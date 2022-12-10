import { EventEmitter } from 'events';
import Pool, { type PoolOptions } from './pool';
const HashRing = require( 'hashring' );

export type HashPoolOptions = {
	retry: ( retries: number ) => number;
} & PoolOptions;

type PoolNode = {
	pool: Pool;
	reconnecting: boolean;
};

export default class HashPool extends EventEmitter {
	hashring: typeof HashRing;
	nodes: Map<string, PoolNode>;
	isReady: boolean;
	retries: number;
	opts: HashPoolOptions;

	constructor( nodes: Array<string>, opts?: any ) {
		super();

		this.retries = 0;
		this.isReady = false;
		this.hashring = new HashRing();
		this.nodes = new Map();
		this.opts = Object.assign( {
			retry: ( retries: number ): number => {
				const exp = Math.pow( 2, retries ) * 250;

				// exponential backoff up to 30 seconds
				return Math.min( exp, 30000 );
			},

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

		this.opts.forwardPoolErrors = true;

		// initialize hash pool
		for ( const node of nodes ) {
			this.connect( node );
		}
	}

	connect( node: string ) {
		if ( this.nodes.has( node ) ) {
			throw new Error( `Pool already has node ${node}` );
		}

		const [ host, port ] = node.split( ':' );
		const pool = new Pool( parseInt( port, 10 ), host, this.opts );
		pool.on( 'error', () => {
			const host = this.nodes.get( node );
			if ( !host || host.reconnecting ) {
				return;
			}

			this.disconnect( node );
		} );

		this.nodes.set( node, {
			pool,
			reconnecting: false,
		} );

		pool.ready()
			.then( () => {
				this.hashring.add( node );

				this.retries = 0;
				this.isReady = true;
				this.emit( 'ready' );
			} )
			.catch( () => {
				this.disconnect( node );
			} );
	}

	reconnect( node: string ) {
		setTimeout( () => {
			this.connect( node );
		}, this.opts.retry( this.retries++ ) );
	}

	disconnect( node: string, reconnect = true ) {
		const host = this.nodes.get( node );
		if ( !host || host.reconnecting ) {
			return;
		}

		host.reconnecting = true;

		this.hashring.remove( node );
		host.pool.end().then( () => {
			this.nodes.delete( node );
			if ( !this.nodes.size ) {
				this.isReady = false;
			}

			if ( reconnect ) {
				this.reconnect( node );
			}
		} );
	}

	async ready() {
		if ( this.isReady ) {
			return true;
		}

		return new Promise<void>( ( resolve, reject ) => {
			const timeout = setTimeout( () => {
				reject( new Error( 'No hosts' ) );
			}, this.opts.socketTimeout ).unref();

			this.once( 'ready', () => {
				clearTimeout( timeout );
				resolve();
			} );
		} );
	}

	async getHost( key: string ): Promise<Pool> {
		await this.ready();
		const host = this.hashring.get( key );
		const node = this.nodes.get( host );
		if ( !node ) {
			throw new Error( 'Could not find node' );
		}

		return node.pool;
	}

	async flush() {
		for ( const host of this.nodes.values() ) {
			await host.pool.flush();
		}
	}

	async set( key: string, value: string|number, ttl = 0 ): Promise<boolean> {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.set( key, value, ttl );
	}

	async add( key: string, value: string|number, ttl = 0 ): Promise<boolean> {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.add( key, value, ttl );
	}

	async get( key: string ): Promise<string|false> {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.get( key );
	}

	async del( key: string ): Promise<boolean> {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.del( key );
	}

	async incr( key: string, value = 1 ): Promise<number|false> {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.incr( key, value );
	}

	async decr( key: string, value = 1 ): Promise<number|false> {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.decr( key, value );
	}

	async ping(): Promise<boolean> {
		const pings = [];
		for ( const host of this.nodes.values() ) {
			pings.push( host.pool.ping() );
		}

		return ( await Promise.all( pings ) ).every( ping => ping === true );
	}

	async end() {
		this.isReady = false;
		for ( const [ node, host ] of this.nodes.entries() ) {
			await host.pool.end();
			this.nodes.delete( node );
		}
	}
}
