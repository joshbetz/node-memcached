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
		this.nodes = new Map();
		this.isReady = false;
		for ( const node of nodes ) {
			this.connect( node );
		}
	}

	connect( node ) {
		if ( this.nodes.has( node ) ) {
			this.end();
			throw new Error( `Pool already has node ${node}` );
		}

		const [ host, port ] = node.split( ':' );
		const pool = new Pool( { host, port } );
		this.nodes.set( node, {
			pool,
			errors: 0,
		} );

		let reconnecting = false;
		pool.on( 'error', error => {
			if ( error.code === 'ECONNREFUSED' && !reconnecting ) {
				reconnecting = true;
				this.reconnect( node );
			} else if ( this.nodes.has( node ) && this.nodes.get( node ).errors++ > this.opts.failures ) {
				this.disconnect( node );
			}
		} );

		pool.ready()
			.then( () => {
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

		const host = this.nodes.get( node );
		host.pool.end();

		delete this.nodes.get( node );

		if ( !this.nodes.size ) {
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
		this.nodes.get( host ).errors = 0;
		return this.nodes.get( host ).pool;
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
		const hosts = [];
		for ( const [ _, host ] of this.nodes.entries() ) {
			hosts.push( host.pool.end() );
		}

		await Promise.all( hosts );
	}
};
