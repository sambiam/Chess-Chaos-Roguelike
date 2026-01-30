// =============================================================================
// GAME STATE & LOGIC
// =============================================================================
// This module contains all chess game state and logic, separate from rendering.
// It handles piece positions, movement, captures, and server synchronization.

// =============================================================================
// CONSTANTS
// =============================================================================

export const SQUARE_SIZE = 100;  // Each square is 100x100 pixels

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

// Creates the initial piece state from piecesConfig
export const initializePieces = () => {
    piecesConfig.forEach(config => {
        state.pieces[config.slot] = {
            slot: config.slot,
            label: config.label,
            color: config.color,
            image: config.image,
            position: { col: config.col, row: config.row },
            initialPosition: { col: config.col, row: config.row },
            notation: toNotation(config.col, config.row),
            captured: false,
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

// Marks a piece as captured
export const capturePiece = (piece) => {
    if (!piece || piece.captured) return null;
    piece.captured = true;
    if (state.selectedSlot === piece.slot) state.selectedSlot = null;
    return piece; // Return so app.js can update visuals
};

// *** CORE MOVEMENT FUNCTION ***
// Moves a piece to a new position, handling captures.
// Returns an object describing what happened, for visual updates and server sync.
export const movePiece = (slot, targetCol, targetRow, { isFromServer = false } = {}) => {
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

    // =================================================================
    // SERVER SYNC: Send move to server (only for local moves)
    // =================================================================
    // TODO: Implement server communication
    // When a local player moves a piece, notify the server so it can:
    // 1. Update its authoritative board state
    // 2. Broadcast the move to other clients via Pusher
    if (!isFromServer) {
        sendMoveToServer(moveResult);
    }

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
        resetPieces.push(piece);
    });
    return resetPieces; // Return all pieces so app.js can update visuals
};

// =============================================================================
// SERVER COMMUNICATION STUBS
// =============================================================================
// These functions handle synchronization with the server.
// The server maintains the authoritative board state and broadcasts moves via Pusher.

// Sends a local move to the server
// TODO: Implement actual HTTP request to server
function sendMoveToServer(moveResult) {
    // TODO: Send move to server
    // Example payload:
    // {
    //     slot: moveResult.piece.slot,
    //     from: { col: moveResult.from.col, row: moveResult.from.row },
    //     to: { col: moveResult.to.col, row: moveResult.to.row },
    // }
    console.log('[SERVER STUB] Would send move to server:', {
        slot: moveResult.piece.slot,
        from: moveResult.from,
        to: moveResult.to,
    });
}

// Called when receiving a move from another client via Pusher
// This updates local state to match the server's authoritative state
export const applyServerMove = (moveData) => {
    // TODO: Implement when adding Pusher
    // moveData expected format:
    // {
    //     slot: '5',           // Which piece moved
    //     from: { col, row },  // Previous position
    //     to: { col, row },    // New position
    // }
    console.log('[SERVER STUB] Would apply server move:', moveData);

    // Apply the move locally (isFromServer=true prevents re-sending to server)
    const result = movePiece(moveData.slot, moveData.to.col, moveData.to.row, { isFromServer: true });
    return result;
};

// Called to sync full board state from server (safety measure)
// Use this on initial load or if states get out of sync
export const applyFullBoardState = (boardState) => {
    // TODO: Implement when adding Pusher
    // boardState expected format:
    // {
    //     pieces: {
    //         '1': { col: 0, row: 7, captured: false },
    //         '2': { col: 1, row: 7, captured: false },
    //         ... etc
    //     }
    // }
    console.log('[SERVER STUB] Would apply full board state:', boardState);

    // TODO: Loop through boardState.pieces and update each piece's position/captured status
    // Return list of pieces that changed so app.js can update visuals
    return [];
};
