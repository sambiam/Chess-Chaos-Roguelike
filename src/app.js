import './style.css';
import { createZoomPan } from './viewport.js';
import {
    state,
    SQUARE_SIZE,
    initializePieces,
    getPieceAt,
    selectPiece,
    deselectPiece,
    movePiece,
    resetBoard,
    applyServerMove,
    applyFullBoardState,
} from './game.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const BOARD_SIZE = 800;              // Total board dimensions in pixels
const ZOOM_SCROLL_MULTIPLIER = 0.7;  // Lower = slower zoom, higher = faster

// =============================================================================
// ASSET LISTS
// =============================================================================

// Available piece images for the dropdown selectors
const pieceImageOptions = [
    'White King 1.png', 'White Queen 1.png',
    'White Rook 1.png', 'White Rook 2.png',
    'White Bishop 1.png', 'White Bishop 2.png',
    'White Knight 1.png', 'White Knight 2.png',
    'White Pawn 1.png', 'White Pawn 2.png', 'White Pawn 3.png', 'White Pawn 4.png',
    'White Pawn 5.png', 'White Pawn 6.png', 'White Pawn 7.png', 'White Pawn 8.png',
    'Black King 1.png', 'Black Queen 1.png',
    'Black Rook 1.png', 'Black Rook 2.png',
    'Black Bishop 1.png', 'Black Bishop 2.png',
    'Black Knight 1.png', 'Black Knight 2.png',
    'Black Pawn 1.png', 'Black Pawn 2.png', 'Black Pawn 3.png', 'Black Pawn 4.png',
    'Black Pawn 5.png', 'Black Pawn 6.png', 'Black Pawn 7.png', 'Black Pawn 8.png'
];

// Sound effects played when a piece captures another
const hitSoundFiles = [
    'hit sound 1.wav', 'hit sound 2.wav', 'hit sound 3.wav', 'hit sound 4.wav'
].map(name => `/sounds/${encodeURIComponent(name)}`);

const audienceSoundFiles = [
    'audience sound 1.wav', 'audience sound 2.wav', 'audience sound 3.wav', 'audience sound 4.wav'
].map(name => `/sounds/${encodeURIComponent(name)}`);

// =============================================================================
// VIEW STATE
// =============================================================================
// This defines the starting state of all 32 chess pieces.
// - slot: unique identifier for each piece (1-32)
// - col/row: board position (0-7), where row 0 is top (black's back rank)
// - col 0 is leftmost (A file), col 7 is rightmost (H file)

const viewState = {
    hasInteractedWithView: false,
};

// =============================================================================
// DOM REFERENCES
// =============================================================================

const settingsPanel = document.getElementById('settings-panel');
const piecesLayer = document.getElementById('pieces-layer');
const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
const resetButton = document.getElementById('reset-board');

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const randomItem = list => list[Math.floor(Math.random() * list.length)];

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
// SOUND EFFECTS
// =============================================================================

const playCaptureSounds = () => {
    [randomItem(hitSoundFiles), randomItem(audienceSoundFiles)].forEach(url => {
        const sfx = new Audio(url);
        sfx.volume = 0.8;
        sfx.play().catch(() => {});
    });
};

// =============================================================================
// RENDERING - SETTINGS PANEL
// =============================================================================

const renderSettingsPanel = () => {
    const fragment = document.createDocumentFragment();
    
    Object.values(state.pieces).forEach(piece => {
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
        
        // Add them in reverse order, so that they're visually lined up like a chess board
        fragment.prepend(card);
    });

    settingsPanel.innerHTML = '';
    settingsPanel.appendChild(fragment);
};

// =============================================================================
// RENDERING - CHESS PIECES
// =============================================================================

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
// VIEWPORT SETUP
// =============================================================================

const zoomPan = createZoomPan(viewport, stage, {
    onInteract: () => { viewState.hasInteractedWithView = true; },
    zoomMultiplier: ZOOM_SCROLL_MULTIPLIER,
    contentSize: BOARD_SIZE,
});

// Converts screen click position to board square (col, row)
const screenToSquare = (clientX, clientY) => {
    const world = zoomPan.screenToWorld(clientX, clientY);
    const col = Math.floor(world.x / SQUARE_SIZE);
    const row = Math.floor(world.y / SQUARE_SIZE);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return { col, row };
};

// =============================================================================
// GAME ACTIONS (bridge between UI events and game logic)
// =============================================================================
// These functions call game.js logic and then update visuals accordingly.

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

// Handles moving a piece (updates game state and visuals)
const handleMovePiece = (slot, targetCol, targetRow) => {
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
};

// Handles resetting the board
const handleResetBoard = () => {
    handleDeselectPiece();
    const pieces = resetBoard();
    pieces.forEach(piece => {
        updatePiecePosition(piece);
        updatePieceCaptureState(piece);
        updatePieceNotation(piece);
    });
};

// =============================================================================
// SERVER MOVE HANDLING
// =============================================================================
// Called when receiving move updates from the server via Pusher.
// Updates game state and visuals to reflect moves made by other clients.

const handleServerMove = (moveData) => {
    // Apply the move to game state
    const result = applyServerMove(moveData);
    if (!result) return;

    // Update visuals
    updatePiecePosition(result.piece);
    updatePieceNotation(result.piece);

    if (result.capturedPiece) {
        updatePieceCaptureState(result.capturedPiece);
        playCaptureSounds();
    }
};

const handleFullBoardSync = (boardState) => {
    // Apply full state from server
    const changedPieces = applyFullBoardState(boardState);
    
    // Update visuals for all changed pieces
    changedPieces.forEach(piece => {
        updatePiecePosition(piece);
        updatePieceCaptureState(piece);
        updatePieceNotation(piece);
    });
};

// =============================================================================
// PUSHER INITIALIZATION (STUB)
// =============================================================================
// TODO: Initialize Pusher client and bind to channel events

function initializePusher() {
    // TODO: Implement Pusher initialization
    // Example:
    // const pusher = new Pusher('YOUR_APP_KEY', { cluster: 'YOUR_CLUSTER' });
    // const channel = pusher.subscribe('chess-game');
    //
    // // Listen for moves from other clients
    // channel.bind('piece-moved', (data) => {
    //     // data format:
    //     // {
    //     //     slot: '5',
    //     //     from: { col: 4, row: 7 },
    //     //     to: { col: 4, row: 5 },
    //     //     fullBoardState: { pieces: { ... } }  // Optional safety sync
    //     // }
    //     handleServerMove(data);
    //     
    //     // Optionally apply full board state for safety
    //     if (data.fullBoardState) {
    //         handleFullBoardSync(data.fullBoardState);
    //     }
    // });
    //
    // // Listen for board reset events
    // channel.bind('board-reset', () => {
    //     handleResetBoard();
    // });

    console.log('[PUSHER STUB] Would initialize Pusher and bind to channel events');
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

// Right-click: select a piece or move the selected piece
viewport.addEventListener('contextmenu', event => {
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
    handleMovePiece(state.selectedSlot, targetSquare.col, targetSquare.row);
    handleDeselectPiece();
});

// Reset button
resetButton.addEventListener('click', () => {
    handleResetBoard();
    zoomPan.setTransform({ scale: 1 });
    zoomPan.centerContent(BOARD_SIZE, BOARD_SIZE);
    viewState.hasInteractedWithView = false;
});

// Settings panel: handle image dropdown changes
settingsPanel.addEventListener('change', event => {
    if (!event.target.classList.contains('image-select')) return;
    const piece = state.pieces[event.target.dataset.slot];
    if (piece) {
        piece.image = event.target.value;
        updatePieceImage(piece);
    }
});

// Re-center board on window resize if user hasn't manually panned/zoomed
window.addEventListener('resize', () => {
    if (!viewState.hasInteractedWithView) {
        zoomPan.centerContent(BOARD_SIZE, BOARD_SIZE);
    }
});

// =============================================================================
// INITIALIZATION
// =============================================================================

initializePieces();
renderSettingsPanel();
renderPieces();
zoomPan.setTransform({ scale: 1 });
zoomPan.centerContent(BOARD_SIZE, BOARD_SIZE);

// Initialize server connection (when implemented)
initializePusher();
