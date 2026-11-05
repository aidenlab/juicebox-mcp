# Why juicebox-mcp has two production deployments

There is one build: the server code in this repo plus the page from `juicebox-view`. It is deployed to production **twice**, under two sets of names. This file explains why, so the setup stops being a mystery.

## What there is

| | Juicebot production | geenee's Juicebox production | Dev |
|---|---|---|---|
| Script | `scripts/deploy-prod.sh` | `scripts/deploy-view-prod.sh` | `scripts/deploy-dev.sh` |
| Tags | `prod-YYYY-MM-DD[.N]` | `view-prod-YYYY-MM-DD[.N]` | none (deploys a branch or ref) |
| `wrangler.toml` env | `[env.prod]` | `[env.view-prod]` | `[env.view-dev]` |
| Worker | `juicebot-mcp` at `juicebot-mcp.3dg.io` | `juicebox-view-mcp` at `juicebox-view-mcp.3dg.io` | `juicebox-view-mcp-dev` at `juicebox-view-mcp-dev.3dg.io` |
| Page (Pages project) | `juicebot-web` at `juicebot.3dg.io` | `juicebox-view` at `juicebox-view.pages.dev` | `juicebox-view-dev` at `juicebox-view-dev.pages.dev` |
| Built from | juicebox-mcp + juicebox-view | juicebox-mcp + juicebox-view | juicebox-mcp + juicebox-view |
| Who uses it | The Connector this repo's `README.md` publishes (Claude Desktop, Claude Code, `mcp-remote`) | geenee: `JUICEBOX_UPSTREAM_URL` in geenee's `wrangler.toml` | Testing before a release, and geenee dev |

The two production columns run the same code. They differ only in names, addresses, Rooms and secrets.

## How it got this way

1. **2026-10-11: Juicebot production is created** (commit `f68c88d`, David Weisz). The project started as David's fork. At that point Juicebot's page was built from a different repo, `juicebox-web`, so the code really was different then. Its releases are tagged `prod-`.
2. **2026-10-19 to 10-27: the page moves to `juicebox-view`.** Commit `9e070c7` ran two dev stacks side by side, the web stack and the view stack. From tag `prod-2026-10-27` on, Juicebot's page is built from `juicebox-view`. Before that tag, the scripts at those tags build `juicebox-web`.
3. **2026-11-05: geenee's own production is created** ([#21](https://github.com/aidenlab/juicebox-mcp/issues/21)) during the geenee Deployments rollout ([geenee ADR 0004](https://github.com/aidenlab/geenee/blob/main/docs/adr/0004-two-deployments-not-versioned-urls.md)). The aim was to set up the tag-only release process, along with `/version`, without touching David's live Juicebot. So it became a separate Worker, page, set of Rooms and secret, called `view-prod`.

Since step 2, both production deployments build the same code. The second one exists because of the rollout, not because of anything in the code.

## Why the `view-prod-` tag prefix

Both production scripts release from tags in the same two repos. If both used `prod-`, a tag like `prod-2026-11-05` wouldn't say which deployment it released. The prefix makes each tag name exactly one release, and each script only accepts its own prefix. The prefix answers "which deployment?", not "which repo?".

## What still keeps them apart

- **Addresses already handed out.** Anyone who added `https://juicebot-mcp.3dg.io/mcp` as a Connector is on Juicebot. geenee forwards to `https://juicebox-view-mcp.3dg.io/mcp`.
- **Rooms and secrets.** Each Worker has its own `SESSION_HMAC_SECRET` and its own Rooms, so a Room on one doesn't exist on the other.
- **Ownership.** Juicebot is David's original deployment, and he may still be using it.

## Known costs

- **juicebox-view collects tags that mark no change.** Releases tag both repos with the same name, so juicebox-view gets a tag even when it hasn't changed. Example: `prod-2026-10-27` and `view-prod-2026-11-05` through `view-prod-2026-11-05.3` all point at juicebox-view `b587dbc`. [#31](https://github.com/aidenlab/juicebox-mcp/issues/31) fixes this by pinning the juicebox-view commit in this repo.
- **Rollback to some early tags is broken.** juicebox-view has no `prod-2026-10-11` or `prod-2026-10-11.1` tags, so those Juicebot releases can't be deployed again with the script as it is now.
- **Every release step happens twice:** two scripts, two `wrangler.toml` envs, two Pages projects and two secrets to keep in step.

## The way out (not decided)

Collapse to one production deployment:

1. Keep the `juicebox-view-mcp` / `juicebox-view` names. They match `igv-mcp` / `igv-viewer` and `spacewalk-mcp` / `spacewalk-viewer`, and geenee already uses them.
2. Attach `juicebot-mcp.3dg.io`, and `juicebot.3dg.io` if needed, to that same Worker and page as second custom domains, so existing Connectors and links keep working.
3. Remove `[env.prod]`, `scripts/deploy-prod.sh`, the `juicebot-mcp` Worker and the `juicebot-web` Pages project.
4. Go back to plain `prod-` tags like the other two repos. The old `prod-` tags stay in history as Juicebot's past releases.

Before going ahead, check with David whether he still uses Juicebot and whether anyone other than geenee points at `juicebot-mcp.3dg.io`.
