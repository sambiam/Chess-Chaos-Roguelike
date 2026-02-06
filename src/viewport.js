// =============================================================================
// VIEWPORT / ZOOM-PAN SYSTEM
// =============================================================================
// This system allows the user to pan (drag) and zoom the chess board within
// a fixed viewport area. Here's how it works:
//
// STRUCTURE:
//   - viewport: The visible window (fixed size, acts as a "camera frame")
//   - stage: The container that holds the board (this element gets transformed)
//   - The stage is positioned with CSS transform: translate(tx, ty) scale(scale)
//
// KEY CONCEPTS:
//   - tx, ty: Translation offsets (how far the stage is shifted in pixels)
//   - scale: Zoom level (1 = 100%, 2 = 200%, 0.5 = 50%)
//   - The transform is applied to the stage, making everything inside it
//     move and scale together as a single unit
//
// COORDINATE SPACES:
//   - Screen coords: Where mouse events occur (relative to browser window)
//   - Viewport coords: Position within the viewport element
//   - World coords: Position on the actual board (unaffected by zoom/pan)
//
// THE MAGIC - apply():
//   This function sets: stage.style.transform = translate(tx, ty) scale(scale)
//   - translate moves the entire stage left/right/up/down
//   - scale zooms everything in the stage from the top-left corner (0,0)
//   - Together, these let you pan around and zoom into any part of the board

export function createZoomPan(viewport, stage, { zoomMultiplier = 0.7, contentSize = 800 } = {}) {
    const MIN_SCALE = 0.4;   // Maximum zoom out (40%)
    const MAX_SCALE = 3.5;   // Maximum zoom in (350%)
    let scale = 1;           // Current zoom level
    let tx = 0;              // Horizontal offset in pixels
    let ty = 0;              // Vertical offset in pixels
    let dragging = false;    // Is user currently dragging?
    let lastX = 0;           // Last mouse X position (for drag delta calculation)
    let lastY = 0;           // Last mouse Y position
    let hasInteracted = false; // Tracks if user has manually panned/zoomed

    // Constrains a value between min and max
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // Marks that user has interacted with the viewport
    const markInteraction = () => { hasInteracted = true; };

    // CORE FUNCTION: Applies the current transform to the stage element
    // This single line is what makes all zooming and panning visually happen
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

    // Zooms in/out centered on a specific screen position
    // This keeps the point under the cursor stationary while zooming
    const zoomAround = (sx, sy, factor) => {
        markInteraction();
        const world = screenToWorld(sx, sy);
        const newScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
        // Adjust translation so the world point stays under the cursor
        tx += world.x * (scale - newScale);
        ty += world.y * (scale - newScale);
        scale = newScale;
        apply();
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

    // Resets interaction state (called when board resets)
    const resetInteractionState = () => { hasInteracted = false; };

    // Checks if user has interacted with viewport
    const getHasInteracted = () => hasInteracted;

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

    // Prevent native drag behavior (fixes drag interference on images/elements)
    viewport.addEventListener('dragstart', event => {
        event.preventDefault();
    });

    // Mouse wheel: zoom in/out centered on cursor position
    viewport.addEventListener('wheel', event => {
        event.preventDefault();
        const factor = Math.exp((-event.deltaY) * 0.0015 * zoomMultiplier);
        zoomAround(event.clientX, event.clientY, factor);
    }, { passive: false });

    // Left mouse button: start dragging to pan
    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); // Prevent text selection and native drag initiation
        markInteraction();
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        viewport.classList.add('dragging');
        viewport.setPointerCapture(event.pointerId);
    });

    // Mouse move: pan the view while dragging
    viewport.addEventListener('pointermove', event => {
        if (!dragging) return;
        tx += event.clientX - lastX;
        ty += event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        apply();
    });

    const stopDragging = () => {
        dragging = false;
        viewport.classList.remove('dragging');
    };

    viewport.addEventListener('pointerup', event => {
        if (event.button === 0) {
            try { viewport.releasePointerCapture(event.pointerId); } catch {}
            stopDragging();
        }
    });

    viewport.addEventListener('lostpointercapture', stopDragging);

    // Double-click: reset to default zoom and center
    viewport.addEventListener('dblclick', () => {
        setTransform({ scale: 1 });
        centerContent();
    });

    return { 
        setTransform, 
        screenToWorld, 
        centerContent,
        resetInteractionState,
        hasInteracted: getHasInteracted,
        toGridSquare
    };
}
