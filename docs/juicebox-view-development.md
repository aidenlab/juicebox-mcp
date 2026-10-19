# Developing juicebox-view against the MCP server

juicebox-view is the page that will replace juicebox-web (which is frozen). This is the
iteration loop for it: run it and this repo's MCP server on your machine, drive it from
Claude, and when a version is worth sharing, deploy it to the hosted view dev stack.

The MCP server is never re-pointed between iterations. It knows the page through two settings
per environment: `BROWSER_URL` (where join links open) and `ALLOWED_ORIGINS` (which pages may
open `/ws`). Locally both name `localhost:5173`; on the view dev stack both name
`juicebot-view-dev.pages.dev`. Only the page changes.

## The moving parts

| # | Part | What it does | Where it runs | Needed for |
|---|---|---|---|---|
| 1 | **Relay** (this repo's MCP server, `wrangler dev`) | Receives Claude's tool calls on `/mcp` and passes them to the page over `/ws` | `localhost:8787` | Everything |
| 2 | **Page** (juicebox-view, `vite`) | The viewer. Dials out to the relay through its own `/ws`, joins a room, draws the maps | `localhost:5173` | Any tool that drives the viewer |
| 3 | **Tunnel** (`cloudflared`) | Gives the relay a public `https://` address | `*.trycloudflare.com` | Claude Desktop and claude.ai only |
| 4 | **Connector** | Tells Claude where the relay is | Claude settings | Everything |

```
Claude ──(connector URL)──> [tunnel] ──> RELAY :8787 <──(Vite /ws proxy)── PAGE :5173
```

The page's relay address (`VITE_WS_URL`) is fixed when the page is built. juicebox-view's
`.env.development` sets it to `ws://localhost:5173/ws`, and `vite.config.js` forwards `/ws` to
`ws://localhost:8787`. So `npm run dev` needs no prefix, and the page reaches the relay through
its own port, which Claude Desktop's side panel requires. A hosted page is built for a hosted
relay and can never join a room on your local one, and the other way round.

## One-time setup

```bash
# Relay
cd /Users/turner/JuiceboxDevelopment/weiszd/juicebox-mcp
npm install
cp packages/server/.dev.vars.example packages/server/.dev.vars

# Page
cd /Users/turner/AidenLabDevelopment/juicebox-view
npm install

# Tunnel (only for Claude Desktop and claude.ai)
brew install cloudflared
```

`.dev.vars` is gitignored. Its `BROWSER_URL=http://localhost:5173/` makes join links open the
local page.

## Start everything

**Terminal 1: relay**

```bash
cd /Users/turner/JuiceboxDevelopment/weiszd/juicebox-mcp
npm run dev:server
```

**Terminal 2: page**

```bash
cd /Users/turner/AidenLabDevelopment/juicebox-view
npm run dev
```

The port is fixed at 5173 (`strictPort`); Vite opens the page in your browser. In dev, contact
maps on hosts that refuse a browser (ENCODE among them) load through juicebox.js's dev proxy,
which a production build does not include.

**Terminal 3: tunnel** (skip for Claude Code and the MCP Inspector)

```bash
cloudflared tunnel --url http://localhost:8787
```

It prints `https://<random-words>.trycloudflare.com`. The connector URL is that plus `/mcp`.

## Connect Claude

**Claude Code** (no tunnel):

```bash
claude mcp add --transport http juicebox-local http://localhost:8787/mcp
```

**Claude Desktop and claude.ai** (one connector covers both): Settings → Connectors → Add
custom connector, name `Juicebox local`, URL `https://<random-words>.trycloudflare.com/mcp`,
OAuth fields blank. Turn it on in a new chat's tools menu. The tunnel address changes every
time `cloudflared` restarts; then remove the connector and add it again.

**MCP Inspector** (no tunnel): `npx @modelcontextprotocol/inspector`, transport "Streamable
HTTP", URL `http://localhost:8787/mcp`.

## Iterate

1. Say "Hello, Juicebot". Claude calls `get_juicebox_url` and gets
   `http://localhost:5173/?room=<ROOM>`. Claude Desktop opens it in the panel beside the chat;
   elsewhere, open it in a browser on this Mac. Use `localhost`, not `127.0.0.1`.
2. Ask for a map, e.g. "load a GM12878 Hi-C map".
3. Edit juicebox-view and save. Vite reloads the page; it rejoins the same room (the `?room=`
   is in its URL) and catches up from the room's saved session. Keep chatting.
4. Edit the server and save. `wrangler dev` reloads the Worker. Rooms and sessions survive in
   `packages/server/.wrangler/state`.

Nothing is deployed and nothing needs restarting between iterations.

The connector is only a URL; nothing is installed in Claude, so nothing is reinstalled when the
page or the server changes. Two exceptions:

- Restarting `cloudflared` changes the tunnel address; remove the connector and add it again.
  Leave the tunnel running between iterations to avoid this.
- A server change to the tool list (a tool added, or a name, description or schema changed)
  reaches Claude in a new chat. An open chat may keep the list it fetched when it started.

## Check each part

| Part | Command | Good result |
|---|---|---|
| Relay | `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8787/mcp` | `405` (`/mcp` only accepts `POST`) |
| Page | `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/` | `200` |
| Tunnel | `curl -s -o /dev/null -w '%{http_code}\n' https://<random-words>.trycloudflare.com/mcp` | `405` |
| Page joined a room | Relay terminal prints `[DO] WebSocket accepted. Total connections: 1` | |
| Command reached a page | Relay terminal prints `[DO sendToClient] command=... websockets=1` | `websockets=0`: no page in that room |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "No page is connected to this room" | No page has joined that room. Check the relay terminal for `WebSocket accepted`, and that the page's URL carries the room from this chat's join link |
| Page loads but never joins | Relay not running, or the page is not on `localhost:5173`. A refused page shows as `[WS] refused Origin: ...` in the relay terminal (`ALLOWED_ORIGINS` in `packages/server/wrangler.toml`) |
| Join link points at a deployed page | `.dev.vars` is missing; copy it from `.dev.vars.example` and restart the relay |
| Connector stopped working | The tunnel restarted with a new address; add the connector again |
| A new chat cannot drive the open page | Each chat gets its own room. Open the new chat's join link, or paste the page's join link and ask Claude to join that room (`join_room`) |
| Port 8787 or 5173 in use | An earlier relay or page is still running; `lsof -nP -iTCP:8787 -sTCP:LISTEN` shows it |
| Stale rooms or sessions | Stop the relay and delete `packages/server/.wrangler/state` |

`Ctrl-C` in each terminal shuts down. Stop the tunnel when you are not testing: while it runs,
anyone with the address can call your relay.

## Check the production build: the round trip

The dev server is not what is deployed. To check the built page against a real Worker without
deploying:

```bash
cd /Users/turner/AidenLabDevelopment/juicebox-view
npm run test:roundtrip
```

It builds the page as deployed, serves it at `localhost:4183`, starts a Worker from
`../juicebox-mcp` under `wrangler dev` at `localhost:8797`, and in headless Chromium opens a join
link, runs `load_map` and `goto_locus` through `/mcp`, and checks the page. Its ports differ from
the ones above, so it runs beside your dev loop. It expects juicebox-mcp cloned next to
juicebox-view and `npx playwright install chromium` done once; details in juicebox-view's
`docs/roundtrip.md`.

## Share a version: the hosted view dev stack

| | |
|---|---|
| Page | https://juicebot-view-dev.pages.dev/ (Pages project `juicebot-view-dev`) |
| MCP connector | `https://juicebot-view-mcp-dev.3dg.io/mcp` (Worker `juicebot-view-mcp-dev`, `wrangler --env view-dev`) |

Add the connector once in Claude (Settings → Connectors). It stays the same across deploys.

Deploy from this repo, after `npx wrangler login` once:

```bash
cd /Users/turner/JuiceboxDevelopment/weiszd/juicebox-mcp
scripts/deploy-test.sh view /Users/turner/AidenLabDevelopment/juicebox-view <branch-or-tag>
WORKER=0 scripts/deploy-test.sh view /Users/turner/AidenLabDevelopment/juicebox-view <branch-or-tag>   # page only
```

- **Only committed code ships.** The page is built from `<branch-or-tag>` (default `main`) in a
  throwaway worktree, and the Worker from this repo's `HEAD` (or a fourth argument). Commit the
  iteration to a branch first; a local branch need not be pushed.
- `WORKER=0` skips the Worker deploy when only the page changed.
- The build bakes in `VITE_WS_URL=wss://juicebot-view-mcp-dev.3dg.io/ws` and fails if the built
  assets do not contain it.
- The stack is shared: your deploy replaces the previous one. Tell anyone testing it first. To
  undo, deploy the branch or tag that was there before.
- It never touches the web stack (`juicebot-dev.3dg.io`).

### What the deploy does

The copy to Cloudflare is a direct upload from your machine. Pushing juicebox-view to GitHub
deploys nothing; Cloudflare never builds from the repo. `deploy-test.sh` checks out the ref and
runs `npm ci`, then calls `scripts/deploy-web-dev.sh view`, which does two things:

```bash
# scripts/deploy-web-dev.sh: build the page for the hosted relay
VITE_WS_URL=wss://juicebot-view-mcp-dev.3dg.io/ws npm run build

# scripts/deploy-web-dev.sh: upload dist/ to the Pages project (the copy to Cloudflare)
npx wrangler pages deploy dist --project-name juicebot-view-dev --branch main --commit-dirty=true
```

`--branch main` makes the upload the project's production deployment, so it replaces what
https://juicebot-view-dev.pages.dev/ serves within seconds. Every upload is kept, so the
Cloudflare dashboard (Pages → `juicebot-view-dev` → Deployments) can also roll back.

To deploy your working copy as it is, uncommitted changes included, and the page only, call
the inner script directly:

```bash
cd /Users/turner/JuiceboxDevelopment/weiszd/juicebox-mcp
scripts/deploy-web-dev.sh view --repo /Users/turner/AidenLabDevelopment/juicebox-view
```

Or by hand, from juicebox-view:

```bash
cd /Users/turner/AidenLabDevelopment/juicebox-view
VITE_WS_URL=wss://juicebot-view-mcp-dev.3dg.io/ws npm run build
CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e \
  npx wrangler pages deploy dist --project-name juicebot-view-dev --branch main
```

Do not leave out `VITE_WS_URL`. `npm run build` does not read `.env.development`, so without it
the built page has no relay address and never joins a room. The account id is the one in
`packages/server/wrangler.toml`; wrangler will not pick between the accounts your login reaches.

A deployed page has no juicebox.js dev proxy, so a contact map on a host that refuses a browser
(ENCODE among them) can load in `npm run dev` and fail on the hosted page.

More on both dev stacks, and creating the view stack if it ever has to be rebuilt:
`docs/test-deployment.md`.
