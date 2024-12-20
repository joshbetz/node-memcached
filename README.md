# Memcached [![Node.js CI](https://github.com/joshbetz/node-memcached/actions/workflows/node.js.yml/badge.svg)](https://github.com/joshbetz/node-memcached/actions/workflows/node.js.yml)

There are three libraries exported from this package.

```typescript
const { Memcached, Pool, HashPool } = require( '@joshbetz/memcached' );
```

## API

The API for all three libraries is the same. It just depends what kind of connection and failover logic you need.

```typescript
async ready()
```

Wait for the connection to be ready.

```typescript
async flush()
```

Flush the Memcached data.

```typescript
async set( key, value, ttl ): Boolean
```

SETs a given key and value for the specified TTL (or no TTL). Returns a Boolean to indicate whether the operation was successful.

```typescript
async add( key, value, ttl ): Boolean
```

ADDs a given key and value for the specified TTL (or no TTL) if it doesn't already exist. Returns a Boolean to indicate whether the operation was successful.

```typescript
async get( key ): string|Boolean
```

GETs a given key. Returns `false` if it does not exist.

```typescript
async del( key ): Boolean
```

DELETEs a given key.

```typescript
async ping(): Boolean
```

Sends the version command. Returns `true` if the expected response is returned.

```typescript
async end()
```

Close the connection to Memcached.

## Memcached Library

This is a simple Memcached library that connects to a Memcached server and execute commands.

### Example

```typescript
const opts = {
    prefix: '',
    socketTimeout: 100,
};
const memcached = new Memcached( 11211, 'localhost', opts );
await memcached.ready();
await memcached.set( 'key', 'value' );
const value = await memcached.get( 'key' );
await memcached.end();
```

### Options

* `prefix` A prefix to apply to all keys. Default: (empty string)
* `socketTimeout` The timeout to establish a connection. Default: 100.

## Pool Library

This is a wrapper around our Memcached library that establishes a connection pool.

### Example

```typescript
const opts = {
    // Pool options
    max: 10,
    min: 2,
    acquireTimeoutMillis: 200,
    destroyTimeoutMillis: 200,
    maxWaitingClients: 2,
    idleTimeoutMillis: 30000,

    // Connection options
    prefix: '',
    socketTimeout: 100,
};
const memcached = new Pool( 11211, 'localhost', opts );
await memcached.set( 'key', 'value' );
const value = await memcached.get( 'key' );
await memcached.end();
```

### Options

* `max` The maximum number of connections in the pool. Default: 10.
* `min` The minimum number of connections in the pool. Default: 2.
* `acquireTimeoutMillis` The maximum amount of time to wait to create a connection. Default: 200.
* `destroyTimeoutMillis` The maximum amount of time to wait to destroy a connection. Default: 200.
* `maxWaitingClients` The maximum number of queued requests allowed, additional acquire calls will be callback with an err in a future cycle of the event loop. Default: 2.
* `idleTimeoutMillis` The minimum amount of time that an object may sit idle in the pool before it is eligible for eviction due to idle time. Default: 30000.
* `prefix` A prefix to apply to all keys. Default: (empty string)
* `socketTimeout` The timeout to establish a connection. Default: 100.

## HashPool Library

This is a wrapper around our Pool library that establishes connection pools to each host and load balances queries across them. It includes automatic failover and reconnecting when hosts experience issues.

### Example

```typescript
const opts = {
    retry: ( retries: number ): number => {
        const exp = Math.pow( 2, retries ) * 250;

        // exponential backoff up to 30 seconds
        return Math.min( exp, 30000 );
    },

    // Pool options
    max: 10,
    min: 2,
    acquireTimeoutMillis: 200,
    destroyTimeoutMillis: 200,
    maxWaitingClients: 2,
    idleTimeoutMillis: 30000,

    // Connection options
    prefix: '',
    socketTimeout: 100,
};
const memcached = new HashPool( [ 'localhost:11211', 'localhost:11311' ], opts );
await memcached.set( 'key', 'value' );
const value = await memcached.get( 'key' );
await memcached.end();
```

### Options

* `retry` A function that takes the number of retries as a parameter and returns the time before the next retry in milliseconds.
* `max` The maximum number of connections in the pool. Default: 10.
* `min` The minimum number of connections in the pool. Default: 2.
* `acquireTimeoutMillis` The maximum amount of time to wait to create a connection. Default: 200.
* `destroyTimeoutMillis` The maximum amount of time to wait to destroy a connection. Default: 200.
* `maxWaitingClients` The maximum number of queued requests allowed, additional acquire calls will be callback with an err in a future cycle of the event loop. Default: 2.
* `idleTimeoutMillis` The minimum amount of time that an object may sit idle in the pool before it is eligible for eviction due to idle time. Default: 30000.
* `prefix` A prefix to apply to all keys. Default: (empty string)
* `socketTimeout` The timeout to establish a connection. Default: 100.
