# Deploying a test version of Juicebot

The test version of Juicebot is the dev stack: the juicebox-view page at
https://juicebot-view-dev.pages.dev/ and its own MCP server. Deploying it never affects
production.

## 1. Set up your machine (once)

Log in to Cloudflare:

```bash
npx wrangler login
```

## 2. Deploy

From this repo, give the path to your juicebox-view project:

```bash
scripts/deploy-dev.sh <path to juicebox-view>
```

This deploys juicebox-view's `main` branch. To deploy a different branch or a tag, add it at
the end:

```bash
scripts/deploy-dev.sh <path to juicebox-view> <branch or tag>
```

When it finishes it prints the page URL and the MCP URL.

The test stack is shared: your deploy replaces the previous one. Tell anyone testing it before
you deploy.

To undo a deploy, run the command again with the branch or tag that was deployed before.

## 3. Connect Claude desktop (once)

In Claude desktop, Settings → Connectors → Add custom connector: name `Juicebot dev`, URL
`https://juicebot-view-mcp-dev.3dg.io/mcp`.

## 4. Check it works

In a chat with the connector enabled, ask Claude to open Juicebox. Open the link it gives you
and ask it to load a map.

## Creating the dev stack (only if https://juicebot-view-dev.pages.dev/ does not load)

Someone has to do this once, ever. From `packages/server`:

1. Create the page's project:
   ```bash
   CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e \
     npx wrangler pages project create juicebot-view-dev --production-branch main --force
   ```
   (`--production-branch` is a setting every Cloudflare Pages project needs; this is still the
   dev project.)
2. Deploy, as in step 2: `scripts/deploy-dev.sh <path to juicebox-view>` (from the repo root).
3. Set the MCP server's two secrets (ask a maintainer for the values):
   ```bash
   npx wrangler secret put TINYURL_API_KEY --env view-dev
   npx wrangler secret put SESSION_HMAC_SECRET --env view-dev
   ```
