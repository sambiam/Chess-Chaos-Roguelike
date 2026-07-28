import './style.css';
import { createZoomPan } from './viewport.js';
import {
    state,
    SQUARE_SIZE,
    initializePieces,
    movePiece,
    getPieceAt,
    getSimpleBoardState,
    turns,
} from './board-state.js';
import {
    initView,
    renderSettingsPanel,
    renderPieces,
    renderBoardEffectsLayer,
    renderRandomizerPanel,
    updatePiecePosition,
    updatePieceNotation,
    updatePieceCaptureState,
    updatePieceEmojis,
    updatePieceImage,
    refreshAllReviveButtons,
    handleSelectPiece,
    handleDeselectPiece,
    handleResetBoard,
    showContextMenu,
    dismissPieceContextMenu,
    renderLegalMoves,
    clearLegalMoves,
    renderChoiceUI,
    clearChoiceUI,
    getChoiceCandidateAt,
    renderSeats,
    renderGameOver,
    showEvents,
} from './board-view.js';
import {
    initNetwork,
    pullServerBoardState,
    pullServerTurnState,
} from './network.js';
import { apiGet, apiPost, getUserId, playCaptureSounds } from './utils.js';
import { startPageBackground } from './animated-bg.js';
import { getAllLegalMoves } from '../shared/engine.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const BOARD_SIZE = 800;

// =============================================================================
// AUTHENTICATION
// =============================================================================

let clientSecret = '';

// =============================================================================
// DOM REFERENCES
// =============================================================================

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
const undoTurnButton = document.getElementById('undo-turn');
const resetButton = document.getElementById('reset-board');
const passButton = document.getElementById('pass-turn');
const ignoreTurnsCheckbox = document.getElementById('ignore-turns-checkbox');

// =============================================================================
// MODE HELPERS
// =============================================================================
// Sandbox Mode = the old free-for-all board (manual moves, no enforcement).
// Enforced mode (default) = server-validated PVP with automated rules.

const inSandboxMode = () => ignoreTurnsCheckbox.checked;

const mySeat = () => {
    const uid = getUserId();
    if (turns.seats?.white === uid) return 'white';
    if (turns.seats?.black === uid) return 'black';
    return null;
};

const applyModeVisuals = () => {
    const sandbox = inSandboxMode();
    viewport.classList.toggle('ignoring-turns', sandbox);
    document.body.classList.toggle('sandbox-mode', sandbox);
    document.body.classList.toggle('enforced-mode', !sandbox);
};

ignoreTurnsCheckbox.addEventListener('change', () => {
    applyModeVisuals();
    refreshPlayUI();
});

// Hotkey: Tab key toggles Sandbox Mode checkbox
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        ignoreTurnsCheckbox.checked = !ignoreTurnsCheckbox.checked;
        ignoreTurnsCheckbox.dispatchEvent(new Event('change'));
    }
});

// =============================================================================
// VIEWPORT SETUP
// =============================================================================

// The board is fixed: this only fits/centers it, it does not pan or zoom
const zoomPan = createZoomPan(viewport, stage, {
    contentSize: BOARD_SIZE,
});

const screenToSquare = (clientX, clientY) =>
    zoomPan.toGridSquare(clientX, clientY, SQUARE_SIZE, 8, 8);

// =============================================================================
// HELPERS
// =============================================================================

const postBoardState = (extra = {}) => apiPost('/api/board-state', {
    clientSecret,
    userId: getUserId(),
    newState: getSimpleBoardState(),
    ...extra,
});

const postGameAction = async (action, payload = {}) => {
    const result = await apiPost('/api/game', {
        clientSecret,
        userId: getUserId(),
        action,
        payload,
    });
    if (!result.success && result.message) {
        showEvents([result.message]);
    }
    return result;
};

// Sharing "who is selected" must never rewrite the board. In enforced play the
// server owns the board, so we send the selection as an intent; only Sandbox
// Mode (a deliberately free-form board) still pushes the client's whole mirror.
const sendSelectionUpdate = () => inSandboxMode()
    ? postBoardState({ skipSnapshot: true })
    : postGameAction('SELECT', { slot: state.selectedSlot });

// Builds a read-only engine game object over the client's mirrored state
const localGame = () => ({
    pieces: state.pieces,
    boardEffects: state.boardEffects,
    turn: turns,
    events: [],
});

// Legal moves for my whole side (enforced mode), cached per refresh
let myLegalMoves = {};

const refreshMyLegalMoves = () => {
    const seat = mySeat();
    if (inSandboxMode() || !seat || seat !== turns.currentPlayer || turns.gameOver) {
        myLegalMoves = {};
        return;
    }
    try {
        myLegalMoves = getAllLegalMoves(localGame(), seat);
    } catch (err) {
        console.error('Failed to compute legal moves locally:', err);
        myLegalMoves = {};
    }
};

// =============================================================================
// MOVE HANDLING
// =============================================================================

// Sandbox: mutate freely and push the whole board state (the original flow)
const handleSandboxMove = async (slot, targetCol, targetRow) => {
    const result = movePiece(slot, targetCol, targetRow);
    if (!result) return;

    updatePiecePosition(result.piece);
    updatePieceNotation(result.piece);

    if (result.capturedPiece) {
        updatePieceCaptureState(result.capturedPiece);
        updatePieceEmojis(result.capturedPiece);
        playCaptureSounds();
    }

    refreshAllReviveButtons();
    handleDeselectPiece();

    let response = await postBoardState();
    if (!response.success) {
        console.log("Failed to update Board State on server. Message: ", response.message);
        return;
    }
    console.log("Posted new board state to the server", response);
    console.log("Sandbox Mode: skipping turn processing");
};

// Enforced: send the move intent — the server engine validates and applies
const handleEnforcedMove = async (slot, targetCol, targetRow) => {
    const legal = (myLegalMoves[slot] || []).some(m => m.col === targetCol && m.row === targetRow);
    if (!legal) {
        showEvents(['Illegal move']);
        return;
    }
    clearLegalMoves();
    handleDeselectPiece();
    await postGameAction('MOVE', { slot, target: { col: targetCol, row: targetRow } });
    // The authoritative result arrives via Pusher and updates everything
};

// =============================================================================
// DOUBLE RIGHT-CLICK DETECTION
// =============================================================================

let lastRightClickTime = 0;
let lastRightClickSquare = null;
const DOUBLE_CLICK_THRESHOLD = 400;

// =============================================================================
// VIEWPORT INPUT (Click)
// =============================================================================
// Left-click (and right-click, kept for muscle memory): select a piece, move the
// selected piece, or — sandbox only, on a double right-click — open the manual
// piece context menu. The board itself never moves in response to input.

const handleBoardInteraction = async (event, { rightClick = false } = {}) => {
    const targetSquare = screenToSquare(event.clientX, event.clientY);

    // Double right-click detection (manual tools — Sandbox Mode only)
    if (rightClick) {
        const now = Date.now();
        const isDoubleRightClick =
            (now - lastRightClickTime < DOUBLE_CLICK_THRESHOLD) &&
            lastRightClickSquare && targetSquare &&
            lastRightClickSquare.col === targetSquare.col &&
            lastRightClickSquare.row === targetSquare.row;
        lastRightClickTime = now;
        lastRightClickSquare = targetSquare;

        if (isDoubleRightClick && targetSquare && inSandboxMode()) {
            const piece = getPieceAt(targetSquare.col, targetSquare.row);
            const prevSlot = state.selectedSlot;
            if (piece) handleSelectPiece(piece.slot);
            showContextMenu(event.clientX, event.clientY, targetSquare, piece);
            if (state.selectedSlot !== prevSlot) await sendSelectionUpdate();
            return;
        }
    }

    dismissPieceContextMenu();

    if (!targetSquare) {
        if (state.selectedSlot) {
            handleDeselectPiece();
            clearLegalMoves();
            await sendSelectionUpdate();
        }
        return;
    }

    const targetPiece = getPieceAt(targetSquare.col, targetSquare.row);

    // ------------------------- SANDBOX MODE -------------------------
    if (inSandboxMode()) {
        if (!state.selectedSlot) {
            if (targetPiece) {
                handleSelectPiece(targetPiece.slot);
                await sendSelectionUpdate();
            }
            return;
        }
        const selectedPiece = state.pieces[state.selectedSlot];
        if (!selectedPiece) {
            handleDeselectPiece();
            await sendSelectionUpdate();
            return;
        }
        if (selectedPiece.position.col === targetSquare.col &&
            selectedPiece.position.row === targetSquare.row) {
            handleDeselectPiece();
            await sendSelectionUpdate();
            return;
        }
        await handleSandboxMove(state.selectedSlot, targetSquare.col, targetSquare.row);
        return;
    }

    // ------------------------- ENFORCED MODE -------------------------
    if (turns.gameOver) return;

    // A pending choice takes over the board — clicks resolve it (left OR right)
    if (await tryResolveChoiceClick(targetSquare)) return;

    const seat = mySeat();
    if (!seat) {
        showEvents(['Claim a seat (White or Black) to play']);
        return;
    }
    if (seat !== turns.currentPlayer) {
        showEvents([`It is ${turns.currentPlayer}'s turn`]);
        return;
    }
    if ((turns.pendingChoices || []).length > 0) {
        showEvents(['Waiting on a rule choice']);
        return;
    }

    // Selecting one of my movable pieces
    if (targetPiece && targetPiece.color === seat && state.selectedSlot !== targetPiece.slot) {
        handleSelectPiece(targetPiece.slot);
        refreshMyLegalMoves();
        renderLegalMoves(myLegalMoves[targetPiece.slot] || []);
        await sendSelectionUpdate();
        return;
    }

    if (!state.selectedSlot) return;

    const selectedPiece = state.pieces[state.selectedSlot];
    if (!selectedPiece) {
        handleDeselectPiece();
        clearLegalMoves();
        return;
    }

    // Clicking the selected piece's own square deselects
    if (selectedPiece.position.col === targetSquare.col &&
        selectedPiece.position.row === targetSquare.row) {
        handleDeselectPiece();
        clearLegalMoves();
        await sendSelectionUpdate();
        return;
    }

    await handleEnforcedMove(state.selectedSlot, targetSquare.col, targetSquare.row);
};

viewport.addEventListener('click', event => handleBoardInteraction(event));

viewport.addEventListener('contextmenu', event => {
    event.preventDefault();
    return handleBoardInteraction(event, { rightClick: true });
});

// =============================================================================
// CHOICE HANDLING
// =============================================================================

const tryResolveChoiceClick = async (targetSquare) => {
    const choice = myPendingChoice();
    if (!choice || !targetSquare) return false;
    const selection = getChoiceCandidateAt(targetSquare.col, targetSquare.row);
    if (selection === undefined) return false;
    clearChoiceUI();
    await postGameAction('CHOICE', { choiceId: choice.id, selection });
    return true;
};

const myPendingChoice = () => {
    const seat = mySeat();
    return (turns.pendingChoices || []).find(c => c.color === seat) || null;
};

// =============================================================================
// PLAY UI REFRESH (seats, choices, pass button, game over)
// =============================================================================
// Called whenever fresh authoritative state lands (Pusher or initial pull).

let choiceTimerInterval = null;
let autoChoiceFiredFor = null;

function refreshPlayUI() {
    applyModeVisuals();

    // Seats
    renderSeats({
        seats: turns.seats || { white: null, black: null },
        mySeat: mySeat(),
        onClaim: async (seat) => { await postGameAction('CLAIM_SEAT', { seat }); },
        onRelease: async () => { await postGameAction('RELEASE_SEAT'); },
    });

    // Game over overlay
    renderGameOver(inSandboxMode() ? null : turns.gameOver);

    // Legal move dots for the current selection
    refreshMyLegalMoves();
    if (!inSandboxMode() && state.selectedSlot && myLegalMoves[state.selectedSlot]) {
        renderLegalMoves(myLegalMoves[state.selectedSlot]);
    } else {
        clearLegalMoves();
    }

    // Pass button: only when it's my turn and I truly have no legal moves
    const seat = mySeat();
    const canPass = !inSandboxMode() && seat && seat === turns.currentPlayer &&
        !turns.gameOver && (turns.pendingChoices || []).length === 0 &&
        Object.keys(myLegalMoves).length === 0;
    passButton.style.display = canPass ? '' : 'none';

    // Pending choice banner + candidates + countdown
    refreshChoiceUI();
}

function refreshChoiceUI() {
    if (choiceTimerInterval) {
        clearInterval(choiceTimerInterval);
        choiceTimerInterval = null;
    }
    const pending = turns.pendingChoices || [];
    if (inSandboxMode() || pending.length === 0) {
        clearChoiceUI();
        return;
    }

    const mine = myPendingChoice();
    const display = mine || pending[0];

    const tick = async () => {
        const secondsLeft = Math.max(0, Math.ceil((display.deadline - Date.now()) / 1000));
        renderChoiceUI({ choice: display, isMine: !!mine, secondsLeft });
        // Timer expiry: the owner fires the auto-resolve; anyone else fires
        // a few seconds later as a fallback (covers disconnected opponents)
        const grace = mine ? 0 : 5000;
        if (Date.now() > display.deadline + grace && autoChoiceFiredFor !== display.id) {
            autoChoiceFiredFor = display.id;
            await postGameAction('CHOICE', { choiceId: display.id, auto: true });
        }
    };
    tick();
    choiceTimerInterval = setInterval(tick, 1000);
}

// =============================================================================
// DOM EVENT HANDLERS
// =============================================================================

// Undo Turn button
undoTurnButton.addEventListener('click', async () => {
    const result = await apiPost('/api/undo', {
        clientSecret: clientSecret,
    });
    if (!result.success) {
        console.log("Failed to undo turn:", result.message);
        return;
    }
    console.log("Successfully undid a turn!")
});

// Pass button (enforced mode, no legal moves)
passButton.addEventListener('click', async () => {
    await postGameAction('PASS');
});

// Reset button
resetButton.addEventListener('click', async () => {
    if (inSandboxMode()) {
        // Sandbox is a free-form board with no server-side game to rebuild,
        // so the client's own reset is the source of truth here
        handleResetBoard();
        await postBoardState();
        await apiPost('/api/turns', {clientSecret, userId: getUserId(), action: 'RESET_TURNS',});
        return;
    }
    // Enforced play: the server rebuilds the starting board from
    // shared/defs.js and broadcasts it. Resetting from the local mirror could
    // re-upload pieces a stale tab was still carrying, which is exactly how
    // rule-spawned Queens survived a reset and returned on the next move.
    await postGameAction('RESET_GAME');
});

// Settings panel: handle image dropdown changes (Sandbox tool)
document.getElementById('settings-panel').addEventListener('change', async event => {
    if (!event.target.classList.contains('image-select')) return;
    const piece = state.pieces[event.target.dataset.slot];
    if (piece) {
        piece.image = event.target.value;
        updatePieceImage(piece);
    }
    await postBoardState();
});

// Re-center board on window resize if user hasn't manually panned/zoomed
window.addEventListener('resize', () => {
    if (!zoomPan.hasInteracted()) {
        zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);
    }
});

// =============================================================================
// INITIALIZATION
// =============================================================================

const passwordForm = document.getElementById('password-form');
passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clientSecret = document.getElementById('password-input').value;
    const authResult = await apiGet('/api/auth', {clientSecret: clientSecret});
    if (authResult.success) {
        document.getElementById('password-modal').style.display = 'none';
        await initializeApp();
    } else {
        console.log(authResult.message);
        document.getElementById('password-error').textContent = "Invalid Password!";
    }
});

// UNCOMMENT THIS TO REMOVE MODAL FOR TESTING
// document.getElementById('password-modal').style.display = 'none';
// clientSecret = 'dougdoug';
// initializeApp();

async function initializeApp() {
    initializePieces();

    // Wire up the view layer with shared references
    initView({
        postBoardState,
        zoomPan,
        boardSize: BOARD_SIZE,
        // Gate rule-card clicks: only the player to move may pick (when seats exist)
        onRuleCardClick: () => {
            const seatsClaimed = turns.seats?.white || turns.seats?.black;
            if (!seatsClaimed) return true;
            if (mySeat() !== turns.currentPlayer) {
                showEvents([`Only ${turns.currentPlayer} may pick the new rule`]);
                return false;
            }
            return true;
        },
    });

    // Render all visual elements
    renderSettingsPanel();
    renderPieces();
    renderBoardEffectsLayer();
    renderRandomizerPanel();
    zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);

    startPageBackground(document.body);

    applyModeVisuals();

    // Draw the seat buttons (and the rest of the play UI) up front, so the
    // board is playable-looking even if the server never answers
    refreshPlayUI();

    // Initialize server connection
    initNetwork({ clientSecret, onStateChanged: refreshPlayUI });

    // Pull current state from the server
    await pullServerBoardState();
    await pullServerTurnState();
}
