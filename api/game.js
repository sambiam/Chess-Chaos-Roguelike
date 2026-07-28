/*
SERVER-AUTHORITATIVE GAME ENDPOINT

All competitive play flows through here. The client never writes board state
directly in enforced mode — it sends intents (MOVE / PASS / CHOICE / seats)
and the server validates them against the rules engine, applies every
consequence, and broadcasts the authoritative result to all clients.

Actions (POST body: { clientSecret, userId, action, payload }):
    MOVE         payload: { slot, target: { col, row } }
    PASS         (only legal when the mover truly has no legal moves)
    CHOICE       payload: { choiceId, selection, auto? }
    CLAIM_SEAT   payload: { seat: 'white' | 'black' }
    RELEASE_SEAT
    LEGAL_MOVES  payload: { } — returns current legal moves (for debugging)
*/

import { redis, redisUnavailable, REDIS_BOARD_CURRENT, REDIS_TURNS_CURRENT, REDIS_UNDO_STACK, UNDO_STACK_MAX } from './_lib/redis.js';
import pusher from './_lib/pusher.js';
import { checkPassword } from './auth.js';
import {
    buildGame,
    serializeBoard,
    serializeTurn,
    applyMove,
    mustPass,
    getAllLegalMoves,
} from '../shared/engine.js';
import {
    finishTurn,
    resolveChoice,
    autoResolveExpiredChoices,
} from '../shared/effects.js';

const CHANNEL_NAME = 'chess-events';
const EVENT_TYPE_BOARD_UPDATE = 'board-event';
const EVENT_TYPE_TURN_UPDATE = 'turn-event';

export default async function handler(req, res) {
    if (redisUnavailable(res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed. POST an action.' });
    }

    try {
        const { clientSecret, userId, action, payload = {} } = req.body;

        if (!checkPassword(clientSecret)) {
            return res.status(401).json({ success: false, message: 'Invalid password, get outta here ya rascal' });
        }
        if (!action) {
            return res.status(400).json({ success: false, error: 'Missing action type' });
        }
        if (!userId) {
            return res.status(400).json({ success: false, error: 'Missing userId' });
        }

        // Load the full authoritative state and build the in-memory game
        const [boardState, turnState] = await Promise.all([
            redis.hgetall(REDIS_BOARD_CURRENT),
            redis.hgetall(REDIS_TURNS_CURRENT),
        ]);
        const game = buildGame(boardState || {}, turnState || {});

        // Choices whose timer ran out get auto-resolved before anything else
        const autoResolved = autoResolveExpiredChoices(game);

        const seats = game.turn.seats;
        const seatOf = (uid) =>
            seats.white === uid ? 'white' : seats.black === uid ? 'black' : null;

        let result = { success: false, message: 'Unknown action type' };
        let mutated = autoResolved;
        let snapshot = false;   // whether to push an undo snapshot
        let ruleJustExpired = false;

        switch (action) {

            case 'CLAIM_SEAT': {
                const seat = payload.seat;
                if (seat !== 'white' && seat !== 'black') {
                    result = { success: false, message: 'Seat must be white or black' };
                    break;
                }
                // This is a private game between friends: any seat can always be
                // claimed, even one that already has an occupant. A stale userId
                // (cleared localStorage, a different browser) used to lock a
                // colour out permanently with "already taken".
                const previousOccupant = seats[seat];
                // One seat per user — leaving your old seat if you switch
                if (seats.white === userId) seats.white = null;
                if (seats.black === userId) seats.black = null;
                seats[seat] = userId;
                game.events.push(
                    previousOccupant && previousOccupant !== userId
                        ? `A player took over the ${seat} seat`
                        : `A player claimed the ${seat} seat`
                );
                result = { success: true, message: `You are now playing ${seat}`, seat };
                mutated = true;
                break;
            }

            case 'RELEASE_SEAT': {
                const seat = seatOf(userId);
                if (!seat) {
                    result = { success: false, message: 'You have no seat to release' };
                    break;
                }
                seats[seat] = null;
                game.events.push(`The ${seat} seat is now open`);
                result = { success: true, message: `Released the ${seat} seat` };
                mutated = true;
                break;
            }

            case 'MOVE': {
                const seat = seatOf(userId);
                if (!seat) {
                    result = { success: false, message: 'Claim a seat before moving' };
                    break;
                }
                if (seat !== game.turn.currentPlayer) {
                    result = { success: false, message: `It is ${game.turn.currentPlayer}'s turn` };
                    break;
                }
                const { slot, target } = payload;
                if (!slot || !target) {
                    result = { success: false, message: 'MOVE needs a slot and target' };
                    break;
                }
                const piece = game.pieces[slot];
                if (!piece || piece.color !== seat) {
                    result = { success: false, message: 'You can only move your own pieces' };
                    break;
                }
                const moveResult = applyMove(game, slot, target.col, target.row);
                if (!moveResult.ok) {
                    result = { success: false, message: moveResult.reason };
                    // Auto-resolved choices may still need saving
                    break;
                }
                if (!game.turn.gameOver) {
                    ruleJustExpired = finishTurn(game).ruleJustExpired;
                }
                game.selectedSlot = null;
                result = { success: true, message: 'Move applied' };
                mutated = true;
                snapshot = true;
                break;
            }

            case 'PASS': {
                const seat = seatOf(userId);
                if (!seat) {
                    result = { success: false, message: 'Claim a seat before passing' };
                    break;
                }
                if (seat !== game.turn.currentPlayer) {
                    result = { success: false, message: `It is ${game.turn.currentPlayer}'s turn` };
                    break;
                }
                if ((game.turn.pendingChoices || []).length > 0) {
                    result = { success: false, message: 'A rule choice must be resolved first' };
                    break;
                }
                if (!mustPass(game, seat)) {
                    result = { success: false, message: 'You have legal moves — you cannot pass' };
                    break;
                }
                game.events.push(`${seat} has no legal moves and passes`);
                ruleJustExpired = finishTurn(game).ruleJustExpired;
                result = { success: true, message: 'Turn passed' };
                mutated = true;
                snapshot = true;
                break;
            }

            case 'CHOICE': {
                const seat = seatOf(userId);
                const { choiceId, selection, auto } = payload;
                const choice = (game.turn.pendingChoices || []).find(c => c.id === choiceId);
                if (!choice) {
                    result = { success: false, message: 'That choice is no longer pending' };
                    break;
                }
                // Only the player the choice belongs to may resolve it —
                // except an expired choice, which anyone may trigger auto-resolve on
                const expired = Date.now() > choice.deadline;
                if (choice.color !== seat && !expired) {
                    result = { success: false, message: 'This choice belongs to the other player' };
                    break;
                }
                const choiceResult = resolveChoice(game, choiceId, selection, Math.random, {
                    auto: !!auto || (expired && choice.color !== seat),
                });
                if (!choiceResult.ok) {
                    result = { success: false, message: choiceResult.reason };
                    break;
                }
                result = { success: true, message: 'Choice resolved' };
                mutated = true;
                snapshot = true;
                break;
            }

            case 'LEGAL_MOVES': {
                const color = payload.color || game.turn.currentPlayer;
                result = { success: true, legalMoves: getAllLegalMoves(game, color) };
                break;
            }

            default:
                result = { success: false, message: `Unknown action: ${action}` };
                break;
        }

        // Persist + broadcast if anything changed
        if (mutated) {
            const newBoard = serializeBoard(game);
            const newTurn = serializeTurn(game);

            const stringifiedBoard = Object.fromEntries(
                Object.entries(newBoard).map(([id, data]) => [id, JSON.stringify(data)])
            );
            const stringifiedTurn = Object.fromEntries(
                Object.entries(newTurn).map(([id, data]) => [id, JSON.stringify(data)])
            );

            const pipeline = redis.multi();
            if (snapshot && boardState && turnState) {
                const undoSnapshot = JSON.stringify({
                    boardState, turnState, timestamp: Date.now(),
                });
                pipeline.lpush(REDIS_UNDO_STACK, undoSnapshot);
                pipeline.ltrim(REDIS_UNDO_STACK, 0, UNDO_STACK_MAX - 1);
            }
            // DEL first so captured/stale fields never linger
            pipeline.del(REDIS_BOARD_CURRENT);
            pipeline.hset(REDIS_BOARD_CURRENT, stringifiedBoard);
            pipeline.del(REDIS_TURNS_CURRENT);
            pipeline.hset(REDIS_TURNS_CURRENT, stringifiedTurn);
            await pipeline.exec();

            await Promise.all([
                pusher.trigger(CHANNEL_NAME, EVENT_TYPE_BOARD_UPDATE, {
                    newState: newBoard, events: game.events,
                    // No userId here on purpose: EVERY client (including the
                    // one that acted) applies the authoritative server state
                }),
                pusher.trigger(CHANNEL_NAME, EVENT_TYPE_TURN_UPDATE, {
                    newTurn, events: game.events, ruleJustExpired,
                }),
            ]);
        }

        return res.status(200).json({ ...result, events: game.events });

    } catch (error) {
        console.error('Game action error:', error);
        return res.status(500).json({ success: false, error: 'Failed to process game action' });
    }
}
