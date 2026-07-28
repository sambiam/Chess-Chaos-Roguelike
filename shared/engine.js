// =============================================================================
// CHESS CHAOS ENGINE — move legality + move application
// =============================================================================
// Shared by client (legal-move highlighting) and server (authoritative
// validation & application). All functions operate on a plain "game" object:
//
// game = {
//     pieces: { slot: { slot, label, color, image, position:{col,row},
//                       captured, emojis:[], moved } },
//     boardEffects: { "col,row": [effectName, ...] },
//     turn: {
//         currentTurn, currentPlayer, currentRules: [ruleInstance],
//         newRuleChoices, nextTurnWithNewRules,
//         seats: { white: userId|null, black: userId|null },
//         pendingChoices: [],
//         gameOver: null | { winner, reason },
//         coinFlip: null | { player, result, turn },
//         lastMove: null | { slot, from, to, wasDoubleStep },
//     },
//     events: [],   // transient — human-readable log entries for toasts
// }
//
// The engine is deterministic except where it takes `rng` (a () => [0,1)
// function). The server passes Math.random; tests pass a seeded rng.

import {
    typeFromImage,
    imageForType,
    inBounds,
    toNotation,
    squareKey,
    adjacentSquares,
    forwardDir,
    enemyBackRow,
    otherColor,
} from './defs.js';

// =============================================================================
// BASIC STATE HELPERS
// =============================================================================

export const pieceType = (piece) => typeFromImage(piece.image);

export const hasRule = (game, ruleId) =>
    game.turn.currentRules.some(r => r.id === ruleId);

export const getRule = (game, ruleId) =>
    game.turn.currentRules.find(r => r.id === ruleId) || null;

export const alivePieces = (game, color = null, type = null) =>
    Object.values(game.pieces).filter(p => {
        if (p.captured) return false;
        if (color && p.color !== color) return false;
        if (type && pieceType(p) !== type) return false;
        return true;
    });

export const getPieceAt = (game, col, row) =>
    Object.values(game.pieces).find(p =>
        !p.captured && p.position.col === col && p.position.row === row
    ) || null;

export const emptySquares = (game, { excludeEffects = true } = {}) => {
    const result = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (getPieceAt(game, col, row)) continue;
            if (excludeEffects && (game.boardEffects[squareKey(col, row)] || []).length > 0) continue;
            result.push({ col, row });
        }
    }
    return result;
};

export const squareHasEffect = (game, col, row, name) =>
    (game.boardEffects[squareKey(col, row)] || []).includes(name);

export const addSquareEffect = (game, col, row, name) => {
    const key = squareKey(col, row);
    if (!game.boardEffects[key]) game.boardEffects[key] = [];
    if (!game.boardEffects[key].includes(name)) game.boardEffects[key].push(name);
};

export const removeSquareEffect = (game, col, row, name) => {
    const key = squareKey(col, row);
    if (!game.boardEffects[key]) return;
    game.boardEffects[key] = game.boardEffects[key].filter(e => e !== name);
    if (game.boardEffects[key].length === 0) delete game.boardEffects[key];
};

export const logEvent = (game, text) => {
    game.events.push(text);
};

const hasStatus = (piece, name) => piece.emojis.includes(name);

export const addStatus = (game, piece, name) => {
    if (!piece.emojis.includes(name)) piece.emojis.push(name);
};

export const removeStatus = (game, piece, name) => {
    piece.emojis = piece.emojis.filter(e => e !== name);
};

export const pickRandom = (arr, rng) =>
    arr.length ? arr[Math.floor(rng() * arr.length)] : null;

// =============================================================================
// PIECE CONDITION CHECKS
// =============================================================================

// A piece with the frozen or mitosis marker can't move at all
export const isImmobilized = (game, piece) =>
    hasStatus(piece, 'frozen') || hasStatus(piece, 'mitosis');

// Can this piece die right now, by any means?
// (Both freeze rules grant immunity along with the freeze.)
export const isUnkillable = (game, piece) => {
    if (hasStatus(piece, 'immortal')) return true;
    if (hasStatus(piece, 'frozen')) return true;
    if (hasRule(game, 'christmas_truce')) return true;
    if (hasRule(game, 'hobbit_slaughter') && pieceType(piece) !== 'Pawn') return true;
    if (hasRule(game, 'god_kings') && pieceType(piece) === 'King') return true;
    return false;
};

// =============================================================================
// MOVESET RESOLUTION
// =============================================================================
// Determines which movement pattern a piece actually uses once statuses and
// active rules are taken into account.

export const effectiveMoveset = (game, piece) => {
    // Proletariat trumps everything: every piece moves like a Pawn
    if (hasRule(game, 'proletariat')) return 'Pawn';

    // Manual/rule-applied status emojis override the piece's own type
    if (hasStatus(piece, 'pawn_moveset')) return 'Pawn';
    if (hasStatus(piece, 'queen_moveset')) return 'Queen';
    if (hasStatus(piece, 'king_moveset')) return 'King';

    let type = pieceType(piece);
    if (type === 'King' && (hasRule(game, 'trans_rights') || hasRule(game, 'estrogen'))) {
        return 'Queen';
    }
    if (type === 'Queen' && hasRule(game, 'trans_rights')) {
        return 'King';
    }
    return type;
};

// King range is 1 normally, 2 under Knee Surgery / God Kings
const kingRange = (game) =>
    (hasRule(game, 'knee_surgery') || hasRule(game, 'god_kings')) ? 2 : 1;

// =============================================================================
// SQUARE TRAVERSAL (respects Pacman wrap + blocked/wall squares)
// =============================================================================

const wrapActive = (game) => hasRule(game, 'pacman_style');

// Normalizes a column with Pacman wrap; returns null if out of bounds without it
const resolveCol = (game, col) => {
    if (col >= 0 && col < 8) return col;
    if (wrapActive(game)) return ((col % 8) + 8) % 8;
    return null;
};

const noMansColumn = (game) => {
    const rule = getRule(game, 'no_mans_land');
    return rule && rule.data && rule.data.column !== undefined ? rule.data.column : null;
};

// Can a piece occupy/pass through this square at all (static square effects)?
const squareIsBlocked = (game, col, row) => squareHasEffect(game, col, row, 'blocked');

// =============================================================================
// PSEUDO-MOVE GENERATION (per piece, before global filters)
// =============================================================================
// A move is { col, row, captureSlot: slot|null, special: null|'castle'|'enpassant'|'push', meta? }

const SLIDE_DIRS = {
    Rook:   [[0, 1], [0, -1], [1, 0], [-1, 0]],
    Bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    Queen:  [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

const KNIGHT_LEAPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

// Would moving from fromCol toward toCol cross the No Mans Land wall column?
// (Straddle check on the non-wrapped axis; entering the column is checked separately.)
const crossesWall = (game, fromCol, toCol) => {
    const wall = noMansColumn(game);
    if (wall === null) return false;
    if (fromCol === wall) return false; // pieces inside the column can leave it
    return (fromCol < wall && toCol > wall) || (fromCol > wall && toCol < wall);
};

const entersWall = (game, toCol) => {
    const wall = noMansColumn(game);
    return wall !== null && toCol === wall;
};

// Generates sliding moves along dirs, walking square by square
const slideMoves = (game, piece, dirs, maxDist = 8) => {
    const moves = [];
    const wall = noMansColumn(game);
    for (const [dc, dr] of dirs) {
        let col = piece.position.col;
        let row = piece.position.row;
        let steps = 0;
        while (steps < maxDist) {
            const nextRow = row + dr;
            const nextColRaw = col + dc;
            const nextCol = resolveCol(game, nextColRaw);
            if (nextCol === null || nextRow < 0 || nextRow > 7) break;
            // Full wrap-around back to start — stop
            if (nextCol === piece.position.col && nextRow === piece.position.row) break;
            // Static blockers stop the ray before the square
            if (squareIsBlocked(game, nextCol, nextRow)) break;
            // No Mans Land column can't be entered or crossed
            if (wall !== null && piece.position.col !== wall && nextCol === wall) break;
            const occupant = getPieceAt(game, nextCol, nextRow);
            if (occupant) {
                if (occupant.color !== piece.color) {
                    moves.push({ col: nextCol, row: nextRow, captureSlot: occupant.slot, special: null });
                }
                break;
            }
            moves.push({ col: nextCol, row: nextRow, captureSlot: null, special: null });
            col = nextCol;
            row = nextRow;
            steps++;
        }
    }
    return moves;
};

// Generates fixed-offset (leap/step) moves
const leapMoves = (game, piece, offsets) => {
    const moves = [];
    for (const [dc, dr] of offsets) {
        const col = resolveCol(game, piece.position.col + dc);
        const row = piece.position.row + dr;
        if (col === null || row < 0 || row > 7) continue;
        if (squareIsBlocked(game, col, row)) continue;
        if (entersWall(game, col)) continue;
        if (crossesWall(game, piece.position.col, col)) continue;
        const occupant = getPieceAt(game, col, row);
        if (occupant && occupant.color === piece.color) continue;
        moves.push({ col, row, captureSlot: occupant ? occupant.slot : null, special: null });
    }
    return moves;
};

// King steps within `range` (range 2 slides through the intermediate square)
const kingMoves = (game, piece) => {
    const range = kingRange(game);
    const dirs = SLIDE_DIRS.Queen;
    const moves = slideMoves(game, piece, dirs, range);
    // Castling: only in a vanilla king situation (original square, never moved)
    moves.push(...castlingMoves(game, piece));
    return moves;
};

const castlingMoves = (game, piece) => {
    const moves = [];
    if (pieceType(piece) !== 'King' || piece.moved) return moves;
    const homeRow = piece.color === 'white' ? 7 : 0;
    if (piece.position.col !== 4 || piece.position.row !== homeRow) return moves;
    for (const rookCol of [0, 7]) {
        const rook = getPieceAt(game, rookCol, homeRow);
        if (!rook || rook.moved || rook.color !== piece.color || pieceType(rook) !== 'Rook') continue;
        const dir = rookCol === 0 ? -1 : 1;
        // All squares between king and rook must be empty and enterable
        let clear = true;
        for (let c = 4 + dir; c !== rookCol; c += dir) {
            if (getPieceAt(game, c, homeRow) || squareIsBlocked(game, c, homeRow) ||
                entersWall(game, c)) { clear = false; break; }
        }
        if (!clear) continue;
        moves.push({
            col: 4 + 2 * dir, row: homeRow, captureSlot: null,
            special: 'castle', meta: { rookSlot: rook.slot, rookToCol: 4 + dir },
        });
    }
    return moves;
};

const pawnMoves = (game, piece, rng) => {
    const moves = [];
    const dir = forwardDir(piece.color);
    const { col, row } = piece.position;
    const oneAhead = row + dir;

    if (oneAhead >= 0 && oneAhead <= 7) {
        const blocked = squareIsBlocked(game, col, oneAhead);
        const occupant = getPieceAt(game, col, oneAhead);
        // Forward one into an empty square
        if (!blocked && !occupant) {
            moves.push({ col, row: oneAhead, captureSlot: null, special: null });
            // Double-step from the pawn home row
            const homeRow = piece.color === 'white' ? 6 : 1;
            const twoAhead = row + 2 * dir;
            if (row === homeRow && twoAhead >= 0 && twoAhead <= 7 &&
                !getPieceAt(game, col, twoAhead) && !squareIsBlocked(game, col, twoAhead)) {
                moves.push({ col, row: twoAhead, captureSlot: null, special: 'doublestep' });
            }
        }
        // Pawns learned Strength: push an occupied square's chain forward
        if (!blocked && occupant && hasRule(game, 'pawns_learned_strength')) {
            const chain = [];
            let c = oneAhead;
            let valid = false;
            while (c >= 0 && c <= 7) {
                const p = getPieceAt(game, col, c);
                if (!p) { valid = !squareIsBlocked(game, col, c); break; }
                if (squareIsBlocked(game, col, c)) break;
                chain.push(p.slot);
                c += dir;
            }
            if (valid && chain.length > 0) {
                moves.push({
                    col, row: oneAhead, captureSlot: null,
                    special: 'push', meta: { chain },
                });
            }
        }
        // Diagonal captures
        for (const dc of [-1, 1]) {
            const capCol = resolveCol(game, col + dc);
            if (capCol === null || squareIsBlocked(game, capCol, oneAhead)) continue;
            if (entersWall(game, capCol)) continue;
            const target = getPieceAt(game, capCol, oneAhead);
            if (target && target.color !== piece.color) {
                moves.push({ col: capCol, row: oneAhead, captureSlot: target.slot, special: null });
            }
            // En passant
            const lm = game.turn.lastMove;
            if (!target && lm && lm.wasDoubleStep) {
                const victim = game.pieces[lm.slot];
                if (victim && !victim.captured && victim.color !== piece.color &&
                    victim.position.col === capCol && victim.position.row === row) {
                    moves.push({
                        col: capCol, row: oneAhead, captureSlot: victim.slot,
                        special: 'enpassant',
                    });
                }
            }
        }
    }

    // Pawns with Viagra: capture directly left/right
    if (hasRule(game, 'pawns_with_viagra')) {
        for (const dc of [-1, 1]) {
            const capCol = resolveCol(game, col + dc);
            if (capCol === null || squareIsBlocked(game, capCol, row)) continue;
            if (entersWall(game, capCol)) continue;
            const target = getPieceAt(game, capCol, row);
            if (target && target.color !== piece.color) {
                moves.push({ col: capCol, row, captureSlot: target.slot, special: null });
            }
        }
    }

    return moves;
};

// All pseudo-legal moves for one piece (before cross-piece global filters)
export const getMovesForPiece = (game, slot) => {
    const piece = game.pieces[slot];
    if (!piece || piece.captured) return [];
    if (game.turn.gameOver) return [];
    if (isImmobilized(game, piece)) return [];

    const type = pieceType(piece);

    // Severe Constipation: actual Bishops and Knights cannot move
    if (hasRule(game, 'severe_constipation') && (type === 'Bishop' || type === 'Knight')) return [];

    const moveset = effectiveMoveset(game, piece);

    // Short Stop: Knights (by moveset) cannot move at all
    if (hasRule(game, 'short_stop') && moveset === 'Knight') return [];

    let moves;
    switch (moveset) {
        case 'Pawn':   moves = pawnMoves(game, piece); break;
        case 'Knight': moves = leapMoves(game, piece, KNIGHT_LEAPS); break;
        case 'King':   moves = kingMoves(game, piece); break;
        case 'Rook':
        case 'Bishop':
        case 'Queen':  moves = slideMoves(game, piece, SLIDE_DIRS[moveset]); break;
        default:       moves = [];
    }

    // Ice Physics: sliding movesets must move the maximum distance per direction.
    // Keep, for each direction ray, only the furthest reachable square.
    if (hasRule(game, 'ice_physics') &&
        (moveset === 'Rook' || moveset === 'Bishop' || moveset === 'Queen')) {
        const byDir = {};
        for (const m of moves) {
            let dc = Math.sign(m.col - piece.position.col);
            let dr = Math.sign(m.row - piece.position.row);
            // With pacman wrap the sign can flip; bucket by direction of first step instead
            const dist = Math.max(Math.abs(m.col - piece.position.col), Math.abs(m.row - piece.position.row));
            const dirKey = `${dc},${dr}`;
            if (!byDir[dirKey] || byDir[dirKey].dist < dist) {
                byDir[dirKey] = { move: m, dist };
            }
        }
        moves = Object.values(byDir).map(x => x.move);
    }

    // Short Stop: cap distance at 1 square
    if (hasRule(game, 'short_stop')) {
        moves = moves.filter(m =>
            Math.abs(m.col - piece.position.col) <= 1 &&
            Math.abs(m.row - piece.position.row) <= 1);
    }

    // Can never capture an unkillable piece (immortal, frozen, truce, etc.)
    moves = moves.filter(m => {
        if (!m.captureSlot) return true;
        const target = game.pieces[m.captureSlot];
        return target && !isUnkillable(game, target);
    });

    // No Cowards: per-piece forward-progress filter is applied globally below
    return moves;
};

// =============================================================================
// GLOBAL (CROSS-PIECE) MOVE FILTERS
// =============================================================================
// Returns { slot: [moves] } for everything the given color can legally do
// right now, applying rules that constrain the whole side at once.

export const getAllLegalMoves = (game, color) => {
    if (game.turn.gameOver) return {};

    // Pending choices block all movement until resolved
    if ((game.turn.pendingChoices || []).length > 0) return {};

    let byPiece = {};
    for (const piece of alivePieces(game, color)) {
        const moves = getMovesForPiece(game, piece.slot);
        if (moves.length) byPiece[piece.slot] = moves;
    }

    const applyFilter = (filterFn) => {
        const filtered = {};
        for (const [slot, moves] of Object.entries(byPiece)) {
            const kept = moves.filter(m => filterFn(game.pieces[slot], m));
            if (kept.length) filtered[slot] = kept;
        }
        return filtered;
    };

    const nonEmpty = (obj) => Object.keys(obj).length > 0;

    // Hobbit Battle: only Pawns may move (fallback to all if no pawn can move)
    if (hasRule(game, 'hobbit_battle')) {
        const pawnsOnly = applyFilter(p => pieceType(p) === 'Pawn');
        if (nonEmpty(pawnsOnly)) byPiece = pawnsOnly;
    }

    // All on Red: on tails you may only move your King (fallback if king is stuck)
    const flip = game.turn.coinFlip;
    if (hasRule(game, 'all_on_red') && flip && flip.player === color && flip.result === 'tails') {
        const kingOnly = applyFilter(p => pieceType(p) === 'King');
        if (nonEmpty(kingOnly)) byPiece = kingOnly;
    }

    // No Cowards: every move must go toward the opponent (fallback if impossible)
    if (hasRule(game, 'no_cowards')) {
        const dir = forwardDir(color);
        const forwardOnly = applyFilter((p, m) => Math.sign(m.row - p.position.row) === dir);
        if (nonEmpty(forwardOnly)) byPiece = forwardOnly;
    }

    // Bloodthirsty: if any capture exists, you must capture
    if (hasRule(game, 'bloodthirsty')) {
        const capturesOnly = applyFilter((p, m) => !!m.captureSlot);
        if (nonEmpty(capturesOnly)) byPiece = capturesOnly;
    }

    // Tornado: if any piece can reach the marked square, one must
    const tornadoRule = getRule(game, 'tornado');
    if (tornadoRule && tornadoRule.data && tornadoRule.data.square) {
        const { col, row } = tornadoRule.data.square;
        if (!getPieceAt(game, col, row)) {
            const intoTornado = applyFilter((p, m) => m.col === col && m.row === row);
            if (nonEmpty(intoTornado)) byPiece = intoTornado;
        }
    }

    return byPiece;
};

// True when the color has no legal move at all (they must pass)
export const mustPass = (game, color) =>
    Object.keys(getAllLegalMoves(game, color)).length === 0;

// =============================================================================
// DEATH PIPELINE
// =============================================================================
// All piece deaths funnel through killPiece so rule interactions trigger
// consistently: Soul Link, Kamikaze, win detection, etc.

// Attempts to kill a piece. Returns true if it died.
// Deaths caused by this death are queued and processed iteratively (cascades).
export const killPiece = (game, piece, cause, rng) => {
    const queue = [{ piece, cause }];
    let anyDied = false;
    let processed = 0;
    while (queue.length > 0 && processed < 200) { // hard cap: no infinite cascades
        processed++;
        const { piece: victim, cause: victimCause } = queue.shift();
        if (!victim || victim.captured) continue;
        if (isUnkillable(game, victim)) {
            logEvent(game, `${victim.label} survives ${victimCause} (protected)`);
            continue;
        }
        const deathSquare = { ...victim.position };
        victim.captured = true;
        victim.emojis = [];
        anyDied = true;
        logEvent(game, `${victim.label} dies (${victimCause})`);

        // King down = game over
        if (pieceType(victim) === 'King' && !game.turn.gameOver) {
            game.turn.gameOver = {
                winner: otherColor(victim.color),
                reason: `${victim.label} was destroyed (${victimCause})`,
            };
            logEvent(game, `GAME OVER — ${otherColor(victim.color)} wins!`);
        }

        // Soul Link: same-type same-color siblings die too (Knights/Rooks/Bishops)
        if (hasRule(game, 'soul_link')) {
            const type = pieceType(victim);
            if (type === 'Knight' || type === 'Rook' || type === 'Bishop') {
                for (const sibling of alivePieces(game, victim.color, type)) {
                    queue.push({ piece: sibling, cause: 'Soul Link' });
                }
            }
        }

        // Kamikaze: 25% chance everything adjacent to the death square dies
        if (hasRule(game, 'kamikaze') && rng() < 0.25) {
            logEvent(game, `KAMIKAZE! Everything next to ${toNotation(deathSquare.col, deathSquare.row)} dies`);
            for (const sq of adjacentSquares(deathSquare.col, deathSquare.row)) {
                const neighbor = getPieceAt(game, sq.col, sq.row);
                if (neighbor) queue.push({ piece: neighbor, cause: 'Kamikaze blast' });
            }
        }
    }
    return anyDied;
};

// =============================================================================
// PIECE TRANSFORMATION / SPAWNING
// =============================================================================

export const transformPiece = (game, piece, newType) => {
    piece.image = imageForType(piece.color, newType);
    logEvent(game, `${piece.label} becomes a ${newType}`);
};

export const convertPiece = (game, piece, newColor) => {
    piece.color = newColor;
    piece.image = imageForType(newColor, pieceType(piece));
    logEvent(game, `${piece.label} joins team ${newColor}`);
};

// Spawns a brand-new piece into an empty square with a fresh slot id
export const spawnPiece = (game, { color, type, col, row, labelSuffix = '' }) => {
    const maxSlot = Math.max(...Object.keys(game.pieces).map(Number), 0);
    const slot = String(maxSlot + 1);
    const colorName = color === 'white' ? 'White' : 'Black';
    const label = `${colorName} ${type}${labelSuffix ? ` ${labelSuffix}` : ' (spawned)'}`;
    game.pieces[slot] = {
        slot,
        label,
        color,
        image: imageForType(color, type),
        initialImage: imageForType(color, type),
        position: { col, row },
        initialPosition: { col, row },
        captured: false,
        emojis: [],
        moved: true,
    };
    logEvent(game, `${label} appears at ${toNotation(col, row)}`);
    return game.pieces[slot];
};

export const promotePiece = (game, piece) => {
    if (pieceType(piece) === 'Queen' || pieceType(piece) === 'King') return false;
    transformPiece(game, piece, 'Queen');
    return true;
};

// Relocates a piece with NO capture handling (used by rule effects & swaps)
export const teleportPiece = (game, piece, col, row) => {
    piece.position = { col, row };
    piece.moved = true;
};

// =============================================================================
// DESTINATION HAZARDS (applied after any piece lands on a square)
// =============================================================================

export const applySquareHazards = (game, piece, rng) => {
    if (piece.captured) return;
    const { col, row } = piece.position;

    if (squareHasEffect(game, col, row, 'mine')) {
        removeSquareEffect(game, col, row, 'mine');
        logEvent(game, `${piece.label} steps on a mine at ${toNotation(col, row)}!`);
        killPiece(game, piece, 'mine', rng);
        return;
    }
    if (squareHasEffect(game, col, row, 'pit')) {
        logEvent(game, `${piece.label} falls into the Bottomless Pit at ${toNotation(col, row)}!`);
        killPiece(game, piece, 'Bottomless Pit', rng);
        return;
    }
    if (squareHasEffect(game, col, row, 'chest')) {
        removeSquareEffect(game, col, row, 'chest');
        logEvent(game, `${piece.label} opens the Treasure Chest at ${toNotation(col, row)}!`);
        promotePiece(game, piece);
    }
};

// =============================================================================
// MOVE APPLICATION
// =============================================================================
// Validates + applies a move for the current player. Mutates `game`.
// Returns { ok: true } or { ok: false, reason }.
// NOTE: turn advancement (rule ticking, expiry, portals, new rule offers) is
// handled separately by shared/effects.js finishTurn() — the server calls
// applyMove() then finishTurn().

export const applyMove = (game, slot, targetCol, targetRow, rng = Math.random) => {
    const piece = game.pieces[slot];
    if (!piece || piece.captured) return { ok: false, reason: 'That piece is not on the board' };
    if (game.turn.gameOver) return { ok: false, reason: 'The game is over' };
    if (piece.color !== game.turn.currentPlayer) return { ok: false, reason: `It is ${game.turn.currentPlayer}'s turn` };
    if ((game.turn.pendingChoices || []).length > 0) return { ok: false, reason: 'A rule choice must be resolved first' };

    const legal = getAllLegalMoves(game, piece.color);
    const move = (legal[slot] || []).find(m => m.col === targetCol && m.row === targetRow);
    if (!move) return { ok: false, reason: 'Illegal move' };

    const from = { ...piece.position };

    // ---- Parry: defender gets an auto-rolled Rock Paper Scissors save ----
    if (move.captureSlot && hasRule(game, 'parry')) {
        const options = ['Rock', 'Paper', 'Scissors'];
        let attackRoll, defendRoll;
        do {
            attackRoll = pickRandom(options, rng);
            defendRoll = pickRandom(options, rng);
        } while (attackRoll === defendRoll);
        const beats = { Rock: 'Scissors', Paper: 'Rock', Scissors: 'Paper' };
        const defenderWins = beats[defendRoll] === attackRoll;
        logEvent(game, `PARRY ROLL — attacker ${attackRoll} vs defender ${defendRoll}`);
        if (defenderWins) {
            const target = game.pieces[move.captureSlot];
            logEvent(game, `${target.label} parries the attack! The move is wasted.`);
            game.turn.lastMove = { slot, from, to: from, wasDoubleStep: false };
            return { ok: true, parried: true };
        }
    }

    // ---- Execute the move ----
    let capturedPiece = null;
    if (move.special === 'castle') {
        const rook = game.pieces[move.meta.rookSlot];
        teleportPiece(game, piece, move.col, move.row);
        teleportPiece(game, rook, move.meta.rookToCol, piece.position.row);
        logEvent(game, `${piece.label} castles`);
    } else if (move.special === 'push') {
        // Shift the chain forward one square (furthest piece first), then step in
        const dir = forwardDir(piece.color);
        for (let i = move.meta.chain.length - 1; i >= 0; i--) {
            const pushed = game.pieces[move.meta.chain[i]];
            teleportPiece(game, pushed, pushed.position.col, pushed.position.row + dir);
        }
        teleportPiece(game, piece, move.col, move.row);
        logEvent(game, `${piece.label} pushes the pile forward`);
        // Pushed pieces can land on hazards too
        for (const pushedSlot of move.meta.chain) {
            applySquareHazards(game, game.pieces[pushedSlot], rng);
        }
    } else {
        if (move.captureSlot) {
            capturedPiece = game.pieces[move.captureSlot];
            killPiece(game, capturedPiece, `captured by ${piece.label}`, rng);
            if (!capturedPiece.captured) {
                // Guard fired (shouldn't happen — unkillable targets are filtered out)
                return { ok: false, reason: 'That piece cannot be captured' };
            }
        }
        teleportPiece(game, piece, move.col, move.row);
    }

    game.turn.lastMove = {
        slot, from, to: { col: move.col, row: move.row },
        wasDoubleStep: move.special === 'doublestep',
    };

    // ---- Post-move consequences (only if the mover is still alive) ----
    applySquareHazards(game, piece, rng);

    if (!piece.captured) {
        // Critical Strike: 50% chance a capture also kills a random adjacent enemy non-King
        if (capturedPiece && hasRule(game, 'crtical_strike') && rng() < 0.5) {
            const targets = adjacentSquares(piece.position.col, piece.position.row)
                .map(sq => getPieceAt(game, sq.col, sq.row))
                .filter(p => p && p.color !== piece.color && pieceType(p) !== 'King' && !isUnkillable(game, p));
            const bonus = pickRandom(targets, rng);
            if (bonus) {
                logEvent(game, `CRITICAL STRIKE!`);
                killPiece(game, bonus, 'Critical Strike', rng);
            }
        }

        // Religious Conversion: a Bishop moving next to enemy Pawns converts them
        if (hasRule(game, 'religious_conversion') && pieceType(piece) === 'Bishop') {
            for (const sq of adjacentSquares(piece.position.col, piece.position.row)) {
                const neighbor = getPieceAt(game, sq.col, sq.row);
                if (neighbor && neighbor.color !== piece.color && pieceType(neighbor) === 'Pawn') {
                    convertPiece(game, neighbor, piece.color);
                }
            }
        }

        // Promotion
        const backRow = enemyBackRow(piece.color);
        const type = pieceType(piece);
        if (type === 'Pawn') {
            const promoRow = hasRule(game, 'early_promo')
                ? (piece.color === 'white' ? 2 : 5)  // "6th row" from each player's side
                : backRow;
            const reached = piece.color === 'white'
                ? piece.position.row <= promoRow
                : piece.position.row >= promoRow;
            if (reached) promotePiece(game, piece);
        } else if (hasRule(game, 'cash_grab') && piece.position.row === backRow) {
            // Cash Grab: ANY piece reaching the back line promotes
            promotePiece(game, piece);
        }

        // Down with the Ship: the capturer dies too
        if (capturedPiece && hasRule(game, 'down_with_the_ship')) {
            killPiece(game, piece, 'Down with the Ship', rng);
        }
    }

    return { ok: true, capturedSlot: capturedPiece ? capturedPiece.slot : null };
};

// =============================================================================
// SERIALIZATION HELPERS (game object <-> stored Redis shapes)
// =============================================================================
// The server stores the board as { slot: {image, captured, position, emojis,
// color, label, moved} } and turn state as a flat hash. These helpers build
// the in-memory game object from those shapes and back.

export const DEFAULT_TURN_STATE = {
    currentTurn: 1,
    nextTurnWithNewRules: 4,
    currentPlayer: 'white',
    currentRules: [],
    newRuleChoices: [],
    seats: { white: null, black: null },
    pendingChoices: [],
    gameOver: null,
    coinFlip: null,
    lastMove: null,
};

export const buildGame = (boardState, turnState) => {
    const pieces = {};
    for (const [slot, data] of Object.entries(boardState)) {
        if (['selectedSlot', 'boardEffects', 'highlightedSquare'].includes(slot)) continue;
        pieces[slot] = {
            slot,
            label: data.label || `Piece ${slot}`,
            color: data.color || (data.image && data.image.startsWith('White') ? 'white' : 'black'),
            image: data.image,
            position: { ...data.position },
            captured: !!data.captured,
            emojis: [...(data.emojis || [])],
            moved: !!data.moved,
            initialPosition: data.initialPosition ? { ...data.initialPosition } : { ...data.position },
            initialImage: data.initialImage || data.image,
        };
    }
    const turn = { ...DEFAULT_TURN_STATE, ...turnState };
    // DEFAULT_TURN_STATE is a shared module-level object, so any field the
    // stored turn hash is missing would otherwise come back as a reference to
    // ITS array/object. The engine mutates these in place (currentRules.push,
    // seats[seat] = userId), which on a warm serverless instance would leak
    // rules and seat claims from one request into the next. Always copy.
    turn.currentRules = [...(turn.currentRules || [])];
    turn.newRuleChoices = [...(turn.newRuleChoices || [])];
    turn.pendingChoices = [...(turn.pendingChoices || [])];
    turn.seats = { white: null, black: null, ...(turn.seats || {}) };
    return {
        pieces,
        boardEffects: { ...(boardState.boardEffects || {}) },
        turn,
        events: [],
        selectedSlot: boardState.selectedSlot ?? null,
        highlightedSquare: boardState.highlightedSquare ?? null,
    };
};

export const serializeBoard = (game) => {
    const board = {};
    for (const [slot, p] of Object.entries(game.pieces)) {
        board[slot] = {
            image: p.image,
            captured: p.captured,
            position: { ...p.position },
            emojis: [...p.emojis],
            color: p.color,
            label: p.label,
            moved: !!p.moved,
            initialPosition: { ...p.initialPosition },
            initialImage: p.initialImage,
        };
    }
    board.selectedSlot = game.selectedSlot ?? null;
    board.boardEffects = {};
    for (const [key, effects] of Object.entries(game.boardEffects)) {
        if (effects.length > 0) board.boardEffects[key] = [...effects];
    }
    board.highlightedSquare = game.highlightedSquare ?? null;
    return board;
};

export const serializeTurn = (game) => ({ ...game.turn });
