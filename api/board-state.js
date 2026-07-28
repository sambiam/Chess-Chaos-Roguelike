/*
REDIS HASH (1 per app)

KEY: "board:status"
HASH: {
    "1": "{captured: false, image: "White Rook 1.png", position: {"col": 0,"row": 7}, emojis: []",
    "2": "{...}",
    "3": "{...}"",
    etc
}

Note: Redis can only store strings as values
So each each value is a stringify'ed JSON object, rather than an actual JSON object
*/

import {redis, redisUnavailable, withStateLock, REDIS_BOARD_CURRENT, REDIS_TURNS_CURRENT, REDIS_UNDO_STACK, UNDO_STACK_MAX} from './_lib/redis.js';
import pusher from './_lib/pusher.js';
import { checkPassword } from './auth.js';
import { filterResurrectedSlots, isPieceSlot } from '../shared/defs.js';

export default async function handler(req, res) {

    // Without Redis credentials every call below fails on an empty URL —
    // say so plainly instead of returning a mystery 500
    if (redisUnavailable(res)) return;

    // GET BOARD STATE
    if (req.method === 'GET') {
        
        console.log("ATTEMPTING TO GET BOARD STATE");

        // First check the client's password against the real password on Vercel
        const { clientSecret } = req.query;
        if (!checkPassword(clientSecret)) {
            console.log("Rejecting a Get Board State request: wrong password");
            return res.status(401).json({
                success: false,
                message: "Invalid password, get outta here ya rascal"
            });
        }

        try {
            // Return the full hash of the board state
            const rawBoardState = await redis.hgetall(REDIS_BOARD_CURRENT);
            // Logging the whole hash printed ~9KB per page load; the slot list is
            // what actually helps when debugging state that should have been reset
            console.log(
                "Loaded board state from DB:",
                Object.keys(rawBoardState || {}).filter(k => /^\d+$/.test(k)).length,
                "pieces, slots:",
                Object.keys(rawBoardState || {}).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b).join(","),
            );
            // Send board state to the client
            return res.status(200).json({
                success: true,
                boardState: rawBoardState,
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

            const { clientSecret, userId, tabId, newState, skipSnapshot } = req.body;

            // First check the client's password against the real password on Vercel
            if (!checkPassword(clientSecret)) {
                console.log("Rejecting a Get Board State request: wrong password");
                return res.status(401).json({
                    success: false,
                    message: "Invalid password, get outta here ya rascal"
                });
            }

            if (!newState) {
                return res.status(400).json({ success: false, error: "Did not send value board state"});
            }

            // A board with no pieces at all is never a legitimate client mirror,
            // and writing it would empty the hash for everyone
            if (!Object.keys(newState).some(isPieceSlot)) {
                return res.status(400).json({ success: false, error: "Board state contains no pieces" });
            }

            /*
            Adding the undo-turn feature made all this shit whacky, buckle up chucklehead:
            Here's the normal flow:
                You make a change on the board
                This fires off an update HTTP request to our board-state API, *then* to the turns API
                This board-state API (right here) fires first.
                    It grabs the current board state and turn state from the DB (our snapshot info), and stores them in the undo history.
                    Then it writes the new board state we received into the DB
                Shortly after, the turns API will fire and update the turn state
                    By the time this fires, the board-state API has already saved the previous board AND turn state,
                    so it's fine for us to overwrite the current turn state DB data

            So essentially, this API will grab and store the history for BOTH states. 
                We depend on the board-state API always firing before the turns API.
                A little whacky but it works.
            
            Things to think about:
                If Ignore Turns is checked, we're still creating history snapshots with every move, but the snapshots only reflect the board state changing, and each one has the exact same turn state
                The only thing that DOESN'T get saved into history by this API is when you select a new rule
                    In that case, it ONLY fires a turns.js API update, not a board one
                    Therefore, we have the turns.js store the history snapshot for that particular action, otherwise board-state.js handles it
            */

            // If skipSnapshot is true, it means this board-state event was triggered from someone selecting or deselecting a piece
            // We want this synced on the server (so clients can see it), but we don't want to add it to our turn history,
            // because otherwise 50%+ of the turn history is just piece selections
            // Note: every POST carries the client's COMPLETE board state, so we
            // DEL before HSET. A bare HSET only merges: slots the client no
            // longer knows about (rule-spawned pieces 33+, removed after a
            // Reset Board) survived in the hash and were resurrected by the
            // next server-authoritative action — that's how ghost Queens from
            // a previous game reappeared on the first move of a new one.
            //
            // The mirror-image failure is a client posting pieces the server no
            // longer has, so the incoming state is filtered against the
            // authoritative hash first (see filterResurrectedSlots).
            //
            // The whole read-modify-write runs under the state lock so it
            // cannot interleave with a move being processed in /api/game.
            const { savedState, droppedSlots } = await withStateLock(async () => {
                // Grab the current board (and, unless this is a selection-only
                // update, the turn state for the undo snapshot)
                const [prevBoardState, prevTurnState] = await Promise.all([
                    redis.hgetall(REDIS_BOARD_CURRENT),
                    skipSnapshot ? Promise.resolve(null) : redis.hgetall(REDIS_TURNS_CURRENT),
                ]);

                // Clients may update pieces, never invent them
                const { board, dropped } = filterResurrectedSlots(newState, prevBoardState || {});
                if (dropped.length > 0) {
                    console.warn(
                        "Ignored rule-spawned slots a client tried to restore (they are not on the authoritative board):",
                        dropped.join(","),
                    );
                }
                if (!Object.keys(board).some(isPieceSlot)) {
                    // Nothing legitimate left to write — leave the board alone
                    return { savedState: null, droppedSlots: dropped };
                }

                // Reminder: Redis values must all be strings, not raw JSON, so we stringify every value here
                const stringifiedState = Object.fromEntries(
                    Object.entries(board).map(([id, data]) => [id, JSON.stringify(data)])
                );

                const pipeline = redis.multi();
                if (!skipSnapshot && prevBoardState && prevTurnState) {
                    const snapshot = JSON.stringify({
                        boardState: prevBoardState,
                        turnState: prevTurnState,
                        timestamp: Date.now(),
                    });
                    pipeline.lpush(REDIS_UNDO_STACK, snapshot);
                    pipeline.ltrim(REDIS_UNDO_STACK, 0, UNDO_STACK_MAX - 1);
                }
                pipeline.del(REDIS_BOARD_CURRENT);
                pipeline.hset(REDIS_BOARD_CURRENT, stringifiedState);
                await pipeline.exec();

                return { savedState: board, droppedSlots: dropped };
            });

            if (!savedState) {
                return res.status(409).json({
                    success: false,
                    resync: true,   // tells the client to pull the real board
                    message: 'That board state only contained pieces the server no longer has — resyncing',
                });
            }

            // Trigger Pusher event to give all clients the new board state.
            // tabId lets the sending TAB skip its own echo — but when we had to
            // drop slots the sender is out of date, so we deliberately leave it
            // off and let the sanitized board heal it too.
            const CHANNEL_NAME = 'chess-events';
            const EVENT_TYPE_BOARD_UPDATE = 'board-event';
            await pusher.trigger(CHANNEL_NAME, EVENT_TYPE_BOARD_UPDATE, {
                userId: userId,
                tabId: droppedSlots.length > 0 ? null : (tabId ?? null),
                newState: savedState,
            });
            console.log(`Triggered Pusher event for Channel:${CHANNEL_NAME} and EventType:${EVENT_TYPE_BOARD_UPDATE}`);

            // Send response to client
            return res.status(200).json({
                success: true,
                message: `New board state successfully saved`,
                droppedSlots,
            });
        
        } catch (error) {
            console.error('Redis SET error:', error);
            return res.status(500).json({success: false, error: 'Failed to update board state in database'});
        }
    }
  
    // Method not allowed
    return res.status(405).json({
        success: false,
        error: 'Method not allowed. Use GET to retrieve or POST to interact with the board.'
    });
}