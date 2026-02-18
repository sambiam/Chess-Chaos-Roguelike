
// =============================================================================
// API FUNCTIONS
// =============================================================================

// HTTP GET helper function
export async function apiGet(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString(); // Build query string from params object,  e.g., { playerId: "mario", limit: 10 } becomes "?playerId=mario&limit=10"
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;    
    const response = await fetch(url); // Send the HTTP request
    const data = await response.json();
    return data;
}

// HTTP POST helper function
export async function apiPost(endpoint, body = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json', // Tell the server we're sending JSON
        },
        body: JSON.stringify(body), // Convert JS object to JSON string
    });
    const data = await response.json();
    return data;
    // return response;
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
