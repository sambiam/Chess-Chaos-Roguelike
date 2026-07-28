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
