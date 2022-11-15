const GenericPool = require( 'generic-pool' );
const { EventEmitter } = require( 'events' );
const Memcached = require( './memcached' );

module.exports = class Pool extends EventEmitter {
	constructor( port, host, opts ) {
		super();

		opts = Object.assign( {
			failures: 5,

			// Pool options
			max: 10,
			min: 2,
			acquireTimeoutMillis: 2000,
			destroyTimeoutMillis: 2000,
			maxWaitingClients: 10,
			idleTimeoutMillis: 30000,

			// Connection options
			timeout: 1000,
			socketTimeout: 1000,
		}, opts );

		opts.testOnBorrow = true;
		opts.autostart = true;
		opts.fifo = true;
		opts.evictionRunIntervalMillis = 0;

		this.pool = GenericPool.createPool( {
			create: async () => {
				const memcached = new Memcached( port, host, this.opts );
				memcached.on( 'error', error => this.emit( 'error', error ) );

				await memcached.ready();
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

	async flush() {
		return this.pool.use( client => client.flush() );
	}

	async set( key, value, ttl = 0 ) {
		return this.pool.use( client => client.set( key, value, ttl ) );
	}

	async add( key, value, ttl = 0 ) {
		return this.pool.use( client => client.add( key, value, ttl ) );
	}

	async get( key ) {
		return this.pool.use( client => client.get( key ) );
	}

	async del( key ) {
		return this.pool.use( client => client.del( key ) );
	}

	async incr( key, value = 1 ) {
		return this.pool.use( client => client.incr( key, value ) );
	}

	async decr( key, value = 1 ) {
		return this.pool.use( client => client.decr( key, value ) );
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
};
