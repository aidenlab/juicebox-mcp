# juicebox-mcp

AI control for the [juicebox.js](https://github.com/aidenlab/juicebox.js) Hi-C contact map viewer, as a plug-in. An MCP client (Claude Desktop, Claude Code, ChatGPT, Cursor, …) drives juicebox.js on a web page, and every page in the same room stays in sync.

```
MCP client ──/mcp──▶ Worker ──▶ room (Durable Object) ──/ws──▶ page: juicebox-view + @aidenlab/juicebox-remote
```

- `packages/server` — the MCP server: a Cloudflare Worker on `/mcp`, with a Durable Object per room behind `/ws`. Deployed with wrangler, never published.
- `packages/remote` — `@aidenlab/juicebox-remote`: the browser library that attaches a juicebox.js viewer to a room. The API is in [`packages/remote/README.md`](packages/remote/README.md).

The page is [juicebox-view](https://github.com/aidenlab/juicebox-view), a thin wrapper around juicebox.js with a Room indicator and the join link in its header ([ADR-0010](docs/adr/0010-juicebox-view-is-the-host.md)). The viewer and the page are separate repositories; neither is vendored here.

Read next: [`GLOSSARY.md`](GLOSSARY.md) (glossary: room, join link, snapshot link, session, …), [`docs/design/ARCHITECTURE_V2.md`](docs/design/ARCHITECTURE_V2.md) (the design), [`docs/adr/`](docs/adr/) (decisions).

## Connect an MCP client

The production server is `https://juicebot-mcp.3dg.io/mcp` (Streamable HTTP, no auth).

- **Claude Desktop** — Settings → Connectors → Add custom connector, URL `https://juicebot-mcp.3dg.io/mcp`.
- **Claude Code** — `claude mcp add --transport http juicebox https://juicebot-mcp.3dg.io/mcp`
- **Any stdio-only client** — bridge with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), e.g. in `claude_desktop_config.json`:

  ```json
  {
    "mcpServers": {
      "juicebox": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://juicebot-mcp.3dg.io/mcp"]
      }
    }
  }
  ```

Then ask for the Juicebox link. `get_juicebox_url` returns a join link (`https://juicebot.3dg.io/?room=…`); open it, and ask the client to load a map and go to a locus. An open page can be handed to another chat by pasting its join link; the client calls `join_room`.

## Tools

A page can hold several panels (juicebox.js viewers side by side), numbered 1, 2, … from the left. Every tool marked *panel* takes `panel`: that position, a map name that is unique among the panels, or `"all"` (not on `load_map`, `load_control_map`, `list_tracks`, `close_panel`). With one panel open it may be omitted; with several it is required, and the error lists the panels ([ADR-0007](docs/adr/0007-panels-addressed-by-position.md)).

| Tool | Does | panel |
|---|---|---|
| `get_juicebox_url`, `join_room` | join link for the session's room; bind the session to another room | |
| `load_map` | load a `.hic` map; `panel: "new"` opens it in a new panel beside the others | new, one |
| `load_control_map` | load a control map (display mode AOB) | one |
| `close_panel` | close a panel; the ones to its right move left; never the last | one |
| `list_panels` | the panels left to right: map, genome, control map, track count, locus; whether the Juicebox Panel Controls are shown | |
| `show_panel_controls` | hide or show the Juicebox Panel Controls on every panel of the page (`show: true\|false`) | |
| `goto_locus`, `zoom_in`, `zoom_out` | navigate | yes |
| `set_map_foreground_color`, `set_map_background_color`, `set_color_scale`, `select_normalization` | map look | yes |
| `load_track`, `remove_track`, `set_track_color`, `set_track_name`, `set_track_data_range`, `set_track_autoscale`, `set_track_log_scale` | tracks, by name or 1-based number (by name only with `"all"`) | yes |
| `list_tracks` | one panel's 1D and 2D tracks | one |
| `load_session`, `save_session`, `create_shareable_url` | session JSON in and out; snapshot link | |
| `search_encode_hic` | live ENCODE portal: Hi-C experiments (tissues, intact Hi-C, cell lines) with their map and track files | |
| `search_encode` | live ENCODE portal: any other assay, annotation, biosample, file | |
| `search_map_catalogs` | the curated ENCODE and 4DN catalogs on igv-data (was `search_maps`) | |
| `get_map_details`, `get_data_source_statistics`, `list_data_sources` | catalog details and counts | |
| `juicebox_help`, `get_server_status` | examples; server status | |

## Run everything locally

[`docs/juicebox-view-development.md`](docs/juicebox-view-development.md) runs this repo's server (`wrangler dev`) and juicebox-view (`vite`) side by side and connects Claude to them. It expects juicebox-view cloned next to this repo.

## Develop

```bash
npm test                 # vitest watch: remote in Node, server inside workerd
npm run test:run         # single run
npm run dev:server       # wrangler dev on :8787
```

Project conventions are in [`CLAUDE.md`](CLAUDE.md).

## Deploy

Every deploy runs from a maintainer's machine with `wrangler`; nothing deploys from GitHub. There are two stacks, each a Worker paired with a juicebox-view Page (`[env.*]` in `packages/server/wrangler.toml`):

| Stack | Page | MCP server | Deployed by |
|---|---|---|---|
| Production | https://juicebot.3dg.io/ | `https://juicebot-mcp.3dg.io/mcp` | `scripts/deploy-prod.sh prod-YYYY-MM-DD`, from a tag pushed on both this repo and juicebox-view |
| Dev | https://juicebot-view-dev.pages.dev/ | `https://juicebot-view-mcp-dev.3dg.io/mcp` | `scripts/deploy-test.sh <juicebox-view clone> [branch-or-tag]` ([`docs/test-deployment.md`](docs/test-deployment.md)) |

`scripts/deploy-wizard.sh` walks a maintainer through login, the two secrets, the dev Worker deploy, probing `/mcp` and `/ws`, and connecting each client end to end. How the pieces fit: [`docs/how-juicebot-deploys.html`](docs/how-juicebot-deploys.html).

Each stack's settings in `wrangler.toml`:

| | Why |
|---|---|
| route, custom domain | wrangler attaches the domain and its DNS record on deploy |
| `workers_dev`, `preview_urls` = `false` | one public hostname per Worker; no `*.workers.dev` second entry point for clients or pages to drift onto |
| `BROWSER_URL` | the stack's Page, where join and snapshot links open (the trailing slash matters) |
| `ALLOWED_ORIGINS` | exact-match `Origin` check on `/ws`, listing the stack's Page; WebSockets are not covered by CORS |
| `TINYURL_DOMAIN`, `TINYURL_ENDPOINT` | `t.3dg.io` and the TinyURL API, for snapshot-link shortening in `create_shareable_url` |
| secret `SESSION_HMAC_SECRET` | keys room ids derived from ChatGPT's `x-openai-session`; unset → that path fails |
| secret `TINYURL_API_KEY` | unset → `create_shareable_url` returns the long link |

Secrets are set per stack with `wrangler secret put <NAME> --env <env>`. For `wrangler dev`, the top-level `[vars]` point at a local juicebox-view on `localhost:5173`, and `packages/server/.dev.vars` stands in for the secrets.

## History

This repository started as the first Juicebox MCP server (tags `v0.0.1-mvp` to `v1.1.0`). Development of v2 continued in the fork `weiszd/juicebox-mcp` from `0149fd1` and was moved back here at `4c0ecaa` (October 2026), with its full history; that fork's issues and pull requests remain there.

## The prototype

The pre-v2 prototype (Node `.mcpb` server, vendored viewer, Vite frontend) and its notes (`docs/mcp-notes/`, `docs/datasource-notes/`, `docs/development-notes/`, `docs/usage-scenerios/`) are on branch [`prototype`](https://github.com/aidenlab/juicebox-mcp/tree/prototype) and tag `v1.1.0-prototype`.

## License

MIT. See `LICENSE`.
