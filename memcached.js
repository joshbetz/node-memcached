const { createConnection } = require( 'net' );

module.exports = class Memcached {
	constructor(port, host) {
		this.ready = false
		this.client = createConnection({ port, host });
		this.client.once( 'ready', () => this.ready = true );
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
			this.client.once('error', err => reject( err ) );
			this.client.once('data', data => {
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
			this.client.once('error', err => reject( err ) );
			this.client.once('data', data => {
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
			this.client.once('error', err => reject( err ) );
			this.client.once('data', data => {
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
