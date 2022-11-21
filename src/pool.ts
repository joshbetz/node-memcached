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
				await memcached.ready();
				return memcached;
			},
			destroy: async ( memcached: Memcached ) => {
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
		return new Promise( ( resolve, reject ) => {
			const timeout = setTimeout( reject, this.opts.timeout ).unref();
			this.pool.ready().then( () => {
				clearTimeout( timeout );
				resolve( true );
			} );
		} );
	}

	async use( fn: ( client: Memcached ) => Promise<any> ): Promise<any> {
		let client;
		try {
			client = await this.pool.acquire();
		} catch ( error ) {
			return false;
		}

		const value = await fn( client );
		await this.pool.release( client );

		return value;
	}

	async flush() {
		return this.use( ( client: Memcached ) => client.flush() );
	}

	async set( key: string, value: string|number, ttl = 0 ): Promise<boolean> {
		return this.use( ( client: Memcached ) => client.set( key, value, ttl ) );
	}

	async add( key: string, value: string|number, ttl = 0 ): Promise<boolean> {
		return this.use( ( client: Memcached ) => client.add( key, value, ttl ) );
	}

	async get( key: string ): Promise<string|false> {
		return this.use( ( client: Memcached ) => client.get( key ) );
	}

	async del( key: string ): Promise<boolean> {
		return this.use( ( client: Memcached ) => client.del( key ) );
	}

	async incr( key: string, value = 1 ): Promise<number|false> {
		return this.use( ( client: Memcached ) => client.incr( key, value ) );
	}

	async decr( key: string, value = 1 ): Promise<number|false> {
		return this.use( ( client: Memcached ) => client.decr( key, value ) );
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
}
