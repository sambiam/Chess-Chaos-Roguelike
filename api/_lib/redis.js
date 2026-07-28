import { Redis } from '@upstash/redis';

/*
REDIS CONNECTION

@upstash/redis talks to Upstash over HTTPS (the REST API), so it needs a
`https://...` endpoint plus a token — it cannot open a `redis://` TCP socket.

Different setups hand you those credentials under different names:
  - Vercel Storage / Vercel KV .............. KV_REST_API_URL       + KV_REST_API_TOKEN
  - Upstash console / integration ........... UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
  - Vercel Marketplace Redis / "Connect" .... REDIS_URL (rediss://default:<token>@<host>:6379)

The third form is the one most people end up with, and the old code only read
KV_REST_API_URL / KV_REST_API_TOKEN — so the client was built with an empty URL
and every request died with "Failed to parse URL from" / a 500 on the API.
We now accept all three, deriving the REST endpoint from an Upstash connection
URL when that is all we have.
*/

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/*
Integrations often namespace their variables — Vercel's Marketplace lets you
prefix a storage integration's vars per project, so the same credentials can
arrive as KV_REST_API_URL, CHESS_KV_REST_API_URL or chess_KV_REST_API_URL.

readEnv() takes the canonical name, prefers an exact match, and otherwise falls
back to any variable whose name ends with `_<CANONICAL>` (compared without
regard to case). Matching on the full canonical suffix keeps neighbours
distinct: KV_REST_API_READ_ONLY_TOKEN never satisfies KV_REST_API_TOKEN, and
KV_REST_API_URL never satisfies KV_URL. Ties are broken by sorting so the same
environment always resolves the same way.
*/
const readEnv = (env, canonical) => {
    const exact = clean(env[canonical]);
    if (exact) return exact;

    const suffix = `_${canonical.toUpperCase()}`;
    const matches = Object.keys(env)
        .filter(key => key.toUpperCase().endsWith(suffix) && clean(env[key]))
        .sort();
    return matches.length ? clean(env[matches[0]]) : '';
};

const firstNonEmpty = (...values) => {
    for (const value of values) {
        const trimmed = clean(value);
        if (trimmed) return trimmed;
    }
    return '';
};

// Turns a connection URL into the REST { url, token } pair @upstash/redis needs.
// Returns null when the URL cannot be used over HTTPS.
const deriveRestCredentials = (connectionUrl) => {
    let parsed;
    try {
        parsed = new URL(connectionUrl);
    } catch {
        return null;
    }

    // Already a REST endpoint (https://<db>.upstash.io) — the token may be
    // carried as the password, otherwise the caller supplies it separately.
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return {
            url: `${parsed.protocol}//${parsed.host}`,
            token: decodeURIComponent(parsed.password || ''),
        };
    }

    if (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') {
        // Upstash serves the REST API on the same hostname over port 443, and
        // the Redis password doubles as the REST token.
        if (!parsed.hostname.endsWith('upstash.io')) return null;
        return {
            url: `https://${parsed.hostname}`,
            token: decodeURIComponent(parsed.password || ''),
        };
    }

    return null;
};

export function resolveRedisCredentials(env = process.env) {
    const restUrl = firstNonEmpty(
        readEnv(env, 'KV_REST_API_URL'),
        readEnv(env, 'UPSTASH_REDIS_REST_URL'),
        readEnv(env, 'REDIS_REST_API_URL'),
    );
    const restToken = firstNonEmpty(
        readEnv(env, 'KV_REST_API_TOKEN'),
        readEnv(env, 'UPSTASH_REDIS_REST_TOKEN'),
        readEnv(env, 'REDIS_REST_API_TOKEN'),
    );
    if (restUrl && restToken) {
        return { url: restUrl, token: restToken, error: '' };
    }

    const connectionUrl = firstNonEmpty(readEnv(env, 'REDIS_URL'), readEnv(env, 'KV_URL'));
    if (connectionUrl) {
        const derived = deriveRestCredentials(connectionUrl);
        if (derived && derived.url && (derived.token || restToken)) {
            return { url: derived.url, token: derived.token || restToken, error: '' };
        }
        return {
            url: '',
            token: '',
            error:
                'REDIS_URL is set but is not an Upstash HTTPS/REST endpoint. This app uses ' +
                '@upstash/redis, which connects over HTTPS and cannot use a plain redis:// server. ' +
                'Set KV_REST_API_URL and KV_REST_API_TOKEN (Vercel Storage / Upstash console) instead.',
        };
    }

    return {
        url: '',
        token: '',
        error:
            'Redis is not configured. Set KV_REST_API_URL + KV_REST_API_TOKEN (or ' +
            'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or an Upstash REDIS_URL) ' +
            'in your environment variables, then redeploy. An integration prefix is fine — ' +
            'CHESS_KV_REST_API_URL and the like are picked up automatically. Note that a ' +
            'read-only token (KV_REST_API_READ_ONLY_TOKEN) is deliberately not used: the ' +
            'game writes board state on every move.',
    };
}

const credentials = resolveRedisCredentials();

export const redisConfigError = credentials.error;

if (redisConfigError) {
    console.error('[redis] ' + redisConfigError);
}

export const redis = new Redis({
    url: credentials.url,
    token: credentials.token,
});

// Guard for API handlers: replies 503 with an actionable message instead of
// letting every call fall through to an opaque 500.
export function redisUnavailable(res) {
    if (!redisConfigError) return false;
    res.status(503).json({
        success: false,
        message: redisConfigError,
        error: redisConfigError,
    });
    return true;
}

// Shared Redis key constants used across API handlers
export const REDIS_BOARD_CURRENT = 'board:status';
export const REDIS_TURNS_CURRENT = 'rules:status';
export const REDIS_UNDO_STACK = 'undo:stack';
export const REDIS_STATE_LOCK = 'state:lock';
export const UNDO_STACK_MAX = 50;

/*
STATE LOCK

Every handler that changes the game does read-modify-write across two Redis
hashes, and on Vercel these functions regularly take over a second (cold
starts). Without a lock two overlapping requests both read the OLD state and
the slower one's write wins, silently undoing the faster one.

That is not theoretical — it is the Hot Drop Queen bug. Pressing Reset Board
and then immediately playing fired the reset (board write + turn write) and a
MOVE at the same time; the MOVE had already read the pre-reset board, so its
write put the previous game's rule-spawned Queens straight back, along with the
old turn counter. The board looked clean until the first move re-materialised
everything.

So: serialize every mutation behind a short-lived lock, and take the read
INSIDE the lock so nobody ever acts on state somebody else is replacing.
*/

const LOCK_TTL_MS = 10000;      // generous: longer than any handler should run
const LOCK_RETRY_MS = 60;
const LOCK_MAX_WAIT_MS = 6000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Only release a lock we still own — a handler that overran its TTL must not
// delete the lock another request has since acquired.
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0`;

/*
Runs `fn` with exclusive access to the game state.

Returns whatever `fn` returns. If the lock cannot be acquired within
LOCK_MAX_WAIT_MS the work runs anyway rather than failing the player's move:
a rare racy write is a better outcome than a game that refuses to accept input
because a lock leaked. `contended` tells the caller which happened.
*/
export async function withStateLock(fn, { client = redis, maxWaitMs = LOCK_MAX_WAIT_MS } = {}) {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const deadline = Date.now() + maxWaitMs;
    let held = false;

    while (Date.now() < deadline) {
        try {
            held = Boolean(await client.set(REDIS_STATE_LOCK, token, { nx: true, px: LOCK_TTL_MS }));
        } catch (error) {
            // A lock we cannot take is not a reason to drop the player's move
            console.error('[redis] state lock unavailable, continuing unlocked:', error?.message);
            break;
        }
        if (held) break;
        await sleep(LOCK_RETRY_MS);
    }

    if (!held) {
        console.warn('[redis] proceeding without the state lock (timed out waiting)');
    }

    try {
        return await fn({ contended: !held });
    } finally {
        if (held) {
            try {
                await client.eval(RELEASE_SCRIPT, [REDIS_STATE_LOCK], [token]);
            } catch (error) {
                // The TTL will clear it; never fail a completed action on cleanup
                console.error('[redis] failed to release the state lock:', error?.message);
            }
        }
    }
}
