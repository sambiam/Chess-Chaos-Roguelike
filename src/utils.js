
// =============================================================================
// API FUNCTIONS
// =============================================================================

// Reads a JSON body, but never throws: a crashed serverless function answers
// with an HTML error page, and an unhandled parse error used to take the whole
// click handler down with it (leaving the game silently unresponsive).
async function readJsonResponse(response, endpoint) {
    try {
        return await response.json();
    } catch {
        console.error(`Non-JSON response from ${endpoint} (HTTP ${response.status})`);
        return {
            success: false,
            message: `${endpoint} returned HTTP ${response.status}`,
        };
    }
}

// HTTP GET helper function
export async function apiGet(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString(); // Build query string from params object,  e.g., { playerId: "mario", limit: 10 } becomes "?playerId=mario&limit=10"
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    let response;
    try {
        response = await fetch(url); // Send the HTTP request
    } catch (error) {
        console.error(`Network error calling ${endpoint}:`, error);
        return { success: false, message: 'network error — could not reach the server' };
    }
    return readJsonResponse(response, endpoint);
}

// HTTP POST helper function
export async function apiPost(endpoint, body = {}) {
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json', // Tell the server we're sending JSON
            },
            body: JSON.stringify(body), // Convert JS object to JSON string
        });
    } catch (error) {
        console.error(`Network error calling ${endpoint}:`, error);
        return { success: false, message: 'network error — could not reach the server' };
    }
    return readJsonResponse(response, endpoint);
}

// Returns this browser's unique ID (or generates a new one if they don't have it already)
export function getUserId() {
    let id = localStorage.getItem('userId');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('userId', id);
    }
    return id;
}

// A per-TAB id, regenerated on every page load. userId lives in localStorage,
// so every tab of the same browser shares it — and skipping board broadcasts
// "we sent ourselves" by userId meant a second tab also skipped its sibling's
// updates, including Reset Board. It then sat on a board full of pieces the
// server had deleted and posted them back on its next action.
const tabId = crypto.randomUUID();
export const getTabId = () => tabId;

// =============================================================================
// SOUND EFFECTS
// =============================================================================

const randomItem = list => list[Math.floor(Math.random() * list.length)];

export const playCaptureSounds = () => {
    [randomItem(hitSoundFiles), randomItem(audienceSoundFiles)].forEach(url => {
        const sfx = new Audio(url);
        sfx.volume = 0.8;
        sfx.play().catch(() => {});
    });
};

const ruleExpiredSoundFile = '/sounds/Peggle%20Free%20Ball%201%20(Quiet%20V3).wav';

export const playRuleExpiredSound = () => {
    const sfx = new Audio(ruleExpiredSoundFile);
    sfx.volume = 0.8;
    sfx.play().catch(() => {});
};

// =============================================================================
// ASSET LISTS
// =============================================================================

// Sound effects played when a piece captures another
const hitSoundFiles = [
    'hit sound 1.wav', 'hit sound 2.wav', 'hit sound 3.wav', 'hit sound 4.wav'
].map(name => `/sounds/${encodeURIComponent(name)}`);

const audienceSoundFiles = [
    'audience sound 1.wav', 'audience sound 2.wav', 'audience sound 3.wav', 'audience sound 4.wav'
].map(name => `/sounds/${encodeURIComponent(name)}`);
