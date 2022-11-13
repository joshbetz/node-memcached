const GenericPool = require( 'generic-pool' );
const { EventEmitter } = require( 'events' );
const Memcached = require( './memcached' );

module.exports = class Pool extends EventEmitter {
	constructor( host, opts ) {
		super();

		opts = Object.assign( {
			max: 10,
			min: 2,
			acquireTimeoutMillis: 2000,
			destroyTimeoutMillis: 2000,
			failures: 5,
		}, opts );

		opts.testOnBorrow = true;

		this.pool = GenericPool.createPool( {
			create: async () => {
				const memcached = new Memcached( host.port, host.host );
				memcached.on( 'error', error => this.emit( 'error', error ) );

				await memcached.acquire();
				return memcached;
			},
			destroy: async ( memcached ) => {
				memcached.removeAllListeners();
				return memcached.end();
			},
			validate: async ( memcached ) => {
				if ( memcached.errors > this.failures ) {
					return false;
				}

				return true;
			},
		}, opts );

		this.pool.on( 'factoryCreateError', error => this.emit( 'error', error ) );
	}

	async get( key ) {
		const connection = await this.pool.acquire();

		const value = await connection.get( key );
		await this.pool.release( connection );

		return value;
	}

	async set( key, value, ttl = 0 ) {
		const connection = await this.pool.acquire();

		const set = await connection.set( key, value, ttl );
		await this.pool.release( connection );

		return set;
	}

	async del( key ) {
		const connection = await this.pool.acquire();

		const del = await connection.del( key );
		await this.pool.release( connection );

		return del;
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
};
