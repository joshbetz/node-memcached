const { HashPool } = require( './build' );

async function sleep( ms ) {
	return new Promise( resolve => setTimeout( resolve, ms ) );
}

async function main() {
	const memcached = new HashPool( [ 'localhost:11211', 'localhost:11311' ], { pingInterval: 1000 } );
	while ( true ) {
		try {
			const key = 'test';
			console.log( memcached.hashring.get( key ) );
			console.log( await memcached.set( key, 'value' ) );
			console.log( await memcached.get( key ) );
		} catch ( error ) {
			console.log( error );
		}

		await sleep( 1000 );
	}
}

main();
