// =============================================================================
// ENGINE TESTS — run with: node tests/engine.test.mjs
// =============================================================================
// Covers move legality, rule modifiers, the death pipeline, choices, and the
// win condition. No framework — plain asserts so there are zero new deps.

import assert from 'node:assert/strict';
import {
    buildGame,
    getMovesForPiece,
    getAllLegalMoves,
    applyMove,
    killPiece,
    mustPass,
    pieceType,
    getPieceAt,
    alivePieces,
    serializeBoard,
    serializeTurn,
} from '../shared/engine.js';
import {
    applyRuleSelection,
    resolveChoice,
    finishTurn,
} from '../shared/effects.js';

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

// Deterministic rng for reproducible tests
const seededRng = (seed = 42) => {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePiece = (slot, color, type, col, row, extra = {}) => [slot, {
    label: `${color} ${type} ${slot}`,
    color,
    image: `${color === 'white' ? 'White' : 'Black'} ${type} 1.png`,
    position: { col, row },
    captured: false,
    emojis: [],
    moved: false,
    ...extra,
}];

// Builds a game from a compact piece list
const makeGame = (pieceSpecs, turnOverrides = {}) => {
    const board = Object.fromEntries(pieceSpecs);
    return buildGame(board, {
        currentTurn: 1,
        currentPlayer: 'white',
        currentRules: [],
        newRuleChoices: [],
        nextTurnWithNewRules: 4,
        seats: { white: 'u1', black: 'u2' },
        pendingChoices: [],
        gameOver: null,
        coinFlip: null,
        lastMove: null,
        ...turnOverrides,
    });
};

const standardGame = (turnOverrides = {}) => makeGame([
    makePiece('1', 'white', 'King', 4, 7),
    makePiece('2', 'white', 'Queen', 3, 7),
    makePiece('3', 'white', 'Rook', 0, 7),
    makePiece('4', 'white', 'Bishop', 2, 7),
    makePiece('5', 'white', 'Knight', 1, 7),
    makePiece('6', 'white', 'Pawn', 4, 6),
    makePiece('7', 'black', 'King', 4, 0),
    makePiece('8', 'black', 'Queen', 3, 0),
    makePiece('9', 'black', 'Pawn', 3, 1),
], turnOverrides);

const addRule = (game, id, data = {}, turnsLeft = 3) => {
    game.turn.currentRules.push({ id, title: id, description: id, isInstant: false, turnsLeft, data });
};

// ---------------------------------------------------------------------------
console.log('== basic movement ==');
// ---------------------------------------------------------------------------

test('pawn moves forward one and two from home row', () => {
    const game = standardGame();
    const moves = getMovesForPiece(game, '6');
    assert.ok(moves.some(m => m.col === 4 && m.row === 5));
    assert.ok(moves.some(m => m.col === 4 && m.row === 4 && m.special === 'doublestep'));
});

test('pawn cannot move forward into an occupied square', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 4, 6),
        makePiece('2', 'black', 'Pawn', 4, 5),
        makePiece('3', 'white', 'King', 0, 7),
        makePiece('4', 'black', 'King', 0, 0),
    ]);
    const moves = getMovesForPiece(game, '1');
    assert.equal(moves.length, 0);
});

test('pawn captures diagonally', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 4, 6),
        makePiece('2', 'black', 'Pawn', 3, 5),
        makePiece('3', 'white', 'King', 0, 7),
        makePiece('4', 'black', 'King', 0, 0),
    ]);
    const moves = getMovesForPiece(game, '1');
    assert.ok(moves.some(m => m.col === 3 && m.row === 5 && m.captureSlot === '2'));
});

test('knight leaps, rook slides and is blocked', () => {
    const game = standardGame();
    const knightMoves = getMovesForPiece(game, '5');
    assert.ok(knightMoves.some(m => m.col === 2 && m.row === 5));
    assert.ok(knightMoves.some(m => m.col === 0 && m.row === 5));
    const rookMoves = getMovesForPiece(game, '3');
    // Rook on A1 can go up the A file but not through the knight on B1
    assert.ok(rookMoves.some(m => m.col === 0 && m.row === 0));
    assert.ok(!rookMoves.some(m => m.col === 2 && m.row === 7));
});

test('cannot move opponent pieces via applyMove', () => {
    const game = standardGame();
    const result = applyMove(game, '9', 3, 2); // black pawn, white to move
    assert.equal(result.ok, false);
});

test('illegal target rejected', () => {
    const game = standardGame();
    const result = applyMove(game, '6', 0, 0);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'Illegal move');
});

test('legal move applies and captures', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'black', 'Pawn', 0, 1),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    const result = applyMove(game, '1', 0, 1, seededRng());
    assert.equal(result.ok, true);
    assert.equal(game.pieces['2'].captured, true);
    assert.deepEqual(game.pieces['1'].position, { col: 0, row: 1 });
});

test('castling kingside works when clear', () => {
    const game = makeGame([
        makePiece('1', 'white', 'King', 4, 7),
        makePiece('2', 'white', 'Rook', 7, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    const moves = getMovesForPiece(game, '1');
    const castle = moves.find(m => m.special === 'castle');
    assert.ok(castle);
    const result = applyMove(game, '1', castle.col, castle.row, seededRng());
    assert.equal(result.ok, true);
    assert.deepEqual(game.pieces['1'].position, { col: 6, row: 7 });
    assert.deepEqual(game.pieces['2'].position, { col: 5, row: 7 });
});

test('en passant capture', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 4, 3),
        makePiece('2', 'black', 'Pawn', 3, 3),
        makePiece('3', 'white', 'King', 0, 7),
        makePiece('4', 'black', 'King', 0, 0),
    ], { lastMove: { slot: '2', from: { col: 3, row: 1 }, to: { col: 3, row: 3 }, wasDoubleStep: true } });
    const moves = getMovesForPiece(game, '1');
    const ep = moves.find(m => m.special === 'enpassant');
    assert.ok(ep);
    const result = applyMove(game, '1', ep.col, ep.row, seededRng());
    assert.equal(result.ok, true);
    assert.equal(game.pieces['2'].captured, true);
});

test('pawn promotes to queen on back row', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 0, 1),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    const result = applyMove(game, '1', 0, 0, seededRng());
    assert.equal(result.ok, true);
    assert.equal(pieceType(game.pieces['1']), 'Queen');
});

// ---------------------------------------------------------------------------
console.log('== win condition ==');
// ---------------------------------------------------------------------------

test('capturing the king ends the game', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 4, 5),
        makePiece('2', 'white', 'King', 0, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    const result = applyMove(game, '1', 4, 0, seededRng());
    assert.equal(result.ok, true);
    assert.ok(game.turn.gameOver);
    assert.equal(game.turn.gameOver.winner, 'white');
});

test('no moves allowed after game over', () => {
    const game = standardGame({ gameOver: { winner: 'black', reason: 'test' } });
    assert.equal(Object.keys(getAllLegalMoves(game, 'white')).length, 0);
});

// ---------------------------------------------------------------------------
console.log('== rule modifiers: movement ==');
// ---------------------------------------------------------------------------

test('proletariat: everyone moves like a pawn', () => {
    const game = standardGame();
    addRule(game, 'proletariat');
    const queenMoves = getMovesForPiece(game, '2');
    // Queen on D1 may only step forward like a pawn (D2 free)
    assert.ok(queenMoves.every(m => m.row === 6));
});

test('trans_rights: king moves like queen, queen like king', () => {
    const game = makeGame([
        makePiece('1', 'white', 'King', 4, 4),
        makePiece('2', 'white', 'Queen', 0, 7),
        makePiece('3', 'black', 'King', 7, 0),
    ]);
    addRule(game, 'trans_rights');
    const kingMoves = getMovesForPiece(game, '1');
    assert.ok(kingMoves.some(m => Math.abs(m.col - 4) > 2 || Math.abs(m.row - 4) > 2));
    const queenMoves = getMovesForPiece(game, '2');
    assert.ok(queenMoves.every(m => Math.abs(m.col - 0) <= 1 && Math.abs(m.row - 7) <= 1));
});

test('severe_constipation: bishops and knights frozen', () => {
    const game = standardGame();
    addRule(game, 'severe_constipation');
    assert.equal(getMovesForPiece(game, '4').length, 0);
    assert.equal(getMovesForPiece(game, '5').length, 0);
});

test('short_stop: max one square, knights stuck', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 4),
        makePiece('2', 'white', 'Knight', 5, 5),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'short_stop');
    const rookMoves = getMovesForPiece(game, '1');
    assert.ok(rookMoves.length > 0);
    assert.ok(rookMoves.every(m => Math.abs(m.col) <= 1 && Math.abs(m.row - 4) <= 1));
    assert.equal(getMovesForPiece(game, '2').length, 0);
});

test('hobbit_battle: only pawns move (with fallback)', () => {
    const game = standardGame();
    addRule(game, 'hobbit_battle');
    const legal = getAllLegalMoves(game, 'white');
    assert.deepEqual(Object.keys(legal), ['6']);
});

test('bloodthirsty: must capture when possible', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'black', 'Pawn', 0, 1),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'bloodthirsty');
    const legal = getAllLegalMoves(game, 'white');
    const allMoves = Object.values(legal).flat();
    assert.ok(allMoves.length > 0);
    assert.ok(allMoves.every(m => m.captureSlot));
});

test('no_cowards: only forward moves', () => {
    const game = standardGame();
    addRule(game, 'no_cowards');
    const legal = getAllLegalMoves(game, 'white');
    for (const [slot, moves] of Object.entries(legal)) {
        for (const m of moves) {
            assert.ok(m.row < game.pieces[slot].position.row, `${slot} moved backward`);
        }
    }
});

test('christmas_truce: no captures allowed', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'black', 'Pawn', 0, 1),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'christmas_truce');
    const moves = getMovesForPiece(game, '1');
    assert.ok(!moves.some(m => m.captureSlot));
    // Rook can still move up to (but not onto) the pawn
    assert.ok(moves.some(m => m.col === 0 && m.row === 2));
});

test('hobbit_slaughter: only pawns can be captured', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'black', 'Knight', 0, 1),
        makePiece('3', 'black', 'Pawn', 1, 6),
        makePiece('4', 'white', 'King', 4, 7),
        makePiece('5', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'hobbit_slaughter');
    const rookMoves = getMovesForPiece(game, '1');
    assert.ok(!rookMoves.some(m => m.captureSlot === '2'));
});

test('frozen pieces cannot move and cannot be captured', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'black', 'Pawn', 0, 1, { emojis: ['frozen'] }),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    assert.equal(getMovesForPiece(game, '2').length, 0);
    const rookMoves = getMovesForPiece(game, '1');
    assert.ok(!rookMoves.some(m => m.captureSlot === '2'));
});

test('all_on_red tails: king only', () => {
    const game = standardGame({ coinFlip: { player: 'white', result: 'tails', turn: 1 } });
    addRule(game, 'all_on_red');
    const legal = getAllLegalMoves(game, 'white');
    assert.deepEqual(Object.keys(legal), ['1']);
});

test('tornado: reachable marked square forces the move', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'white', 'Knight', 6, 6),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'tornado', { square: { col: 0, row: 3 } });
    const legal = getAllLegalMoves(game, 'white');
    const allMoves = Object.values(legal).flat();
    assert.ok(allMoves.every(m => m.col === 0 && m.row === 3));
});

test('no_mans_land: cannot enter or cross the column', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 4),
        makePiece('2', 'white', 'King', 4, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'no_mans_land', { column: 3 });
    const moves = getMovesForPiece(game, '1');
    assert.ok(!moves.some(m => m.col >= 3 && m.row === 4));
});

test('nuclear fallout blocked square stops slides', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 4),
        makePiece('2', 'white', 'King', 4, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    game.boardEffects['3,4'] = ['blocked'];
    const moves = getMovesForPiece(game, '1');
    assert.ok(moves.some(m => m.col === 2 && m.row === 4));
    assert.ok(!moves.some(m => m.col >= 3 && m.row === 4));
});

test('ice_physics: sliders must move max distance', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 4),
        makePiece('2', 'white', 'King', 4, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'ice_physics');
    const moves = getMovesForPiece(game, '1');
    // Along the row the rook must go all the way to H5 (col 7)
    const rowMoves = moves.filter(m => m.row === 4);
    assert.equal(rowMoves.length, 1);
    assert.equal(rowMoves[0].col, 7);
});

test('pacman wrap lets rook cross the board edge', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 4),
        makePiece('2', 'black', 'Pawn', 6, 4),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'pacman_style');
    const moves = getMovesForPiece(game, '1');
    // Moving LEFT from col 0 wraps to col 7 and continues to the pawn at col 6
    assert.ok(moves.some(m => m.col === 7 && m.row === 4));
    assert.ok(moves.some(m => m.col === 6 && m.row === 4 && m.captureSlot === '2'));
});

test('pawns_with_viagra: sideways captures', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 4, 4),
        makePiece('2', 'black', 'Knight', 5, 4),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'pawns_with_viagra');
    const moves = getMovesForPiece(game, '1');
    assert.ok(moves.some(m => m.col === 5 && m.row === 4 && m.captureSlot === '2'));
});

test('pawns_learned_strength: push a chain into empty space', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 4, 6),
        makePiece('2', 'black', 'Pawn', 4, 5),
        makePiece('3', 'black', 'Rook', 4, 4),
        makePiece('4', 'white', 'King', 0, 7),
        makePiece('5', 'black', 'King', 0, 0),
    ]);
    addRule(game, 'pawns_learned_strength');
    const moves = getMovesForPiece(game, '1');
    const push = moves.find(m => m.special === 'push');
    assert.ok(push);
    const result = applyMove(game, '1', push.col, push.row, seededRng());
    assert.equal(result.ok, true);
    assert.deepEqual(game.pieces['2'].position, { col: 4, row: 4 });
    assert.deepEqual(game.pieces['3'].position, { col: 4, row: 3 });
    assert.deepEqual(game.pieces['1'].position, { col: 4, row: 5 });
});

test('god_kings: king immune and 2-square moves', () => {
    const game = makeGame([
        makePiece('1', 'white', 'King', 4, 7),
        makePiece('2', 'black', 'Rook', 4, 0),
        makePiece('3', 'black', 'King', 0, 0),
    ]);
    addRule(game, 'god_kings');
    const kingMoves = getMovesForPiece(game, '1');
    assert.ok(kingMoves.some(m => m.row === 5)); // two squares forward
    // Black rook cannot capture the immune king
    const rookMoves = getMovesForPiece(game, '2');
    assert.ok(!rookMoves.some(m => m.captureSlot === '1'));
});

// ---------------------------------------------------------------------------
console.log('== death pipeline ==');
// ---------------------------------------------------------------------------

test('down_with_the_ship kills the capturer', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'black', 'Pawn', 0, 1),
        makePiece('3', 'white', 'King', 4, 7),
        makePiece('4', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'down_with_the_ship');
    const result = applyMove(game, '1', 0, 1, seededRng());
    assert.equal(result.ok, true);
    assert.equal(game.pieces['2'].captured, true);
    assert.equal(game.pieces['1'].captured, true);
});

test('soul_link: sibling knights die together', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'black', 'Knight', 0, 1),
        makePiece('3', 'black', 'Knight', 7, 1),
        makePiece('4', 'white', 'King', 4, 7),
        makePiece('5', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'soul_link');
    const result = applyMove(game, '1', 0, 1, seededRng());
    assert.equal(result.ok, true);
    assert.equal(game.pieces['2'].captured, true);
    assert.equal(game.pieces['3'].captured, true);
});

test('immortal pieces survive kill attempts', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 0, 6, { emojis: ['immortal'] }),
        makePiece('2', 'white', 'King', 4, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    killPiece(game, game.pieces['1'], 'test', seededRng());
    assert.equal(game.pieces['1'].captured, false);
});

test('mine kills the piece that steps on it', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Rook', 0, 7),
        makePiece('2', 'white', 'King', 4, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    game.boardEffects['0,3'] = ['mine'];
    const result = applyMove(game, '1', 0, 3, seededRng());
    assert.equal(result.ok, true);
    assert.equal(game.pieces['1'].captured, true);
    assert.ok(!(game.boardEffects['0,3'] || []).includes('mine'));
});

test('treasure chest promotes the entering piece', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 0, 6),
        makePiece('2', 'white', 'King', 4, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    game.boardEffects['0,5'] = ['chest'];
    const result = applyMove(game, '1', 0, 5, seededRng());
    assert.equal(result.ok, true);
    assert.equal(pieceType(game.pieces['1']), 'Queen');
});

// ---------------------------------------------------------------------------
console.log('== instant rule effects ==');
// ---------------------------------------------------------------------------

test('they_deserved_it kills exactly one non-king', () => {
    const game = standardGame();
    const before = alivePieces(game).length;
    applyRuleSelection(game, { id: 'they_deserved_it', data: {} }, 'white', seededRng());
    assert.equal(alivePieces(game).length, before - 1);
    assert.equal(alivePieces(game, null, 'King').length, 2);
});

test('born_again_christian converts queens to bishops', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'born_again_christian', data: {} }, 'white', seededRng());
    assert.equal(alivePieces(game, null, 'Queen').length, 0);
    assert.ok(alivePieces(game, null, 'Bishop').length >= 3);
});

test('hot_drop spawns a queen for each side', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'hot_drop', data: {} }, 'white', seededRng());
    assert.equal(alivePieces(game, 'white', 'Queen').length, 2);
    assert.equal(alivePieces(game, 'black', 'Queen').length, 2);
});

test('march_of_the_pawnguins advances pawns', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'march_of_the_pawnguins', data: {} }, 'white', seededRng());
    assert.deepEqual(game.pieces['6'].position, { col: 4, row: 5 });
    assert.deepEqual(game.pieces['9'].position, { col: 3, row: 2 });
});

test('minefield places two mines', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'minefield', data: {} }, 'white', seededRng());
    const mines = Object.values(game.boardEffects).filter(effects => effects.includes('mine'));
    assert.equal(mines.length, 2);
});

test('mind_control creates choices for both players', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'mind_control', data: {} }, 'white', seededRng());
    assert.equal(game.turn.pendingChoices.length, 2);
    assert.ok(game.turn.pendingChoices.some(c => c.color === 'white'));
    assert.ok(game.turn.pendingChoices.some(c => c.color === 'black'));
    // Choices block movement
    assert.equal(Object.keys(getAllLegalMoves(game, 'white')).length, 0);
});

test('resolving mind_control converts the piece', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'mind_control', data: {} }, 'white', seededRng());
    const whiteChoice = game.turn.pendingChoices.find(c => c.color === 'white');
    const targetSlot = whiteChoice.candidates[0];
    const result = resolveChoice(game, whiteChoice.id, targetSlot, seededRng());
    assert.equal(result.ok, true);
    assert.equal(game.pieces[targetSlot].color, 'white');
    assert.equal(game.turn.pendingChoices.length, 1);
});

test('sophies_choice kill resolves via choice', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'sophies_choice', data: {} }, 'white', seededRng());
    const choice = game.turn.pendingChoices.find(c => c.color === 'white');
    assert.ok(choice);
    assert.equal(choice.candidates.length, 2);
    const victim = choice.candidates[0];
    resolveChoice(game, choice.id, victim, seededRng());
    assert.equal(game.pieces[victim].captured, true);
});

test('horse_race resolves with a winner choice', () => {
    const game = standardGame();
    applyRuleSelection(game, { id: 'horse_race', data: {} }, 'white', seededRng());
    assert.equal(game.turn.pendingChoices.length, 1);
    const choice = game.turn.pendingChoices[0];
    assert.equal(choice.kind, 'square');
    const before = alivePieces(game, choice.color, 'Knight').length;
    resolveChoice(game, choice.id, choice.candidates[0], seededRng());
    assert.equal(alivePieces(game, choice.color, 'Knight').length, before + 1);
});

test('kids_in_trenchcoat chains three choices', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 0, 6),
        makePiece('2', 'white', 'Pawn', 1, 6),
        makePiece('3', 'white', 'Pawn', 2, 6),
        makePiece('4', 'white', 'King', 4, 7),
        makePiece('5', 'black', 'King', 4, 0),
    ]);
    const rng = seededRng();
    applyRuleSelection(game, { id: 'kids_in_trenchcoat', data: {} }, 'white', rng);
    let choice = game.turn.pendingChoices[0];
    resolveChoice(game, choice.id, choice.candidates[0], rng);
    choice = game.turn.pendingChoices[0];
    assert.equal(choice.step, 'pawn2');
    resolveChoice(game, choice.id, choice.candidates[0], rng);
    choice = game.turn.pendingChoices[0];
    assert.equal(choice.step, 'place');
    resolveChoice(game, choice.id, choice.candidates[0], rng);
    assert.equal(game.turn.pendingChoices.length, 0);
    assert.equal(alivePieces(game, 'white', 'Pawn').length, 1);
    assert.equal(alivePieces(game, 'white', 'Bishop').length, 1);
});

test('mr_freeze freezes the chosen column', () => {
    const game = standardGame();
    const rule = { id: 'mr_freeze', data: {}, turnsLeft: 3, isInstant: false, title: 'Mr Freeze', description: '' };
    game.turn.currentRules.push(rule);
    applyRuleSelection(game, rule, 'white', seededRng());
    const choice = game.turn.pendingChoices[0];
    resolveChoice(game, choice.id, 4, seededRng()); // column E
    assert.ok(game.pieces['1'].emojis.includes('frozen')); // white king E1
    assert.ok(game.pieces['6'].emojis.includes('frozen')); // white pawn E2
});

// ---------------------------------------------------------------------------
console.log('== turn lifecycle ==');
// ---------------------------------------------------------------------------

test('finishTurn flips player, ticks rules, expires them', () => {
    const game = standardGame();
    addRule(game, 'bloodthirsty', {}, 1);
    const { ruleJustExpired } = finishTurn(game, seededRng());
    assert.equal(game.turn.currentPlayer, 'black');
    assert.equal(game.turn.currentTurn, 2);
    assert.equal(ruleJustExpired, true);
    assert.equal(game.turn.currentRules.length, 0);
});

test('new rules offered on schedule', () => {
    const game = standardGame({ currentTurn: 3, nextTurnWithNewRules: 4 });
    finishTurn(game, seededRng());
    assert.equal(game.turn.newRuleChoices.length, 3);
    assert.equal(game.turn.nextTurnWithNewRules, 7);
});

test('time_bomb expiry wipes column E', () => {
    const game = standardGame();
    addRule(game, 'time_bomb', {}, 1);
    finishTurn(game, seededRng());
    assert.equal(game.pieces['6'].captured, true); // white pawn E2
    // Kings in column E die too — game over fires
    assert.ok(game.turn.gameOver);
});

test('living_bomb explodes at expiry', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 4, 4),
        makePiece('2', 'black', 'Pawn', 4, 3),
        makePiece('3', 'black', 'Pawn', 5, 4),
        makePiece('4', 'white', 'King', 0, 7),
        makePiece('5', 'black', 'King', 0, 0),
    ]);
    addRule(game, 'living_bomb', { slot: '1' }, 1);
    game.pieces['1'].emojis.push('bomb');
    finishTurn(game, seededRng());
    assert.equal(game.pieces['1'].captured, true);
    assert.equal(game.pieces['2'].captured, true);
    assert.equal(game.pieces['3'].captured, true);
});

test('portal_3 swaps square contents at end of turn', () => {
    const game = makeGame([
        makePiece('1', 'white', 'Pawn', 0, 6),
        makePiece('2', 'white', 'King', 4, 7),
        makePiece('3', 'black', 'King', 4, 0),
    ]);
    addRule(game, 'portal_3', { squares: [{ col: 0, row: 6 }, { col: 7, row: 3 }] }, 5);
    finishTurn(game, seededRng());
    assert.deepEqual(game.pieces['1'].position, { col: 7, row: 3 });
});

test('blood_sacrifice demands a victim after the turn', () => {
    const game = standardGame();
    addRule(game, 'blood_sacrifice', {}, 3);
    finishTurn(game, seededRng());
    const choice = game.turn.pendingChoices.find(c => c.ruleId === 'blood_sacrifice');
    assert.ok(choice);
    assert.equal(choice.color, 'white'); // the mover
});

test('mustPass detects a stuck player', () => {
    const game = makeGame([
        makePiece('1', 'white', 'King', 4, 7, { emojis: ['frozen'] }),
        makePiece('2', 'black', 'King', 4, 0),
    ]);
    assert.equal(mustPass(game, 'white'), true);
});

// ---------------------------------------------------------------------------
console.log('== serialization round-trip ==');
// ---------------------------------------------------------------------------

test('serialize -> build round trip preserves state', () => {
    const game = standardGame();
    addRule(game, 'parry');
    game.boardEffects['2,2'] = ['mine'];
    const rebuilt = buildGame(serializeBoard(game), serializeTurn(game));
    assert.equal(alivePieces(rebuilt).length, alivePieces(game).length);
    assert.deepEqual(rebuilt.boardEffects['2,2'], ['mine']);
    assert.equal(rebuilt.turn.currentRules.length, 1);
    assert.deepEqual(rebuilt.turn.seats, { white: 'u1', black: 'u2' });
});

// ---------------------------------------------------------------------------

console.log(`\n${testCount - failCount}/${testCount} tests passed`);
if (failCount > 0) process.exit(1);
