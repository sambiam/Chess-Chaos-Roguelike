import Pusher from 'pusher-js';
import { state, toNotation, turns } from './board-state.js';
import {
    updatePiecePosition,
    updatePieceImage,
    updatePieceCaptureState,
    updatePieceEmojis,
    updatePieceNotation,
    updatePieceSelection,
    updateSquareEffect,
    refreshAllReviveButtons,
    syncHighlightFromServer,
    renderTurnUpdate,
} from './board-view.js';
import { apiGet, apiPost, getUserId, playCaptureSounds } from './utils.js';

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================

let _clientSecret = '';
let pusherClient = null;
let pusherChannel = null;

export function initNetwork({ clientSecret }) {
    _clientSecret = clientSecret;
    initializePusher();
}

// =============================================================================
// PUSHER INITIALIZATION
// =============================================================================

function initializePusher() {
    const pusherKey = import.meta.env.VITE_PUSHER_KEY;
	const pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER;
    const CHANNEL_NAME = 'chess-events';
    const EVENT_TYPE_BOARD_UPDATE = 'board-event';
    const EVENT_TYPE_TURN_UPDATE = 'turn-event';

    if (!pusherKey || !pusherCluster) {
        throw new Error(
            'Missing VITE_PUSHER_KEY / VITE_PUSHER_CLUSTER. Set these to your own Pusher app credentials ' +
            '(see .env.example) so your deployment does not share a channel with other instances of this app.'
        );
    }

	pusherClient = new Pusher(pusherKey, {cluster: pusherCluster,});
	
	pusherChannel = pusherClient.subscribe(CHANNEL_NAME);
	
	pusherChannel.bind(EVENT_TYPE_BOARD_UPDATE, (data) => {
        handleBoardUpdate(data);
	});

	pusherChannel.bind(EVENT_TYPE_TURN_UPDATE, (data) => {
        handleTurnUpdate(data);
	});
	
	pusherClient.connection.bind('connected', () => {
        const headerText = document.getElementById("pusher-status");
        headerText.textContent = "Connected to Pusher!"
		console.log('Pusher connected!');
	});
	pusherClient.connection.bind('disconnected', () => {
        const headerText = document.getElementById("pusher-status");
        headerText.textContent = "Disconnected from Pusher!"
		console.log('Pusher disconnected');
	});
	pusherClient.connection.bind('error', (err) => {
		const headerText = document.getElementById("pusher-status");
        headerText.textContent = "Pusher Error!"
		console.error('Pusher error:', err);
	});
}

// =============================================================================
// SERVER STATE PULLING
// =============================================================================

export const pullServerBoardState = async () => {
    const result = await apiGet('/api/board-state', {clientSecret: _clientSecret});
    if (!result.success) {
        console.log("Failed to pull board state from the server");
        return;
    }
    syncBoardWithServer(result.boardState);
}

export const pullServerTurnState = async () => {
    const result = await apiGet('/api/turns', {clientSecret: _clientSecret, userId: getUserId()});
    if (!result.success) {
        console.log("Failed to pull turn state from the server");
        return;
    }
    handleTurnUpdate(result.turnState);
}

// =============================================================================
// INCOMING BOARD UPDATES
// =============================================================================

const handleBoardUpdate = (boardData) => {
    if (boardData.userId === getUserId()) {
        console.log("Received a Pusher piece move event, but we initiated it, so ignoring it");
        return;
    }
    syncBoardWithServer(boardData.newState);
};

const syncBoardWithServer = (newState) => {
    let playedCaptureSound = false;
    for (const [slot, newPiece] of Object.entries(newState)) {
        if (slot === 'boardEffects' || slot === 'highlightedSquare' || slot === 'selectedSlot') continue;
        const currentPiece = state.pieces[Number(slot)];
        if (!currentPiece) continue;
        if (currentPiece.position.row !== newPiece.position.row || currentPiece.position.col !== newPiece.position.col) {
            currentPiece.position = { col: newPiece.position.col, row: newPiece.position.row };
            currentPiece.notation = toNotation(newPiece.position.col, newPiece.position.row);
            updatePiecePosition(currentPiece);
            updatePieceNotation(currentPiece);
        }
        if (currentPiece.image !== newPiece.image) {
            currentPiece.image = newPiece.image;
            currentPiece.imageSelect.value = currentPiece.image;
            updatePieceImage(currentPiece);
        }
        if (currentPiece.captured !== newPiece.captured) {
            currentPiece.captured = newPiece.captured;
            updatePieceCaptureState(currentPiece);
            if (newPiece.captured && !playedCaptureSound) {
                playCaptureSounds();
                playedCaptureSound = true;
            }
        }
        const serverEmojis = newPiece.emojis || [];
        const currentEmojis = currentPiece.emojis;
        if (serverEmojis.length !== currentEmojis.length ||
            serverEmojis.some((e, i) => e !== currentEmojis[i])) {
            currentPiece.emojis = [...serverEmojis];
            updatePieceEmojis(currentPiece);
        }
    }

    refreshAllReviveButtons();

    // Sync selection from server
    const serverSelectedSlot = newState.selectedSlot ?? null;
    if (state.selectedSlot !== serverSelectedSlot) {
        if (state.selectedSlot) {
            updatePieceSelection(state.pieces[state.selectedSlot], false);
        }
        state.selectedSlot = serverSelectedSlot;
        if (serverSelectedSlot) {
            const selectedPiece = state.pieces[serverSelectedSlot];
            if (selectedPiece && !selectedPiece.captured) {
                updatePieceSelection(selectedPiece, true);
            } else {
                state.selectedSlot = null;
            }
        }
    }

    // Sync board effects
    if (newState.boardEffects) {
        const serverEffects = newState.boardEffects;
        for (const key of Object.keys(state.boardEffects)) {
            if (!serverEffects[key] || serverEffects[key].length === 0) {
                state.boardEffects[key] = [];
                const [col, row] = key.split(',').map(Number);
                updateSquareEffect(col, row);
            }
        }
        for (const [key, effects] of Object.entries(serverEffects)) {
            const current = state.boardEffects[key] || [];
            if (effects.length !== current.length || effects.some((e, i) => e !== current[i])) {
                state.boardEffects[key] = [...effects];
                const [col, row] = key.split(',').map(Number);
                updateSquareEffect(col, row);
            }
        }
    }

    // Sync randomizer highlight (timestamp-guarded)
    if (newState.highlightedSquare !== undefined) {
        syncHighlightFromServer(newState.highlightedSquare);
    }
};

// =============================================================================
// INCOMING TURN UPDATES
// =============================================================================

const handleTurnUpdate = (data) => {
    console.log("We got a turn update from the server with this info:", data.newTurn);
    const newTurnState = data.newTurn;

    // Update turn state
    turns.currentTurn = newTurnState.currentTurn;
    turns.currentRules = newTurnState.currentRules;
    turns.newRuleChoices = newTurnState.newRuleChoices;

    const playerChanged = turns.currentPlayer !== newTurnState.currentPlayer;
    if (playerChanged) {
        turns.currentPlayer = newTurnState.currentPlayer;
    }

    // Delegate all visual updates to the view layer
    renderTurnUpdate({
        newTurnState,
        playerChanged,
        ruleJustExpired: data.ruleJustExpired,
        userId: data.userId,
        onRuleSelect: async (chosenIndex) => {
            await apiPost('/api/turns', {
                clientSecret: _clientSecret,
                userId: getUserId(),
                action: 'SELECT_RULE',
                payload: { chosenIndex },
            });
        },
    });
};
