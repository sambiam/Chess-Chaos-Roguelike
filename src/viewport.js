// =============================================================================
// VIEWPORT / BOARD FITTING
// =============================================================================
// The board is FIXED in place. It is scaled once to fit the viewport and
// centered there, and it stays put: dragging with the mouse does not pan it and
// scrolling the wheel does not zoom it. Mouse input over the board belongs to
// the game (selecting and moving pieces), not to the camera.
//
// STRUCTURE:
//   - viewport: The visible window (fixed size, acts as a "camera frame")
//   - stage: The container that holds the board (this element gets transformed)
//   - The stage is positioned with CSS transform: translate(tx, ty) scale(scale)
//
// KEY CONCEPTS:
//   - tx, ty: Translation offsets (how far the stage is shifted in pixels)
//   - scale: Fit factor chosen so the whole board is visible in the viewport
//
// COORDINATE SPACES:
//   - Screen coords: Where mouse events occur (relative to browser window)
//   - Viewport coords: Position within the viewport element
//   - World coords: Position on the actual board (unaffected by the fit transform)
//
// screenToWorld()/toGridSquare() invert the transform, which is how a click
// anywhere on screen is mapped back to the board square underneath it.

export function createZoomPan(viewport, stage, { contentSize = 800 } = {}) {
    const MIN_SCALE = 0.4;   // Smallest fit factor we will apply
    const MAX_SCALE = 3.5;   // Largest fit factor we will apply
    let scale = 1;           // Current fit factor
    let tx = 0;              // Horizontal offset in pixels
    let ty = 0;              // Vertical offset in pixels

    // Constrains a value between min and max
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // CORE FUNCTION: Applies the current transform to the stage element
    const apply = () => {
        stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };

    // Converts screen coordinates to viewport-relative coordinates
    const screenToViewport = (sx, sy) => {
        const rect = viewport.getBoundingClientRect();
        return { x: sx - rect.left, y: sy - rect.top };
    };

    // Converts screen coordinates to world coordinates (actual board position)
    // This reverses the transform to find where on the board the mouse is pointing
    const screenToWorld = (sx, sy) => {
        const point = screenToViewport(sx, sy);
        return { x: (point.x - tx) / scale, y: (point.y - ty) / scale };
    };

    // Directly sets the transform values
    const setTransform = ({ scale: nextScale = scale, tx: nextTx = tx, ty: nextTy = ty } = {}) => {
        scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
        tx = nextTx;
        ty = nextTy;
        apply();
    };

    // Centers content of given dimensions within the viewport
    const centerContent = (contentWidth = contentSize, contentHeight = contentSize) => {
        const rect = viewport.getBoundingClientRect();
        tx = Math.floor((rect.width - contentWidth * scale) / 2);
        ty = Math.floor((rect.height - contentHeight * scale) / 2);
        apply();
    };

    // Fits content to viewport and centers it (guarantees entire content is visible)
    const fitAndCenterContent = (contentWidth = contentSize, contentHeight = contentSize) => {
        const rect = viewport.getBoundingClientRect();
        // Calculate scale needed to fit content within viewport (with small padding)
        const padding = 20; // Add some breathing room
        const scaleToFitWidth = (rect.width - padding) / contentWidth;
        const scaleToFitHeight = (rect.height - padding) / contentHeight;
        // Use the smaller scale to ensure content fits in both dimensions
        const fitScale = Math.min(scaleToFitWidth, scaleToFitHeight, 1.1); // Doug: if we want to prevent zooming in past 100%, set the value at 1
        scale = clamp(fitScale, MIN_SCALE, MAX_SCALE);

        tx = Math.floor((rect.width - contentWidth * scale) / 2);
        ty = Math.floor((rect.height - contentHeight * scale) / 2);
        apply();
    };

    // Kept for API compatibility: the board no longer has an interaction state,
    // so it is always considered "untouched" and re-fits on layout changes.
    const resetInteractionState = () => {};
    const getHasInteracted = () => false;

    // Converts screen click position to grid square (col, row)
    // Generic helper for any grid-based content
    const toGridSquare = (clientX, clientY, squareSize, gridWidth = 8, gridHeight = 8) => {
        const world = screenToWorld(clientX, clientY);
        const col = Math.floor(world.x / squareSize);
        const row = Math.floor(world.y / squareSize);
        if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) return null;
        return { col, row };
    };

    // --- EVENT LISTENERS ---
    // Only one: suppress the browser's native image drag so dragging across the
    // board never picks up a piece sprite as a drag ghost. No pan, no zoom.
    viewport.addEventListener('dragstart', event => {
        event.preventDefault();
    });

    return {
        setTransform,
        screenToWorld,
        centerContent,
        fitAndCenterContent,
        resetInteractionState,
        hasInteracted: getHasInteracted,
        toGridSquare
    };
}
