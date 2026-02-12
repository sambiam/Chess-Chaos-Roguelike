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
    capturePiece,
    resetBoard,
    toNotation,
    PIECE_STATUS_OPTIONS,
    STATUS_EMOJI_MAP,
    MAX_PIECE_EMOJIS,
} from './board-state.js';
import {
    apiGet,
    apiPost,
    getUserId,
    playCaptureSounds,
} from './utils.js';
import {
    turns
} from './turns.js';

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

// Updates the emoji overlay elements on a piece to match piece.emojis[]
const updatePieceEmojis = piece => {
    if (!piece.emojiElements) return;
    for (let i = 0; i < MAX_PIECE_EMOJIS; i++) {
        const el = piece.emojiElements[i];
        if (i < piece.emojis.length) {
            el.textContent = STATUS_EMOJI_MAP[piece.emojis[i]] || '';
            el.style.display = '';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
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
    const emojiPositions = ['tl', 'tr', 'bl', 'br']; // top-left, top-right, bottom-left, bottom-right
    
    Object.values(state.pieces).forEach(piece => {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        pieceEl.id = `piece-${piece.slot}`;

        // Create 4 emoji overlay slots (positioned at corners of the piece)
        piece.emojiElements = emojiPositions.map(pos => {
            const emojiEl = document.createElement('span');
            emojiEl.className = `piece-emoji piece-emoji-${pos}`;
            emojiEl.style.display = 'none';
            pieceEl.appendChild(emojiEl);
            return emojiEl;
        });
        
        // Store DOM reference on the piece object (view layer property)
        piece.element = pieceEl;

        updatePieceImage(piece);
        updatePieceCaptureState(piece);
        updatePiecePosition(piece);
        updatePieceEmojis(piece);

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
        updatePieceEmojis(piece); // Clear all status emojis visually
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
    const EVENT_TYPE_TURN_UPDATE = 'turn-event';

    // Create Pusher client
	pusherClient = new Pusher(pusherKey, {cluster: pusherCluster,});
	
	// Subscribe to the channel
	pusherChannel = pusherClient.subscribe(CHANNEL_NAME);
	
	// Listen for any updates to the board state
    // This can include piece updates, settings, or a full board reset
	pusherChannel.bind(EVENT_TYPE_BOARD_UPDATE, (data) => {
        handleBoardUpdate(data);
	});

    // Listen for any updates to the rules
    // This can include turn count, current rules, and new rules
	pusherChannel.bind(EVENT_TYPE_TURN_UPDATE, (data) => {
        handleTurnUpdate(data);
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
    // Tell server to reset turn send
    await apiPost('/api/turns', {clientSecret: clientSecret, action: 'RESET_TURNS',});
});

// Settings panel: handle image dropdown changes
settingsPanel.addEventListener('change', async event => {
    if (!event.target.classList.contains('image-select')) return;
    const piece = state.pieces[event.target.dataset.slot];
    if (piece) {
        piece.image = event.target.value;
        updatePieceImage(piece);
    }
    // Send board update event to server (it includes each piece's images)
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
// PIECE CONTEXT MENU (Double Right-Click)
// =============================================================================

// Double-right-click timing
let lastRightClickTime = 0;
let lastRightClickSquare = null;
const DOUBLE_CLICK_THRESHOLD = 400; // ms window to detect double right-click

// Create the context menu element (lives on body so it isn't clipped by viewport overflow)
const pieceContextMenu = document.createElement('div');
pieceContextMenu.className = 'piece-context-menu';
pieceContextMenu.style.display = 'none';
document.body.appendChild(pieceContextMenu);

// Dismiss / hide the context menu
const dismissPieceContextMenu = () => {
    pieceContextMenu.style.display = 'none';
    pieceContextMenu.innerHTML = '';
};

// Show the context menu at the click position for the given piece
const showPieceContextMenu = (clientX, clientY, piece) => {
    dismissPieceContextMenu(); // Close any existing menu first

    // --- Header: piece label ---
    const header = document.createElement('div');
    header.className = 'context-menu-header';
    header.textContent = piece.label;
    pieceContextMenu.appendChild(header);

    // --- "Capture" option ---
    const captureOption = document.createElement('div');
    captureOption.className = 'context-menu-option context-menu-capture';
    captureOption.textContent = '\u2620\uFE0F Capture';
    captureOption.addEventListener('click', async () => {
        dismissPieceContextMenu();
        capturePiece(piece);
        updatePieceCaptureState(piece);
        updatePieceEmojis(piece); // Clear emoji overlays (capturePiece clears the data)
        handleDeselectPiece();
        // Send board state to server (NOT a turn — just a state update)
        await apiPost('/api/board-state', {
            clientSecret: clientSecret,
            userId: getUserId(),
            newState: getSimpleBoardState(),
        });
    });
    pieceContextMenu.appendChild(captureOption);

    // --- Separator ---
    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    pieceContextMenu.appendChild(separator);

    // --- Emoji status options (vertical list: emoji + name) ---
    // "Remove all" first, then all status emojis from PIECE_STATUS_OPTIONS
    const emojiList = document.createElement('div');
    emojiList.className = 'context-menu-emoji-list';

    // "Remove all emojis" option
    const removeBtn = document.createElement('div');
    removeBtn.className = 'context-menu-option context-menu-emoji-remove';
    removeBtn.textContent = '\u274C  remove';
    removeBtn.addEventListener('click', async () => {
        dismissPieceContextMenu();
        piece.emojis = [];
        updatePieceEmojis(piece);
        handleDeselectPiece();
        await apiPost('/api/board-state', {
            clientSecret: clientSecret,
            userId: getUserId(),
            newState: getSimpleBoardState(),
        });
    });
    emojiList.appendChild(removeBtn);

    // Status emoji options (from PIECE_STATUS_OPTIONS)
    PIECE_STATUS_OPTIONS.forEach(option => {
        const emojiBtn = document.createElement('div');
        emojiBtn.className = 'context-menu-option';
        emojiBtn.textContent = `${option.emoji}  ${option.name}`;
        emojiBtn.addEventListener('click', async () => {
            dismissPieceContextMenu();
            if (piece.emojis.length >= MAX_PIECE_EMOJIS) return; // Already at max (4)
            piece.emojis.push(option.name);
            updatePieceEmojis(piece);
            handleDeselectPiece();
            await apiPost('/api/board-state', {
                clientSecret: clientSecret,
                userId: getUserId(),
                newState: getSimpleBoardState(),
            });
        });
        emojiList.appendChild(emojiBtn);
    });
    pieceContextMenu.appendChild(emojiList);

    // --- Position the menu at the cursor ---
    pieceContextMenu.style.left = `${clientX}px`;
    pieceContextMenu.style.top = `${clientY}px`;
    pieceContextMenu.style.display = '';

    // Nudge if it would overflow the window
    requestAnimationFrame(() => {
        const rect = pieceContextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            pieceContextMenu.style.left = `${clientX - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            pieceContextMenu.style.top = `${clientY - rect.height}px`;
        }
    });
};

// Dismiss on any mousedown outside the menu (covers left + right clicks)
document.addEventListener('mousedown', event => {
    if (pieceContextMenu.style.display !== 'none' && !pieceContextMenu.contains(event.target)) {
        dismissPieceContextMenu();
    }
});

// Dismiss on Escape key
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismissPieceContextMenu();
});

// Prevent the browser's own context menu from appearing on our custom menu
pieceContextMenu.addEventListener('contextmenu', event => {
    event.preventDefault();
});

// =============================================================================
// HANDLE MOVE ACTIONS
// =============================================================================

// Right-click: select a piece, move the selected piece, or open piece context menu
viewport.addEventListener('contextmenu', async event => {
    event.preventDefault();
    const targetSquare = screenToSquare(event.clientX, event.clientY);

    // --- Double right-click detection ---
    const now = Date.now();
    const isDoubleRightClick =
        (now - lastRightClickTime < DOUBLE_CLICK_THRESHOLD) &&
        lastRightClickSquare && targetSquare &&
        lastRightClickSquare.col === targetSquare.col &&
        lastRightClickSquare.row === targetSquare.row;
    lastRightClickTime = now;
    lastRightClickSquare = targetSquare;

    // If double right-click on a piece, show the context menu instead of normal behavior
    if (isDoubleRightClick && targetSquare) {
        const piece = getPieceAt(targetSquare.col, targetSquare.row);
        if (piece) {
            handleSelectPiece(piece.slot); // Highlight the piece
            showPieceContextMenu(event.clientX, event.clientY, piece);
            return;
        }
    }

    // Dismiss any open context menu on a normal (single) right-click
    dismissPieceContextMenu();

    // --- Normal single right-click behavior ---
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
        updatePieceEmojis(result.capturedPiece); // Clear emoji overlays
        playCaptureSounds();
    }

    // Visually deselect it, now that it's moved
    handleDeselectPiece();

    // Send entire simple board state to server
    // Makes it easier for the server to maintain a single source of truth at all times, rather than just move diffs
    // Include clientSecret for authentication, include userId for receiving clients
    const response = await apiPost('/api/board-state', {clientSecret: clientSecret, userId: getUserId(), newState: getSimpleBoardState()});
    console.log("Posted new board state to the server", response)

    // Tell server to process a turn
    if (document.getElementById('ignore-turns-checkbox').checked) {
        console.log("Skipping turn processing because the Ignore Turns checkbox is checked");
    } else {
        await apiPost('/api/turns', {clientSecret: clientSecret, action: 'INCREMENT_TURN',});
    }
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
        // Sync emoji statuses (compare arrays by content)
        const serverEmojis = newPiece.emojis || [];
        const currentEmojis = currentPiece.emojis;
        if (serverEmojis.length !== currentEmojis.length ||
            serverEmojis.some((e, i) => e !== currentEmojis[i])) {
            currentPiece.emojis = [...serverEmojis];
            updatePieceEmojis(currentPiece);
        }
    }
};


// Process a rules event from the server
const handleTurnUpdate = (data) => {

    console.log("We got a turn update from the server with this info:", data.newTurn);
    const newTurnState = data.newTurn;

    turns.currentTurn = newTurnState.currentTurn;
    turns.currentPlayer = newTurnState.currentPlayer;
    turns.currentRules = newTurnState.currentRules;
    turns.newRuleChoices = newTurnState.newRuleChoices;

    // Update the Title visuals
    const titleCard = document.getElementById('title-card');
    if (turns.currentPlayer === 'white') {
        titleCard.textContent = 'White Turn';
        titleCard.classList.remove('black-turn');
        titleCard.classList.add('white-turn');
    } else {
        titleCard.textContent = 'Black Turn';
        titleCard.classList.remove('white-turn');
        titleCard.classList.add('black-turn');
    }

    // Update the Current Rule visuals
    const currentRulesEl = document.getElementById("current-rules-section");
    currentRulesEl.innerHTML = ""; // EXECUTE ORDER 67 - KILL THE YOUNGLINGS
    for (const nextRule of turns.currentRules) {
        const newRuleEl = document.createElement('div');
        newRuleEl.classList.add('current-rule-card');
        const nextDescription = document.createElement('p');
        nextDescription.classList.add('current-rule-description');
        nextDescription.textContent = nextRule.description;
        newRuleEl.append(nextDescription)
        const nextDuration = document.createElement('p');
        nextDuration.classList.add('current-rule-duration');
        nextDuration.textContent = `Turns Left: ${nextRule.turnsLeft}`;
        newRuleEl.append(nextDuration);
        currentRulesEl.append(newRuleEl);
    }

    // If a rule was just selected, lets do a 1-time reset to the "default" visual state
    if (newTurnState.justSelectedRule) {
        document.getElementById('viewport').classList.remove("choices-mode");
        document.getElementById('new-rules').classList.add("hidden");
        zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);         
    }

    if (turns.newRuleChoices.length > 0) {
        // HOLY FUCKING BEANS, THERE ARE CHOICES TO MAKE!!
        // Change visual state to choices mode
        document.getElementById('viewport').classList.add("choices-mode");
        const newRulesEl = document.getElementById('new-rules');
        newRulesEl.innerHTML = '';
        newRulesEl.classList.remove("hidden");
        zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);  

        const MAKEYOURCHOICE = document.createElement('p');
        MAKEYOURCHOICE.classList.add('new-rule-duration');
        MAKEYOURCHOICE.textContent = "MAKE YOUR CHOICE";
        newRulesEl.append(MAKEYOURCHOICE);

        // Now create the New Rules panel
        for (const nextRule of turns.newRuleChoices) {
            const newRuleCard = document.createElement('div');
            newRuleCard.classList.add('new-rule-card');

            const nextTitle = document.createElement('p');
            nextTitle.classList.add('new-rule-title');
            nextTitle.textContent = nextRule.title;
            newRuleCard.append(nextTitle);

            const nextDescription = document.createElement('p');
            nextDescription.classList.add('new-rule-description');
            nextDescription.textContent = nextRule.description;
            newRuleCard.append(nextDescription);

            const nextDuration = document.createElement('p');
            nextDuration.classList.add('new-rule-duration');
            if (nextRule.isInstant) {
                nextDuration.textContent = `Instant`;
            } else {
                nextDuration.textContent = `${nextRule.turnsLeft} Turns`;
            }            
            newRuleCard.append(nextDuration);
            newRuleCard.addEventListener('click', async () => {
                // We clicked a new rule! Send the selected rule to the server
                if (turns.newRuleChoices) {
                    await apiPost('/api/turns', {
                        action: 'SELECT_RULE',
                        payload: {
                            chosenIndex: turns.newRuleChoices.indexOf(nextRule),
                        },
                    });
                }
            });
            newRulesEl.append(newRuleCard);
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

// Initialize server connection
initializePusher();

// Pull the state of the board from the Redis DB, update our board state appropriately
await pullServerBoardState();


// TEMP TEMP TEMP TEMP
// TEMP TEMP TEMP TEMP
// TEMP TEMP TEMP TEMP
const endChoosingRules = function() {
    document.getElementById('viewport').classList.remove("choices-mode");
    document.getElementById('new-rules').classList.add("hidden");
    zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);
}
const startChoosingRules = function() {
    document.getElementById('viewport').classList.add("choices-mode");
    document.getElementById('new-rules').classList.remove("hidden");
    zoomPan.fitAndCenterContent(BOARD_SIZE, BOARD_SIZE);    
}
// setTimeout(endChoosingRules, 2000);
// setTimeout(startChoosingRules, 3000);
// setTimeout(endChoosingRules, 6000);
// setTimeout(startChoosingRules, 8000);
