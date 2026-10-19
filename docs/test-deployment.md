# Deploying a test version of Juicebot

There are two test versions of Juicebot, each with its own web page and MCP server:

- **web**: the juicebox-web page, at https://juicebot-dev.3dg.io/
- **view**: the juicebox-view page, at https://juicebot-view-dev.pages.dev/

Deploying one never affects the other.

## 1. Set up your machine (once)

Log in to Cloudflare:

```bash
npx wrangler login
```

## 2. Deploy

From this repo, give the stack and the path to your juicebox-web or juicebox-view project:

```bash
scripts/deploy-test.sh web <path to juicebox-web>
scripts/deploy-test.sh view <path to juicebox-view>
```

This deploys the project's main branch (`master` for juicebox-web, `main` for juicebox-view).
To deploy a different branch or a tag, add it at the end:

```bash
scripts/deploy-test.sh view <path to juicebox-view> <branch or tag>
```

When it finishes it prints the page URL and the MCP URL.

The test stacks are shared: your deploy replaces the previous one. Tell anyone testing that
stack before you deploy.

To undo a deploy, run the command again with the branch or tag that was deployed before.

## 3. Connect Claude desktop (once)

In Claude desktop, Settings → Connectors → Add custom connector. Add one or both:

| Name | URL |
|---|---|
| Juicebot dev (web) | `https://juicebot-mcp-dev.3dg.io/mcp` |
| Juicebot dev (view) | `https://juicebot-view-mcp-dev.3dg.io/mcp` |

## 4. Check it works

In a chat with the connector enabled, ask Claude to open Juicebox. Open the link it gives you
and ask it to load a map.

## Creating the view stack (only if https://juicebot-view-dev.pages.dev/ does not load)

Someone has to do this once, ever. From `packages/server`:

1. Create the page's project:
   ```bash
   CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e \
     npx wrangler pages project create juicebot-view-dev --production-branch main --force
   ```
   (`--production-branch` is a setting every Cloudflare Pages project needs; this is still the
   dev project.)
2. Deploy, as in step 2: `scripts/deploy-test.sh view <path to juicebox-view>` (from the repo root).
3. Set the MCP server's two secrets (ask a maintainer for the values):
   ```bash
   npx wrangler secret put TINYURL_API_KEY --env view-dev
   npx wrangler secret put SESSION_HMAC_SECRET --env view-dev
   ```
