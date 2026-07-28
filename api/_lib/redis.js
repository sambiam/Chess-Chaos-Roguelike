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

const firstNonEmpty = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim() !== '') return value.trim();
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
        env.KV_REST_API_URL,
        env.UPSTASH_REDIS_REST_URL,
        env.REDIS_REST_API_URL,
    );
    const restToken = firstNonEmpty(
        env.KV_REST_API_TOKEN,
        env.UPSTASH_REDIS_REST_TOKEN,
        env.REDIS_REST_API_TOKEN,
    );
    if (restUrl && restToken) {
        return { url: restUrl, token: restToken, error: '' };
    }

    const connectionUrl = firstNonEmpty(env.REDIS_URL, env.KV_URL);
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
            'in your environment variables, then redeploy.',
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
export const UNDO_STACK_MAX = 50;
