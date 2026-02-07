import './style.css';
import Pusher from 'pusher-js';
import { createZoomPan } from './viewport.js';
import {
    state,
    getSimpleBoardState,
    SQUARE_SIZE,
    pieceImageOptions,
    initializePieces,
    getPieceAt,
    selectPiece,
    deselectPiece,
    movePiece,
    resetBoard,
    toNotation
} from './board-state.js';
import {
    apiGet,
    apiPost,
    getUserId,
    playCaptureSounds,
} from './utils.js';
import {
    rules,
} from './rules.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const BOARD_SIZE = 800;              // Total board dimensions in pixels
const ZOOM_SCROLL_MULTIPLIER = 0.7;  // Lower = slower zoom, higher = faster

// =============================================================================
// AUTHENTICATION VARIABLES
// =============================================================================

// TODO - this will be set by the user when opening app
// This is sent with all server requests to ensure authentication
let clientSecret = '';

// =============================================================================
// DOM REFERENCES
// =============================================================================

const settingsPanel = document.getElementById('settings-panel');
const piecesLayer = document.getElementById('pieces-layer');
const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
const resetButton = document.getElementById('reset-board');

// =============================================================================
// PIECE VISUAL UPDATES
// =============================================================================
// These functions sync DOM elements with piece state.
// Note: piece.element, piece.positionTag are set during rendering.

// Sets the piece's visual position via CSS left/top
const updatePiecePosition = piece => {
    if (!piece.element) return;
    piece.element.style.left = `${piece.position.col * SQUARE_SIZE}px`;
    piece.element.style.top = `${piece.position.row * SQUARE_SIZE}px`;
};

// Sets the piece's background image
const updatePieceImage = piece => {
    if (!piece.element) return;
    piece.element.style.backgroundImage = `url('/images/${encodeURIComponent(piece.image)}')`;
};

// Toggles the 'captured' CSS class (makes piece invisible)
const updatePieceCaptureState = piece => {
    if (piece.element) {
        piece.element.classList.toggle('captured', piece.captured);
    }
};

// Updates the notation display in the settings panel
const updatePieceNotation = piece => {
    if (piece.positionTag) {
        piece.positionTag.textContent = piece.notation;
    }
};

// Updates selection highlight on piece element
const updatePieceSelection = (piece, isSelected) => {
    if (piece?.element) {
        piece.element.classList.toggle('selected', isSelected);
    }
};

// =============================================================================
// RENDERING SETTINGS AND PIECES
// =============================================================================

const renderSettingsPanel = () => {
    const fragment = document.createDocumentFragment();
    
    // Sort pieces to display like a chess board: Black back rank, Black pawns, White pawns, White back rank
    // Within each row, sort left to right by column
    const sortedPieces = Object.values(state.pieces).sort((a, b) => {
        // Map rows to display order: row 0 (black back) → 0, row 1 (black pawns) → 1, 
        // row 6 (white pawns) → 2, row 7 (white back) → 3
        const rowOrder = { 0: 0, 1: 1, 6: 2, 7: 3 };
        const rowDiff = rowOrder[a.position.row] - rowOrder[b.position.row];
        if (rowDiff !== 0) return rowDiff;
        // Within same row, sort by column (left to right)
        return a.position.col - b.position.col;
    });
    
    sortedPieces.forEach(piece => {
        const card = document.createElement('div');
        card.className = 'piece-controls';
        card.dataset.slot = piece.slot;

        // Header with piece name and position notation
        const header = document.createElement('header');
        const title = document.createElement('span');
        title.textContent = piece.label;
        const notationTag = document.createElement('span');
        notationTag.className = 'position-tag';
        notationTag.textContent = piece.notation;
        header.append(title, notationTag);
        card.appendChild(header);

        // Image selector dropdown
        const imageRow = document.createElement('div');
        imageRow.className = 'control-row';
        const imageLabel = document.createElement('label');
        imageLabel.setAttribute('for', `image${piece.slot}`);
        imageLabel.textContent = 'Image';
        const imageSelect = document.createElement('select');
        imageSelect.id = `image${piece.slot}`;
        imageSelect.dataset.slot = piece.slot;
        imageSelect.className = 'image-select';
        pieceImageOptions.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option;
            optionEl.textContent = option.replace('.png', '');
            imageSelect.appendChild(optionEl);
        });
        imageSelect.value = piece.image;
        imageRow.append(imageLabel, imageSelect);
        card.appendChild(imageRow);

        // Store DOM references on the piece object (view layer properties)
        piece.positionTag = notationTag;
        piece.imageSelect = imageSelect;
        
        // Add them in order to match the visual layout of a chess board
        fragment.append(card);
    });

    settingsPanel.innerHTML = '';
    settingsPanel.appendChild(fragment);
};

const renderPieces = () => {
    const fragment = document.createDocumentFragment();
    
    Object.values(state.pieces).forEach(piece => {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        pieceEl.id = `piece-${piece.slot}`;
        
        // Store DOM reference on the piece object (view layer property)
        piece.element = pieceEl;

        updatePieceImage(piece);
        updatePieceCaptureState(piece);
        updatePiecePosition(piece);

        fragment.appendChild(pieceEl);
    });

    piecesLayer.innerHTML = '';
    piecesLayer.appendChild(fragment);
};

// =============================================================================
// BOARD STATE HELPERS
// =============================================================================

// Handles selecting a piece (updates game state and visuals)
const handleSelectPiece = (slot) => {
    // Deselect current piece first
    const previousSlot = state.selectedSlot;
    if (previousSlot) {
        updatePieceSelection(state.pieces[previousSlot], false);
    }
    
    // Select new piece
    const piece = selectPiece(slot);
    if (piece) {
        updatePieceSelection(piece, true);
    }
};

// Handles deselecting the current piece
const handleDeselectPiece = () => {
    const previousSlot = state.selectedSlot;
    if (previousSlot) {
        updatePieceSelection(state.pieces[previousSlot], false);
    }
    deselectPiece();
};

// Handles resetting the board
const handleResetBoard = () => {
    handleDeselectPiece();
    const pieces = resetBoard();
    pieces.forEach(piece => {
        updatePiecePosition(piece);
        updatePieceCaptureState(piece);
        updatePieceNotation(piece);
        updatePieceImage(piece); // Reset visual image
        if (piece.imageSelect) {
            piece.imageSelect.value = piece.image; // Reset dropdown to initial image
        }
    });
};

// =============================================================================
// VIEWPORT SETUP
// =============================================================================

const zoomPan = createZoomPan(viewport, stage, {
    zoomMultiplier: ZOOM_SCROLL_MULTIPLIER,
    contentSize: BOARD_SIZE,
});

// Converts screen click position to board square (col, row)
const screenToSquare = (clientX, clientY) => 
    zoomPan.toGridSquare(clientX, clientY, SQUARE_SIZE, 8, 8);

// =============================================================================
// PUSHER INITIALIZATION
// =============================================================================

let pusherClient = null;
let pusherChannel = null;

function initializePusher() {
    // For app 'chaos-chess' on Pusher
    const pusherKey = 'e8e241cce30912124291';
	const pusherCluster = 'us2';
    const CHANNEL_NAME = 'chess-events';
    const EVENT_TYPE_BOARD_UPDATE = 'board-event';

    // Create Pusher client
	pusherClient = new Pusher(pusherKey, {cluster: pusherCluster,});
	
	// Subscribe to the channel
	pusherChannel = pusherClient.subscribe(CHANNEL_NAME);
	
	// Listen for any updates to the board state
    // This can include piece updates, settings, or a full board reset
	pusherChannel.bind(EVENT_TYPE_BOARD_UPDATE, (data) => {
        handleBoardUpdate(data);
	});
	
	// Pusher connection state
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
// DOM EVENT HANDLERS
// =============================================================================

// Reset button
resetButton.addEventListener('click', async () => {
    handleResetBoard();
    zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);
    zoomPan.resetInteractionState();

    // Send a board update event to server
    await apiPost('/api/board-state', {clientSecret: clientSecret, userId: getUserId(), newState: getSimpleBoardState()});
});

// Settings panel: handle image dropdown changes
settingsPanel.addEventListener('change', async event => {
    if (!event.target.classList.contains('image-select')) return;
    const piece = state.pieces[event.target.dataset.slot];
    if (piece) {
        piece.image = event.target.value;
        updatePieceImage(piece);
    }

    // Send a board update event to server
    // TODO - currently, only the image setting is tracked in getSimpleBoardState()
    //        In future will add more settings and add them to getSimpleBoardState() and syncBoardWithServer()
    await apiPost('/api/board-state', {clientSecret: clientSecret, userId: getUserId(), newState: getSimpleBoardState()});
});

// Re-center board on window resize if user hasn't manually panned/zoomed
window.addEventListener('resize', () => {
    if (!zoomPan.hasInteracted()) {
        zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);
    }
});


// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================
// =============================================================================



// =============================================================================
// HANDLE MOVE ACTIONS
// =============================================================================

// Right-click: select a piece or move the selected piece
viewport.addEventListener('contextmenu', async event => {
    event.preventDefault();
    const targetSquare = screenToSquare(event.clientX, event.clientY);
    
    if (!targetSquare) {
        handleDeselectPiece();
        return;
    }

    const targetPiece = getPieceAt(targetSquare.col, targetSquare.row);

    // No piece selected - try to select one
    if (!state.selectedSlot) {
        if (targetPiece) handleSelectPiece(targetPiece.slot);
        return;
    }

    const selectedPiece = state.pieces[state.selectedSlot];
    if (!selectedPiece) {
        handleDeselectPiece();
        return;
    }

    // Clicking same square deselects
    if (selectedPiece.position.col === targetSquare.col && 
        selectedPiece.position.row === targetSquare.row) {
        handleDeselectPiece();
        return;
    }

    // Move the selected piece to target square
    await handleClientMove(state.selectedSlot, targetSquare.col, targetSquare.row);
});

// Handles moving a piece (updates game state and visuals)
const handleClientMove = async (slot, targetCol, targetRow) => {
    const result = movePiece(slot, targetCol, targetRow);
    if (!result) return;

    // Update visuals for the moved piece
    updatePiecePosition(result.piece);
    updatePieceNotation(result.piece);

    // Update visuals for captured piece if any
    if (result.capturedPiece) {
        updatePieceCaptureState(result.capturedPiece);
        playCaptureSounds();
    }

    // Visually deselect it, now that it's moved
    handleDeselectPiece();

    // Send entire simple board state to server
    // Makes it easier for the server to maintain a single source of truth at all times, rather than just move diffs
    // Include clientSecret for authentication, include userId for receiving clients
    const response = await apiPost('/api/board-state', {clientSecret: clientSecret, userId: getUserId(), newState: getSimpleBoardState()});
    console.log("Posted new board state to the server", response)
};

// =============================================================================
// SENDING AND RECEIVING SERVER EVENTS
// =============================================================================

const pullServerBoardState = async () => {
    const result = await apiGet('/api/board-state', {clientSecret: clientSecret});
    if (!result.success) {
        console.log("Failed to pull board state from the server");
        return;
    }
    syncBoardWithServer(result.boardState); // Update client board based on server data
}

// Process a move event from the server
const handleBoardUpdate = (boardData) => {

    // Ignore this update if it was initiated by us
    if (boardData.userId === getUserId()) {
        console.log("Received a Pusher piece move event, but we initiated it, so ignoring it");
        return;
    }

    // Update client board based on server data
    syncBoardWithServer(boardData.newState);
};

const syncBoardWithServer = (newState) => {
    // Check through all pieces in the server board state
    // If there's any discrepancies, update the client state
    /*
        newState = {
            1: {
                captured: false,
                color: "white",
                image: "White Rook 1.png",
                position: {
                    "col": 0,
                    "row": 7
                }
            },
            2: {...},
            3: {...},
            etc
        }
    */
    for (const [slot, newPiece] of Object.entries(newState)) {
        const currentPiece = state.pieces[Number(slot)];
        if (currentPiece.position.row !== newPiece.position.row || currentPiece.position.col !== newPiece.position.col) {
            // The newPiece is in a different position - update our local state
            currentPiece.position = { col: newPiece.position.col, row: newPiece.position.row };
            currentPiece.notation = toNotation(newPiece.position.col, newPiece.position.row);
            updatePiecePosition(currentPiece); // Update this piece's *visual* location
            updatePieceNotation(currentPiece); // Update this piece's *visual* notation in settings
        }
        if (currentPiece.image !== newPiece.image) {
            currentPiece.image = newPiece.image;
            currentPiece.imageSelect.value = currentPiece.image; // Update the settings selector to match the new image
            updatePieceImage(currentPiece);
        }
        if (currentPiece.captured !== newPiece.captured) {
            currentPiece.captured = newPiece.captured;
            updatePieceCaptureState(currentPiece);
        }
    }
};

// =============================================================================
// INITIALIZATION
// =============================================================================

initializePieces();
renderSettingsPanel();
renderPieces();
zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);

// Pull the state of the board from the Redis DB, update our board state appropriately
await pullServerBoardState();

// Initialize server connection (when implemented)
initializePusher();

/*
Temp tests for future rule design changes
const viewportShrink = function() {
    document.getElementById('viewport').style.width = '60vw';
    zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);
}
const viewportExpand = function() {
    document.getElementById('viewport').style.width = '90vw';
    zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);
}
setTimeout(viewportShrink, 3000);
setTimeout(viewportExpand, 6000);
setTimeout(viewportShrink, 9000);
setTimeout(viewportExpand, 12000);
*/