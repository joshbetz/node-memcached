import { HashPool, Pool } from '../src';

describe( 'hashpool', () => {
	it( 'should correctly shutdown hash pool', async () => {
		const pool = new HashPool( [ 'localhost:11211', 'localhost:11311' ] );
		await pool.end();
	} );

	it( 'should error on duplicate hosts', async () => {
		const pool = new HashPool( [ 'localhost:11211' ] );
		try {
			pool.connect( 'localhost:11211' );
		} catch ( error: any ) {
			expect( error.message ).toBe( 'Pool already has node localhost:11211' );
		}

		await pool.end();
	} );

	it( 'should handle hosts that do not exist', async () => {
		const pool = new HashPool( [ 'invalid-host' ] );
		await pool.end();
	} );

	it( 'should return false if there are no hosts', async () => {
		const pool = new HashPool( [ 'invalid-host' ] );
		expect( pool.get( 'invalid-host' ) ).resolves.toBe( false );
		await pool.end();
	} );
} );

describe( 'basic ops', () => {
	let pool: HashPool;

	beforeAll( async () => {
		pool = new HashPool( [ 'localhost:11211', 'localhost:11311' ] );
	} );

	afterAll( async () => {
		await pool.end();
	} );

	it( 'should correctly get a host', () => {
		const host = pool.getHost( 'key' );
		expect( host ).resolves.toBeInstanceOf( Pool );
	} );

	it( 'should corrrectly set and get', async () => {
		const set = await pool.set( 'test', 'data' );
		expect( set ).toBe( true );

		const get = await pool.get( 'test' );
		expect( get ).toBe( 'data' );
	} );
} );
