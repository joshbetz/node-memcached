import { createConnection, type Socket } from 'net';
import { EventEmitter } from 'events';

export type MemcachedOptions = {
	prefix: string;
	socketTimeout: number;
};

export default class Memcached extends EventEmitter {
	client: Socket;
	isReady: boolean;
	opts: MemcachedOptions;

	constructor( port: number, host: string, opts?: any ) {
		super();

		this.isReady = false;
		this.opts = Object.assign( {
			prefix: '',
			socketTimeout: 100,
		}, opts );

		// setup client
		this.client = createConnection( { port, host } );
		this.client.once( 'connect', () => this.client.setTimeout( 0 ) );
		this.client.once( 'ready', () => { this.isReady = true; } );
		this.client.setTimeout( this.opts.socketTimeout, () => {
			this.emit( 'error', new Error( 'Socket Timeout' ) );
			this.client.destroy();
		} );

		// forward errors
		this.client.on( 'error', ( error: Error ) => {
			this.emit( 'error', error );
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
		cmd = cmd.toLowerCase();

		if ( key ) {
			// keys cannot contain whitespace
			key = key.replace( /\s+/, '_' );

			if ( this.opts.prefix ) {
				key = this.opts.prefix + key;
			}

			if ( key.length > 250 ) {
				throw new Error( 'Invalid key' );
			}

			args.unshift( key );
		}

		const command = `${cmd} ${args.join( ' ' )}\r\n`;
		return new Promise( ( resolve, reject ) => {
			const isError = ( data: Buffer ) => {
				const errors = [
					// error strings https://github.com/memcached/memcached/blob/master/doc/protocol.txt#L156
					data.indexOf( 'ERROR\r\n' ),
					data.indexOf( 'CLIENT_ERROR' ),
					data.indexOf( 'SERVER_ERROR' ),
				];

				return errors.some( token => token >= 0 );
			};

			const onSimpleMessage = ( data: Buffer ) => {
				if ( isError( data ) ) {
					return reject( data );
				}

				return resolve( data.toString() );
			};

			let buffer = '';
			const onBufferedMessage = ( data: Buffer ) => {
				if ( isError( data ) ) {
					this.client.off( 'data', onBufferedMessage );
					return reject( buffer );
				}

				buffer += data;
				if ( data.indexOf( 'END\r\n' ) < 0 ) {
					// Keep looking for terminating tokens
					return;
				}

				this.client.off( 'data', onBufferedMessage );
				return resolve( buffer );
			};

			switch ( cmd ) {
			case 'get':
			case 'gets':
			case 'gat':
			case 'gats':
			case 'mg':
			case 'stat':
				this.client.on( 'data', onBufferedMessage );
				break;
			default:
				this.client.once( 'data', onSimpleMessage );
				break;
			}

			this.client.write( command );
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

	async ping(): Promise<boolean> {
		const message = await this.command( 'version' );
		return message.indexOf( 'VERSION' ) === 0;
	}

	async end(): Promise<void> {
		return new Promise( resolve => {
			const timeout = setTimeout( () => this.client.destroy(), this.opts.socketTimeout );
			this.client.once( 'close', () => {
				clearTimeout( timeout );
				resolve();
			} );

			this.client.end();
		} );
	}
}
