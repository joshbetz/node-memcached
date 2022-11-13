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
	}

	async ready() {
		return this.pool.ready();
	}

	async get( key ) {
		return this.pool.use( client => client.get( key ) );
	}

	async set( key, value, ttl = 0 ) {
		return this.pool.use( client => client.set( key, value, ttl ) );
	}

	async del( key ) {
		return this.pool.use( client => client.del( key ) );
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
};
