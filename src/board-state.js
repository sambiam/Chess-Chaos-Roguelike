// =============================================================================
// PIECE STATUS EMOJIS
// =============================================================================

// Can add new emojis with { name: 'your_name', emoji: '🎯' } 
// It'll automatically appear everywhere from there

export const MAX_PIECE_EMOJIS = 4;

export const PIECE_STATUS_OPTIONS = [
    { name: 'frozen',        emoji: '❄️' },
    { name: 'immortal',      emoji: '☠️' },
    { name: 'pawn_moveset',  emoji: '♟️' },
    { name: 'king_moveset',  emoji: '🫅' },
    { name: 'queen_moveset', emoji: '👸' },
    { name: 'soul_link',     emoji: '👨‍❤️‍👨' },
    { name: 'on_ice',        emoji: '☃️' },
    { name: 'misc_1',        emoji: '💪' },
    { name: 'misc_2',        emoji: '🩸' },
    { name: 'misc_3',        emoji: '💣' },
    { name: 'misc_4',        emoji: '👑' },
    { name: 'misc_5',        emoji: '🐎' },
];

// Lookup map: status name → emoji character (for rendering stored status names)
export const STATUS_EMOJI_MAP = Object.fromEntries(
    PIECE_STATUS_OPTIONS.map(opt => [opt.name, opt.emoji])
);

// =============================================================================
// BOARD EFFECT EMOJIS
// =============================================================================
// Can add new emojis with { name: 'your_name', emoji: '🎯' } 

export const BOARD_EFFECT_OPTIONS = [
    { name: 'blocked',   emoji: '❌' },
    { name: 'misc_1', emoji: '💣' },
    { name: 'misc_2',    emoji: '💀' },
    { name: 'misc_3',    emoji: '❄️' },
    { name: 'misc_4',    emoji: '🔀' },
    { name: 'misc_5',    emoji: '🌪️' },
    { name: 'misc_6',    emoji: '💰' },
    { name: 'misc_7',    emoji: '🕳️' },
];

export const BOARD_EFFECT_EMOJI_MAP = Object.fromEntries(
    BOARD_EFFECT_OPTIONS.map(opt => [opt.name, opt.emoji])
);

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

export const piecesConfig = [
    // White back rank (row 7)
    { slot: '1', label: 'White Rook 1', color: 'white', image: 'White Rook 1.png', col: 0, row: 7 },
    { slot: '2', label: 'White Knight 1', color: 'white', image: 'White Knight 1.png', col: 1, row: 7 },
    { slot: '3', label: 'White Bishop 1', color: 'white', image: 'White Bishop 1.png', col: 2, row: 7 },
    { slot: '4', label: 'White Queen', color: 'white', image: 'White Queen 1.png', col: 3, row: 7 },
    { slot: '5', label: 'White King', color: 'white', image: 'White King 1.png', col: 4, row: 7 },
    { slot: '6', label: 'White Bishop 2', color: 'white', image: 'White Bishop 2.png', col: 5, row: 7 },
    { slot: '7', label: 'White Knight 2', color: 'white', image: 'White Knight 2.png', col: 6, row: 7 },
    { slot: '8', label: 'White Rook 2', color: 'white', image: 'White Rook 2.png', col: 7, row: 7 },
    // White pawns (row 6)
    { slot: '9', label: 'White Pawn 1', color: 'white', image: 'White Pawn 1.png', col: 0, row: 6 },
    { slot: '10', label: 'White Pawn 2', color: 'white', image: 'White Pawn 2.png', col: 1, row: 6 },
    { slot: '11', label: 'White Pawn 3', color: 'white', image: 'White Pawn 3.png', col: 2, row: 6 },
    { slot: '12', label: 'White Pawn 4', color: 'white', image: 'White Pawn 4.png', col: 3, row: 6 },
    { slot: '13', label: 'White Pawn 5', color: 'white', image: 'White Pawn 5.png', col: 4, row: 6 },
    { slot: '14', label: 'White Pawn 6', color: 'white', image: 'White Pawn 6.png', col: 5, row: 6 },
    { slot: '15', label: 'White Pawn 7', color: 'white', image: 'White Pawn 7.png', col: 6, row: 6 },
    { slot: '16', label: 'White Pawn 8', color: 'white', image: 'White Pawn 8.png', col: 7, row: 6 },
    // Black pawns (row 1)
    { slot: '17', label: 'Black Pawn 1', color: 'black', image: 'Black Pawn 1.png', col: 0, row: 1 },
    { slot: '18', label: 'Black Pawn 2', color: 'black', image: 'Black Pawn 2.png', col: 1, row: 1 },
    { slot: '19', label: 'Black Pawn 3', color: 'black', image: 'Black Pawn 3.png', col: 2, row: 1 },
    { slot: '20', label: 'Black Pawn 4', color: 'black', image: 'Black Pawn 4.png', col: 3, row: 1 },
    { slot: '21', label: 'Black Pawn 5', color: 'black', image: 'Black Pawn 5.png', col: 4, row: 1 },
    { slot: '22', label: 'Black Pawn 6', color: 'black', image: 'Black Pawn 6.png', col: 5, row: 1 },
    { slot: '23', label: 'Black Pawn 7', color: 'black', image: 'Black Pawn 7.png', col: 6, row: 1 },
    { slot: '24', label: 'Black Pawn 8', color: 'black', image: 'Black Pawn 8.png', col: 7, row: 1 },
    // Black back rank (row 0)
    { slot: '25', label: 'Black Rook 1', color: 'black', image: 'Black Rook 1.png', col: 0, row: 0 },
    { slot: '26', label: 'Black Knight 1', color: 'black', image: 'Black Knight 1.png', col: 1, row: 0 },
    { slot: '27', label: 'Black Bishop 1', color: 'black', image: 'Black Bishop 1.png', col: 2, row: 0 },
    { slot: '28', label: 'Black Queen', color: 'black', image: 'Black Queen 1.png', col: 3, row: 0 },
    { slot: '29', label: 'Black King', color: 'black', image: 'Black King 1.png', col: 4, row: 0 },
    { slot: '30', label: 'Black Bishop 2', color: 'black', image: 'Black Bishop 2.png', col: 5, row: 0 },
    { slot: '31', label: 'Black Knight 2', color: 'black', image: 'Black Knight 2.png', col: 6, row: 0 },
    { slot: '32', label: 'Black Rook 2', color: 'black', image: 'Black Rook 2.png', col: 7, row: 0 },
];

// =============================================================================
// GAME STATE
// =============================================================================
// Single source of truth for all game data.
// - pieces: Object mapping slot ID to piece data (position, captured status, etc.)
// - selectedSlot: Currently selected piece for move operations

export const state = {
    pieces: {},
    selectedSlot: null,
    boardEffects: {},       // key: "col,row" → value: array of effect name strings
    highlightedSquare: null, // { col, row, timestamp } or null — ephemeral randomizer highlight
};

// This generates a simplified version of the state,
//  where it only includes the info that the server cares about
export const getSimpleBoardState = () => {
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
            emojis: [...piece.emojis],
        };
    }
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
// UTILITY FUNCTIONS
// =============================================================================

// Converts col/row to chess notation (e.g., col=0, row=7 -> "A1")
export const toNotation = (col, row) => `${String.fromCharCode(65 + col)}${8 - row}`;

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

// Creates the initial piece state from piecesConfig
export const initializePieces = () => {
    piecesConfig.forEach(config => {
        state.pieces[config.slot] = {
            slot: config.slot,
            label: config.label,
            color: config.color,
            image: config.image,
            initialImage: config.image, // Store initial image for reset
            position: { col: config.col, row: config.row },
            initialPosition: { col: config.col, row: config.row },
            notation: toNotation(config.col, config.row),
            captured: false,
            emojis: [],  // Array of status name strings (max MAX_PIECE_EMOJIS)
        };
    });
};

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
// PIECE MOVEMENT & CAPTURE
// =============================================================================

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

// *** CORE MOVEMENT FUNCTION ***
// Moves a piece to a new position, handling captures.
// Returns an object describing what happened
// NOTE THIS DOES NOT JUST UPDATE THE POSITION OF A PIECE, IT HANDLES A BUNCH OF OTHER CONSEQUENCES
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

    const moveResult = {
        piece,
        from: fromPosition,
        to: { col: targetCol, row: targetRow },
        capturedPiece,
    };

    return moveResult;
};

// Resets all pieces to their starting positions
export const resetBoard = () => {
    deselectPiece();
    const resetPieces = [];
    Object.values(state.pieces).forEach(piece => {
        piece.captured = false;
        piece.position = { ...piece.initialPosition };
        piece.notation = toNotation(piece.position.col, piece.position.row);
        piece.image = piece.initialImage; // Reset image to initial state
        piece.emojis = [];  // Clear all status emojis on reset
        resetPieces.push(piece);
    });
    state.boardEffects = {};  // Clear all board square effects on reset
    state.highlightedSquare = null;  // Clear highlight on reset
    return resetPieces; // Return all pieces so app.js can update visuals
};


