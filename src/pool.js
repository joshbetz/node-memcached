const GenericPool = require( 'generic-pool' );
const Memcached = require( './memcached' );

module.exports = class Pool {
	constructor( host, opts ) {
		opts = Object.assign( {
			max: 10,
			min: 2,
			acquireTimeoutMillis: 2000,
			destroyTimeoutMillis: 2000,
		}, opts );

		this.pool = GenericPool.createPool( {
			create: () => new Memcached( host.port, host.host ),
			destroy: memcached => memcached.end(),
		}, opts );
	}

	async get( key ) {
		const connection = await this.pool.acquire();
		const value = await connection.get( key );
		await this.pool.release( connection );

		return value;
	}

	async set( key, value, ttl = 0 ) {
		const connection = await this.pool.acquire();
		const ret = await connection.set( key, value, ttl );
		await this.pool.release( connection );

		return ret;
	}

	async del( key ) {
		const connection = await this.pool.acquire();
		const ret = await connection.del( key );
		await this.pool.release( connection );

		return ret;
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
};
