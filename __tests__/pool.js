const { Pool } = require( '../src/' );

describe( 'pool', () => {
	it( 'should correctly set pool configuration', async () => {
		const opts = {
			max: 100,
			min: 50,
		};

		const pool = new Pool( { port: 11211, host: 'localhost' }, opts );
		expect( pool.pool._config.max ).toBe( 100 );
		expect( pool.pool._config.min ).toBe( 50 );

		await pool.end();
	} );

	it( 'should set and get', async () => {
		const pool = new Pool( { port: 11211, host: 'localhost' } );
		await pool.set( 'test', 'test' );
		const get = await pool.get( 'test' );
		expect( get ).toBe( 'test' );
		await pool.end();
	} );
} );
