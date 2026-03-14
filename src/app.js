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
    updateTitleVisuals,
} from './board-view.js';
import {
    initNetwork,
    pullServerBoardState,
    pullServerTurnState,
} from './network.js';
import { apiGet, apiPost, getUserId, playCaptureSounds } from './utils.js';
import { startPageBackground } from './animated-bg.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const BOARD_SIZE = 800;
const ZOOM_SCROLL_MULTIPLIER = 0.7;

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
const ignoreTurnsCheckbox = document.getElementById('ignore-turns-checkbox');

ignoreTurnsCheckbox.addEventListener('change', () => {
    viewport.classList.toggle('ignoring-turns', ignoreTurnsCheckbox.checked);
});

// Hotkey: Tab key toggles Ignore Turns checkbox
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

const zoomPan = createZoomPan(viewport, stage, {
    zoomMultiplier: ZOOM_SCROLL_MULTIPLIER,
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

const sendSelectionUpdate = () => postBoardState({ skipSnapshot: true });

// =============================================================================
// MOVE HANDLING
// =============================================================================

const handleClientMove = async (slot, targetCol, targetRow) => {
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

    // We want the client visuals to update immediately rather than waiting on server
    const ignoreTurns = ignoreTurnsCheckbox.checked;
    if (!ignoreTurns) {
        turns.currentPlayer = (turns.currentPlayer === "white") ? "black" : "white";
        updateTitleVisuals(turns.currentPlayer);
    }

    let response = await postBoardState();
    if (!response.success) {
        console.log("Failed to update Board State on server. Message: ", response.message);
        return;
    }
    console.log("Posted new board state to the server", response)

    if (ignoreTurns) {
        console.log("Skipping turn processing because the Ignore Turns checkbox is checked");
        return;
    }
    response = await apiPost('/api/turns', {clientSecret, userId: getUserId(), action: 'INCREMENT_TURN',});
    if (!response.success) {
        console.log("Failed to update Turn State on server. Message: ", response.message);
    }
};

// =============================================================================
// DOUBLE RIGHT-CLICK DETECTION
// =============================================================================

let lastRightClickTime = 0;
let lastRightClickSquare = null;
const DOUBLE_CLICK_THRESHOLD = 400;

// =============================================================================
// VIEWPORT INPUT (Right-Click)
// =============================================================================
// Right-click: select a piece, move the selected piece, or open piece context menu

viewport.addEventListener('contextmenu', async event => {
    event.preventDefault();
    const targetSquare = screenToSquare(event.clientX, event.clientY);

    // Double right-click detection
    const now = Date.now();
    const isDoubleRightClick =
        (now - lastRightClickTime < DOUBLE_CLICK_THRESHOLD) &&
        lastRightClickSquare && targetSquare &&
        lastRightClickSquare.col === targetSquare.col &&
        lastRightClickSquare.row === targetSquare.row;
    lastRightClickTime = now;
    lastRightClickSquare = targetSquare;

    if (isDoubleRightClick && targetSquare) {
        const piece = getPieceAt(targetSquare.col, targetSquare.row);
        const prevSlot = state.selectedSlot;
        if (piece) handleSelectPiece(piece.slot);
        showContextMenu(event.clientX, event.clientY, targetSquare, piece);
        if (state.selectedSlot !== prevSlot) await sendSelectionUpdate();
        return;
    }

    dismissPieceContextMenu();

    if (!targetSquare) {
        if (state.selectedSlot) {
            handleDeselectPiece();
            await sendSelectionUpdate();
        }
        return;
    }

    const targetPiece = getPieceAt(targetSquare.col, targetSquare.row);

    // No piece selected - try to select one
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

    // Clicking same square deselects
    if (selectedPiece.position.col === targetSquare.col && 
        selectedPiece.position.row === targetSquare.row) {
        handleDeselectPiece();
        await sendSelectionUpdate();
        return;
    }

    await handleClientMove(state.selectedSlot, targetSquare.col, targetSquare.row);
});

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

// Reset button
resetButton.addEventListener('click', async () => {
    handleResetBoard();
    await postBoardState();
    await apiPost('/api/turns', {clientSecret, userId: getUserId(), action: 'RESET_TURNS',});
});

// Settings panel: handle image dropdown changes
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
    });

    // Render all visual elements
    renderSettingsPanel();
    renderPieces();
    renderBoardEffectsLayer();
    renderRandomizerPanel();
    zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);

    startPageBackground(document.body);

    // Initialize server connection
    initNetwork({ clientSecret });

    // Pull current state from the server
    await pullServerBoardState();
    await pullServerTurnState();
}
