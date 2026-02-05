/*
REDIS HASH (1 per app)

KEY: "board:status"
HASH: {
    "1": "{captured: false, image: "White Rook 1.png", position: {"col": 0,"row": 7}",
    "2": "{...}",
    "3": "{...}"",
    etc
}

Note: Redis can only store strings as values
So each each value is a stringify'ed JSON object, rather than an actual JSON object
*/

import {redis} from './_lib/redis.js';
import pusher from './_lib/pusher.js';

const REDIS_KEY = `board:status`;

export default async function handler(req, res) {

    // GET BOARD STATE
    if (req.method === 'GET') {
        
        console.log("ATTEMPTING TO GET BOARD STATE");

        // TODO - check the provided clientSecret against the secret env variable on vercel
        // const { clientSecret } = req.query;
        // let vercelClientSecret = process.env.MY_VERCEL_ENV_VARIABLE_NAME;
        // if (clientSecret !== vercelClientSecret) { ... do stuff }

        try {
            // Return the full hash of the board state
            const rawBoardState = await redis.hgetall(REDIS_KEY);

            console.log("got raw board state", rawBoardState);
            // Parse all the string JSON values back into JSON
            // const boardState = Object.fromEntries(
            //     Object.entries(rawBoardState).map(([id, jsonString]) => [Number(id), JSON.parse(jsonString)])
            //   );
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

            const { clientSecret, userId, newState } = req.body;

            // TODO - check the provided clientSecret against the secret env variable on vercel
            // let vercelClientSecret = process.env.MY_VERCEL_ENV_VARIABLE_NAME;
            // if (clientSecret !== vercelClientSecret) { ... do stuff }

            if (!newState) {
                return res.status(400).json({ success: false, error: "Did not send value board state"});
            }

            // Turn all of the data into one string for efficient database transaction
            // Reminder: Redis values must all be strings, not raw JSON, so we stringify every value here
            const stringifiedState = Object.fromEntries(
                Object.entries(newState).map(([id, data]) => [id, JSON.stringify(data)])
            );

            // Update the DB
            await redis.hset(REDIS_KEY, stringifiedState);

            // Trigger Pusher event to give all clients the new board state
            const CHANNEL_NAME = 'chess-events';
            const EVENT_TYPE_BOARD_UPDATE = 'board-event';
            await pusher.trigger(CHANNEL_NAME, EVENT_TYPE_BOARD_UPDATE, {userId: userId, newState: newState});
            console.log(`Triggered Pusher event for Channel:${CHANNEL_NAME} and EventType:${EVENT_TYPE_BOARD_UPDATE}`);
            
            // Send response to client
            return res.status(200).json({
                success: true,
                message: `New board state successfully saved`
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
