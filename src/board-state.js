// =============================================================================
// CLIENT BOARD STATE
// =============================================================================
// Piece/status/effect definitions now live in shared/defs.js so the rules
// engine (shared/engine.js) can use them on both client and server.
// This module re-exports them for the view layer and manages the client-side
// mirror of the authoritative server state.

import {
    MAX_PIECE_EMOJIS,
    PIECE_STATUS_OPTIONS,
    STATUS_EMOJI_MAP,
    BOARD_EFFECT_OPTIONS,
    BOARD_EFFECT_EMOJI_MAP,
    STARTING_PIECES,
    isOriginalSlot,
    toNotation,
} from '../shared/defs.js';

export {
    MAX_PIECE_EMOJIS,
    PIECE_STATUS_OPTIONS,
    STATUS_EMOJI_MAP,
    BOARD_EFFECT_OPTIONS,
    BOARD_EFFECT_EMOJI_MAP,
    toNotation,
};

// =============================================================================
// CONSTANTS
// =============================================================================

export const SQUARE_SIZE = 100;  // Each square is 100x100 pixels

// Available piece images for the dropdown selectors
export const pieceImageOptions = [
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

// =============================================================================
// INITIAL PIECE CONFIGURATION
// =============================================================================
// Defines the starting state of all 32 chess pieces.
// - slot: unique identifier for each piece (1-32)
// - col/row: board position (0-7), where row 0 is top (black's back rank)
// - col 0 is leftmost (A file), col 7 is rightmost (H file)
// Rules can SPAWN additional pieces (slot 33+); those arrive via server sync.

// The starting 32 pieces now live in shared/defs.js so the server can rebuild
// the same pristine board without trusting a client's in-memory copy.
export const piecesConfig = STARTING_PIECES;

// =============================================================================
// GAME STATE
// =============================================================================
// Client-side mirror of the authoritative server game state.
// - pieces: Object mapping slot ID to piece data (position, captured status, etc.)
// - selectedSlot: Currently selected piece for move operations
// - boardEffects: key: "col,row" → value: array of effect name strings
// - highlightedSquare: { col, row, timestamp } or null — ephemeral randomizer highlight

export const state = {
    pieces: {},
    selectedSlot: null,
    boardEffects: {},
    highlightedSquare: null,
};

// This generates a simplified version of the state,
//  where it only includes the info that the server cares about
export const getSimpleBoardState = () => {
    const simpleState = {};
    for (const [slot, piece] of Object.entries(state.pieces)) {
        simpleState[slot] = {
            image: piece.image,
            captured: piece.captured,
            position: { ...piece.position },
            emojis: [...piece.emojis],
            // The rules engine needs these to validate and apply moves
            color: piece.color,
            label: piece.label,
            moved: !!piece.moved,
            initialPosition: { ...piece.initialPosition },
            initialImage: piece.initialImage,
        };
    }
    // Include current selection so other clients can see it
    simpleState.selectedSlot = state.selectedSlot;
    // Include board square effects
    simpleState.boardEffects = {};
    for (const [key, effects] of Object.entries(state.boardEffects)) {
        if (effects.length > 0) {
            simpleState.boardEffects[key] = [...effects];
        }
    }
    // Include highlight (with timestamp for expiry)
    simpleState.highlightedSquare = state.highlightedSquare
        ? { ...state.highlightedSquare }
        : null;
    return simpleState;
};


// =============================================================================
// PIECE STATE MANAGEMENT
// =============================================================================
// *** THIS IS WHERE PIECE POSITION DATA LIVES ***
// Each piece in state.pieces has:
//   - position: { col, row } - CURRENT position on the board
//   - initialPosition: { col, row } - Starting position (for reset)
//   - notation: Chess notation string (e.g., "E4")
//   - captured: Boolean indicating if piece has been taken
//   - emojis: Array of status name strings (e.g., ["frozen", "immortal"])
//   - moved: Whether the piece has moved this game (castling rights)

// Creates the initial piece state from piecesConfig
export const initializePieces = () => {
    piecesConfig.forEach(config => {
        state.pieces[config.slot] = {
            slot: config.slot,
            label: config.label,
            color: config.color,
            image: config.image,
            initialImage: config.image, // Store initial image for reset
            initialColor: config.color, // Mind Control can flip color — reset needs the original
            position: { col: config.col, row: config.row },
            initialPosition: { col: config.col, row: config.row },
            notation: toNotation(config.col, config.row),
            captured: false,
            emojis: [],  // Array of status name strings (max MAX_PIECE_EMOJIS)
            moved: false,
        };
    });
};

// Registers a rule-spawned piece (slot 33+) arriving from the server.
// Returns the new piece object so the view can create its DOM elements.
export const registerSpawnedPiece = (slot, data) => {
    state.pieces[slot] = {
        slot,
        label: data.label || `Piece ${slot}`,
        color: data.color || (data.image.startsWith('White') ? 'white' : 'black'),
        image: data.image,
        initialImage: data.initialImage || data.image,
        position: { ...data.position },
        initialPosition: data.initialPosition ? { ...data.initialPosition } : { ...data.position },
        notation: toNotation(data.position.col, data.position.row),
        captured: !!data.captured,
        emojis: [...(data.emojis || [])],
        moved: !!data.moved,
    };
    return state.pieces[slot];
};

// True for pieces that came from the standard starting 32
export const isOriginalPiece = isOriginalSlot;

// Finds the piece at a given board position (returns null if empty)
export const getPieceAt = (col, row) => {
    return Object.values(state.pieces).find(p =>
        !p.captured && p.position.col === col && p.position.row === row
    ) || null;
};

// =============================================================================
// PIECE SELECTION
// =============================================================================

// Removes selection from current piece
export const deselectPiece = () => {
    const previousSlot = state.selectedSlot;
    state.selectedSlot = null;
    return previousSlot; // Return so app.js can update visuals
};

// Selects a piece for movement
export const selectPiece = (slot) => {
    const piece = state.pieces[slot];
    if (!piece || piece.captured || state.selectedSlot === slot) return null;
    deselectPiece();
    state.selectedSlot = slot;
    return piece; // Return so app.js can update visuals
};

// =============================================================================
// PIECE MOVEMENT & CAPTURE (Sandbox Mode)
// =============================================================================
// These free-form mutations are only used in Sandbox Mode. Competitive play
// sends move intents to /api/game and the server engine decides everything.

// Revives a captured piece back to its starting position/image, clearing emojis.
// Returns null if the piece can't be revived (not captured, or starting spot is occupied).
export const revivePiece = (piece) => {
    if (!piece || !piece.captured) return null;
    const blocker = getPieceAt(piece.initialPosition.col, piece.initialPosition.row);
    if (blocker) return { blocked: true, blockerLabel: blocker.label };
    piece.captured = false;
    piece.position = { ...piece.initialPosition };
    piece.notation = toNotation(piece.position.col, piece.position.row);
    piece.image = piece.initialImage;
    piece.emojis = [];
    return { blocked: false, piece };
};

// Marks a piece as captured
export const capturePiece = (piece) => {
    if (!piece || piece.captured) return null;
    piece.captured = true;
    piece.emojis = [];  // Clear all status emojis when captured
    if (state.selectedSlot === piece.slot) state.selectedSlot = null;
    return piece; // Return so app.js can update visuals
};

// *** SANDBOX MOVEMENT FUNCTION ***
// Moves a piece to a new position, handling captures.
// Returns an object describing what happened
export const movePiece = (slot, targetCol, targetRow) => {
    const piece = state.pieces[slot];
    if (!piece || piece.captured) return null;

    const fromPosition = { col: piece.position.col, row: piece.position.row };

    // Check if target square has a piece to capture
    const targetPiece = getPieceAt(targetCol, targetRow);
    let capturedPiece = null;
    if (targetPiece && targetPiece.slot !== slot) {
        capturePiece(targetPiece);
        capturedPiece = targetPiece;
    }

    // *** UPDATE PIECE POSITION ***
    piece.position = { col: targetCol, row: targetRow };
    piece.notation = toNotation(targetCol, targetRow);
    piece.moved = true;

    const moveResult = {
        piece,
        from: fromPosition,
        to: { col: targetCol, row: targetRow },
        capturedPiece,
    };

    return moveResult;
};

// Resets all pieces to their starting positions.
// Rule-spawned pieces (slot 33+) are removed entirely; their slots are
// returned so the view can clean up their DOM elements.
export const resetBoard = () => {
    deselectPiece();
    const resetPieces = [];
    const removedSlots = [];
    Object.values(state.pieces).forEach(piece => {
        if (!isOriginalPiece(piece.slot)) {
            removedSlots.push(piece.slot);
            return;
        }
        piece.captured = false;
        piece.position = { ...piece.initialPosition };
        piece.notation = toNotation(piece.position.col, piece.position.row);
        piece.image = piece.initialImage; // Reset image to initial state
        if (piece.initialColor) piece.color = piece.initialColor; // Undo Mind Control
        piece.emojis = [];  // Clear all status emojis on reset
        piece.moved = false;
        resetPieces.push(piece);
    });
    removedSlots.forEach(slot => delete state.pieces[slot]);
    state.boardEffects = {};  // Clear all board square effects on reset
    state.highlightedSquare = null;  // Clear highlight on reset
    return { resetPieces, removedSlots };
};

// =============================================================================
// TURN STATE
// =============================================================================
// Mirror of the server's turn hash. seats/pendingChoices/gameOver/coinFlip
// are what make enforced PVP work.

export const turns = {
    currentTurn: 1,
    currentPlayer: "white",
    currentRules: [],
    newRuleChoices: [],
    seats: { white: null, black: null },
    pendingChoices: [],
    gameOver: null,
    coinFlip: null,
    lastMove: null,
};
