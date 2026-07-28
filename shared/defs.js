// =============================================================================
// SHARED DEFINITIONS
// =============================================================================
// This module is imported by BOTH the client (src/) and the server (api/).
// It holds the data definitions the rules engine needs: piece types, status
// emojis, board square effects, and small board-math helpers.
// Keep this file free of DOM and Redis code — pure data + pure functions only.

// =============================================================================
// PIECE TYPES
// =============================================================================

export const PIECE_TYPES = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];

// Derives a piece's type from its image filename (e.g. "White Rook 2.png" -> "Rook").
// Type is intentionally derived from the CURRENT image so that rules which
// transform pieces (promotion, "All Queens become Bishops", etc.) only need to
// swap the image and the engine picks up the new movement automatically.
export const typeFromImage = (image) => {
    for (const type of PIECE_TYPES) {
        if (image.includes(type)) return type;
    }
    return 'Pawn'; // Fallback — should never happen with the bundled art
};

// Returns an image filename for a given color + type (used when a rule
// transforms or spawns a piece). Variant 1 always exists for every type.
export const imageForType = (color, type) => {
    const colorName = color === 'white' ? 'White' : 'Black';
    return `${colorName} ${type} 1.png`;
};

// Relative piece values, used for auto-resolving choices when a player
// lets the choice timer run out (we pick sensibly, not stupidly).
export const PIECE_VALUES = { Pawn: 1, Knight: 3, Bishop: 3, Rook: 5, Queen: 9, King: 100 };

// =============================================================================
// STARTING BOARD
// =============================================================================
// The standard 32 pieces, shared so the SERVER can rebuild a pristine board on
// its own. Reset used to be "whatever the client currently has in memory",
// which meant a stale tab could hand back a board still carrying the previous
// game's rule-spawned pieces.
// - slot: unique identifier (1-32); rules SPAWN extra pieces at slot 33+
// - col/row: 0-7, row 0 is the top (black's back rank), col 0 is the A file

export const STARTING_PIECES = [
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

// True for pieces from the standard starting 32 (rule-spawned pieces are 33+)
export const isOriginalSlot = (slot) => Number(slot) <= 32;

// Builds a pristine { slot: piece } map in the shape the engine expects
export const createStartingPieces = () => {
    const pieces = {};
    for (const config of STARTING_PIECES) {
        pieces[config.slot] = {
            slot: config.slot,
            label: config.label,
            color: config.color,
            image: config.image,
            initialImage: config.image,
            position: { col: config.col, row: config.row },
            initialPosition: { col: config.col, row: config.row },
            captured: false,
            emojis: [],
            moved: false,
        };
    }
    return pieces;
};

// =============================================================================
// PIECE STATUS EMOJIS
// =============================================================================
// Statuses are stored on pieces as name strings; the engine enforces the ones
// with gameplay meaning and the view renders them via STATUS_EMOJI_MAP.
//
// Engine-enforced statuses:
//   frozen        — piece cannot move (Mr Freeze / Ice Age)
//   immortal      — piece cannot die (Invulnerability Potion)
//   pawn_moveset  — piece moves like a Pawn
//   king_moveset  — piece moves like a King
//   queen_moveset — piece moves like a Queen
//   soul_link     — linked sibling dies with this piece (Soul Link visual)
//   bomb          — Living Bomb target
//   mitosis       — Mitosis target (cannot move, may duplicate on expiry)

export const MAX_PIECE_EMOJIS = 4;

export const PIECE_STATUS_OPTIONS = [
    { name: 'frozen',        emoji: '❄️' },
    { name: 'immortal',      emoji: '☠️' },
    { name: 'pawn_moveset',  emoji: '♟️' },
    { name: 'king_moveset',  emoji: '🫅' },
    { name: 'queen_moveset', emoji: '👸' },
    { name: 'soul_link',     emoji: '👨‍❤️‍👨' },
    { name: 'on_ice',        emoji: '☃️' },
    { name: 'bomb',          emoji: '💣' },
    { name: 'mitosis',       emoji: '🧬' },
    { name: 'misc_1',        emoji: '💪' },
    { name: 'misc_2',        emoji: '🩸' },
    { name: 'misc_4',        emoji: '👑' },
    { name: 'misc_5',        emoji: '🐎' },
];

export const STATUS_EMOJI_MAP = Object.fromEntries(
    PIECE_STATUS_OPTIONS.map(opt => [opt.name, opt.emoji])
);

// =============================================================================
// BOARD SQUARE EFFECTS
// =============================================================================
// Effects are stored in boardEffects as { "col,row": [name, ...] }.
// Engine-enforced effects:
//   blocked   — cannot be entered or crossed (Nuclear Fallout)
//   mine      — entering piece dies, mine removed (Minefield)
//   pit       — entering piece dies, pit stays (Bottomless Pit)
//   chest     — first piece entering promotes, chest removed (Treasure Chest)
//   lightning — marker for Call Down Lightning
//   doom      — marker for Get The Fuck Off (pieces on it die at expiry)
//   portal    — marker for Portal 3 (contents swap every turn)
//   tornado   — marker for Tornado (pieces that can enter, must)
//   wall      — marker for No Mans Land column

export const BOARD_EFFECT_OPTIONS = [
    { name: 'blocked',   emoji: '❌' },
    { name: 'mine',      emoji: '💣' },
    { name: 'doom',      emoji: '💀' },
    { name: 'freeze',    emoji: '❄️' },
    { name: 'portal',    emoji: '🔀' },
    { name: 'tornado',   emoji: '🌪️' },
    { name: 'chest',     emoji: '💰' },
    { name: 'pit',       emoji: '🕳️' },
    { name: 'lightning', emoji: '⚡' },
    { name: 'wall',      emoji: '🚧' },
];

export const BOARD_EFFECT_EMOJI_MAP = Object.fromEntries(
    BOARD_EFFECT_OPTIONS.map(opt => [opt.name, opt.emoji])
);

// =============================================================================
// BOARD MATH HELPERS
// =============================================================================

export const BOARD_SIZE_SQUARES = 8;

export const inBounds = (col, row) =>
    col >= 0 && col < BOARD_SIZE_SQUARES && row >= 0 && row < BOARD_SIZE_SQUARES;

// Converts col/row to chess notation (e.g., col=0, row=7 -> "A1")
export const toNotation = (col, row) => `${String.fromCharCode(65 + col)}${8 - row}`;

export const squareKey = (col, row) => `${col},${row}`;

export const parseSquareKey = (key) => {
    const [col, row] = key.split(',').map(Number);
    return { col, row };
};

// All 8 squares surrounding (col,row) that are on the board
export const adjacentSquares = (col, row) => {
    const result = [];
    for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            if (inBounds(col + dc, row + dr)) result.push({ col: col + dc, row: row + dr });
        }
    }
    return result;
};

// "Forward" direction for a color: white moves up the board (row decreases)
export const forwardDir = (color) => (color === 'white' ? -1 : 1);

// The row that counts as the enemy's back line for a color
export const enemyBackRow = (color) => (color === 'white' ? 0 : 7);

export const otherColor = (color) => (color === 'white' ? 'black' : 'white');
