import { Pool } from '../src';

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

	it( 'should handle host that does not exist', async () => {
		const pool = new Pool( 12345, 'invalid-host' );
		await pool.end();
	} );

	it( 'should return false if no hosts exist', async () => {
		const pool = new Pool( 12345, 'invalid-host' );
		expect( await pool.set( 'test', 'test' ) ).toBe( false );
		expect( pool.get( 'invalid-host' ) ).resolves.toBe( false );
		await pool.end();
	} );
} );
