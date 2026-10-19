# Test deployment: `scripts/deploy-test.sh`

Put a tagged Page on Cloudflare, paired with its own MCP server, without touching
production. During the comparison of juicebox-web (the incumbent) and juicebox-view (the
contender to replace it) there are two **Juicebot dev** stacks, side by side. Each is a
complete, independent pair of a Worker and a Page:

| | **web** (incumbent) | **view** (contender) |
|---|---|---|
| Page source | weiszd/juicebox-web fork, at a tag | aidenlab/juicebox-view, at a tag |
| Pages project | `juicebot-web-dev` | `juicebot-view-dev` |
| Page | `https://juicebot-dev.3dg.io/` | `https://juicebot-view-dev.3dg.io/` |
| Worker (`wrangler --env`) | `juicebot-mcp-dev` (`dev`) | `juicebot-view-mcp-dev` (`view-dev`) |
| MCP endpoint | `https://juicebot-mcp-dev.3dg.io/mcp` | `https://juicebot-view-mcp-dev.3dg.io/mcp` |
| MCP server name | `juicebox-server` | `juicebot-view-server` |
| Page's relay (`VITE_WS_URL`) | `wss://juicebot-mcp-dev.3dg.io/ws` | `wss://juicebot-view-mcp-dev.3dg.io/ws` |

Each Worker's `BROWSER_URL` and `ALLOWED_ORIGINS` name only its own Page, so the stacks share
no Rooms, sessions or secrets. Deploying one never changes the other, and both can be connected
to Claude desktop at the same time. Both Workers are built from the same juicebox-mcp code; only
their configuration differs.

When the comparison is over, one stack is retired (see "Retiring a stack" below).

Production (`juicebot-mcp.3dg.io`, `juicebot.3dg.io`) is released only by
`scripts/deploy-prod.sh` from a `prod-` tag; this script never deploys to it.

## Before the first run

- `npx wrangler login` with an account that owns the 3dg.io zone and both stacks' Workers and
  Pages projects.
- The Page repos cloned next to this repo, or the variables set to them:
  - web: the juicebox-web fork at `../juicebox-web`, or `WEB_REPO=`
  - view: juicebox-view at `../juicebox-view`, or `VIEW_REPO=`
- Each Worker's secrets are set. If they are missing, from `packages/server`:
  ```bash
  npx wrangler secret put TINYURL_API_KEY --env dev        # web
  npx wrangler secret put SESSION_HMAC_SECRET --env dev
  npx wrangler secret put TINYURL_API_KEY --env view-dev   # view
  npx wrangler secret put SESSION_HMAC_SECRET --env view-dev
  ```

### Creating the view stack (once)

The web stack already exists. The view stack needs:

1. The Pages project: `npx wrangler pages project create juicebot-view-dev --production-branch main`.
2. Its custom domain `juicebot-view-dev.3dg.io`, added in the Cloudflare dashboard under
   Workers & Pages → `juicebot-view-dev` → Custom domains.
3. A first `scripts/deploy-test.sh view <tag>`. The Worker's custom domain
   `juicebot-view-mcp-dev.3dg.io` is created by `wrangler deploy` from `[env.view-dev]`.
4. Its secrets, as above.

## Usage

The stack is the first argument and is required, so every deploy says which stack it is for:

```bash
scripts/deploy-test.sh <web|view> <tag> [mcp-ref]
```

| Invocation | Page | Worker |
|---|---|---|
| `scripts/deploy-test.sh web my-tag` | juicebox-web at `my-tag` → `juicebot-dev.3dg.io` | `juicebot-mcp-dev` from juicebox-mcp at `HEAD` |
| `scripts/deploy-test.sh view v0.3.0` | juicebox-view at `v0.3.0` → `juicebot-view-dev.3dg.io` | `juicebot-view-mcp-dev` from juicebox-mcp at `HEAD` |
| `scripts/deploy-test.sh view v0.3.0 main` | juicebox-view at `v0.3.0` | `juicebot-view-mcp-dev` from juicebox-mcp at `main` (any branch, tag or commit) |
| `WORKER=0 scripts/deploy-test.sh view v0.3.0` | juicebox-view at `v0.3.0` | not deployed; the view Worker stays as it is |

| Variable | Default | Meaning |
|---|---|---|
| `WEB_REPO` | `../juicebox-web` | Where the juicebox-web fork is cloned (web stack) |
| `VIEW_REPO` | `../juicebox-view` | Where juicebox-view is cloned (view stack) |
| `WORKER` | `1` | `0` skips the Worker deploy |

The tag is looked up in your local clone first and fetched from its `origin` if it is not
there, so a tag you have not pushed works too.

To deploy both stacks, run the script once for each. They can run one after the other in either
order.

## What it does

1. Checks out the stack's Page repo at the tag, and juicebox-mcp at `mcp-ref`, into throwaway git
   worktrees. Your working copies are not touched and uncommitted changes never ship; the
   worktrees are removed when the script exits, whether it succeeded or not.
2. Unless `WORKER=0`: `npm install`, then `wrangler deploy --env dev` (web) or
   `--env view-dev` (view). The deploy message (shown in the Cloudflare dashboard's deployment
   list) records the stack and both refs.
3. Installs the Page's dependencies and runs `scripts/deploy-web-dev.sh <web|view>`, which builds
   the Page with the stack's `VITE_WS_URL`, checks the bundle contains that URL, and uploads it to
   the stack's Pages project.
   - web only: `npm ci --allow-git=root` (npm 12 refuses the fork's git dependency otherwise),
     and a check that the bundle contains the jb-shortlink `/shorten` endpoint.
4. Prints the stack's Page URL and MCP endpoint.

A Page's relay address is fixed at build time, so each stack's Page only ever talks to its own
Worker.

## Connecting Claude desktop to both stacks

Add each MCP endpoint as its own custom connector (Settings → Connectors → Add custom
connector), named so you can tell them apart:

| Connector name | URL |
|---|---|
| Juicebot dev (web) | `https://juicebot-mcp-dev.3dg.io/mcp` |
| Juicebot dev (view) | `https://juicebot-view-mcp-dev.3dg.io/mcp` |

The server names (`juicebox-server`, `juicebot-view-server`) also tell them apart where a host
shows them. Enable one connector per chat to see one stack, or both to compare them; the Join
link from each opens that stack's Page.

## Checking a deployment

For either stack, with its own Page and MCP endpoint from the table at the top:

- Open the Page. It should load; with `?room=<room>` it should join that Room (in juicebox-view
  the Header's Room indicator turns green).
- Point an MCP client at the MCP endpoint, call `get_juicebox_url`, open the link and drive
  the viewer.
- Or, without an MCP client, use `scripts/dev-check.mjs` against a fresh room (see
  `docs/local-testing.md`, "Drive the dev stack from a script"). It targets the web Worker by
  default; for view, set `MCP_URL`:
  ```bash
  ROOM=T$(tr -dc 'A-HJKMNP-TV-Z0-9' </dev/urandom | head -c9)
  # open https://juicebot-view-dev.3dg.io/?room=$ROOM in a tab, then:
  MCP_URL=https://juicebot-view-mcp-dev.3dg.io/mcp node scripts/dev-check.mjs $ROOM list_panels
  ```

## Things to know

- **The dev stacks are shared.** Your deploy replaces whatever was on that stack, and the next
  person's deploy replaces yours. Say so before deploying if others are testing it. A deploy to
  one stack never affects the other.
- **Keep the Page and its Worker compatible.** The Page speaks the protocol of the
  `@aidenlab/juicebox-remote` version it was built with; the Room validates message
  types against the protocol bundled into the Worker at deploy time. If the tag's Page
  uses a new command or sync event, deploy a Worker that knows it (don't use `WORKER=0`).
- **Going back.** Re-run the script for the same stack with the previous tag. For web, the dev
  Page can also go back to juicebox-web `master` with `scripts/deploy-web-dev.sh web`.
- **Retiring a stack.** When the comparison is decided, delete the losing stack's
  `[env.*]` block, Worker (`npx wrangler delete --env <env>`), Pages project and custom
  domains, and remove its branch from the deploy scripts and this document.
- **Need a test stack of your own?** Add an environment beside `[env.dev]` and `[env.view-dev]`
  in `packages/server/wrangler.toml` with its own Worker name, domain, `BROWSER_URL` and
  `ALLOWED_ORIGINS`, create a matching Pages project, and run `deploy-web-dev.sh <web|view>` with
  `PROJECT=` and `VITE_WS_URL=` set for it.
