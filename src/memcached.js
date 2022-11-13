const { createConnection } = require( 'net' );
const { EventEmitter } = require( 'events' );

module.exports = class Memcached extends EventEmitter {
	constructor( port, host, opts ) {
		super();

		this.opts = Object.assign( {
			timeout: 1000,
			socketTimeout: 1000,
		}, opts );

		this.errors = 0;
		this.ready = false;

		this.client = createConnection( { port, host } );
		this.client.setTimeout( this.opts.socketTimeout, () => {
			this.emit( 'error', new Error( 'Socket Timeout' ) );
			this.client.destroy();
		} );
		this.client.once( 'connect', () => this.client.setTimeout( 0 ) );
		this.client.once( 'ready', () => { this.ready = true; } );

		// forward errors
		this.client.on( 'error', error => {
			this.errors++;

			this.emit( 'error', error );
			this.emit( 'message', error );
		} );

		let buffer = '';
		this.client.on( 'data', data => {
			this.errors = 0;

			buffer += data;
			while ( buffer.length > 0 ) {
				const tokens = [
					buffer.indexOf( 'END\r\n' ),
					buffer.indexOf( 'STORED\r\n' ),
					buffer.indexOf( 'DELETED\r\n' ),

					// error strings https://github.com/memcached/memcached/blob/master/doc/protocol.txt#L156
					buffer.indexOf( 'ERROR\r\n' ),
					buffer.indexOf( 'CLIENT_ERROR' ),
					buffer.indexOf( 'SERVER_ERROR' ),
				].filter( i => i >= 0 );

				if ( !tokens.length ) {
					// If the message is split, we might not have any tokens in this chunk.
					return;
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

	async acquire() {
		if ( this.ready ) {
			return true;
		}

		return new Promise( ( resolve, reject ) => {
			this.once( 'error', reject );
			this.client.once( 'ready', resolve );
		} );
	}

	async command( command ) {
		return new Promise( ( resolve, reject ) => {
			const onMessage = ( error, message ) => {
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

	async set( key, value, ttl = 0 ) {
		const message = await this.command( `set ${key} 0 ${ttl} ${value.length}\r\n${value}\r\n` );
		if ( message.indexOf( 'STORED' ) !== 0 ) {
			return false;
		}

		return true;
	}

	async get( key ) {
		const message = await this.command( `get ${key}\r\n` );
		if ( message === 'END\r\n' ) {
			return false;
		}

		// start after the \r\n
		const start = message.indexOf( '\r\n' ) + 2;
		const end = message.indexOf( '\r\nEND\r\n' );

		return message.substring( start, end );
	}

	async del( key ) {
		const message = await this.command( `delete ${key}\r\n` );
		if ( message.indexOf( 'DELETED' ) !== 0 ) {
			return false;
		}

		return true;
	}

	async end() {
		this.client.end();
	}
};
