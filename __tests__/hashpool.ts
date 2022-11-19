import HashPool from '../src/hashpool';
import Pool from '../src/pool';

describe( 'hashpool', () => {
	it( 'should correctly shutdown hash pool', async () => {
		const pool = new HashPool( [ 'localhost:11211', 'localhost:11311' ] );
		await pool.end();
	} );

	it( 'should error on duplicate hosts', async () => {
		let pool;
		try {
			pool = new HashPool( [ 'localhost:11211', 'localhost:11211' ] );
		} catch ( error: any ) {
			expect( error.message ).toBe( 'Pool already has node localhost:11211' );
		}
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
