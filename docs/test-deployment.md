# Test deployment: `scripts/deploy-test.sh`

Put a tagged juicebox-web on Cloudflare, paired with an MCP server, without touching
production. The target is the shared **Juicebot dev** stack:

| Part | Cloudflare name | URL |
|---|---|---|
| MCP server (Worker) | `juicebot-mcp-dev` (`wrangler --env dev`) | `https://juicebot-mcp-dev.3dg.io/mcp` |
| Page (Pages project) | `juicebot-web-dev` | `https://juicebot-dev.3dg.io/` |

Production (`juicebot-mcp.3dg.io`, `juicebot.3dg.io`) is released only by
`scripts/deploy-prod.sh` from a `prod-` tag; this script never deploys to it.

## Before the first run

- `npx wrangler login` with an account that owns the 3dg.io zone and the dev Worker and
  Pages project.
- The juicebox-web fork cloned next to this repo (`../juicebox-web`), or `WEB_REPO=` set to it.
- The dev Worker's secrets are already set. If they are missing, set them with
  `npx wrangler secret put TINYURL_API_KEY --env dev` and the same for `SESSION_HMAC_SECRET`,
  from `packages/server`.

## Usage

```bash
scripts/deploy-test.sh <web-tag> [mcp-ref]
```

| Invocation | Page from | Worker from |
|---|---|---|
| `scripts/deploy-test.sh my-tag` | juicebox-web at `my-tag` | juicebox-mcp at `HEAD` |
| `scripts/deploy-test.sh my-tag main` | juicebox-web at `my-tag` | juicebox-mcp at `main` (any branch, tag or commit) |
| `WORKER=0 scripts/deploy-test.sh my-tag` | juicebox-web at `my-tag` | not deployed; the dev Worker stays as it is |

| Variable | Default | Meaning |
|---|---|---|
| `WEB_REPO` | `../juicebox-web` | Where the juicebox-web fork is cloned |
| `WORKER` | `1` | `0` skips the Worker deploy |

The tag is looked up in your local juicebox-web clone first and fetched from its `origin`
if it is not there, so a tag you have not pushed works too.

## What it does

1. Checks out juicebox-web at the tag, and juicebox-mcp at `mcp-ref`, into throwaway git
   worktrees. Your working copies are not touched and uncommitted changes never ship; the
   worktrees are removed when the script exits, whether it succeeded or not.
2. Unless `WORKER=0`: `npm install`, then `wrangler deploy --env dev`. The deploy message
   (shown in the Cloudflare dashboard's deployment list) records both refs.
3. `npm ci --allow-git=root` in juicebox-web (npm 12 refuses its git dependency otherwise),
   then `scripts/deploy-web-dev.sh`: builds the page with
   `VITE_WS_URL=wss://juicebot-mcp-dev.3dg.io/ws`, checks the bundle contains that URL,
   and uploads it to `juicebot-web-dev`.

The page's relay address is fixed at build time, so the page from this script only ever
talks to the dev Worker.

## Checking the deployment

- Open `https://juicebot-dev.3dg.io/`. The page should load and join a room.
- Point an MCP client at `https://juicebot-mcp-dev.3dg.io/mcp`, call `get_juicebox_url`,
  open the link and drive the viewer.
- Or, without an MCP client, use `scripts/dev-check.mjs` against a fresh room
  (see `docs/local-testing.md`, "Drive the dev stack from a script").

## Things to know

- **The dev stack is shared.** Your deploy replaces whatever was there, and the next
  person's deploy replaces yours. Say so before deploying if others are testing.
- **Keep the page and the Worker compatible.** The page speaks the protocol of the
  `@aidenlab/juicebox-remote` version it was built with; the room validates message
  types against the protocol bundled into the Worker at deploy time. If the tag's page
  uses a new command or sync event, deploy a Worker that knows it (don't use `WORKER=0`).
- **Going back.** Re-run the script with the previous tag, or put the dev page back on
  juicebox-web `master` with `scripts/deploy-web-dev.sh`.
- **Need a test stack of your own?** Add an environment beside `[env.dev]` in
  `packages/server/wrangler.toml` with its own Worker name, domain, `BROWSER_URL` and
  `ALLOWED_ORIGINS`, create a matching Pages project, and run `deploy-web-dev.sh` with
  `PROJECT=` and `VITE_WS_URL=` set for it.
