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

		this.pool = GenericPool.createPool( {
			create: () => new Memcached( host.port, host.host ),
			destroy: memcached => memcached.end(),
			validate: memcached => memcached.errors < this.failures,
		}, opts );
	}

	async get( key ) {
		const connection = await this.pool.acquire();

		let value = false;
		try {
			value = await connection.get( key );
		} catch ( error ) {
			this.emit( 'error', error );
		}

		await this.pool.release( connection );

		return value;
	}

	async set( key, value, ttl = 0 ) {
		const connection = await this.pool.acquire();

		let set = false;
		try {
			set = await connection.set( key, value, ttl );
		} catch ( error ) {
			this.emit( 'error', error );
		}

		await this.pool.release( connection );

		return set;
	}

	async del( key ) {
		const connection = await this.pool.acquire();

		let del = false;
		try {
			del = await connection.del( key );
		} catch ( error ) {
			this.emit( 'error', error );
		}

		await this.pool.release( connection );

		return del;
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
};
