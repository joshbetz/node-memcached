const { Memcached } = require( '../src/' );

describe( 'connection', () => {
	it( 'should correctly acquire a memcached connection', async () => {
		const memcached = new Memcached( 11211, 'localhost' );
		expect( memcached.isReady ).toBe( false );

		await memcached.ready();
		expect( memcached.isReady ).toBe( true );

		await memcached.end();
	} );
} );

describe( 'prefix', () => {
	it( 'should correctly set and get with a prefix', async () => {
		const memcached = new Memcached( 11211, 'localhost', { prefix: 'prefix:' } );
		await memcached.ready();

		const set = await memcached.set( 'somekey', 'somevalue' );
		expect( set ).toBe( true );

		const get = await memcached.get( 'somekey' );
		expect( get ).toBe( 'somevalue' );

		await memcached.end();

		const memcachedUnprefixed = new Memcached( 11211, 'localhost' );
		await memcachedUnprefixed.ready();

		const getUnprefixed = await memcachedUnprefixed.get( 'prefix:somekey' );
		expect( getUnprefixed ).toBe( 'somevalue' );

		await memcachedUnprefixed.end();
	} );
} );

describe( 'basic commands', () => {
	let memcached;

	beforeAll( async () => {
		memcached = new Memcached( 11211, 'localhost' );
		await memcached.ready();
		await memcached.flush();
	} );

	afterAll( async () => {
		await memcached.end();
	} );

	it( 'should correctly set', async () => {
		const set = await memcached.set( 'set', 'set' );
		expect( set ).toBe( true );
	} );

	it( 'should correctly add', async () => {
		const add = await memcached.add( 'add', 'add' );
		expect( add ).toBe( true );
	} );

	it( 'should not add if the value already exists', async () => {
		let add = await memcached.add( 'add2', 'add' );
		expect( add ).toBe( true );

		add = await memcached.add( 'add2', 'add' );
		expect( add ).toBe( false );
	} );

	it.each( [
		{
			key: 'get',
			value: 'get',
		},
		{
			key: 'get2',
			value: 'data',
		},
	] )( 'should correctly get %p', async ( { key, value } ) => {
		await memcached.set( key, value );
		const get = await memcached.get( key );
		expect( get ).toBe( value );
	} );

	it( 'should get big values', async () => {
		const data = 'a'.repeat( 1023 * 1024 ); // 1MB - 1kb (for headers)
		const set = await memcached.set( 'big', data );
		expect( set ).toBe( true );

		const get = await memcached.get( 'big' );
		expect( get ).toBe( data );
	} );

	it( 'should get keys that do not exist', async () => {
		const get = await memcached.get( 'nonexisting' );
		expect( get ).toBe( false );
	} );

	it( 'should correctly del', async () => {
		await memcached.set( 'set', 'set' );
		let get = await memcached.get( 'set' );
		expect( get ).toBe( 'set' );

		const del = await memcached.del( 'set' );
		expect( del ).toBe( true );

		get = await memcached.get( 'set' );
		expect( get ).toBe( false );
	} );

	it( 'should del key that does not exist', async () => {
		const del = await memcached.del( 'nonexisting' );
		expect( del ).toBe( false );
	} );

	it( 'should error on timestamps greater than 30 days', async () => {
		const set = memcached.set( 'set', 'set', 60 * 60 * 31 * 24 );
		expect( set ).rejects.toEqual( new Error( 'Invalid TTL' ) );
	} );

	it( 'should correctly increment', async () => {
		await memcached.set( 'increment', 0 );
		const incr = await memcached.incr( 'increment' );
		expect( incr ).toBe( 1 );
		const incr2 = await memcached.incr( 'increment', 2 );
		expect( incr2 ).toBe( 3 );
	} );

	it( 'should return false on increment if the key does not exist', async () => {
		const incr = await memcached.incr( 'invalid' );
		expect( incr ).toBe( false );
	} );

	it( 'should correctly decrement', async () => {
		await memcached.set( 'decrement', 10 );
		const decr = await memcached.decr( 'decrement' );
		expect( decr ).toBe( 9 );
		const decr2 = await memcached.decr( 'decrement', 2 );
		expect( decr2 ).toBe( 7 );
	} );

	it( 'should return false on decrement if the key does not exist', async () => {
		const incr = await memcached.decr( 'invalid' );
		expect( incr ).toBe( false );
	} );

	it( 'should allow keys with whitespace', async () => {
		const set = await memcached.set( 'has whitespace', 'value' );
		expect( set ).toBe( true );

		const get = await memcached.get( 'has whitespace' );
		expect( get ).toBe( 'value' );

		const correctedKey = await memcached.get( 'has_whitespace' );
		expect( correctedKey ).toBe( 'value' );
	} );
} );
