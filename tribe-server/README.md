# MonkeyClash tribe server

Real-time server for Monkeytype's multiplayer client ("Tribe", in `frontend/src/ts/tribe`).
Upstream never published their server, so this one implements the same Socket.IO
protocol from what the client emits and listens to.

It handles rooms (create / join by 6-char code / public list), leader actions
(config, start, kick+ban, give leader, rename, visibility), ready / afk states,
chat, the race itself (seed, countdown, live progress, results, finish timer)
and the final positions with points and mini crowns. Everything lives in memory:
restarting the server closes all rooms.

## Run

```sh
pnpm install                      # from the repo root
cd tribe-server && pnpm dev       # listens on :3005, restarts on change
```

Then start the frontend with Tribe enabled and open http://localhost:3000/tribe:

```sh
cd frontend && FORCE_TRIBE=true pnpm dev
```

The client connects to `TRIBE_URL` (frontend build env). Dev defaults to
`http://localhost:3005`; in production an empty value means the site's own
origin, so a reverse proxy must forward `/socket.io/` to this server.

## Configuration

| env                     | default         | meaning                                               |
| ----------------------- | --------------- | ----------------------------------------------------- |
| `PORT`                  | `3005`          | http port (`/health` answers `ok`)                    |
| `TRIBE_CLIENT_VERSIONS` | `25.12.4,dev`   | accepted client versions (`expectedVersion` in tribe.ts) |
| `TRIBE_VERSION`         | `monkeyclash`   | version shown in the tribe menu                       |
| `CORS_ORIGIN`           | reflect any     | comma-separated allowed origins                       |
| `FINISH_TIMER_SECONDS`  | `30`            | time left for the others once the first player finished |

## Code

- `src/server.ts`: socket events → room actions, validation, leader checks
- `src/room.ts`: a room and its race state machine
  (`LOBBY → RACE_INIT → RACE_COUNTDOWN → RACE_ONGOING → RACE_ONE_FINISHED → SHOWING_RESULTS → READY_TO_CONTINUE`)
- `src/positions.ts`: ranking, points and mini crowns
- `__tests__/`: unit tests and full races played by real socket.io clients (`pnpm test`)
