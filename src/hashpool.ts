import { EventEmitter } from 'events';
import Pool from './pool';
const HashRing = require( 'hashring' );

type PoolNode = {
	pool: Pool;
	errors: number;
};

export default class HashPool extends EventEmitter {
	opts: any;
	hashring: typeof HashRing;
	nodes: Map<string, PoolNode>;
	isReady: boolean;

	constructor( nodes: Array<string>, opts?: any ) {
		super();

		this.opts = Object.assign( {
			failures: 5,
			retry: 30000,

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

		this.hashring = new HashRing();
		this.nodes = new Map();
		this.isReady = false;
		for ( const node of nodes ) {
			this.connect( node );
		}
	}

	connect( node: string ) {
		if ( this.nodes.has( node ) ) {
			this.end();
			throw new Error( `Pool already has node ${node}` );
		}

		const [ host, port ] = node.split( ':' );
		const pool: Pool = new Pool( parseInt( port, 10 ), host, this.opts );
		let reconnecting = false;
		pool.on( 'error', ( error: NodeJS.ErrnoException ) => {
			if ( error.code === 'ECONNREFUSED' && !reconnecting ) {
				reconnecting = true;
				this.reconnect( node );
			} else if ( this.nodes.has( node ) && this.nodes.get( node )!.errors++ > this.opts.failures ) {
				this.disconnect( node );
			}
		} );

		pool.ready()
			.then( () => {
				this.nodes.set( node, {
					pool,
					errors: 0,
				} );

				this.hashring.add( node );

				this.isReady = true;
				this.emit( 'ready' );
			} )
			.catch( () => {
				if ( !reconnecting ) {
					reconnecting = true;
					this.reconnect( node );
				}
			} );
	}

	reconnect( node: string ) {
		setTimeout( () => {
			this.connect( node );
		}, this.opts.retry );
	}

	disconnect( node: string ) {
		this.hashring.remove( node );

		// TODO: Flush host when we connect?
		const host = this.nodes.get( node );
		if ( host ) {
			host.pool.end();
		}

		this.nodes.delete( node );

		if ( !this.nodes.size ) {
			this.isReady = false;
		}

		this.reconnect( node );
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

	async set( key: string, value: string, ttl = 0 ): Promise<boolean> {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.set( key, value, ttl );
	}

	async add( key: string, value: string, ttl = 0 ): Promise<boolean> {
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
		for ( const host of this.nodes.values() ) {
			await host.pool.end();
		}
	}
}
