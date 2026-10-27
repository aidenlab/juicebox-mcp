# juicebox-view is the host; the juicebox-web stacks are retired

Supersedes ADR-0004 in part: the Page is no longer juicebox-web. It stays on its own origin, with the relay address set at build time (`VITE_WS_URL`) and an Origin allow-list on `/ws`.

Join links and snapshot links open juicebox-view, a thin page written from scratch around juicebox.js: a header with the Room indicator and the join link, and the viewer below it (juicebox-view ADR-0001). The weiszd fork of juicebox-web carried a full application (load menus, catalogs, share modal, session files) that a model-driven view in a side panel does not use, and the room widget never landed in aidenlab/juicebox-web. Both stacks in `wrangler.toml` now pair the Worker with juicebox-view: the dev stack (`[env.view-dev]`) and production (`[env.prod]`). The juicebox-web dev stack (`[env.dev]`), the frozen demo stack (`[env.v2]`) and the prototype Worker on `jbmcp.3dg.io` (the top level) are removed, along with the juicebox-web paths in the deploy scripts.

Rejected:
- **Keep the juicebox-web stack beside juicebox-view:** two Pages to build, deploy and check against every protocol change, for a page no longer developed.

Consequences:
- Production's Pages project keeps its name, `juicebot-web`, so `juicebot.3dg.io` and its rollback history stay where they are; only what is uploaded to it changes.
- Release tags `prod-2026-10-11` and `prod-2026-10-11.1` built juicebox-web. Rolling back to one uses the script from that tag, with a juicebox-web clone.
- The search catalogs are still copied from aidenlab/juicebox-web (`src/search/catalogs.js`); that is a data source, not the host.
