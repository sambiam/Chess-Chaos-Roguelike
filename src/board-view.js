import {
    state,
    getPieceAt,
    toNotation,
    SQUARE_SIZE,
    pieceImageOptions,
    PIECE_STATUS_OPTIONS,
    STATUS_EMOJI_MAP,
    MAX_PIECE_EMOJIS,
    BOARD_EFFECT_OPTIONS,
    BOARD_EFFECT_EMOJI_MAP,
    selectPiece,
    deselectPiece,
    capturePiece,
    revivePiece,
    resetBoard,
    turns,
} from './board-state.js';
import { getUserId, playCaptureSounds, playRuleExpiredSound } from './utils.js';
import { startBackground, stopBackground } from './animated-bg.js';

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================
// Shared references injected by app.js during initialization.
// - postBoardState: callback to send current board state to the server
// - zoomPan: viewport zoom/pan controller (for fitAndCenterContent calls)
// - boardSize: board dimensions in pixels

let _postBoardState = null;
let _zoomPan = null;
let _boardSize = 800;
let _currentlyHaveRules = false;
let _onRuleCardClick = null;

export function initView({ postBoardState, zoomPan, boardSize, onRuleCardClick }) {
    _postBoardState = postBoardState;
    _zoomPan = zoomPan;
    _boardSize = boardSize;
    _onRuleCardClick = onRuleCardClick;
}

// =============================================================================
// DOM REFERENCES
// =============================================================================

const settingsPanel = document.getElementById('settings-panel');
const piecesLayer = document.getElementById('pieces-layer');
const boardEffectsLayer = document.getElementById('board-effects-layer');
const highlightLayer = document.getElementById('highlight-layer');

// =============================================================================
// PIECE VISUAL UPDATES
// =============================================================================
// These functions sync DOM elements with piece state.
// Note: piece.element, piece.positionTag are set during rendering.

export const updatePiecePosition = piece => {
    if (!piece.element) return;
    piece.element.style.left = `${piece.position.col * SQUARE_SIZE}px`;
    piece.element.style.top = `${piece.position.row * SQUARE_SIZE}px`;
};

export const updatePieceImage = piece => {
    if (!piece.element) return;
    piece.element.style.backgroundImage = `url('/images/${encodeURIComponent(piece.image)}')`;
};

export const updatePieceCaptureState = piece => {
    if (piece.element) {
        piece.element.classList.toggle('captured', piece.captured);
    }
    if (piece.settingsCard) {
        piece.settingsCard.classList.toggle('captured', piece.captured);
    }
};

export const updateReviveButton = piece => {
    if (!piece.reviveBtn) return;
    const canRevive = piece.captured &&
        !getPieceAt(piece.initialPosition.col, piece.initialPosition.row);
    piece.reviveBtn.style.display = canRevive ? 'block' : 'none';
};

export const refreshAllReviveButtons = () => {
    Object.values(state.pieces).forEach(updateReviveButton);
};

export const updatePieceNotation = piece => {
    if (piece.positionTag) {
        piece.positionTag.textContent = piece.notation;
    }
};

export const updatePieceSelection = (piece, isSelected) => {
    if (piece?.element) {
        piece.element.classList.toggle('selected', isSelected);
    }
};

export const updatePieceEmojis = piece => {
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

export const renderSettingsPanel = () => {
    const fragment = document.createDocumentFragment();
    
    const sortedPieces = Object.values(state.pieces).sort((a, b) => {
        const rowOrder = { 0: 0, 1: 1, 6: 2, 7: 3 };
        const rowDiff = rowOrder[a.position.row] - rowOrder[b.position.row];
        if (rowDiff !== 0) return rowDiff;
        return a.position.col - b.position.col;
    });
    
    sortedPieces.forEach(piece => {
        const card = document.createElement('div');
        card.className = 'piece-controls';
        card.dataset.slot = piece.slot;

        const header = document.createElement('header');
        const title = document.createElement('span');
        title.textContent = piece.label;
        const notationTag = document.createElement('span');
        notationTag.className = 'position-tag';
        notationTag.textContent = piece.notation;
        header.append(title, notationTag);
        card.appendChild(header);

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

        const reviveBtn = document.createElement('button');
        reviveBtn.className = 'revive-btn';
        reviveBtn.textContent = 'Revive';
        reviveBtn.addEventListener('click', async () => {
            const result = revivePiece(piece);
            if (!result || result.blocked) return;
            updatePieceCaptureState(piece);
            updatePiecePosition(piece);
            updatePieceNotation(piece);
            updatePieceImage(piece);
            updatePieceEmojis(piece);
            if (piece.imageSelect) piece.imageSelect.value = piece.image;
            refreshAllReviveButtons();
            await _postBoardState();
        });
        card.appendChild(reviveBtn);

        piece.positionTag = notationTag;
        piece.imageSelect = imageSelect;
        piece.reviveBtn = reviveBtn;
        piece.settingsCard = card;
        
        fragment.append(card);
    });

    settingsPanel.innerHTML = '';
    settingsPanel.appendChild(fragment);
};

const createPieceElement = (piece) => {
    const emojiPositions = ['tl', 'tr', 'bl', 'br'];
    const pieceEl = document.createElement('div');
    pieceEl.className = 'piece';
    pieceEl.id = `piece-${piece.slot}`;

    piece.emojiElements = emojiPositions.map(pos => {
        const emojiEl = document.createElement('span');
        emojiEl.className = `piece-emoji piece-emoji-${pos}`;
        emojiEl.style.display = 'none';
        pieceEl.appendChild(emojiEl);
        return emojiEl;
    });

    piece.element = pieceEl;

    updatePieceImage(piece);
    updatePieceCaptureState(piece);
    updatePiecePosition(piece);
    updatePieceEmojis(piece);

    return pieceEl;
};

export const renderPieces = () => {
    const fragment = document.createDocumentFragment();
    Object.values(state.pieces).forEach(piece => {
        fragment.appendChild(createPieceElement(piece));
    });

    piecesLayer.innerHTML = '';
    piecesLayer.appendChild(fragment);
    refreshAllReviveButtons();
};

// Creates DOM for a rule-spawned piece arriving mid-game from the server
export const ensurePieceDOM = (piece) => {
    if (piece.element) return;
    piecesLayer.appendChild(createPieceElement(piece));
};

// Removes the DOM element of a despawned piece (board reset cleanup)
export const removePieceDOM = (slot) => {
    const el = document.getElementById(`piece-${slot}`);
    if (el) el.remove();
};

// =============================================================================
// BOARD EFFECTS VISUAL LAYER
// =============================================================================

const boardEffectElements = {};

export const renderBoardEffectsLayer = () => {
    boardEffectsLayer.innerHTML = '';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const container = document.createElement('div');
            container.className = 'board-effect';
            container.style.left = `${col * SQUARE_SIZE}px`;
            container.style.top = `${row * SQUARE_SIZE}px`;
            container.style.display = 'none';
            boardEffectsLayer.appendChild(container);
            boardEffectElements[`${col},${row}`] = container;
        }
    }
};

export const updateSquareEffect = (col, row) => {
    const key = `${col},${row}`;
    const container = boardEffectElements[key];
    if (!container) return;
    const effects = state.boardEffects[key] || [];
    container.innerHTML = '';
    if (effects.length === 0) {
        container.style.display = 'none';
        return;
    }
    effects.forEach(name => {
        const span = document.createElement('span');
        span.className = 'board-effect-emoji';
        span.textContent = BOARD_EFFECT_EMOJI_MAP[name] || '';
        container.appendChild(span);
    });
    container.style.display = '';
};

// =============================================================================
// RANDOMIZER SQUARE HIGHLIGHT
// =============================================================================
// Displays a red dotted border on a board square for ~5 seconds, then fades out.

const HIGHLIGHT_DURATION = 5000;
const HIGHLIGHT_FADE_AT  = 4000;

const highlightEl = document.createElement('div');
highlightEl.className = 'square-highlight';
highlightEl.style.display = 'none';
highlightLayer.appendChild(highlightEl);

let highlightTimer = null;
let highlightFadeTimer = null;

const showHighlightVisual = (col, row, duration = HIGHLIGHT_DURATION) => {
    if (highlightTimer) clearTimeout(highlightTimer);
    if (highlightFadeTimer) clearTimeout(highlightFadeTimer);

    highlightEl.style.left = `${col * SQUARE_SIZE}px`;
    highlightEl.style.top = `${row * SQUARE_SIZE}px`;
    highlightEl.classList.remove('fading');
    highlightEl.style.display = '';

    const fadeStart = Math.max(0, duration - (HIGHLIGHT_DURATION - HIGHLIGHT_FADE_AT));
    highlightFadeTimer = setTimeout(() => {
        highlightEl.classList.add('fading');
    }, fadeStart);

    highlightTimer = setTimeout(() => {
        highlightEl.style.display = 'none';
        highlightEl.classList.remove('fading');
    }, duration);
};

const hideHighlight = () => {
    if (highlightTimer) clearTimeout(highlightTimer);
    if (highlightFadeTimer) clearTimeout(highlightFadeTimer);
    highlightEl.style.display = 'none';
    highlightEl.classList.remove('fading');
    state.highlightedSquare = null;
};

const showHighlight = async (col, row) => {
    state.highlightedSquare = { col, row, timestamp: Date.now() };
    showHighlightVisual(col, row);
    await _postBoardState();
};

export const syncHighlightFromServer = (serverHighlight) => {
    if (!serverHighlight || !serverHighlight.timestamp) {
        return;
    }
    const age = Date.now() - serverHighlight.timestamp;
    if (age >= HIGHLIGHT_DURATION) return;

    const cur = state.highlightedSquare;
    if (cur &&
        cur.col === serverHighlight.col &&
        cur.row === serverHighlight.row &&
        cur.timestamp === serverHighlight.timestamp) {
        return;
    }

    state.highlightedSquare = { ...serverHighlight };
    showHighlightVisual(serverHighlight.col, serverHighlight.row, HIGHLIGHT_DURATION - age);
};

// =============================================================================
// PIECE SELECTION HELPERS
// =============================================================================

export const handleSelectPiece = (slot) => {
    if (state.selectedSlot === slot) return;

    const previousSlot = state.selectedSlot;
    if (previousSlot) {
        updatePieceSelection(state.pieces[previousSlot], false);
    }
    
    const piece = selectPiece(slot);
    if (piece) {
        updatePieceSelection(piece, true);
    }
};

export const handleDeselectPiece = () => {
    const previousSlot = state.selectedSlot;
    if (previousSlot) {
        updatePieceSelection(state.pieces[previousSlot], false);
    }
    deselectPiece();
};

// =============================================================================
// BOARD RESET
// =============================================================================

export const handleResetBoard = () => {
    handleDeselectPiece();
    const { resetPieces, removedSlots } = resetBoard();
    removedSlots.forEach(removePieceDOM);
    resetPieces.forEach(piece => {
        updatePiecePosition(piece);
        updatePieceCaptureState(piece);
        updatePieceNotation(piece);
        updatePieceImage(piece);
        updatePieceEmojis(piece);
        if (piece.imageSelect) {
            piece.imageSelect.value = piece.image;
        }
    });
    refreshAllReviveButtons();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            updateSquareEffect(col, row);
        }
    }
    hideHighlight();
    clearLegalMoves();
    clearChoiceUI();
    renderGameOver(null);
    _currentlyHaveRules = false;
    _zoomPan.fitAndCenterContent(_boardSize, _boardSize);
    _zoomPan.resetInteractionState();
};

// =============================================================================
// RANDOMIZER SECTION
// =============================================================================
// Utility panel for randomly picking pieces, squares, or numbers.

const randomizerPanel = document.getElementById('randomizer-panel');

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randItem = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

const getAlivePieces = (colorFilter = null, typeFilter = null) => {
    return Object.values(state.pieces).filter(p => {
        if (p.captured) return false;
        if (colorFilter && p.color !== colorFilter) return false;
        if (typeFilter && !p.image.includes(typeFilter)) return false;
        return true;
    });
};

const getEmptySquares = () => {
    const empty = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (!getPieceAt(col, row)) empty.push({ col, row });
        }
    }
    return empty;
};

const randBtn = (text, onClick) => {
    const btn = document.createElement('button');
    btn.className = 'randomizer-btn';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
};

const randResult = () => {
    const span = document.createElement('span');
    span.className = 'randomizer-result';
    span.textContent = '—';
    return span;
};

const randInput = (placeholder, defaultVal) => {
    const input = document.createElement('input');
    input.className = 'randomizer-input';
    input.type = 'number';
    input.placeholder = placeholder;
    input.value = defaultVal;
    return input;
};

const randRow = (...elements) => {
    const row = document.createElement('div');
    row.className = 'randomizer-row';
    elements.forEach(el => {
        if (typeof el === 'string') {
            const lbl = document.createElement('span');
            lbl.className = 'randomizer-label';
            lbl.textContent = el;
            row.appendChild(lbl);
        } else {
            row.appendChild(el);
        }
    });
    return row;
};

const randSeparator = () => {
    const sep = document.createElement('div');
    sep.className = 'randomizer-separator';
    return sep;
};

export const renderRandomizerPanel = () => {
    randomizerPanel.innerHTML = '';

    // Random Integer (inclusive)
    const intMin = randInput('Min', 1);
    const intMax = randInput('Max', 8);
    const intResult = randResult();
    randomizerPanel.appendChild(randRow(
        'Random Int',
        intMin, intMax,
        randBtn('Generate', () => {
            const min = parseInt(intMin.value) || 0;
            const max = parseInt(intMax.value) || 0;
            intResult.textContent = min > max ? 'Invalid' : randInt(min, max);
        }),
        intResult,
    ));

    // Random Square
    const sqResult = randResult();
    randomizerPanel.appendChild(randRow(
        'Random Square',
        randBtn('Generate', () => {
            const col = randInt(0, 7);
            const row = randInt(0, 7);
            sqResult.textContent = toNotation(col, row);
            showHighlight(col, row);
        }),
        sqResult,
    ));

    // Random Empty Square
    const emptySqResult = randResult();
    randomizerPanel.appendChild(randRow(
        'Random Empty Square',
        randBtn('Generate', () => {
            const sq = randItem(getEmptySquares());
            emptySqResult.textContent = sq ? toNotation(sq.col, sq.row) : 'None found';
            if (sq) showHighlight(sq.col, sq.row);
        }),
        emptySqResult,
    ));

    randomizerPanel.appendChild(randSeparator());

    // Random Piece (any team)
    const anyPieceResult = randResult();
    randomizerPanel.appendChild(randRow(
        'Random Piece',
        randBtn('Generate', () => {
            const p = randItem(getAlivePieces());
            anyPieceResult.textContent = p ? `${p.label} (${p.notation})` : 'None found';
            if (p) showHighlight(p.position.col, p.position.row);
        }),
        anyPieceResult,
    ));

    // Random White Piece
    const whitePieceResult = randResult();
    randomizerPanel.appendChild(randRow(
        'Random White Piece',
        randBtn('Generate', () => {
            const p = randItem(getAlivePieces('white'));
            whitePieceResult.textContent = p ? `${p.label} (${p.notation})` : 'None found';
            if (p) showHighlight(p.position.col, p.position.row);
        }),
        whitePieceResult,
    ));

    // Random Black Piece
    const blackPieceResult = randResult();
    randomizerPanel.appendChild(randRow(
        'Random Black Piece',
        randBtn('Generate', () => {
            const p = randItem(getAlivePieces('black'));
            blackPieceResult.textContent = p ? `${p.label} (${p.notation})` : 'None found';
            if (p) showHighlight(p.position.col, p.position.row);
        }),
        blackPieceResult,
    ));

    randomizerPanel.appendChild(randSeparator());

    // Random piece by type (Pawn, Rook, Knight, Bishop)
    const pieceTypes = ['Pawn', 'Rook', 'Knight', 'Bishop'];
    pieceTypes.forEach(type => {
        const result = randResult();
        randomizerPanel.appendChild(randRow(
            `${type}`,
            randBtn(`Random ${type}`, () => {
                const p = randItem(getAlivePieces(null, type));
                result.textContent = p ? `${p.label} (${p.notation})` : 'None found';
                if (p) showHighlight(p.position.col, p.position.row);
            }),
            randBtn(`White ${type}`, () => {
                const p = randItem(getAlivePieces('white', type));
                result.textContent = p ? `${p.label} (${p.notation})` : 'None found';
                if (p) showHighlight(p.position.col, p.position.row);
            }),
            randBtn(`Black ${type}`, () => {
                const p = randItem(getAlivePieces('black', type));
                result.textContent = p ? `${p.label} (${p.notation})` : 'None found';
                if (p) showHighlight(p.position.col, p.position.row);
            }),
            result,
        ));
    });
};

// =============================================================================
// PIECE CONTEXT MENU (Double Right-Click)
// =============================================================================

const pieceContextMenu = document.createElement('div');
pieceContextMenu.className = 'piece-context-menu';
pieceContextMenu.style.display = 'none';
document.body.appendChild(pieceContextMenu);

export const dismissPieceContextMenu = () => {
    pieceContextMenu.style.display = 'none';
    pieceContextMenu.innerHTML = '';
};

export const showContextMenu = (clientX, clientY, square, piece) => {
    dismissPieceContextMenu();

    // ==========================================================
    // PIECE SECTION (only when double-right-clicking on a piece)
    // ==========================================================
    if (piece) {

    const header = document.createElement('div');
    header.className = 'context-menu-header';
    header.textContent = piece.label;
    pieceContextMenu.appendChild(header);

    const captureOption = document.createElement('div');
    captureOption.className = 'context-menu-option context-menu-capture';
    captureOption.textContent = '\u2620\uFE0F Capture';
    captureOption.addEventListener('click', async () => {
        dismissPieceContextMenu();
        capturePiece(piece);
        updatePieceCaptureState(piece);
        updatePieceEmojis(piece);
        refreshAllReviveButtons();
        handleDeselectPiece();
        playCaptureSounds();
        await _postBoardState();
    });
    pieceContextMenu.appendChild(captureOption);

    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    pieceContextMenu.appendChild(separator);

    const emojiList = document.createElement('div');
    emojiList.className = 'context-menu-emoji-list';

    const removeBtn = document.createElement('div');
    removeBtn.className = 'context-menu-option context-menu-emoji-remove';
    removeBtn.textContent = 'Remove All';
    removeBtn.addEventListener('click', async () => {
        dismissPieceContextMenu();
        piece.emojis = [];
        updatePieceEmojis(piece);
        handleDeselectPiece();
        await _postBoardState();
    });
    emojiList.appendChild(removeBtn);

    PIECE_STATUS_OPTIONS.forEach(option => {
        const emojiBtn = document.createElement('div');
        emojiBtn.className = 'context-menu-option';
        emojiBtn.textContent = `${option.emoji}  ${option.name}`;
        emojiBtn.addEventListener('click', async () => {
            dismissPieceContextMenu();
            if (piece.emojis.length >= MAX_PIECE_EMOJIS) return;
            piece.emojis.push(option.name);
            updatePieceEmojis(piece);
            handleDeselectPiece();
            await _postBoardState();
        });
        emojiList.appendChild(emojiBtn);
    });
    pieceContextMenu.appendChild(emojiList);

    } else {
    // ==========================================================
    // BOARD EFFECTS SECTION (only on empty squares)
    // ==========================================================

    const boardHeader = document.createElement('div');
    boardHeader.className = 'context-menu-header';
    boardHeader.textContent = `Board (${toNotation(square.col, square.row)})`;
    pieceContextMenu.appendChild(boardHeader);

    const boardEffectsList = document.createElement('div');
    boardEffectsList.className = 'context-menu-emoji-list';

    const boardRemoveBtn = document.createElement('div');
    boardRemoveBtn.className = 'context-menu-option context-menu-emoji-remove';
    boardRemoveBtn.textContent = 'Remove All';
    boardRemoveBtn.addEventListener('click', async () => {
        dismissPieceContextMenu();
        const key = `${square.col},${square.row}`;
        state.boardEffects[key] = [];
        updateSquareEffect(square.col, square.row);
        handleDeselectPiece();
        await _postBoardState();
    });
    boardEffectsList.appendChild(boardRemoveBtn);

    BOARD_EFFECT_OPTIONS.forEach(option => {
        const effectBtn = document.createElement('div');
        effectBtn.className = 'context-menu-option';
        effectBtn.textContent = `${option.emoji}  ${option.name}`;
        effectBtn.addEventListener('click', async () => {
            dismissPieceContextMenu();
            const key = `${square.col},${square.row}`;
            if (!state.boardEffects[key]) state.boardEffects[key] = [];
            state.boardEffects[key].push(option.name);
            updateSquareEffect(square.col, square.row);
            handleDeselectPiece();
            await _postBoardState();
        });
        boardEffectsList.appendChild(effectBtn);
    });
    pieceContextMenu.appendChild(boardEffectsList);

    }

    pieceContextMenu.style.left = `${clientX}px`;
    pieceContextMenu.style.top = `${clientY}px`;
    pieceContextMenu.style.display = '';

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

// Dismiss on any mousedown outside the menu
document.addEventListener('mousedown', event => {
    if (pieceContextMenu.style.display !== 'none' && !pieceContextMenu.contains(event.target)) {
        dismissPieceContextMenu();
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismissPieceContextMenu();
});

pieceContextMenu.addEventListener('contextmenu', event => {
    event.preventDefault();
});

// =============================================================================
// TITLE AND RULE VISUALS
// =============================================================================

export function updateTitleVisuals(currentPlayer, userId = "") {
    if (userId === getUserId()) {
        console.log("We were the ones who initated the turn event, so don't update the title")
        return;
    }

    const titleCard = document.getElementById('title-card');
    const front = titleCard.querySelector('.card-front');
    const back = titleCard.querySelector('.card-back');

    const isWhiteTurn = currentPlayer === 'white';
    const isFlipped = titleCard.classList.contains("flip");
    const hiddenFace = isFlipped ? front : back;

    hiddenFace.textContent = isWhiteTurn ? "White Turn" : "Black Turn";
    hiddenFace.classList.remove("white-turn", "black-turn");
    hiddenFace.classList.add(isWhiteTurn ? "white-turn" : "black-turn");

    requestAnimationFrame(() => {
        titleCard.classList.toggle("flip");
    });
}

export function closeNewRuleVisuals(userId = "") {
    if (userId === getUserId()) {
        console.log("We were the ones who initated the rule choice, so we are ignoring this event")
        return;
    }
    stopBackground();
    document.getElementById('viewport').classList.remove("choices-mode");
    document.getElementById('new-rules').classList.add("hidden");
    _zoomPan.fitAndCenterContent(_boardSize, _boardSize);         
}

// =============================================================================
// TURN UPDATE VIEW
// =============================================================================
// Called by the network layer when a turn event is received from the server.
// Handles all DOM updates for current rules, new rule choices, and turn display.

export function renderTurnUpdate({ newTurnState, playerChanged, ruleJustExpired, userId, onRuleSelect }) {
    if (playerChanged) {
        updateTitleVisuals(turns.currentPlayer, userId);
    }

    const nextNewRulesText = document.getElementById('next-turn-with-new-rules');
    nextNewRulesText.textContent = `New Rules In ${(newTurnState.nextTurnWithNewRules - newTurnState.currentTurn)} Turns`;
    
    if (ruleJustExpired) {
        playRuleExpiredSound();
    }

    const gameSectionEl = document.getElementById('game-section');
    const currentRulesEl = document.getElementById("current-rules-section");
    currentRulesEl.innerHTML = "";
    if (turns.currentRules.length === 0) {
        gameSectionEl.classList.remove('squashed');
        if (_currentlyHaveRules) {
            _zoomPan.fitAndCenterContent(_boardSize, _boardSize);
            _currentlyHaveRules = false;
        }
    } else {
        gameSectionEl.classList.add('squashed');
        if (!_currentlyHaveRules) {
            _zoomPan.fitAndCenterContent(_boardSize, _boardSize);
            _currentlyHaveRules = true;
        }
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
    }
    
    if (newTurnState.justSelectedRule) {
        closeNewRuleVisuals(userId);
    }

    if (turns.newRuleChoices.length > 0) {
        document.getElementById('viewport').classList.add("choices-mode");
        const newRulesEl = document.getElementById('new-rules');
        stopBackground();
        newRulesEl.innerHTML = '';
        newRulesEl.classList.remove("hidden");
        _zoomPan.fitAndCenterContent(_boardSize, _boardSize);  

        for (const nextRule of turns.newRuleChoices) {
            const newRuleCard = document.createElement('div');
            newRuleCard.classList.add('new-rule-card');

            const nextTitle = document.createElement('p');
            nextTitle.classList.add('new-rule-title');
            nextTitle.textContent = nextRule.title;
            newRuleCard.append(nextTitle);

            const sep = document.createElement('div');
            sep.className = 'new-rules-separator';
            newRuleCard.append(sep);

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

            if (nextRule.kingImmune) {
                const crownEmoji = document.createElement('span');
                crownEmoji.classList.add('new-rule-king-immune');
                crownEmoji.textContent = '\uD83D\uDC51';
                newRuleCard.append(crownEmoji);
            }
            newRuleCard.addEventListener('click', async () => {
                if (document.getElementById('ignore-turns-checkbox').checked) return;
                // In enforced play only the player to move picks the rule
                if (_onRuleCardClick && !_onRuleCardClick()) return;
                closeNewRuleVisuals();
                if (onRuleSelect) {
                    await onRuleSelect(turns.newRuleChoices.indexOf(nextRule));
                }
            });
            newRulesEl.append(newRuleCard);
        }

        startBackground(newRulesEl);
    }    
}

// =============================================================================
// LEGAL MOVE INDICATORS (Enforced PVP mode)
// =============================================================================
// Renders a dot on every square the selected piece may legally move to.

const legalMovesLayer = document.createElement('div');
legalMovesLayer.className = 'legal-moves-layer';
document.getElementById('chess-stage').appendChild(legalMovesLayer);

export const renderLegalMoves = (moves) => {
    legalMovesLayer.innerHTML = '';
    for (const move of moves) {
        const dot = document.createElement('div');
        dot.className = move.captureSlot ? 'legal-move-dot capture' : 'legal-move-dot';
        if (move.special === 'push') dot.classList.add('push');
        dot.style.left = `${move.col * SQUARE_SIZE}px`;
        dot.style.top = `${move.row * SQUARE_SIZE}px`;
        legalMovesLayer.appendChild(dot);
    }
};

export const clearLegalMoves = () => {
    legalMovesLayer.innerHTML = '';
};

// =============================================================================
// PENDING CHOICE UI (rule decisions, synced across clients)
// =============================================================================
// The choosing player sees a banner with the prompt + countdown, and the
// candidate pieces/squares glow on the board. The other player sees a
// "waiting" banner. Clicks are handled by app.js via getChoiceCandidateAt.

const choiceBanner = document.createElement('div');
choiceBanner.className = 'choice-banner hidden';
document.body.appendChild(choiceBanner);

const choiceLayer = document.createElement('div');
choiceLayer.className = 'choice-layer';
document.getElementById('chess-stage').appendChild(choiceLayer);

let _activeChoice = null;

// Expands a choice's candidates into highlightable squares
const choiceCandidateSquares = (choice) => {
    const squares = [];
    if (choice.kind === 'piece') {
        for (const slot of choice.candidates) {
            const piece = state.pieces[slot];
            if (piece && !piece.captured) squares.push({ ...piece.position, value: slot });
        }
    } else if (choice.kind === 'square') {
        for (const key of choice.candidates) {
            const [col, row] = String(key).split(',').map(Number);
            squares.push({ col, row, value: key });
        }
    } else if (choice.kind === 'column') {
        for (const col of choice.candidates) {
            for (let row = 0; row < 8; row++) squares.push({ col: Number(col), row, value: Number(col) });
        }
    } else if (choice.kind === 'row') {
        for (const row of choice.candidates) {
            for (let col = 0; col < 8; col++) squares.push({ col, row: Number(row), value: Number(row) });
        }
    }
    return squares;
};

// Returns the candidate "selection" value at a clicked square, or undefined
export const getChoiceCandidateAt = (col, row) => {
    if (!_activeChoice) return undefined;
    const hit = choiceCandidateSquares(_activeChoice).find(sq => sq.col === col && sq.row === row);
    return hit ? hit.value : undefined;
};

export const renderChoiceUI = ({ choice, isMine, secondsLeft }) => {
    _activeChoice = isMine ? choice : null;
    choiceLayer.innerHTML = '';
    if (!choice) {
        choiceBanner.classList.add('hidden');
        return;
    }

    choiceBanner.classList.remove('hidden');
    if (isMine) {
        choiceBanner.innerHTML = `
            <span class="choice-prompt">${choice.prompt}</span>
            <span class="choice-timer">${secondsLeft}s</span>`;
        choiceBanner.classList.add('mine');
        for (const sq of choiceCandidateSquares(choice)) {
            const el = document.createElement('div');
            el.className = 'choice-candidate';
            el.style.left = `${sq.col * SQUARE_SIZE}px`;
            el.style.top = `${sq.row * SQUARE_SIZE}px`;
            choiceLayer.appendChild(el);
        }
    } else {
        choiceBanner.classList.remove('mine');
        choiceBanner.innerHTML = `
            <span class="choice-prompt">Waiting for ${choice.color} to choose... (${choice.prompt})</span>
            <span class="choice-timer">${secondsLeft}s</span>`;
    }
};

export const clearChoiceUI = () => {
    _activeChoice = null;
    choiceLayer.innerHTML = '';
    choiceBanner.classList.add('hidden');
};

// =============================================================================
// SEAT UI (who is playing which color)
// =============================================================================

export const renderSeats = ({ seats, mySeat, onClaim, onRelease }) => {
    const container = document.getElementById('seats-panel');
    if (!container) return;
    container.innerHTML = '';

    for (const seat of ['white', 'black']) {
        const button = document.createElement('button');
        button.className = `seat-btn seat-${seat}`;
        const occupant = seats[seat];
        if (mySeat === seat) {
            button.textContent = `You are ${seat.toUpperCase()} — click to leave`;
            button.classList.add('mine');
            button.addEventListener('click', onRelease);
        } else if (occupant) {
            // Private game: an occupied seat is still claimable, so anyone can
            // take over a colour left behind by a stale browser session
            button.textContent = `Play as ${seat.toUpperCase()} — take over`;
            button.classList.add('taken');
            button.addEventListener('click', () => onClaim(seat));
        } else {
            button.textContent = `Play as ${seat.toUpperCase()}`;
            button.addEventListener('click', () => onClaim(seat));
        }
        container.appendChild(button);
    }
};

// =============================================================================
// GAME OVER OVERLAY
// =============================================================================

const gameOverOverlay = document.createElement('div');
gameOverOverlay.className = 'game-over-overlay hidden';
document.body.appendChild(gameOverOverlay);

export const renderGameOver = (gameOver) => {
    if (!gameOver) {
        gameOverOverlay.classList.add('hidden');
        gameOverOverlay.innerHTML = '';
        return;
    }
    gameOverOverlay.classList.remove('hidden');
    gameOverOverlay.innerHTML = `
        <div class="game-over-card">
            <h1>${gameOver.winner.toUpperCase()} WINS!</h1>
            <p>${gameOver.reason}</p>
            <p class="game-over-hint">Press Reset Board to play again</p>
        </div>`;
};

// =============================================================================
// EVENT TOASTS (server-side rule/engine happenings)
// =============================================================================

const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

const seenEventKeys = new Set();

export const showEvents = (events) => {
    if (!events || !events.length) return;
    // Both the board-event and turn-event carry the same events array —
    // de-dupe so each batch only renders once
    const key = JSON.stringify(events);
    if (seenEventKeys.has(key)) return;
    seenEventKeys.add(key);
    setTimeout(() => seenEventKeys.delete(key), 3000);

    for (const text of events.slice(0, 8)) {
        const toast = document.createElement('div');
        toast.className = 'event-toast';
        toast.textContent = text;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('fading'), 5200);
        setTimeout(() => toast.remove(), 6000);
    }
};
