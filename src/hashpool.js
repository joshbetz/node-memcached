const HashRing = require( 'hashring' );
const Pool = require( './pool' );

module.exports = class HashPool {
	constructor( nodes, opts ) {
		this.opts = Object.assign( {
		}, opts );

		this.hashring = new HashRing();
		this.nodes = {};
		for ( const node of nodes ) {
			const [ host, port ] = node.split( ':' );
			const pool = new Pool( { host, port } );
			this.hashring.add( node );
			this.nodes[node] = pool;
		}
	}

	getHost( key ) {
		const host = this.hashring.get( key );
		return this.nodes[host];
	}

	async get( key ) {
		const host = this.getHost( key );
		return host.get( key );
	}

	async set( key, value, ttl ) {
		const host = this.getHost( key );
		return host.set( key, value, ttl );
	}

	async del( key ) {
		const host = this.getHost( key );
		return host.del( key );
	}

	async end() {
		const all = [];
		for ( const node in this.nodes ) {
			all.push( this.nodes[node].end() );
		}

		await Promise.all( all );
	}
};
