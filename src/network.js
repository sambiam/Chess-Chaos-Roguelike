import Pusher from 'pusher-js';
import { state, toNotation, turns, registerSpawnedPiece } from './board-state.js';
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
    ensurePieceDOM,
    removePieceDOM,
    showEvents,
} from './board-view.js';
import { apiGet, apiPost, getUserId, getTabId, playCaptureSounds } from './utils.js';

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================

let _clientSecret = '';
let _onStateChanged = null;   // app.js hook: refresh seats/choices/pass/game-over UI
let pusherClient = null;
let pusherChannel = null;
let hasConnectedBefore = false;   // set once we have been online at least once

// The board version we last saw from the server. Writes that replace the whole
// board (Sandbox Mode) quote it back so the server can refuse a write built on
// a board that has since moved on.
let boardVersion = 0;
export const getBoardVersion = () => boardVersion;
export const setBoardVersion = (version) => {
    if (typeof version === 'number') boardVersion = version;
};

export function initNetwork({ clientSecret, onStateChanged }) {
    _clientSecret = clientSecret;
    _onStateChanged = onStateChanged;
    initializePusher();
}

const notifyStateChanged = () => {
    if (_onStateChanged) _onStateChanged();
};

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

	pusherClient.connection.bind('connected', async () => {
        const headerText = document.getElementById("pusher-status");
        headerText.textContent = "Connected to Pusher!"
		console.log('Pusher connected!');
        // Everything broadcast while we were offline never reached us — a Reset
        // Board included. Acting on that stale mirror is what put the previous
        // game's rule-spawned pieces back, so re-pull instead of trusting it.
        // (The first connect is skipped: initializeApp pulls right after this.)
        if (hasConnectedBefore) {
            await pullServerBoardState();
            await pullServerTurnState();
        }
        hasConnectedBefore = true;
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

// Surfaces a failed server call to the player instead of only the console —
// a misconfigured backend used to look like "the game is just frozen"
const reportServerFailure = (what, result) => {
    const detail = result?.message || result?.error || 'the server did not respond';
    console.log(`Failed to pull ${what} from the server:`, detail);
    showEvents([`Could not load ${what}: ${detail}`]);
};

export const pullServerBoardState = async () => {
    const result = await apiGet('/api/board-state', {clientSecret: _clientSecret});
    if (!result.success) {
        reportServerFailure('the board state', result);
        notifyStateChanged();
        return;
    }
    setBoardVersion(result.boardVersion);
    syncBoardWithServer(result.boardState);
    notifyStateChanged();
}

export const pullServerTurnState = async () => {
    const result = await apiGet('/api/turns', {clientSecret: _clientSecret, userId: getUserId()});
    if (!result.success) {
        reportServerFailure('the turn state', result);
        notifyStateChanged();
        return;
    }
    handleTurnUpdate(result.turnState);
}

// =============================================================================
// INCOMING BOARD UPDATES
// =============================================================================

const handleBoardUpdate = (boardData) => {
    // Sandbox-mode edits are broadcast with the editing TAB's id so that tab
    // can skip its own echo. Authoritative /api/game broadcasts carry no tabId
    // — every client (including the actor) applies the server state. Neither
    // does a sandbox update the server had to sanitize: the tab that sent it is
    // the one holding stale pieces, so it needs the corrected board most.
    // Track the version even for our own echo: it is what the next full-board
    // write has to quote
    setBoardVersion(boardData.boardVersion);
    if (boardData.tabId && boardData.tabId === getTabId()) {
        console.log("Received a Pusher piece move event, but we initiated it, so ignoring it");
        return;
    }
    syncBoardWithServer(boardData.newState);
    showEvents(boardData.events);
    notifyStateChanged();
};

// Applies a board payload from the server. The payload is normally the whole
// board, but some events carry only a field or two (the randomizer highlight),
// so anything that means "the server no longer has this" is only acted on when
// the payload actually covers it — otherwise a highlight would look like an
// empty board and wipe every spawned piece.
const syncBoardWithServer = (newState) => {
    let playedCaptureSound = false;
    const serverSlots = new Set();
    const isFullBoard = Object.keys(newState).some(key => /^\d+$/.test(key));
    for (const [slot, newPiece] of Object.entries(newState)) {
        if (slot === 'boardEffects' || slot === 'highlightedSquare' || slot === 'selectedSlot') continue;
        serverSlots.add(slot);
        let currentPiece = state.pieces[slot];
        if (!currentPiece) {
            // A rule spawned a brand-new piece — create it locally
            currentPiece = registerSpawnedPiece(slot, newPiece);
            ensurePieceDOM(currentPiece);
        }
        if (currentPiece.position.row !== newPiece.position.row || currentPiece.position.col !== newPiece.position.col) {
            currentPiece.position = { col: newPiece.position.col, row: newPiece.position.row };
            currentPiece.notation = toNotation(newPiece.position.col, newPiece.position.row);
            updatePiecePosition(currentPiece);
            updatePieceNotation(currentPiece);
        }
        if (currentPiece.image !== newPiece.image) {
            currentPiece.image = newPiece.image;
            if (currentPiece.imageSelect) currentPiece.imageSelect.value = currentPiece.image;
            updatePieceImage(currentPiece);
        }
        if (newPiece.color && currentPiece.color !== newPiece.color) {
            currentPiece.color = newPiece.color; // Mind Control / conversions
        }
        if (newPiece.moved !== undefined) {
            currentPiece.moved = !!newPiece.moved;
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

    // Remove spawned pieces that no longer exist server-side (post-reset)
    if (isFullBoard) {
        for (const slot of Object.keys(state.pieces)) {
            if (Number(slot) > 32 && !serverSlots.has(slot)) {
                removePieceDOM(slot);
                delete state.pieces[slot];
            }
        }
    }

    refreshAllReviveButtons();

    // Sync selection from server
    const serverSelectedSlot = 'selectedSlot' in newState ? (newState.selectedSlot ?? null) : state.selectedSlot;
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
    if (!newTurnState) return;

    // Update turn state (fresh databases may send an empty hash — default sanely)
    turns.currentTurn = newTurnState.currentTurn ?? 1;
    if (newTurnState.currentPlayer === undefined) newTurnState.currentPlayer = turns.currentPlayer;
    if (newTurnState.nextTurnWithNewRules === undefined) newTurnState.nextTurnWithNewRules = turns.currentTurn + 3;
    turns.currentRules = newTurnState.currentRules || [];
    turns.newRuleChoices = newTurnState.newRuleChoices || [];
    turns.seats = newTurnState.seats || { white: null, black: null };
    turns.pendingChoices = newTurnState.pendingChoices || [];
    turns.gameOver = newTurnState.gameOver || null;
    turns.coinFlip = newTurnState.coinFlip || null;
    turns.lastMove = newTurnState.lastMove || null;

    const playerChanged = turns.currentPlayer !== newTurnState.currentPlayer;
    if (playerChanged) {
        turns.currentPlayer = newTurnState.currentPlayer;
    }

    showEvents(data.events);

    // Delegate all visual updates to the view layer
    renderTurnUpdate({
        newTurnState,
        playerChanged,
        ruleJustExpired: data.ruleJustExpired,
        userId: data.userId,
        onRuleSelect: async (chosenIndex) => {
            const result = await apiPost('/api/turns', {
                clientSecret: _clientSecret,
                userId: getUserId(),
                action: 'SELECT_RULE',
                payload: { chosenIndex },
            });
            if (result && result.events) showEvents(result.events);
        },
    });

    notifyStateChanged();
};
