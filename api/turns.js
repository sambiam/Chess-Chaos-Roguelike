/*
Manages the current turn info, current rules, and rule choices

KEY: "rules:status"
HASH: {
    currentTurn: X,
    nextTurnWithNewRules: Y,
    currentPlayer: "white",
    currentRules: [],
    newRuleChoices: [],
    justSelectedRule: true,
}
*/

const STARTING_TURN = 1;
const TURNS_UNTIL_NEW_RULES = 3;
const STARTING_PLAYER = 'white';

import {getNextRules} from './rules.js';
import {redis} from './_lib/redis.js';
import pusher from './_lib/pusher.js';
import { checkPassword } from './auth.js';

const REDIS_KEY = `rules:status`;

export default async function handler(req, res) {

    // GET TURN STATE
    if (req.method === 'GET') {
        
        console.log("ATTEMPTING TO GET TURN");

        // First check the client's password against the real password on Vercel
        const { clientSecret } = req.query;
        if (!checkPassword(clientSecret)) {
            console.log("A client provided the wrong password, rejecting the Get Board State Request, password was ", clientSecret);
            return res.status(401).json({
                success: false,
                message: "Invalid password, get outta here ya rascal"
            });
        }

        try {
            // Return the full hash of the board state
            const rawTurnState = await redis.hgetall(REDIS_KEY);
            console.log("Here's the current Turn State from DB:", rawTurnState);
            // Sorta janky, but doing this to match the Pusher naming convention for the client
            // The alternative is to send ALL clients the board state via pusher but that feels wasteful
            // fuck it we ball
            const newTurn = {newTurn: rawTurnState} 
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
            //      Reseting the turn state
            //      Incrementing a turn
            //      Selecting a rule
            
            const { clientSecret, userId, action, payload } = req.body;

            // First check the client's password against the real password on Vercel
            if (!checkPassword(clientSecret)) {
                console.log("A client provided the wrong password, rejecting the Get Board State Request, password was ", clientSecret);
                return res.status(401).json({
                    success: false,
                    message: "Invalid password, get outta here ya rascal"
                });
            }

            if (!action) {
                return res.status(400).json({ success: false, error: 'Missing action type' });
            }

            // First get the current turn state
            const currentTurnState = await redis.hgetall(REDIS_KEY);
            console.log("got the turn state from DB", currentTurnState);

            switch (action) {
                case 'RESET_TURNS':
                    console.log("Resetting Turns...")
                    await resetTurns();    
                    return res.status(200).json({
                        success: true,
                        message: `Reset the turn state`,
                    });
                case 'INCREMENT_TURN':
                    await incrementTurn(currentTurnState, userId);
                    return res.status(200).json({
                        success: true,
                        message: `New turns successfully processed`,
                    });
                case 'SELECT_RULE':
                    await handleRuleSelection(currentTurnState, userId, payload);
                    return res.status(200).json({
                        success: true,
                        message: `Successfully selected a new rule!`,
                    });
                default:
                    return res.status(400).json({ success: false, error: 'Unknown action type' });
            }
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

async function resetTurns() {

    // const test1 = {
    //     title: "Pacifist",
    //     description: "No piece can take any other pieces",
    //     turnsLeft: 5,
    //     isInstant: false
    // };
    // const test2 = {
    //     title: "Switcheroo",
    //     description: "All Bishops and Knights swap places",
    //     turnsLeft: 0,
    //     isInstant: true
    // };
    // const test3 = {
    //     title: "Communism",
    //     description: "Every piece moves like a pawn",
    //     turnsLeft: 6,
    //     isInstant: false
    // };
    // const test4 = {
    //     title: "Ice Age",
    //     description: "Columns 1 and 8 are frozen",
    //     turnsLeft: 5,
    //     isInstant: false
    // };
    // const mockCurrentRules = [test1, test2, test3, test4];

    // const newRuleMock1 = {
    //     title: "Swap the Fellas",
    //     description: "Both team's Rooks swap places",
    //     turnsLeft: 5,
    //     isInstant: true
    // };
    // const newRuleMock2 = {
    //     title: "BOOM",
    //     description: "Blow up one of your pieces, kill everything around it",
    //     turnsLeft: 0,
    //     isInstant: true
    // };
    // const newRuleMock3 = {
    //     title: "Trans Rights",
    //     description: "Kings now move like Queens, and vice versa",
    //     turnsLeft: 6,
    //     isInstant: false
    // };
    // const mockNewRules = [newRuleMock1, newRuleMock2, newRuleMock3];

    const newTurn = {
        currentTurn: STARTING_TURN,
        nextTurnWithNewRules: STARTING_TURN + TURNS_UNTIL_NEW_RULES,
        currentPlayer: STARTING_PLAYER,
        currentRules: [],
        newRuleChoices: [],
    };
    console.log("Here's the state we're saving to the DB!", newTurn);

    // Trigger Pusher event to tell all clients that new rule choices are live
    const CHANNEL_NAME = 'chess-events';
    const EVENT_TYPE_TURN_UPDATE = 'turn-event';
    await pusher.trigger(CHANNEL_NAME, EVENT_TYPE_TURN_UPDATE, {newTurn});
    console.log(`Triggered Pusher event for Channel:${CHANNEL_NAME} and EventType:${EVENT_TYPE_TURN_UPDATE}`);

    // Now, we write all the data back to the DB
    // Reminder: Redis values must all be strings, not raw JSON, so we stringify every value here
    const stringifiedState = Object.fromEntries(
        Object.entries(newTurn).map(([id, data]) => [id, JSON.stringify(data)])
    );
    await redis.hset(REDIS_KEY, stringifiedState); // Update the DB
}

async function incrementTurn(currentTurn, userId) {

    console.log("We're incrementing a turn! Here's currentTurn", currentTurn);

    // A turn has been made! Process our turns state accordingly
    let newTurn = {};
    newTurn.currentTurn = currentTurn.currentTurn + 1;
    newTurn.nextTurnWithNewRules = currentTurn.nextTurnWithNewRules;
    if (currentTurn.currentPlayer == "white") {
        newTurn.currentPlayer = "black";
    } else {
        newTurn.currentPlayer = "white";
    }

    // Now update turns left on the current rules (removing any that have hit 0 turns left)
    newTurn.currentRules = [];
    for (const rule of currentTurn.currentRules) {
        const newTurnsLeft = rule.turnsLeft - 1;
        if (newTurnsLeft > 0) { // Only keep rules that still have turns left
            newTurn.currentRules.push({
                title: rule.title,
                description: rule.description,
                turnsLeft: newTurnsLeft,
                isInstant: rule.isInstant
            });
        }
    }

    // Copy over the list of current rules that we've currently got stored (it's usually empty)
    newTurn.newRuleChoices = currentTurn.newRuleChoices;

    // Finally - check if it's time for new rules!
    if (newTurn.currentTurn === newTurn.nextTurnWithNewRules) {
        newTurn.nextTurnWithNewRules += TURNS_UNTIL_NEW_RULES;
        newTurn.newRuleChoices = getNextRules();
    } 

    console.log("Incremented turn successfully, now saving and sending this turn state:", newTurn);

    // Trigger Pusher event to tell all clients that new rule choices are live
    const CHANNEL_NAME = 'chess-events';
    const EVENT_TYPE_TURN_UPDATE = 'turn-event';
    await pusher.trigger(CHANNEL_NAME, EVENT_TYPE_TURN_UPDATE, {newTurn, userId});
    console.log(`Triggered Pusher event for Channel:${CHANNEL_NAME} and EventType:${EVENT_TYPE_TURN_UPDATE}`);

    // Finally, write the new turn state data back to the DB
    // Reminder: Redis values must all be strings, not raw JSON, so we stringify every value here
    const stringifiedState = Object.fromEntries(
        Object.entries(newTurn).map(([id, data]) => [id, JSON.stringify(data)])
    );
    await redis.hset(REDIS_KEY, stringifiedState);
}

async function handleRuleSelection(newTurn, userId, payload) {

    // Grab the chosen rule
    console.log("We're handling rule selection! Here's our payload", payload);
    const selectedRule = newTurn.newRuleChoices[payload.chosenIndex];

    // If it's a persistent rule, add it to our list of current rules
    if (selectedRule.turnsLeft > 0) {
        newTurn.currentRules.push(selectedRule);
    }
    // Empty our rule choices
    newTurn.newRuleChoices = [];

    // Send a flag to client so they can update visuals more easily
    newTurn.justSelectedRule = true;

    // Trigger Pusher event so that clients update with the new rules
    const CHANNEL_NAME = 'chess-events';
    const EVENT_TYPE_TURN_UPDATE = 'turn-event';
    await pusher.trigger(CHANNEL_NAME, EVENT_TYPE_TURN_UPDATE, {newTurn, userId});
    console.log(`Triggered Pusher event for Channel:${CHANNEL_NAME} and EventType:${EVENT_TYPE_TURN_UPDATE}`);

    // Finally, write the new turn state data back to the DB
    // Reminder: Redis values must all be strings, not raw JSON, so we stringify every value here
    const stringifiedState = Object.fromEntries(
        Object.entries(newTurn).map(([id, data]) => [id, JSON.stringify(data)])
    );
    await redis.hset(REDIS_KEY, stringifiedState);
}

