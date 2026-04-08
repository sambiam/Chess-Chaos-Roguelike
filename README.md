# Chess Chaos Roguelike

A chess game where you pick a new custom rule every 3 turns.

Frontend is all written in vanilla JS and CSS, server is vanilla JS Vercel with a Redis DB to store the game state and Pusher to send live updates to clients. Written and designed by DougDoug, albeit with Ai doing a lot of the frontend logic (in particular the viewport, basic piece functionality, QoL features like the randomizer and settings, the animation effects, large chunks of the css). 

To run this you'd have to set up your own Vercel server and associated Redis DB. But honestly if you know how to do that, it  makes way more sense to just go make your own version of this that doesn't use Vercel, if I was starting over I would absolutely not use a serverless backend, this thing became a massive headache by the end.
If you just want to see the list of all rules, that's in /api/rules.js.
Feel free to use this for whatever you want! (although again you probably shouldn't)

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
| `api/board-state.js` | GET returns the current board state from Redis. POST saves a new board state and creates a move history snapshop, fires a Pusher to all clients with the new board state. |
| `api/turns.js` | GET returns turn/rules state; POST handles three actions: `RESET_TURNS`, `INCREMENT_TURN` (which will generate the new rule choices), and `SELECT_RULE`. |
| `api/rules.js` | The list of ALL possible custom rules. |
| `api/undo.js` | Endpoint that pulls the most recent board/turn state and rolls back all the clients via Pusher |
| `api/_lib/redis.js` | Util helper for the Redis client. |
| `api/_lib/pusher.js` | Util helper for the Pusher client. |

### Root

| File | What it does |
|---|---|
| `index.html` | HTML shell with the core components: board viewport, UI panels, password modal. |
| `vite.config.js` | Vite build configuration. |
| `package.json` | Project dependencies (Vite, Pusher, Upstash Redis, Vercel). |
