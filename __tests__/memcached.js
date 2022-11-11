const Memcached = require( '../memcached' );

describe( 'connection', () => {
	it( 'should correctly acquire a memcached connection', async () => {
		const memcached = new Memcached( 11211, 'localhost' );
		expect( memcached.ready ).toBe( false );

		await memcached.acquire();
		expect( memcached.ready ).toBe( true );

		await memcached.end();
	} );
} );

describe( 'commands', () => {
	let memcached;

	beforeAll( async () => {
		memcached = new Memcached( 11211, 'localhost' );
		await memcached.acquire();
	} );

	afterAll( async () => {
		await memcached.end();
	} );

	it( 'should correctly set', async () => {
		const set = await memcached.set( 'set', 'set' );
		expect( set ).toBe( true );
	} );

	it.each([
		{
			key: 'get',
			value: 'get',
		},
		{
			key: 'get2',
			value: 'data',
		}
	])( 'should correctly get %p', async ( { key, value } ) => {
		await memcached.set( key, value );
		const get = await memcached.get( key );
		expect( get ).toBe( value );
	} );

	it( 'should correctly del', async () => {
		const set = await memcached.set( 'set', 'set' );
		let get = await memcached.get( 'set' );
		expect( get ).toBe( 'set' );

		const del = await memcached.del( 'set' );
		expect( del ).toBe( true );

		get = await memcached.get( 'set' );
		expect( get ).toBe( false );
	} );
} );
