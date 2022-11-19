import { createPool, type Pool as GenericPool } from 'generic-pool';
import { EventEmitter } from 'events';
import Memcached from './memcached';

export default class Pool extends EventEmitter {
	opts: any;
	pool: GenericPool<Memcached>;
	failures: number;

	constructor( port: number, host: string, opts?: any ) {
		super();

		this.failures = 0;

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

		this.pool = createPool( {
			create: async () => {
				const memcached = new Memcached( port, host, this.opts );
				memcached.on( 'error', ( error: Error ) => this.emit( 'error', error ) );

				await memcached.ready();
				return memcached;
			},
			destroy: async ( memcached: Memcached ) => {
				memcached.removeAllListeners();
				return memcached.end();
			},
			validate: async ( memcached: Memcached ) => {
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
		return this.pool.use( ( client: Memcached ) => client.flush() );
	}

	async set( key: string, value: string, ttl = 0 ): Promise<boolean> {
		return this.pool.use( ( client: Memcached ) => client.set( key, value, ttl ) );
	}

	async add( key: string, value: string, ttl = 0 ): Promise<boolean> {
		return this.pool.use( ( client: Memcached ) => client.add( key, value, ttl ) );
	}

	async get( key: string ): Promise<string|false> {
		return this.pool.use( ( client: Memcached ) => client.get( key ) );
	}

	async del( key: string ): Promise<boolean> {
		return this.pool.use( ( client: Memcached ) => client.del( key ) );
	}

	async incr( key: string, value = 1 ): Promise<number|false> {
		return this.pool.use( ( client: Memcached ) => client.incr( key, value ) );
	}

	async decr( key: string, value = 1 ): Promise<number|false> {
		return this.pool.use( ( client: Memcached ) => client.decr( key, value ) );
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
}
