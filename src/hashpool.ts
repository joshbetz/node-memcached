import { EventEmitter } from 'events';
import Pool from './pool';
const HashRing = require( 'hashring' );

type PoolNode = {
	pool: Pool;
	errors: number;
	reconnecting: boolean;
};

export default class HashPool extends EventEmitter {
	opts: any;
	hashring: typeof HashRing;
	nodes: Map<string, PoolNode>;
	isReady: boolean;
	retries: number;

	constructor( nodes: Array<string>, opts?: any ) {
		super();

		this.opts = Object.assign( {
			failures: 5,
			retry: ( retries: number ): number => {
				const exp = Math.pow( 2, retries ) * 250;

				// exponential backoff up to 30 seconds
				return Math.min( exp, 30000 );
			},

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

		this.retries = 0;
		this.isReady = false;
		this.hashring = new HashRing();
		this.nodes = new Map();
		for ( const node of nodes ) {
			this.connect( node );
		}
	}

	connect( node: string ) {
		if ( this.nodes.has( node ) ) {
			throw new Error( `Pool already has node ${node}` );
		}

		const [ host, port ] = node.split( ':' );
		let pool: Pool;
		try {
			pool = new Pool( parseInt( port, 10 ), host, this.opts );
		} catch ( error ) {
			return;
		}

		pool.on( 'error', ( error: NodeJS.ErrnoException ) => {
			const host = this.nodes.get( node );
			if ( error.code === 'ECONNREFUSED' && !host?.reconnecting ) {
				return this.disconnect( node );
			}

			if ( host && !host.reconnecting && host.errors++ > this.opts.failures ) {
				return this.disconnect( node );
			}
		} );

		this.nodes.set( node, {
			pool,
			errors: 0,
			reconnecting: false,
		} );

		pool.ready()
			.then( () => {
				this.hashring.add( node );

				this.retries = 0;
				this.isReady = true;
				this.emit( 'ready' );
			} )
			.catch( ( error: NodeJS.ErrnoException ) => {
				if ( error.code === 'ECONNREFUSED' ) {
					// This is already handled by the event emitter
					return;
				}

				this.nodes.delete( node );
				this.reconnect( node );
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
			}, 5000 );

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

		node.errors = 0;
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

	async end() {
		this.isReady = false;
		for ( const [ node, host ] of this.nodes.entries() ) {
			await host.pool.end();
			this.nodes.delete( node );
		}
	}
}
