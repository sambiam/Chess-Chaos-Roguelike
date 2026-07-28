# Chess Chaos Roguelike

A chess game where you pick a new custom rule every 3 turns.

Frontend is all written in vanilla JS and CSS, server is vanilla JS Vercel with a Redis DB to store the game state and Pusher to send live updates to clients. Written and designed by DougDoug, albeit with Ai doing a lot of the frontend logic (in particular the viewport, basic piece functionality, QoL features like the randomizer and settings, the animation effects, large chunks of the css). 

To run this you'd have to set up your own Vercel server and associated Redis DB. But honestly if you know how to do that, it  makes way more sense to just go make your own version of this that doesn't use Vercel, if I was starting over I would absolutely not use a serverless backend, this thing became a massive headache by the end.
If you just want to see the list of all rules, that's in /shared/rules.js.
Feel free to use this for whatever you want! (although again you probably shouldn't)

---

## Enforced PVP mode

The game is now a proper PVP game — every rule (standard chess movement AND all the chaos rules) is enforced automatically by a rules engine, with no manual adjudication needed:

- **Seats:** each player claims White or Black at the top of the page. You can only move your own pieces, on your own turn.
- **Server-authoritative:** clients send move *intents* to `/api/game`; the server engine validates legality (piece movesets, path blocking, castling, en passant, promotion, plus every active chaos rule) and applies all consequences (mines, portals, kamikaze chains, soul links, etc). Illegal moves are rejected — a modified client can't cheat.
- **Legal move hints:** selecting one of your pieces highlights every square it may legally move to under the current rules.
- **Rule choices:** rules that need a decision (Mind Control, Sophie's Choice, Mr Freeze, Bottomless Pit, ...) pop a synced prompt — the choosing player clicks a highlighted piece/square/column, the other player sees a "waiting" banner, and the choice auto-resolves sensibly after 60 seconds.
- **Win condition:** destroy the enemy King (by capture or by chaos). Check/checkmate isn't used — with Kings teleporting through portals and dying to time bombs, king-capture is the only sane referee.
- **Pass:** if you truly have no legal move, a Pass button appears (verified server-side).
- **Sandbox Mode:** the checkbox in the top corner (Tab hotkey) switches back to the original free-for-all board — manual moves, the randomizer, piece settings, and emoji tools — for streamers who want to run the game by hand.

Engine tests live in `tests/engine.test.mjs` — run with `npm test`.

---

## Running your own instance (to play with friends)

You need three free accounts: Vercel (hosting), Upstash (Redis), and Pusher (live sync). All have generous free tiers that easily cover a couple of people playing casually.

1. **Fork/push this repo to your own GitHub**, then go to [vercel.com](https://vercel.com), "Add New Project", and import it.
2. **Add Redis:** in the Vercel project, go to the Storage tab and add an "Upstash" (Redis) integration/database. This auto-sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. **Add Pusher:** create a free app at [dashboard.pusher.com](https://dashboard.pusher.com) (Channels product, any cluster). Grab the App ID, key, secret, and cluster from its "App Keys" page.
4. **Set environment variables** in the Vercel project's Settings → Environment Variables (see `.env.example` for the full list):
   - `CHESS_SECRET` — a password you and your friend will share to get past the login modal.
   - `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` — from step 3.
   - `VITE_PUSHER_KEY`, `VITE_PUSHER_CLUSTER` — same key/cluster as above, exposed to the frontend build (Vite only ships `VITE_`-prefixed vars to the client). These are **required** — the app throws on startup if they're missing, so you don't accidentally end up sharing a live channel with someone else's deployment.
5. **Deploy.** Vercel will build and give you a URL — share that URL and the `CHESS_SECRET` password with your friend, and you're both playing the same game.

For local dev, copy `.env.example` to `.env.local`, run `vercel dev` (for the API routes) and `npm run dev` (for the Vite frontend, which proxies `/api` to `localhost:3000` per `vite.config.js`).

---

## High level stuff

| Component | Description |
|---|---|
| **Frontend App** | Everything in /src. Vanilla JS single-page app (Vite). Renders the chess board, handles the piece movement and context menus, handles the extra features like randomizer selector, and receives updates from the server. |
| **Assets** | Everything in /public. Contains the chess piece images and the sounds. |
| **Vercel Backend** | Server side logic for a Vercel server that tracks the state of the board, the turns, and the rules, plus Redis to store state and Pusher to send client updates |

---

## File Explanations

### `src/` — Frontend

Dude this is where it's a mess, the frontend started as a single file but is so confusing at this point:
| File | What it does |
|---|---|
| `src/app.js` | Main entry point, wires up the module, handles right-click input for updating pieces, posts board state to the server after each move, manages the password login modal. |
| `src/board-state.js` | Stores client-side game state (pieces, selected slot, board effects, turn data) and the logic for moving, capturing, reviving, resetting, etc. |
| `src/board-view.js` | Renders actual DOM, creates and updates piece elements, the settings panel (which lets you update the piece images), the board effects layer, the randomizer panel, and the rule chooser UI. |
| `src/network.js` | Initializes the Pusher WebSocket connection, receives incoming board/turn events from the server, and syncs the server updates into the frontend board |
| `src/viewport.js` | The zoom-and-pan system for the chess board (with zooming, dragging, resetting, etc) |
| `src/utils.js` | Various helper functions |
| `src/animated-bg.js` | Logic for 4 animated background effects that are used on the page background and new rule chooser panel. |
| `src/style.css` | Absolutely gargantuan mess of styling for the whole app |

### `api/` — Vercel Serverless Functions

This also became a disaster over time. The "board state" and the "turns" state are tracked separately, because they are sometimes updated independently. Board state represents all the pieces on the board and their state (plus things like their emojis, the currently selected spot on the board, etc). Turn state tracks the current turn we're on, whose turn it is, any currently running rules, and any new rule choices that the client must pick. Basically board state is just the chess board itself, turn state is about the roguelike rules.

| File | What it does |
|---|---|
| `api/auth.js` | GET endpoint that checks the client password against the `CHESS_SECRET` Vercel environment variable |
| `api/board-state.js` | GET returns the current board state from Redis. POST saves a new board state and creates a move history snapshop, fires a Pusher to all clients with the new board state. (Sandbox Mode only) |
| `api/game.js` | **The enforced-PVP endpoint.** Handles `MOVE`, `PASS`, `CHOICE`, `CLAIM_SEAT`, `RELEASE_SEAT`. Validates everything against the shared rules engine and broadcasts the authoritative result. |
| `api/turns.js` | GET returns turn/rules state; POST handles `RESET_TURNS`, `INCREMENT_TURN` (Sandbox Mode turn advance), and `SELECT_RULE` — which now actually EXECUTES the chosen rule on the board. |
| `api/undo.js` | Endpoint that pulls the most recent board/turn state and rolls back all the clients via Pusher |
| `api/_lib/redis.js` | Util helper for the Redis client. |
| `api/_lib/pusher.js` | Util helper for the Pusher client. |

### `shared/` — The Rules Engine (used by both client and server)

| File | What it does |
|---|---|
| `shared/defs.js` | Piece types, status emoji + board effect definitions, board math helpers. |
| `shared/rules.js` | The list of ALL possible custom rules (moved here from `api/rules.js`). |
| `shared/engine.js` | Legal move generation (with every rule modifier), move application, the death pipeline (soul link / kamikaze / immunity), spawning, promotion, win detection. |
| `shared/effects.js` | Executes each rule: instant effects, timed-rule setup, the synced player-choice system, end-of-turn effects (portals, blood sacrifice), and expiry effects (living bomb, time bomb, ...). |

### Root

| File | What it does |
|---|---|
| `index.html` | HTML shell with the core components: board viewport, UI panels, password modal. |
| `vite.config.js` | Vite build configuration. |
| `package.json` | Project dependencies (Vite, Pusher, Upstash Redis, Vercel). |
