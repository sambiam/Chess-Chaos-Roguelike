// =============================================================================
// CLIENT BOARD WRITE GUARD TESTS — run with: node tests/board-guard.test.mjs
// =============================================================================
// The double-Queen bug: Hot Drop spawns a Queen for each player into slots
// 33/34, Reset Board deletes them server-side, and then the first move of the
// "fresh" game showed both Queens again. They came back because a client that
// had missed the reset still had them in its mirror and posted that whole
// mirror to /api/board-state. These tests pin down that the server now filters
// pieces the authoritative board no longer has.

import assert from 'node:assert/strict';
import { filterResurrectedSlots, isPieceSlot, createStartingPieces } from '../shared/defs.js';

let testCount = 0;
let failCount = 0;
const test = (name, fn) => {
    testCount++;
    try {
        fn();
        console.log(`  ok - ${name}`);
    } catch (err) {
        failCount++;
        console.error(`  FAIL - ${name}`);
        console.error(`    ${err.message}`);
    }
};

// A board hash in the shape Redis stores: piece slots plus the extra keys
const boardHash = (pieces, extras = {}) => ({
    ...pieces,
    selectedSlot: null,
    boardEffects: {},
    highlightedSquare: null,
    ...extras,
});

const hotDropQueens = {
    '33': { image: 'Black Queen 1.png', color: 'black', label: 'Black Queen (Hot Drop)', position: { col: 2, row: 3 }, captured: false, emojis: [], moved: true },
    '34': { image: 'White Queen 1.png', color: 'white', label: 'White Queen (Hot Drop)', position: { col: 5, row: 5 }, captured: false, emojis: [], moved: true },
};

console.log('== client board write guard ==');

test('a stale mirror cannot bring back Queens the reset removed', () => {
    // Server: freshly reset, 32 pieces. Client: still carrying Hot Drop's Queens
    const server = boardHash(createStartingPieces());
    const stale = boardHash({ ...createStartingPieces(), ...hotDropQueens });

    const { board, dropped } = filterResurrectedSlots(stale, server);

    assert.deepEqual(dropped.sort(), ['33', '34']);
    assert.equal(board['33'], undefined);
    assert.equal(board['34'], undefined);
    assert.equal(Object.keys(board).filter(isPieceSlot).length, 32);
});

test('spawned pieces the server still has are left alone', () => {
    // Mid-game: the Queens are legitimately on the board, and the client is
    // posting a normal update (one of them has moved)
    const server = boardHash({ ...createStartingPieces(), ...hotDropQueens });
    const moved = structuredClone(hotDropQueens);
    moved['34'].position = { col: 5, row: 4 };
    const incoming = boardHash({ ...createStartingPieces(), ...moved });

    const { board, dropped } = filterResurrectedSlots(incoming, server);

    assert.deepEqual(dropped, []);
    assert.deepEqual(board['34'].position, { col: 5, row: 4 });
    assert.equal(Object.keys(board).filter(isPieceSlot).length, 34);
});

test('a captured spawned piece can still be reported as captured', () => {
    const server = boardHash({ ...createStartingPieces(), ...hotDropQueens });
    const incoming = structuredClone(server);
    incoming['33'].captured = true;

    const { board, dropped } = filterResurrectedSlots(incoming, server);

    assert.deepEqual(dropped, []);
    assert.equal(board['33'].captured, true);
});

test('the standard 32 always pass, so an empty database can be seeded', () => {
    const { board, dropped } = filterResurrectedSlots(boardHash(createStartingPieces()), {});

    assert.deepEqual(dropped, []);
    assert.equal(Object.keys(board).filter(isPieceSlot).length, 32);
});

test('non-piece keys are passed through untouched', () => {
    const server = boardHash(createStartingPieces());
    const incoming = boardHash(createStartingPieces(), {
        selectedSlot: '13',
        boardEffects: { '3,3': ['mine'] },
        highlightedSquare: { col: 1, row: 1, timestamp: 123 },
    });

    const { board } = filterResurrectedSlots(incoming, server);

    assert.equal(board.selectedSlot, '13');
    assert.deepEqual(board.boardEffects, { '3,3': ['mine'] });
    assert.deepEqual(board.highlightedSquare, { col: 1, row: 1, timestamp: 123 });
});

test('a client cannot invent a brand-new piece', () => {
    const server = boardHash(createStartingPieces());
    const incoming = boardHash({
        ...createStartingPieces(),
        '99': { image: 'White Queen 1.png', color: 'white', label: 'Free Queen', position: { col: 4, row: 4 }, captured: false, emojis: [], moved: true },
    });

    const { board, dropped } = filterResurrectedSlots(incoming, server);

    assert.deepEqual(dropped, ['99']);
    assert.equal(board['99'], undefined);
});

test('a post carrying nothing but ghosts leaves no pieces to write', () => {
    // The endpoint refuses to write this rather than emptying the board
    const { board, dropped } = filterResurrectedSlots(boardHash(hotDropQueens), boardHash(createStartingPieces()));

    assert.deepEqual(dropped.sort(), ['33', '34']);
    assert.equal(Object.keys(board).some(isPieceSlot), false);
});

console.log(`\n${testCount - failCount}/${testCount} tests passed`);
if (failCount > 0) process.exit(1);
