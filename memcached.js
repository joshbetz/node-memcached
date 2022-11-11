const { createConnection } = require( 'net' );
const { EventEmitter } = require("events");


module.exports = class Memcached {
	constructor(port, host) {
		this.ready = false
		this.client = createConnection({ port, host });
		this.client.once( 'ready', () => this.ready = true );

		this.response = new EventEmitter();

		// forward errors to response event
		this.client.on( 'error', error => this.response.emit( 'message', error ) );

		let buffer = '';
		this.client.on( 'data', data => {
			buffer += data;
			while ( buffer.length > 0 ) {
				const tokens = [
					buffer.indexOf( 'END\r\n' ),
					buffer.indexOf( 'STORED\r\n' ),
					buffer.indexOf( 'DELETED\r\n' ),
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
				this.response.emit( 'message', buffer.substring( 0, end ) );

				// remove response from the buffer
				buffer = buffer.substring( end );
			}
		} );
	}

	async acquire() {
		if ( this.ready ) {
			return true;
		}

		return new Promise( resolve => this.client.once( 'ready', resolve ) );
	}

	async set( key, value, ttl = 0 ) {
		return new Promise( ( resolve, reject ) => {
			this.client.write( `set ${key} 0 ${ttl} ${value.length}\r\n${value}\r\n` );
			this.response.once( 'message', data => {
				if ( data instanceof Error ) {
					reject( data );
				}

				data = data.toString();
				if ( data.indexOf( 'STORED' ) !== 0 ) {
					resolve( false );
				}

				resolve( true );
			});
		} );
	}

	async get( key ) {
		return new Promise( ( resolve, reject ) => {
			this.client.write( `get ${key}\r\n` );
			this.response.once( 'message', data => {
				if ( data instanceof Error ) {
					reject( data );
				}

				data = data.toString();
				if ( data === 'END\r\n' ) {
					return resolve( false );
				}

				// start after the \r\n
				const start = data.indexOf( '\r\n' ) + 2;
				const end = data.indexOf( '\r\nEND\r\n' );
				data = data.substring( start, end );

				resolve( data );
			});
		} );
	}

	async del( key ) {
		return new Promise( ( resolve, reject ) => {
			this.client.write( `delete ${key}\r\n` );
			this.response.once( 'message', data => {
				if ( data instanceof Error ) {
					reject( data );
				}

				data = data.toString();
				if ( data.indexOf( 'DELETED' ) !== 0 ) {
					resolve( false );
				}

				resolve( true );
			});
		} );
	}

	async end() {
		this.client.end();
	}
}
