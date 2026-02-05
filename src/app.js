import './style.css';
import Pusher from 'pusher-js';
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
} from './game.js';


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
// API HELPER FUNCTIONS
// =============================================================================

// HTTP GET helper function
async function apiGet(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString(); // Build query string from params object,  e.g., { playerId: "mario", limit: 10 } becomes "?playerId=mario&limit=10"
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;    
    const response = await fetch(url); // Send the HTTP request
    const data = await response.json();
    return data;
}

// HTTP POST helper function
async function apiPost(endpoint, body = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json', // Tell the server we're sending JSON
        },
        body: JSON.stringify(body), // Convert JS object to JSON string
    });
    const data = await response.json();
    return data;
    // return response;
}

// Returns this browser's unique ID (or generates a new one if they don't have it already)
function getUserId() {
    let id = localStorage.getItem('userId');   
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('userId', id);
    }
    return id;
}

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
// CORE GAME ACTIONS
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

const getSimpleBoardState = () => {
    /*
    Creates a new state of the board with following structure:
    simpleState = {
        1: {
            captured: false,
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
    const simpleState = {};
    for (const [slot, piece] of Object.entries(state.pieces)) {
        simpleState[slot] = {
            image: piece.image,
            captured: piece.captured,
            position: { ...piece.position },
        };
    }
    return simpleState;
};

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
            const result = movePiece(Number(slot), newPiece.position.col, newPiece.position.row);
            if (!result) return;
            updatePiecePosition(currentPiece); // Update visuals
            updatePieceNotation(currentPiece);
        }
        if (currentPiece.image !== newPiece.image) {
            currentPiece.image = newPiece.image;
            currentPiece.imageSelect.value = currentPiece.image; // Update the settings selector to match the new image
            updatePieceImage(currentPiece);
        }
        if (currentPiece.captured !== newPiece.captured) {
            updatePieceCaptureState(currentPiece);
            playCaptureSounds();
        }
    }
};


// =============================================================================
// EVENT HANDLERS
// =============================================================================

// Reset button
resetButton.addEventListener('click', async () => {
    handleResetBoard();
    zoomPan.setTransform({ scale: 1 });
    zoomPan.centerContent(BOARD_SIZE, BOARD_SIZE);
    viewState.hasInteractedWithView = false;

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

// Pull the state of the board from the Redis DB, update our board state appropriately
await pullServerBoardState();

// Initialize server connection (when implemented)
initializePusher();
