const HashRing = require( 'hashring' );
const { EventEmitter } = require( 'events' );
const Pool = require( './pool' );

module.exports = class HashPool extends EventEmitter {
	constructor( nodes, opts ) {
		super();

		this.opts = Object.assign( {
			failures: 5,
			retry: 10000,
		}, opts );

		this.hashring = new HashRing();
		this.nodes = {};
		this.isReady = false;
		for ( const node of nodes ) {
			this.connect( node );
		}
	}

	connect( node ) {
		const [ host, port ] = node.split( ':' );
		const pool = new Pool( { host, port } );

		let reconnecting = false;
		pool.on( 'error', error => {
			if ( error.code === 'ECONNREFUSED' && !reconnecting ) {
				reconnecting = true;
				this.reconnect( node );
			} else if ( this.nodes[node] && this.nodes[node].errors++ > this.opts.failures ) {
				this.disconnect( node );
			}
		} );

		pool.ready()
			.then( () => {
				this.nodes[node] = {
					pool,
					errors: 0,
				};

				this.hashring.add( node );

				this.isReady = true;
				this.emit( 'ready' );
			} )
			.catch( _ => {
				if ( !reconnecting ) {
					reconnecting = true;
					this.reconnect( node );
				}
			} );
	}

	reconnect( node ) {
		setTimeout( () => {
			this.connect( node );
		}, this.opts.retry );
	}

	disconnect( node ) {
		this.hashring.remove( node );

		const host = this.nodes[node];
		host.pool.end();

		delete this.nodes[node];

		if ( !this.nodes ) {
			this.isReady = false;
		}

		this.reconnect( node );
	}

	async ready() {
		if ( this.isReady ) {
			return true;
		}

		return new Promise( ( resolve, reject ) => {
			const timeout = setTimeout( () => {
				reject( new Error( 'No hosts' ) );
			}, 5000 );

			this.once( 'ready', () => {
				clearTimeout( timeout );
				resolve();
			} );
		} );
	}

	async getHost( key ) {
		await this.ready();
		const host = this.hashring.get( key );
		this.nodes[host].errors = 0;
		return this.nodes[host].pool;
	}

	async get( key ) {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.get( key );
	}

	async set( key, value, ttl ) {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.set( key, value, ttl );
	}

	async del( key ) {
		let host;
		try {
			host = await this.getHost( key );
		} catch ( _ ) {
			return false;
		}

		return host.del( key );
	}

	async end() {
		const all = [];
		for ( const node in this.nodes ) {
			all.push( this.nodes[node].pool.end() );
		}

		await Promise.all( all );
	}
};
