import Pool from '../src/pool';

describe( 'pool', () => {
	it( 'should correctly set pool configuration', async () => {
		const opts = {
			max: 100,
			min: 50,
		};

		const pool = new Pool( 11211, 'localhost', opts );
		expect( pool.pool.max ).toBe( 100 );
		expect( pool.pool.min ).toBe( 50 );

		await pool.end();
	} );

	it( 'should set and get', async () => {
		const pool = new Pool( 11211, 'localhost' );
		const set = await pool.set( 'test', 'test' );
		expect( set ).toBe( true );

		const get = await pool.get( 'test' );
		expect( get ).toBe( 'test' );
		await pool.end();
	} );
} );