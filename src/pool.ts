import { createPool, type Pool as GenericPool } from 'generic-pool';
import { EventEmitter } from 'events';
import Memcached from './memcached';

export default class Pool extends EventEmitter {
	opts: any;
	pool: GenericPool<Memcached>;

	constructor( port: number, host: string, opts?: any ) {
		super();

		this.opts = Object.assign( {
			forwardPoolErrors: false,

			// Pool options
			max: 10,
			min: 2,
			acquireTimeoutMillis: 200,
			destroyTimeoutMillis: 200,
			maxWaitingClients: 2,
			idleTimeoutMillis: 30000,

			// Connection options
			socketTimeout: 100,
		}, opts );

		this.opts.autostart = true;
		this.opts.fifo = true;
		this.opts.evictionRunIntervalMillis = 0;

		this.pool = createPool( {
			create: async () => {
				const memcached = new Memcached( port, host, this.opts );
				if ( this.opts.forwardPoolErrors ) {
					memcached.on( 'error', ( error: Error ) => this.emit( 'error', error ) );
				}

				await memcached.ready();
				return memcached;
			},
			destroy: async ( memcached: Memcached ) => {
				memcached.removeAllListeners();
				return memcached.end();
			},
		}, this.opts );
	}

	async ready() {
		return new Promise( ( resolve ) => {
			const isReady = () => {
				if ( this.pool.available >= this.pool.min ) {
					resolve( true );
				} else {
					setTimeout( isReady, 100 ).unref();
				}
			};

			isReady();
		} );
	}

	async use( fn: ( client: Memcached ) => Promise<any> ): Promise<any> {
		let value;
		try {
			value = await this.pool.use( fn );
		} catch ( error ) {
			return false;
		}

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

	async ping(): Promise<boolean> {
		return this.use( ( client: Memcached ) => client.ping() );
	}

	async end() {
		await this.pool.drain();
		await this.pool.clear();
	}
}
