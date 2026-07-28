// =============================================================================
// STATE LOCK TESTS — run with: node tests/state-lock.test.mjs
// =============================================================================
// The Hot Drop Queen bug was a lost update: Reset Board and a MOVE overlapped,
// both read the pre-reset state, and the MOVE's write landed last and put the
// previous game's spawned pieces back. These tests pin down that overlapping
// mutations are now serialized.

import assert from 'node:assert/strict';
import { withStateLock, REDIS_STATE_LOCK } from '../api/_lib/redis.js';

let testCount = 0;
let failCount = 0;
const test = async (name, fn) => {
    testCount++;
    try {
        await fn();
        console.log(`  ok - ${name}`);
    } catch (err) {
        failCount++;
        console.error(`  FAIL - ${name}`);
        console.error(`    ${err.message}`);
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Minimal stand-in for the bits of @upstash/redis the lock uses
const fakeRedis = () => {
    const store = new Map();
    return {
        store,
        async set(key, value, opts = {}) {
            if (opts.nx && store.has(key)) return null;
            store.set(key, value);
            return 'OK';
        },
        // Only the compare-and-delete release script is ever eval'd
        async eval(_script, keys, args) {
            if (store.get(keys[0]) === args[0]) {
                store.delete(keys[0]);
                return 1;
            }
            return 0;
        },
    };
};

console.log('== state lock ==');

await test('overlapping mutations run one at a time', async () => {
    const client = fakeRedis();
    const timeline = [];

    const task = (name, workMs) => withStateLock(async () => {
        timeline.push(`${name}:start`);
        await sleep(workMs);
        timeline.push(`${name}:end`);
    }, { client });

    // "reset" is slow, "move" fires while it is still running
    await Promise.all([task('reset', 60), sleep(5).then(() => task('move', 10))]);

    // Never interleaved: each start is followed by its own end
    assert.deepEqual(timeline, ['reset:start', 'reset:end', 'move:start', 'move:end']);
});

await test('the second writer reads what the first one wrote', async () => {
    const client = fakeRedis();
    // Stands in for the board hash: the reset empties it, the move appends
    let board = ['queen-33', 'queen-34'];

    const reset = withStateLock(async () => {
        const loaded = board;            // read
        await sleep(50);                 // slow Vercel function
        board = loaded.filter(() => false);
    }, { client });

    const move = sleep(5).then(() => withStateLock(async () => {
        const loaded = board;            // must see the RESET board, not the old one
        await sleep(5);
        board = [...loaded, 'pawn-moved'];
    }, { client }));

    await Promise.all([reset, move]);

    // The pre-reset Queens must not come back with the move's write
    assert.deepEqual(board, ['pawn-moved']);
});

await test('the lock is released for the next caller', async () => {
    const client = fakeRedis();
    await withStateLock(async () => {}, { client });
    assert.equal(client.store.has(REDIS_STATE_LOCK), false);

    let ran = false;
    await withStateLock(async () => { ran = true; }, { client });
    assert.equal(ran, true);
});

await test('a released lock is not deleted by an overrun holder', async () => {
    const client = fakeRedis();
    // Somebody else holds the lock under a different token
    await client.set(REDIS_STATE_LOCK, 'other-owner');
    await withStateLock(async () => {}, { client, maxWaitMs: 150 });
    // We gave up waiting and ran unlocked — the other owner's lock survives
    assert.equal(client.store.get(REDIS_STATE_LOCK), 'other-owner');
});

await test('work still runs when Redis cannot hand out the lock', async () => {
    const brokenClient = {
        async set() { throw new Error('redis down'); },
        async eval() { throw new Error('redis down'); },
    };
    let ran = false;
    await withStateLock(async () => { ran = true; }, { client: brokenClient });
    assert.equal(ran, true, 'a lock failure must not swallow the player\'s move');
});

console.log(`\n${testCount - failCount}/${testCount} tests passed`);
if (failCount > 0) process.exit(1);
