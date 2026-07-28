/*
Manages the current turn info, current rules, and rule choices.

KEY: "rules:status"
HASH: {
    currentTurn: X,
    nextTurnWithNewRules: Y,
    currentPlayer: "white",
    currentRules: [],
    newRuleChoices: [],
    seats: { white: userId|null, black: userId|null },
    pendingChoices: [],
    gameOver: null,
    coinFlip: null,
    lastMove: null,
    justSelectedRule: true,
}

Since rules are now actually ENFORCED, selecting a rule executes its effect
on the board server-side (instants shuffle/kill/spawn pieces immediately;
timed rules set up their markers and player choices). Turn advancement for
competitive play happens in api/game.js; the INCREMENT_TURN action here is
kept for Sandbox Mode and runs the same shared finishTurn() logic so rule
timers, portals, and expiry effects still fire in sandbox games.
*/

const STARTING_TURN = 1;
const TURNS_UNTIL_NEW_RULES = 3;
const STARTING_PLAYER = 'white';

import { redis, redisUnavailable, withStateLock, bumpBoardVersion, REDIS_BOARD_CURRENT, REDIS_TURNS_CURRENT, REDIS_UNDO_STACK, UNDO_STACK_MAX } from './_lib/redis.js';
import pusher from './_lib/pusher.js';
import { checkPassword } from './auth.js';
import { buildGame, serializeBoard, serializeTurn } from '../shared/engine.js';
import { applyRuleSelection, finishTurn, autoResolveExpiredChoices } from '../shared/effects.js';

const CHANNEL_NAME = 'chess-events';
const EVENT_TYPE_BOARD_UPDATE = 'board-event';
const EVENT_TYPE_TURN_UPDATE = 'turn-event';

export default async function handler(req, res) {

    if (redisUnavailable(res)) return;

    // GET TURN STATE
    if (req.method === 'GET') {

        console.log("ATTEMPTING TO GET TURN");

        // First check the client's password against the real password on Vercel
        const { clientSecret } = req.query;
        if (!checkPassword(clientSecret)) {
            console.log("Rejecting a Get Turn State request: wrong password");
            return res.status(401).json({
                success: false,
                message: "Invalid password, get outta here ya rascal"
            });
        }

        try {
            // Return the full hash of the turn state
            const rawTurnState = await redis.hgetall(REDIS_TURNS_CURRENT);
            console.log("Here's the current Turn State from DB:", rawTurnState);
            // Sorta janky, but doing this to match the Pusher naming convention for the client
            const newTurn = { newTurn: rawTurnState }
            return res.status(200).json({
                success: true,
                turnState: newTurn,
                message: 'board status retrieved'
            });
        } catch (error) {
            console.error('Redis GET error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve board status from database'
            });
        }

    } else if (req.method === 'POST') {

        try {

            // This endpoint can process 3 things:
            //      Resetting the turn state
            //      Incrementing a turn (Sandbox Mode only — api/game.js does this for enforced play)
            //      Selecting a rule (which now EXECUTES the rule on the board)

            const { clientSecret, userId, action, payload } = req.body;

            // First check the client's password against the real password on Vercel
            if (!checkPassword(clientSecret)) {
                console.log("Rejecting a turn state update: wrong password");
                return res.status(401).json({
                    success: false,
                    message: "Invalid password, get outta here ya rascal"
                });
            }

            if (!action) {
                return res.status(400).json({ success: false, error: 'Missing action type' });
            }

            // Load-and-write runs under the state lock: a rule selection or a
            // sandbox turn advance must not interleave with a move being
            // processed in /api/game, or the slower writer silently undoes the
            // other one's changes.
            return await withStateLock(async () => {

            // Load both current states — rule effects touch the board too
            const [currentBoardState, currentTurnState] = await Promise.all([
                redis.hgetall(REDIS_BOARD_CURRENT),
                redis.hgetall(REDIS_TURNS_CURRENT),
            ]);

            switch (action) {
                case 'RESET_TURNS':
                    console.log("Resetting Turns...")
                    await resetTurns(currentTurnState);
                    return res.status(200).json({
                        success: true,
                        message: `Reset the turn state`,
                    });
                case 'INCREMENT_TURN': {
                    // Sandbox Mode turn advance: no move validation, but rule
                    // timers, portals, expiry effects and rule offers still run
                    const game = buildGame(currentBoardState || {}, currentTurnState || {});
                    autoResolveExpiredChoices(game);
                    const { ruleJustExpired } = finishTurn(game);
                    await saveAndBroadcast(game, currentBoardState, currentTurnState, {
                        userId, ruleJustExpired, snapshot: false,
                    });
                    return res.status(200).json({
                        success: true,
                        message: `New turns successfully processed`,
                    });
                }
                case 'SELECT_RULE': {
                    const game = buildGame(currentBoardState || {}, currentTurnState || {});
                    autoResolveExpiredChoices(game);

                    // In enforced play only the player to move picks the rule.
                    // (Seats unclaimed = sandbox/stream mode: anyone may pick.)
                    const seats = game.turn.seats;
                    const seatOf = seats.white === userId ? 'white' : seats.black === userId ? 'black' : null;
                    const seatsClaimed = seats.white || seats.black;
                    if (seatsClaimed && seatOf !== game.turn.currentPlayer) {
                        return res.status(200).json({
                            success: false,
                            message: `Only ${game.turn.currentPlayer} may pick the new rule`,
                        });
                    }

                    const chosen = game.turn.newRuleChoices[payload.chosenIndex];
                    if (!chosen) {
                        return res.status(200).json({ success: false, message: 'That rule choice is not available' });
                    }
                    console.log("Here's our selected rule!", chosen);

                    // Persistent rules join the active list BEFORE execution so
                    // setup effects can write into rule.data
                    game.turn.newRuleChoices = [];
                    let ruleInstance = { ...chosen, data: chosen.data || {} };
                    if (!ruleInstance.isInstant) {
                        game.turn.currentRules.push(ruleInstance);
                        ruleInstance = game.turn.currentRules[game.turn.currentRules.length - 1];
                    }

                    // *** EXECUTE THE RULE ***
                    applyRuleSelection(game, ruleInstance, game.turn.currentPlayer);

                    game.turn.justSelectedRule = true;
                    await saveAndBroadcast(game, currentBoardState, currentTurnState, {
                        userId, ruleJustExpired: false, snapshot: true,
                    });
                    return res.status(200).json({
                        success: true,
                        message: `Successfully selected a new rule!`,
                        events: game.events,
                    });
                }
                default:
                    return res.status(400).json({ success: false, error: 'Unknown action type' });
            }
            });
        } catch (error) {
            console.error('Redis SET error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update board state in database' });
        }
    }
    // Method not allowed
    return res.status(405).json({
        success: false,
        error: 'Method not allowed. Use GET to retrieve or POST to interact with the board.'
    });
}

async function resetTurns(previousTurnState) {

    const newTurn = {
        currentTurn: STARTING_TURN,
        nextTurnWithNewRules: STARTING_TURN + TURNS_UNTIL_NEW_RULES,
        currentPlayer: STARTING_PLAYER,
        currentRules: [],
        newRuleChoices: [],
        // Players keep their seats across board resets
        seats: (previousTurnState && previousTurnState.seats) || { white: null, black: null },
        pendingChoices: [],
        gameOver: null,
        coinFlip: null,
        lastMove: null,
    };
    console.log("Here's the state we're saving to the DB!", newTurn);

    // Trigger Pusher event to tell all clients that new rule choices are live
    await pusher.trigger(CHANNEL_NAME, EVENT_TYPE_TURN_UPDATE, { newTurn });
    console.log(`Triggered Pusher event for Channel:${CHANNEL_NAME} and EventType:${EVENT_TYPE_TURN_UPDATE}`);

    // Now, we write all the data back to the DB
    // Reminder: Redis values must all be strings, not raw JSON, so we stringify every value here
    // Note: we do NOT delete the turn history here! That way you can "Undo Turn" to undo the board reset.
    //     This is strictly as a failsafe in case someone accidentally resets the board
    const stringifiedState = Object.fromEntries(
        Object.entries(newTurn).map(([id, data]) => [id, JSON.stringify(data)])
    );
    await redis.multi()
        .del(REDIS_TURNS_CURRENT)
        .hset(REDIS_TURNS_CURRENT, stringifiedState)
        .exec();
}

// Saves the game's board + turn state (optionally snapshotting the previous
// state onto the undo stack) and broadcasts both Pusher events.
async function saveAndBroadcast(game, prevBoardState, prevTurnState, { userId, ruleJustExpired, snapshot }) {
    const newBoard = serializeBoard(game);
    const newTurn = serializeTurn(game);

    const stringifiedBoard = Object.fromEntries(
        Object.entries(newBoard).map(([id, data]) => [id, JSON.stringify(data)])
    );
    const stringifiedTurn = Object.fromEntries(
        Object.entries(newTurn).map(([id, data]) => [id, JSON.stringify(data)])
    );

    const pipeline = redis.multi();
    if (snapshot && prevBoardState && prevTurnState) {
        const undoSnapshot = JSON.stringify({
            boardState: prevBoardState,
            turnState: prevTurnState,
            timestamp: Date.now(),
        });
        pipeline.lpush(REDIS_UNDO_STACK, undoSnapshot);
        pipeline.ltrim(REDIS_UNDO_STACK, 0, UNDO_STACK_MAX - 1);
    }
    pipeline.del(REDIS_BOARD_CURRENT);
    pipeline.hset(REDIS_BOARD_CURRENT, stringifiedBoard);
    pipeline.del(REDIS_TURNS_CURRENT);
    pipeline.hset(REDIS_TURNS_CURRENT, stringifiedTurn);
    await pipeline.exec();

    // Rule effects rewrite the board, so clients holding the older one must
    // not be allowed to write it back
    const boardVersion = await bumpBoardVersion();

    await Promise.all([
        pusher.trigger(CHANNEL_NAME, EVENT_TYPE_BOARD_UPDATE, {
            newState: newBoard, events: game.events, boardVersion,
        }),
        pusher.trigger(CHANNEL_NAME, EVENT_TYPE_TURN_UPDATE, {
            newTurn, userId, ruleJustExpired, events: game.events,
        }),
    ]);
}
