import {redis, redisUnavailable, REDIS_BOARD_CURRENT, REDIS_TURNS_CURRENT, REDIS_UNDO_STACK} from './_lib/redis.js';
import pusher from './_lib/pusher.js';
import { checkPassword } from './auth.js';

export default async function handler(req, res) {

    if (redisUnavailable(res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST to undo.',
        });
    }

    try {

        // Note: this does not require a userId
        // We want the client to visually update regardless of who initiated the Undo Turn

        const { clientSecret } = req.body;

        if (!checkPassword(clientSecret)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password, Im walking heeere',
            });
        }

        // Atomically pop the most recent snapshot from the undo stack
        const snapshot = await redis.lpop(REDIS_UNDO_STACK);
        if (!snapshot) {
            console.log("Client asked to undo turn, but there's no history on the stack!")
            return res.status(200).json({
                success: false,
                message: 'There is no history to undo!',
            });
        }

        console.log("Undo: restoring snapshot from timestamp", snapshot.timestamp);

        // Re-stringify each hash field value for HSET (Redis stores them as strings)
        const boardEntries = Object.fromEntries(
            Object.entries(snapshot.boardState).map(([k, v]) => [k, JSON.stringify(v)])
        );
        const turnEntries = Object.fromEntries(
            Object.entries(snapshot.turnState).map(([k, v]) => [k, JSON.stringify(v)])
        );

        // Restore both hashes atomically (DEL first to clear any stale fields)
        await redis.multi()
            .del(REDIS_BOARD_CURRENT)
            .hset(REDIS_BOARD_CURRENT, boardEntries)
            .del(REDIS_TURNS_CURRENT)
            .hset(REDIS_TURNS_CURRENT, turnEntries)
            .exec();

        // Fire Pusher events so all clients update
        const CHANNEL_NAME = 'chess-events';
        await Promise.all([
            pusher.trigger(CHANNEL_NAME, 'board-event', {
                newState: snapshot.boardState,
            }),
            pusher.trigger(CHANNEL_NAME, 'turn-event', {
                newTurn: snapshot.turnState,
            }),
        ]);

        console.log("Successfully undid a turn!")

        return res.status(200).json({
            success: true,
            message: 'Undo Turn was successful!',
        });

    } catch (error) {
        console.error('Undo error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to undo turn, I got no fuckin idea',
        });
    }
}
