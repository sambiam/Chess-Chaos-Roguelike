// =============================================================================
// RULE EFFECTS — automated execution of every chaos rule
// =============================================================================
// Shared by client (to reason about pending choices) and server (authoritative
// execution). Three lifecycle hooks:
//
//   applyRuleSelection(game, rule, color, rng)  — when a rule card is picked
//   finishTurn(game, rng)                       — after every move/pass
//   (expiry effects run inside finishTurn when a rule's timer hits 0)
//
// Rules that need a player decision create entries in turn.pendingChoices:
//   { id, color, ruleId, step, kind: 'piece'|'square'|'column'|'row',
//     prompt, candidates, deadline, meta }
// While any pending choice exists, all movement is blocked. Choices are
// resolved via resolveChoice(); expired ones auto-resolve sensibly.

import {
    squareKey,
    parseSquareKey,
    toNotation,
    adjacentSquares,
    forwardDir,
    otherColor,
    inBounds,
    PIECE_VALUES,
} from './defs.js';
import {
    pieceType,
    hasRule,
    getRule,
    alivePieces,
    getPieceAt,
    emptySquares,
    addSquareEffect,
    removeSquareEffect,
    squareHasEffect,
    logEvent,
    addStatus,
    removeStatus,
    pickRandom,
    killPiece,
    transformPiece,
    convertPiece,
    spawnPiece,
    teleportPiece,
    applySquareHazards,
    isUnkillable,
} from './engine.js';
import { getNextRules } from './rules.js';

export const CHOICE_TIMEOUT_MS = 60 * 1000;
const TURNS_UNTIL_NEW_RULES = 3;

// =============================================================================
// SMALL HELPERS
// =============================================================================

let choiceCounter = 0;
const newChoiceId = () => `choice_${Date.now()}_${++choiceCounter}`;

const createChoice = (game, { color, ruleId, step, kind, prompt, candidates, meta = {} }) => {
    if (!candidates || candidates.length === 0) return null; // nothing to choose from
    const choice = {
        id: newChoiceId(),
        color, ruleId, step, kind, prompt,
        candidates,
        deadline: Date.now() + CHOICE_TIMEOUT_MS,
        meta,
    };
    game.turn.pendingChoices.push(choice);
    logEvent(game, `${color} must choose: ${prompt}`);
    return choice;
};

const slotCandidates = (pieces) => pieces.map(p => p.slot);
const squareCandidates = (squares) => squares.map(sq => squareKey(sq.col, sq.row));

// Moves a piece as part of a rule effect (not a player move): optional kill of
// the occupant, then relocation, then square hazards (mines/pits/chests).
const effectMove = (game, piece, col, row, rng, { killOccupant = false } = {}) => {
    if (!inBounds(col, row)) return false;
    if (squareHasEffect(game, col, row, 'blocked')) return false;
    const occupant = getPieceAt(game, col, row);
    if (occupant) {
        if (!killOccupant) return false;
        if (isUnkillable(game, occupant)) return false;
        killPiece(game, occupant, `crushed by ${piece.label}`, rng);
        if (!game.pieces[occupant.slot].captured) return false;
    }
    teleportPiece(game, piece, col, row);
    applySquareHazards(game, piece, rng);
    return true;
};

// Kings are exempt from most board-wide shuffles when the rule is kingImmune
const nonKing = (p) => pieceType(p) !== 'King';

const lowestValue = (game, slots) => {
    let best = null;
    for (const slot of slots) {
        const p = game.pieces[slot];
        if (!p) continue;
        if (!best || PIECE_VALUES[pieceType(p)] < PIECE_VALUES[pieceType(best)]) best = p;
    }
    return best ? best.slot : null;
};

const highestValue = (game, slots) => {
    let best = null;
    for (const slot of slots) {
        const p = game.pieces[slot];
        if (!p) continue;
        if (!best || PIECE_VALUES[pieceType(p)] > PIECE_VALUES[pieceType(best)]) best = p;
    }
    return best ? best.slot : null;
};

// =============================================================================
// RULE SELECTION — instant effects + timed-rule setup
// =============================================================================
// `color` is the player who picked the rule (always the player to move).

export const applyRuleSelection = (game, rule, color, rng = Math.random) => {
    const enemy = otherColor(color);

    switch (rule.id) {

        // ----------------------------- INSTANTS ------------------------------

        case 'going_woke': {
            // Right half pushed left one square if open; kings stay put
            for (let col = 4; col < 8; col++) {
                for (let row = 0; row < 8; row++) {
                    const p = getPieceAt(game, col, row);
                    if (p && nonKing(p)) effectMove(game, p, col - 1, row, rng);
                }
            }
            break;
        }

        case 'march_of_the_pawnguins': {
            for (const p of alivePieces(game, null, 'Pawn')) {
                effectMove(game, p, p.position.col, p.position.row + forwardDir(p.color), rng);
            }
            break;
        }

        case 'the_rumbling': {
            for (const p of alivePieces(game, null, 'Pawn')) {
                const row = p.position.row + forwardDir(p.color);
                if (!inBounds(p.position.col, row)) continue;
                const occupant = getPieceAt(game, p.position.col, row);
                if (occupant && pieceType(occupant) === 'King') continue; // kings immune
                effectMove(game, p, p.position.col, row, rng, { killOccupant: true });
            }
            break;
        }

        case 'they_deserved_it': {
            const victim = pickRandom(alivePieces(game).filter(nonKing), rng);
            if (victim) killPiece(game, victim, 'They Deserved It', rng);
            break;
        }

        case 'born_again_christian': {
            for (const p of alivePieces(game, null, 'Queen')) transformPiece(game, p, 'Bishop');
            break;
        }

        case 'dub_thee_knight': {
            const pawns = alivePieces(game, null, 'Pawn');
            for (let i = 0; i < 2 && pawns.length > 0; i++) {
                const p = pawns.splice(Math.floor(rng() * pawns.length), 1)[0];
                transformPiece(game, p, 'Knight');
            }
            break;
        }

        case 'back_that_shit_up': {
            for (const p of alivePieces(game, null, 'Pawn')) {
                effectMove(game, p, p.position.col, p.position.row - forwardDir(p.color), rng);
            }
            break;
        }

        case 'column_swap': {
            const colA = Math.floor(rng() * 8);
            let colB = Math.floor(rng() * 7);
            if (colB >= colA) colB++;
            logEvent(game, `Column Swap! ${String.fromCharCode(65 + colA)} <-> ${String.fromCharCode(65 + colB)}`);
            const inA = alivePieces(game).filter(p => p.position.col === colA && nonKing(p));
            const inB = alivePieces(game).filter(p => p.position.col === colB && nonKing(p));
            // Move each group to the other column (same row); a square occupied
            // by a staying King blocks the incoming piece (it stays put).
            for (const p of [...inA, ...inB]) {
                const destCol = p.position.col === colA ? colB : colA;
                const blocker = getPieceAt(game, destCol, p.position.row);
                if (blocker && pieceType(blocker) === 'King') continue;
                teleportPiece(game, p, destCol, p.position.row);
            }
            for (const p of [...inA, ...inB]) applySquareHazards(game, p, rng);
            break;
        }

        case 'mind_control': {
            for (const chooser of [color, enemy]) {
                const targets = alivePieces(game, otherColor(chooser))
                    .filter(p => !['King', 'Queen'].includes(pieceType(p)));
                createChoice(game, {
                    color: chooser, ruleId: rule.id, step: 'pick',
                    kind: 'piece',
                    prompt: 'Mind Control — choose an enemy piece to convert to your team',
                    candidates: slotCandidates(targets),
                    meta: { autoStrategy: 'highest' },
                });
            }
            break;
        }

        case 'drafted_for_battle': {
            for (const chooser of [color, enemy]) {
                const candidates = [
                    ...alivePieces(game, chooser, 'Bishop'),
                    ...alivePieces(game, chooser, 'Knight'),
                ];
                createChoice(game, {
                    color: chooser, ruleId: rule.id, step: 'pick',
                    kind: 'piece',
                    prompt: 'Drafted for Battle — choose a Bishop or Knight to swap places with your King',
                    candidates: slotCandidates(candidates),
                });
            }
            break;
        }

        case 'hot_drop': {
            for (const player of [color, enemy]) {
                const sq = pickRandom(emptySquares(game), rng);
                if (sq) spawnPiece(game, { color: player, type: 'Queen', col: sq.col, row: sq.row, labelSuffix: '(Hot Drop)' });
            }
            break;
        }

        case 'minefield': {
            const spots = emptySquares(game);
            for (let i = 0; i < 2 && spots.length > 0; i++) {
                const sq = spots.splice(Math.floor(rng() * spots.length), 1)[0];
                addSquareEffect(game, sq.col, sq.row, 'mine');
                logEvent(game, `A mine is planted at ${toNotation(sq.col, sq.row)}`);
            }
            break;
        }

        case 'risk_it_rook': {
            for (const [player, chance] of [[color, 0.5], [enemy, 0.25]]) {
                if (rng() < chance) {
                    const sq = pickRandom(emptySquares(game), rng);
                    if (sq) spawnPiece(game, { color: player, type: 'Rook', col: sq.col, row: sq.row, labelSuffix: '(Risked)' });
                } else {
                    logEvent(game, `${player} rolls for a free Rook... and gets nothing`);
                }
            }
            break;
        }

        case 'kids_in_trenchcoat': {
            const pawns = alivePieces(game, color, 'Pawn');
            if (pawns.length < 2) {
                logEvent(game, `${color} doesn't have 2 Pawns to sacrifice — nothing happens`);
                break;
            }
            createChoice(game, {
                color, ruleId: rule.id, step: 'pawn1',
                kind: 'piece',
                prompt: '2 Kids in a Trenchcoat — choose the FIRST Pawn to sacrifice',
                candidates: slotCandidates(pawns),
                meta: { autoStrategy: 'lowest' },
            });
            break;
        }

        case 'charge': {
            // Your pieces advance one square toward the enemy — front-most first
            const mine = alivePieces(game, color).sort((a, b) =>
                color === 'white' ? a.position.row - b.position.row : b.position.row - a.position.row);
            for (const p of mine) {
                effectMove(game, p, p.position.col, p.position.row + forwardDir(color), rng);
            }
            break;
        }

        case 'enemy_is_routed': {
            // Enemy pieces retreat one square — rear-most first
            const theirs = alivePieces(game, enemy).sort((a, b) =>
                enemy === 'white' ? b.position.row - a.position.row : a.position.row - b.position.row);
            for (const p of theirs) {
                effectMove(game, p, p.position.col, p.position.row - forwardDir(enemy), rng);
            }
            break;
        }

        case 'nuclear_fallout': {
            const spots = emptySquares(game);
            for (let i = 0; i < 2 && spots.length > 0; i++) {
                const sq = spots.splice(Math.floor(rng() * spots.length), 1)[0];
                addSquareEffect(game, sq.col, sq.row, 'blocked');
                logEvent(game, `${toNotation(sq.col, sq.row)} is irradiated — permanently off limits`);
            }
            break;
        }

        case 'get_up_in_their_face': {
            // Your pieces slide forward through empty squares — kings stay
            const mine = alivePieces(game, color).filter(nonKing).sort((a, b) =>
                color === 'white' ? a.position.row - b.position.row : b.position.row - a.position.row);
            for (const p of mine) {
                const dir = forwardDir(color);
                // Step forward square by square; hazards stop the slide
                while (!p.captured) {
                    const nextRow = p.position.row + dir;
                    if (!inBounds(p.position.col, nextRow)) break;
                    if (getPieceAt(game, p.position.col, nextRow)) break;
                    if (squareHasEffect(game, p.position.col, nextRow, 'blocked')) break;
                    const hadHazard = ['mine', 'pit', 'chest'].some(e => squareHasEffect(game, p.position.col, nextRow, e));
                    effectMove(game, p, p.position.col, nextRow, rng);
                    if (hadHazard) break;
                }
            }
            break;
        }

        case 'a_light_breeze': {
            // Columns D & E blown one square right, crushing what's in the way
            for (const col of [4, 3]) {
                for (let row = 0; row < 8; row++) {
                    const p = getPieceAt(game, col, row);
                    if (!p || !nonKing(p)) continue;
                    const occupant = getPieceAt(game, col + 1, row);
                    if (occupant && pieceType(occupant) === 'King') continue; // kings immune
                    effectMove(game, p, col + 1, row, rng, { killOccupant: true });
                }
            }
            break;
        }

        case 'anti_camping': {
            const targets = alivePieces(game, enemy).filter(nonKing);
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'piece',
                prompt: 'Anti-Camping — pick an enemy piece to swap with a random piece of yours',
                candidates: slotCandidates(targets),
                meta: { autoStrategy: 'highest' },
            });
            break;
        }

        case 'bottomless_pit': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'square',
                prompt: 'Bottomless Pit — pick an empty square. Forever after, pieces entering it die',
                candidates: squareCandidates(emptySquares(game)),
            });
            break;
        }

        case 'moving_up_corporate_ladder': {
            const candidates = alivePieces(game).filter(nonKing)
                .filter(p => alivePieces(game).filter(nonKing)
                    .some(q => q.slot !== p.slot && q.position.col === p.position.col));
            createChoice(game, {
                color, ruleId: rule.id, step: 'first',
                kind: 'piece',
                prompt: 'Corporate Ladder — pick the FIRST piece to swap (must share a column with another piece)',
                candidates: slotCandidates(candidates),
            });
            break;
        }

        case 'hurricane': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'row',
                prompt: 'Hurricane — pick a row. Its pieces get blown to the left',
                candidates: [0, 1, 2, 3, 4, 5, 6, 7],
            });
            break;
        }

        case 'sophies_choice': {
            for (const chooser of [color, enemy]) {
                const pool = alivePieces(game, chooser).filter(nonKing);
                if (pool.length < 2) continue;
                const first = pool.splice(Math.floor(rng() * pool.length), 1)[0];
                const second = pool.splice(Math.floor(rng() * pool.length), 1)[0];
                createChoice(game, {
                    color: chooser, ruleId: rule.id, step: 'pick',
                    kind: 'piece',
                    prompt: "Sophie's Choice — one of these two pieces must die. Choose which",
                    candidates: [first.slot, second.slot],
                    meta: { autoStrategy: 'lowest' },
                });
            }
            break;
        }

        case 'sunday_school': {
            // Auto-graded theology pop quiz: each player rolls a score out of 10
            const scoreA = Math.floor(rng() * 11);
            let scoreB = Math.floor(rng() * 11);
            while (scoreB === scoreA) scoreB = Math.floor(rng() * 11);
            const winner = scoreA > scoreB ? color : enemy;
            logEvent(game, `Sunday School pop quiz! ${color} scores ${scoreA}/10, ${enemy} scores ${scoreB}/10 — ${winner} wins!`);
            createChoice(game, {
                color: winner, ruleId: rule.id, step: 'place',
                kind: 'square',
                prompt: 'Sunday School — you aced the quiz! Pick an empty square for your new Bishop',
                candidates: squareCandidates(emptySquares(game)),
                meta: { spawnType: 'Bishop' },
            });
            break;
        }

        case 'horse_race': {
            // Simulated 2-horse race: horses advance random amounts down a
            // 40-length track until one crosses the line
            const horses = [
                { name: 'Horse 1', player: color, progress: 0 },
                { name: 'Horse 2', player: enemy, progress: 0 },
            ];
            const TRACK = 40;
            const commentary = [];
            let raceWinner = null;
            for (let tick = 0; tick < 60 && !raceWinner; tick++) {
                for (const horse of horses) {
                    horse.progress += 1 + Math.floor(rng() * 6);
                }
                const [h1, h2] = horses;
                if (tick % 3 === 0) {
                    const leader = h1.progress === h2.progress ? null : (h1.progress > h2.progress ? h1 : h2);
                    commentary.push(leader
                        ? `${leader.name} leads ${Math.max(h1.progress, h2.progress)}m to ${Math.min(h1.progress, h2.progress)}m!`
                        : `Neck and neck at ${h1.progress}m!`);
                }
                const finished = horses.filter(h => h.progress >= TRACK);
                if (finished.length === 1) raceWinner = finished[0];
                else if (finished.length === 2) raceWinner = h1.progress >= h2.progress ? h1 : h2; // photo finish
            }
            if (!raceWinner) raceWinner = horses[0];
            logEvent(game, `🐎 THE HORSES ARE OFF! ${commentary.join(' ')}`);
            logEvent(game, `🏁 ${raceWinner.name} wins the race for ${raceWinner.player}!`);
            createChoice(game, {
                color: raceWinner.player, ruleId: rule.id, step: 'place',
                kind: 'square',
                prompt: 'Horse Race — your horse won! Pick an empty square for your new Knight',
                candidates: squareCandidates(emptySquares(game)),
                meta: { spawnType: 'Knight' },
            });
            break;
        }

        // ------------------------- TIMED RULE SETUP --------------------------

        case 'living_bomb': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'piece',
                prompt: 'Living Bomb — pick a friendly piece to become the bomb',
                candidates: slotCandidates(alivePieces(game, color)),
            });
            break;
        }

        case 'mitosis': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'piece',
                prompt: 'Mitosis — pick any piece. It cannot move; if it survives, it duplicates',
                candidates: slotCandidates(alivePieces(game)),
            });
            break;
        }

        case 'treasure_chest': {
            const sq = pickRandom(emptySquares(game), rng);
            if (sq) {
                addSquareEffect(game, sq.col, sq.row, 'chest');
                rule.data.square = sq;
                logEvent(game, `A Treasure Chest appears at ${toNotation(sq.col, sq.row)}`);
            }
            break;
        }

        case 'mr_freeze': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'column',
                prompt: 'Mr Freeze — pick a column. Everything in it is frozen and immune',
                candidates: [0, 1, 2, 3, 4, 5, 6, 7],
            });
            break;
        }

        case 'portal_3': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'first',
                kind: 'square',
                prompt: 'Portal 3 — pick the FIRST portal square',
                candidates: squareCandidates(allSquares()),
            });
            break;
        }

        case 'no_mans_land': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'column',
                prompt: 'No Mans Land — pick a column no piece may enter or cross',
                candidates: [0, 1, 2, 3, 4, 5, 6, 7],
            });
            break;
        }

        case 'call_down_lightning': {
            const sq = pickRandom(emptySquares(game), rng);
            if (sq) {
                addSquareEffect(game, sq.col, sq.row, 'lightning');
                rule.data.square = sq;
                logEvent(game, `Lightning will strike whoever controls ${toNotation(sq.col, sq.row)}`);
            }
            break;
        }

        case 'get_the_fuck_off': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'first',
                kind: 'square',
                prompt: 'Get The Fuck Off — pick the FIRST doomed square',
                candidates: squareCandidates(allSquares()),
            });
            break;
        }

        case 'ice_age': {
            rule.data.slots = [];
            for (const p of alivePieces(game)) {
                if (p.position.col === 0 || p.position.col === 7) {
                    addStatus(game, p, 'frozen');
                    rule.data.slots.push(p.slot);
                }
            }
            logEvent(game, 'Ice Age! Columns A and H are frozen solid');
            break;
        }

        case 'invul_potion': {
            rule.data.slots = [];
            const pool = alivePieces(game, color);
            for (let i = 0; i < 2 && pool.length > 0; i++) {
                const p = pool.splice(Math.floor(rng() * pool.length), 1)[0];
                addStatus(game, p, 'immortal');
                rule.data.slots.push(p.slot);
            }
            break;
        }

        case 'tornado': {
            createChoice(game, {
                color, ruleId: rule.id, step: 'pick',
                kind: 'square',
                prompt: 'Tornado — pick an empty square. Pieces that can enter it, must',
                candidates: squareCandidates(emptySquares(game)),
            });
            break;
        }

        // Rules with no immediate effect (pure move-modifiers handled by the
        // engine, or effects that fire at end-of-turn/expiry):
        // blood_sacrifice, cash_grab, summoning_ritual, gigachad_aura,
        // bloodthirsty, severe_constipation, hobbit_battle, hobbit_slaughter,
        // christmas_truce, portal_storm, proletariat, down_with_the_ship,
        // god_kings, early_promo, short_stop, pawns_with_viagra, trans_rights,
        // kamikaze, parry, pawns_learned_strength, all_on_red, estrogen,
        // ice_physics, soul_link, pacman_style, no_cowards,
        // religious_conversion, time_bomb, knee_surgery, crtical_strike
        default:
            break;
    }
};

const allSquares = () => {
    const result = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) result.push({ col, row });
    }
    return result;
};

// =============================================================================
// CHOICE RESOLUTION
// =============================================================================

// Auto-pick a sensible selection for an expired/skipped choice
const autoSelect = (game, choice, rng) => {
    if (choice.kind === 'piece') {
        if (choice.meta.autoStrategy === 'lowest') return lowestValue(game, choice.candidates);
        if (choice.meta.autoStrategy === 'highest') return highestValue(game, choice.candidates);
    }
    return pickRandom(choice.candidates, rng);
};

// Resolves one pending choice. `selection` must be one of choice.candidates
// (slot string, "col,row" key, or column/row number). Returns {ok, reason?}.
export const resolveChoice = (game, choiceId, selection, rng = Math.random, { auto = false } = {}) => {
    const idx = game.turn.pendingChoices.findIndex(c => c.id === choiceId);
    if (idx === -1) return { ok: false, reason: 'Choice not found (already resolved?)' };
    const choice = game.turn.pendingChoices[idx];

    if (auto || selection === null || selection === undefined) {
        selection = autoSelect(game, choice, rng);
    }
    // Normalize numbers stored as strings
    const matches = choice.candidates.some(c => String(c) === String(selection));
    if (!matches) return { ok: false, reason: 'Invalid selection for this choice' };

    // Remove it from the queue before executing (execution may queue follow-ups)
    game.turn.pendingChoices.splice(idx, 1);

    const rule = getRule(game, choice.ruleId) ||
        { id: choice.ruleId, data: {} }; // instants aren't in currentRules
    executeChoice(game, choice, selection, rule, rng);
    return { ok: true };
};

// Auto-resolves every pending choice whose deadline has passed
export const autoResolveExpiredChoices = (game, rng = Math.random) => {
    let resolvedAny = false;
    while (true) {
        const expired = (game.turn.pendingChoices || []).find(c => Date.now() > c.deadline);
        if (!expired) break;
        logEvent(game, `${expired.color} ran out of time — auto-choosing`);
        resolveChoice(game, expired.id, null, rng, { auto: true });
        resolvedAny = true;
    }
    return resolvedAny;
};

const executeChoice = (game, choice, selection, rule, rng) => {
    const color = choice.color;
    const enemy = otherColor(color);
    const key = `${choice.ruleId}:${choice.step}`;

    switch (key) {

        case 'mind_control:pick': {
            const target = game.pieces[selection];
            if (target && !target.captured) convertPiece(game, target, color);
            break;
        }

        case 'drafted_for_battle:pick': {
            const partner = game.pieces[selection];
            const king = alivePieces(game, color, 'King')[0];
            if (partner && king && !partner.captured) {
                const kingPos = { ...king.position };
                teleportPiece(game, king, partner.position.col, partner.position.row);
                teleportPiece(game, partner, kingPos.col, kingPos.row);
                logEvent(game, `${king.label} swaps places with ${partner.label}`);
            }
            break;
        }

        case 'kids_in_trenchcoat:pawn1': {
            const pawn = game.pieces[selection];
            if (pawn) killPiece(game, pawn, 'Trenchcoat sacrifice', rng);
            const remaining = alivePieces(game, color, 'Pawn');
            createChoice(game, {
                color, ruleId: choice.ruleId, step: 'pawn2',
                kind: 'piece',
                prompt: '2 Kids in a Trenchcoat — choose the SECOND Pawn to sacrifice',
                candidates: slotCandidates(remaining),
                meta: { autoStrategy: 'lowest' },
            });
            break;
        }

        case 'kids_in_trenchcoat:pawn2': {
            const pawn = game.pieces[selection];
            if (pawn) killPiece(game, pawn, 'Trenchcoat sacrifice', rng);
            createChoice(game, {
                color, ruleId: choice.ruleId, step: 'place',
                kind: 'square',
                prompt: '2 Kids in a Trenchcoat — place your new Bishop',
                candidates: squareCandidates(emptySquares(game)),
            });
            break;
        }

        case 'kids_in_trenchcoat:place':
        case 'sunday_school:place':
        case 'horse_race:place':
        case 'summoning_ritual:place': {
            const { col, row } = parseSquareKey(String(selection));
            const type = choice.meta.spawnType ||
                (choice.ruleId === 'kids_in_trenchcoat' ? 'Bishop' : 'Rook');
            spawnPiece(game, { color, type, col, row, labelSuffix: '(summoned)' });
            break;
        }

        case 'anti_camping:pick': {
            const target = game.pieces[selection];
            const friendly = pickRandom(alivePieces(game, color).filter(nonKing), rng);
            if (target && friendly && !target.captured) {
                const spot = { ...target.position };
                teleportPiece(game, target, friendly.position.col, friendly.position.row);
                teleportPiece(game, friendly, spot.col, spot.row);
                logEvent(game, `${target.label} and ${friendly.label} swap places`);
            }
            break;
        }

        case 'bottomless_pit:pick': {
            const { col, row } = parseSquareKey(String(selection));
            addSquareEffect(game, col, row, 'pit');
            logEvent(game, `A Bottomless Pit opens at ${toNotation(col, row)}`);
            break;
        }

        case 'moving_up_corporate_ladder:first': {
            const first = game.pieces[selection];
            if (!first) break;
            const partners = alivePieces(game).filter(nonKing)
                .filter(p => p.slot !== first.slot && p.position.col === first.position.col);
            createChoice(game, {
                color, ruleId: choice.ruleId, step: 'second',
                kind: 'piece',
                prompt: 'Corporate Ladder — pick the piece to swap it with (same column)',
                candidates: slotCandidates(partners),
                meta: { firstSlot: first.slot },
            });
            break;
        }

        case 'moving_up_corporate_ladder:second': {
            const first = game.pieces[choice.meta.firstSlot];
            const second = game.pieces[selection];
            if (first && second && !first.captured && !second.captured) {
                const spot = { ...first.position };
                teleportPiece(game, first, second.position.col, second.position.row);
                teleportPiece(game, second, spot.col, spot.row);
                logEvent(game, `${first.label} and ${second.label} swap places`);
            }
            break;
        }

        case 'hurricane:pick': {
            const row = Number(selection);
            // Push everything to the leftmost empty squares, leftmost piece first
            const inRow = alivePieces(game).filter(p => p.position.row === row)
                .sort((a, b) => a.position.col - b.position.col);
            let nextCol = 0;
            for (const p of inRow) {
                // Skip over blocked squares — pieces pile up after them
                while (nextCol < 8 && squareHasEffect(game, nextCol, row, 'blocked')) nextCol++;
                if (nextCol >= 8) break;
                teleportPiece(game, p, nextCol, row);
                nextCol++;
            }
            for (const p of inRow) applySquareHazards(game, p, rng);
            logEvent(game, `Hurricane blows row ${8 - row} to the left!`);
            break;
        }

        case 'sophies_choice:pick': {
            const victim = game.pieces[selection];
            if (victim) killPiece(game, victim, "Sophie's Choice", rng);
            break;
        }

        case 'living_bomb:pick': {
            const target = game.pieces[selection];
            if (target) {
                addStatus(game, target, 'bomb');
                rule.data.slot = target.slot;
                logEvent(game, `${target.label} is now a ticking Living Bomb`);
            }
            break;
        }

        case 'mitosis:pick': {
            const target = game.pieces[selection];
            if (target) {
                addStatus(game, target, 'mitosis');
                rule.data.slot = target.slot;
                logEvent(game, `${target.label} begins mitosis — it cannot move`);
            }
            break;
        }

        case 'mr_freeze:pick': {
            const column = Number(selection);
            rule.data.column = column;
            rule.data.slots = [];
            for (const p of alivePieces(game)) {
                if (p.position.col === column) {
                    addStatus(game, p, 'frozen');
                    rule.data.slots.push(p.slot);
                }
            }
            for (let row = 0; row < 8; row++) {
                if (!getPieceAt(game, column, row)) addSquareEffect(game, column, row, 'freeze');
            }
            logEvent(game, `Mr Freeze ices column ${String.fromCharCode(65 + column)}`);
            break;
        }

        case 'portal_3:first': {
            createChoice(game, {
                color, ruleId: choice.ruleId, step: 'second',
                kind: 'square',
                prompt: 'Portal 3 — pick the SECOND portal square',
                candidates: squareCandidates(allSquares().filter(sq => squareKey(sq.col, sq.row) !== String(selection))),
                meta: { firstSquare: String(selection) },
            });
            break;
        }

        case 'portal_3:second': {
            const a = parseSquareKey(choice.meta.firstSquare);
            const b = parseSquareKey(String(selection));
            rule.data.squares = [a, b];
            addSquareEffect(game, a.col, a.row, 'portal');
            addSquareEffect(game, b.col, b.row, 'portal');
            logEvent(game, `Portals open at ${toNotation(a.col, a.row)} and ${toNotation(b.col, b.row)}`);
            break;
        }

        case 'no_mans_land:pick': {
            const column = Number(selection);
            rule.data.column = column;
            for (let row = 0; row < 8; row++) addSquareEffect(game, column, row, 'wall');
            logEvent(game, `Column ${String.fromCharCode(65 + column)} is now No Mans Land`);
            break;
        }

        case 'get_the_fuck_off:first': {
            createChoice(game, {
                color, ruleId: choice.ruleId, step: 'second',
                kind: 'square',
                prompt: 'Get The Fuck Off — pick the SECOND doomed square',
                candidates: squareCandidates(allSquares().filter(sq => squareKey(sq.col, sq.row) !== String(selection))),
                meta: { firstSquare: String(selection) },
            });
            break;
        }

        case 'get_the_fuck_off:second': {
            const a = parseSquareKey(choice.meta.firstSquare);
            const b = parseSquareKey(String(selection));
            rule.data.squares = [a, b];
            addSquareEffect(game, a.col, a.row, 'doom');
            addSquareEffect(game, b.col, b.row, 'doom');
            logEvent(game, `Doom marks ${toNotation(a.col, a.row)} and ${toNotation(b.col, b.row)} — vacate before it expires!`);
            break;
        }

        case 'tornado:pick': {
            const { col, row } = parseSquareKey(String(selection));
            rule.data.square = { col, row };
            addSquareEffect(game, col, row, 'tornado');
            logEvent(game, `A Tornado forms at ${toNotation(col, row)}`);
            break;
        }

        case 'call_down_lightning:kill': {
            const victim = game.pieces[selection];
            if (victim) killPiece(game, victim, 'Lightning strike', rng);
            break;
        }

        case 'blood_sacrifice:pick': {
            const victim = game.pieces[selection];
            if (victim) killPiece(game, victim, 'Blood Sacrifice', rng);
            break;
        }

        default:
            logEvent(game, `Unknown choice ${key} — skipping`);
            break;
    }
};

// =============================================================================
// END OF TURN + RULE TICKING
// =============================================================================
// Called by the server after every successful move or pass. Handles
// end-of-turn effects, advances the turn, ticks rule timers, fires expiry
// effects, offers new rules on schedule, and rolls the All on Red coin.
// Returns { ruleJustExpired }.

export const finishTurn = (game, rng = Math.random) => {
    const mover = game.turn.currentPlayer;

    // ---- End-of-turn board effects ----

    // Portal 3: the two chosen squares swap occupants
    const portalRule = getRule(game, 'portal_3');
    if (portalRule && portalRule.data.squares) {
        const [a, b] = portalRule.data.squares;
        const pieceA = getPieceAt(game, a.col, a.row);
        const pieceB = getPieceAt(game, b.col, b.row);
        if (pieceA) teleportPiece(game, pieceA, b.col, b.row);
        if (pieceB) teleportPiece(game, pieceB, a.col, a.row);
        if (pieceA || pieceB) logEvent(game, 'The portals swap their contents');
        for (const p of [pieceA, pieceB]) if (p) applySquareHazards(game, p, rng);
    }

    // Portal Storm: two random non-King pieces swap
    if (hasRule(game, 'portal_storm')) {
        const pool = alivePieces(game).filter(nonKing);
        if (pool.length >= 2) {
            const a = pool.splice(Math.floor(rng() * pool.length), 1)[0];
            const b = pool.splice(Math.floor(rng() * pool.length), 1)[0];
            const spot = { ...a.position };
            teleportPiece(game, a, b.position.col, b.position.row);
            teleportPiece(game, b, spot.col, spot.row);
            logEvent(game, `Portal Storm swaps ${a.label} and ${b.label}`);
        }
    }

    // Blood Sacrifice: the player who just moved picks one of their pieces to die
    if (hasRule(game, 'blood_sacrifice') && !game.turn.gameOver) {
        const pool = alivePieces(game, mover).filter(nonKing);
        createChoice(game, {
            color: mover, ruleId: 'blood_sacrifice', step: 'pick',
            kind: 'piece',
            prompt: 'Blood Sacrifice — choose one of your pieces to die',
            candidates: slotCandidates(pool),
            meta: { autoStrategy: 'lowest' },
        });
    }

    // ---- Advance the turn ----
    game.turn.currentTurn += 1;
    game.turn.currentPlayer = otherColor(mover);
    delete game.turn.justSelectedRule; // one-shot client visual flag

    // ---- Tick rule timers, run expiry effects ----
    const stillActive = [];
    let ruleJustExpired = false;
    for (const rule of game.turn.currentRules) {
        const turnsLeft = rule.turnsLeft - 1;
        if (turnsLeft > 0) {
            stillActive.push({ ...rule, turnsLeft });
        } else {
            ruleJustExpired = true;
            runExpiryEffect(game, rule, rng);
        }
    }
    game.turn.currentRules = stillActive;

    // ---- Offer new rules on schedule ----
    if (game.turn.currentTurn === game.turn.nextTurnWithNewRules) {
        game.turn.nextTurnWithNewRules += TURNS_UNTIL_NEW_RULES;
        game.turn.newRuleChoices = getNextRules(game.turn.currentRules);
    }

    // ---- All on Red: coin flip for the player now to move ----
    if (hasRule(game, 'all_on_red')) {
        const result = rng() < 0.5 ? 'heads' : 'tails';
        game.turn.coinFlip = { player: game.turn.currentPlayer, result, turn: game.turn.currentTurn };
        logEvent(game, `All on Red — ${game.turn.currentPlayer} flips ${result}${result === 'tails' ? ' (King moves only!)' : ''}`);
    } else {
        game.turn.coinFlip = null;
    }

    return { ruleJustExpired };
};

// =============================================================================
// EXPIRY EFFECTS
// =============================================================================

const runExpiryEffect = (game, rule, rng) => {
    switch (rule.id) {

        case 'living_bomb': {
            const bomb = game.pieces[rule.data.slot];
            if (bomb && !bomb.captured) {
                logEvent(game, `${bomb.label} EXPLODES!`);
                removeStatus(game, bomb, 'bomb');
                for (const sq of adjacentSquares(bomb.position.col, bomb.position.row)) {
                    const victim = getPieceAt(game, sq.col, sq.row);
                    if (victim) killPiece(game, victim, 'Living Bomb explosion', rng);
                }
                killPiece(game, bomb, 'Living Bomb explosion', rng);
            }
            break;
        }

        case 'mitosis': {
            const parent = game.pieces[rule.data.slot];
            if (parent && !parent.captured) {
                removeStatus(game, parent, 'mitosis');
                const spot = pickRandom(
                    adjacentSquares(parent.position.col, parent.position.row)
                        .filter(sq => !getPieceAt(game, sq.col, sq.row) &&
                            !squareHasEffect(game, sq.col, sq.row, 'blocked')),
                    rng);
                if (spot) {
                    spawnPiece(game, {
                        color: parent.color, type: pieceType(parent),
                        col: spot.col, row: spot.row, labelSuffix: '(clone)',
                    });
                }
            }
            break;
        }

        case 'treasure_chest': {
            if (rule.data.square) {
                removeSquareEffect(game, rule.data.square.col, rule.data.square.row, 'chest');
            }
            break;
        }

        case 'mr_freeze': {
            for (const slot of rule.data.slots || []) {
                const p = game.pieces[slot];
                if (p) removeStatus(game, p, 'frozen');
            }
            if (rule.data.column !== undefined) {
                for (let row = 0; row < 8; row++) removeSquareEffect(game, rule.data.column, row, 'freeze');
            }
            logEvent(game, 'The Mr Freeze column thaws');
            break;
        }

        case 'ice_age': {
            for (const slot of rule.data.slots || []) {
                const p = game.pieces[slot];
                if (p) removeStatus(game, p, 'frozen');
            }
            logEvent(game, 'The Ice Age thaws');
            break;
        }

        case 'invul_potion': {
            for (const slot of rule.data.slots || []) {
                const p = game.pieces[slot];
                if (p) removeStatus(game, p, 'immortal');
            }
            break;
        }

        case 'portal_3': {
            if (rule.data.squares) {
                for (const sq of rule.data.squares) removeSquareEffect(game, sq.col, sq.row, 'portal');
            }
            break;
        }

        case 'no_mans_land': {
            if (rule.data.column !== undefined) {
                for (let row = 0; row < 8; row++) removeSquareEffect(game, rule.data.column, row, 'wall');
            }
            break;
        }

        case 'tornado': {
            if (rule.data.square) removeSquareEffect(game, rule.data.square.col, rule.data.square.row, 'tornado');
            break;
        }

        case 'summoning_ritual': {
            const corners = [[0, 0], [7, 0], [0, 7], [7, 7]];
            let white = 0, black = 0;
            for (const [col, row] of corners) {
                const p = getPieceAt(game, col, row);
                if (p) (p.color === 'white' ? white++ : black++);
            }
            if (white === black) {
                logEvent(game, 'Summoning Ritual fizzles — corner control is tied');
            } else {
                const winner = white > black ? 'white' : 'black';
                logEvent(game, `Summoning Ritual complete — ${winner} controls the corners!`);
                createChoice(game, {
                    color: winner, ruleId: 'summoning_ritual', step: 'place',
                    kind: 'square',
                    prompt: 'Summoning Ritual — pick an empty square for your new Rook',
                    candidates: squareCandidates(emptySquares(game)),
                    meta: { spawnType: 'Rook' },
                });
            }
            break;
        }

        case 'call_down_lightning': {
            const sq = rule.data.square;
            if (!sq) break;
            removeSquareEffect(game, sq.col, sq.row, 'lightning');
            const controller = getPieceAt(game, sq.col, sq.row);
            if (!controller) {
                logEvent(game, 'Lightning strikes an empty square — nobody was in control');
                break;
            }
            const targets = alivePieces(game).filter(nonKing);
            createChoice(game, {
                color: controller.color, ruleId: 'call_down_lightning', step: 'kill',
                kind: 'piece',
                prompt: 'Call Down Lightning — you control the square! Pick any non-King piece to destroy',
                candidates: slotCandidates(targets),
                meta: { autoStrategy: 'highest' },
            });
            break;
        }

        case 'get_the_fuck_off': {
            if (rule.data.squares) {
                for (const sq of rule.data.squares) {
                    removeSquareEffect(game, sq.col, sq.row, 'doom');
                    const victim = getPieceAt(game, sq.col, sq.row);
                    if (victim) killPiece(game, victim, "didn't Get The Fuck Off in time", rng);
                }
            }
            break;
        }

        case 'gigachad_aura': {
            logEvent(game, 'GIGACHAD AURA detonates around the Kings');
            const doomed = [];
            for (const king of alivePieces(game, null, 'King')) {
                for (const sq of adjacentSquares(king.position.col, king.position.row)) {
                    const p = getPieceAt(game, sq.col, sq.row);
                    if (p && pieceType(p) !== 'King') doomed.push(p);
                }
            }
            for (const p of doomed) killPiece(game, p, 'Gigachad Aura', rng);
            break;
        }

        case 'time_bomb': {
            logEvent(game, 'TIME BOMB detonates — column E is vaporized');
            for (const p of alivePieces(game).filter(p => p.position.col === 4)) {
                killPiece(game, p, 'Time Bomb', rng);
            }
            break;
        }

        default:
            break;
    }
};
