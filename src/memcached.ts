import { createConnection, type Socket } from 'net';
import { EventEmitter } from 'events';

export default class Memcached extends EventEmitter {
	client: Socket;
	errors: number;
	isReady: boolean;
	opts: any;

	constructor( port: number, host: string, opts?: any ) {
		super();

		this.opts = Object.assign( {
			prefix: '',
			timeout: 1000,
			socketTimeout: 1000,
		}, opts );

		this.errors = 0;
		this.isReady = false;

		this.client = createConnection( { port, host } );
		this.client.setTimeout( this.opts.socketTimeout, () => {
			this.emit( 'error', new Error( 'Socket Timeout' ) );
			this.client.destroy();
		} ).unref();
		this.client.once( 'connect', () => this.client.setTimeout( 0 ) );
		this.client.once( 'ready', () => { this.isReady = true; } );

		// forward errors
		this.client.on( 'error', ( error: Error ) => {
			this.errors++;

			this.emit( 'error', error );
			this.emit( 'message', error );
		} );

		let buffer = '';
		this.client.on( 'data', ( data: Buffer ) => {
			this.errors = 0;

			buffer += data;
			while ( buffer.length > 0 ) {
				const tokens = [
					buffer.indexOf( 'END\r\n' ),
					buffer.indexOf( 'STORED\r\n' ),
					buffer.indexOf( 'DELETED\r\n' ),
					buffer.indexOf( 'OK\r\n' ),
					buffer.indexOf( 'NOT_FOUND\r\n' ),

					// error strings https://github.com/memcached/memcached/blob/master/doc/protocol.txt#L156
					buffer.indexOf( 'ERROR\r\n' ),
					buffer.indexOf( 'CLIENT_ERROR' ),
					buffer.indexOf( 'SERVER_ERROR' ),
				].filter( i => i >= 0 );

				if ( !tokens.length ) {
					// incr / decr returns just a number, i.e. 1\r\n
					const offset = buffer.indexOf( '\r\n' ) + 2;
					const line = buffer.substring( 0, offset );
					if ( !line.match( /^\d+\r\n$/ ) ) {
						// If the message is split, we might not have any tokens in this chunk.
						return;
					}

					tokens.push( 0 );
				}

				// Get the end of the next message
				const token = Math.min( ...tokens );
				const end = buffer.indexOf( '\r\n', token ) + 2;

				if ( end > buffer.length ) {
					// For safety. This shouldn't be possible.
					return;
				}

				// emit response
				this.emit( 'message', null, buffer.substring( 0, end ) );

				// remove response from the buffer
				buffer = buffer.substring( end );
			}
		} );
	}

	async ready() {
		if ( this.isReady ) {
			return true;
		}

		return new Promise( ( resolve, reject ) => {
			this.once( 'error', reject );
			this.client.once( 'ready', resolve );
		} );
	}

	async command( cmd: string, key?: string, args: Array<string> = [] ): Promise<string> {
		if ( key ) {
			// keys cannot contain whitespace
			key = key.replace( /\s+/, '_' );

			if ( this.opts.prefix ) {
				key = this.opts.prefix + key;
			}

			args.unshift( key );
		}

		const command = `${cmd} ${args.join( ' ' )}\r\n`;
		return new Promise( ( resolve, reject ) => {
			const onMessage = ( error: Error, message: string ) => {
				if ( error ) {
					return reject( error );
				}

				if ( message.indexOf( 'ERROR' ) === 0 || message.indexOf( 'CLIENT_ERROR' ) === 0 || message.indexOf( 'SERVER_ERROR' ) === 0 ) {
					return reject( message );
				}

				return resolve( message );
			};

			this.client.write( command );
			this.once( 'message', onMessage );

			setTimeout( () => {
				this.off( 'message', onMessage );
				reject( new Error( 'Timeout' ) );
			}, this.opts.timeout ).unref();
		} );
	}

	async flush() {
		return this.command( 'flush_all' );
	}

	async store( command: string, key: string, value: string|number, ttl = 0 ): Promise<boolean> {
		if ( ttl > 60 * 60 * 24 * 30 ) {
			// Memcached considers ttls over 30 days to be
			// Unix timestamps. This is confusing and usually
			// leads to bugs. Just error in this case.
			throw new Error( 'Invalid TTL' );
		}

		// Cast value to a string so we can take the length
		value = value.toString();

		const message: string = await this.command( command, key, [ '0', `${ttl}`, `${value.length}\r\n${value}` ] );
		if ( message.indexOf( 'STORED' ) !== 0 ) {
			return false;
		}

		return true;
	}

	async set( key: string, value: string|number, ttl = 0 ): Promise<boolean> {
		return this.store( 'set', key, value, ttl );
	}

	async add( key: string, value: string|number, ttl = 0 ): Promise<boolean> {
		return this.store( 'add', key, value, ttl );
	}

	async get( key: string ): Promise<string|false> {
		const message = await this.command( 'get', key );
		if ( message === 'END\r\n' ) {
			return false;
		}

		// start after the \r\n
		const start = message.indexOf( '\r\n' ) + 2;
		const end = message.indexOf( '\r\nEND\r\n' );

		return message.substring( start, end );
	}

	async del( key: string ): Promise<boolean> {
		const message = await this.command( 'delete', key );
		if ( message.indexOf( 'DELETED' ) !== 0 ) {
			return false;
		}

		return true;
	}

	async incr( key: string, value = 1 ): Promise<number|false> {
		const message = await this.command( 'incr', key, [ `${value}` ] );
		if ( message === 'NOT_FOUND\r\n' ) {
			return false;
		}

		const end = message.indexOf( '\r\n' );
		return Number.parseInt( message.substring( 0, end ), 10 );
	}

	async decr( key: string, value = 1 ): Promise<number|false> {
		const message = await this.command( 'decr', key, [ `${value}` ] );
		if ( message === 'NOT_FOUND\r\n' ) {
			return false;
		}

		const end = message.indexOf( '\r\n' );
		return Number.parseInt( message.substring( 0, end ), 10 );
	}

	async end(): Promise<void> {
		return new Promise( resolve => {
			const timeout = setTimeout( this.client.destroy, this.opts.socketTimeout );
			this.client.once( 'close', () => {
				clearTimeout( timeout );
				resolve();
			} );

			this.client.end();
		} );
	}
}
