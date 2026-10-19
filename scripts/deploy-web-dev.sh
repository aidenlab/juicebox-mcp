#!/usr/bin/env bash
# Build a dev stack's Page and upload it to that stack's Cloudflare Pages project. There are two
# stacks side by side while juicebox-view is compared with juicebox-web (docs/test-deployment.md):
#
#   web   the juicebox-web fork (../juicebox-web, or WEB_REPO=) → Pages "juicebot-web-dev",
#         https://juicebot-dev.3dg.io/, relay wss://juicebot-mcp-dev.3dg.io/ws
#   view  juicebox-view (../juicebox-view, or VIEW_REPO=) → Pages "juicebot-view-dev",
#         https://juicebot-view-dev.3dg.io/, relay wss://juicebot-view-mcp-dev.3dg.io/ws
#
#   scripts/deploy-web-dev.sh <web|view>
#   PAGE_DIR=/path/to/checkout scripts/deploy-web-dev.sh view
#
# Direct upload, not a git build, so the npm pins in the Page's package.json are what ships.
# PAGE_DIR (default: the stack's repo; WEB_DIR is still read for web), PROJECT and VITE_WS_URL
# override the stack's defaults; scripts/deploy-prod.sh uses them to release the web Page.
#
# The demo stack (PROJECT=juicebox-web-dev at https://juicebox-v2.3dg.io/,
# VITE_WS_URL=wss://juicebox-mcp-v2.aidenlab.workers.dev/ws) is frozen at tag
# demo-2026-10: do not deploy to it except for a hotfix from that tag.
#
# Vite inlines VITE_* vars at build time and a direct upload never sees the Pages
# project's variables, so everything the Page needs is passed here. The web Page's Share
# button shortens through juicebox-web's own jb-shortlink worker, so no TinyURL key.
#
# Pairs with the stack's Worker: `wrangler deploy --env dev` (web) or `--env view-dev` (view)
# in packages/server; its BROWSER_URL points at this Page and ALLOWED_ORIGINS lists it.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="${1:-}"
case "$STACK" in
  web)
    PAGE_DIR="${PAGE_DIR:-${WEB_DIR:-${WEB_REPO:-$REPO_ROOT/../juicebox-web}}}"
    DEFAULT_PROJECT=juicebot-web-dev
    VITE_WS_URL="${VITE_WS_URL:-wss://juicebot-mcp-dev.3dg.io/ws}"
    DOMAIN=juicebot-dev.3dg.io ;;
  view)
    PAGE_DIR="${PAGE_DIR:-${VIEW_REPO:-$REPO_ROOT/../juicebox-view}}"
    DEFAULT_PROJECT=juicebot-view-dev
    VITE_WS_URL="${VITE_WS_URL:-wss://juicebot-view-mcp-dev.3dg.io/ws}"
    DOMAIN=juicebot-view-dev.3dg.io ;;
  *)
    echo "usage: scripts/deploy-web-dev.sh <web|view>" >&2; exit 2 ;;
esac
PROJECT="${PROJECT:-$DEFAULT_PROJECT}"
# Pages deploys run outside packages/server, so wrangler.toml's account_id is passed on here.
ACCOUNT_ID="$(sed -n 's/^account_id = "\(.*\)"$/\1/p' "$REPO_ROOT/packages/server/wrangler.toml")"
[[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "$ACCOUNT_ID" ]] || export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
cd "$PAGE_DIR"
echo "building the $STACK Page from $PAGE_DIR with VITE_WS_URL=$VITE_WS_URL"
VITE_WS_URL="$VITE_WS_URL" npm run build
grep -q "${VITE_WS_URL#wss://}" dist/assets/*.js || { echo "built assets do not contain $VITE_WS_URL" >&2; exit 1; }
if [[ "$STACK" == web ]]; then
  grep -q "juicebox.aidenlab.org/shorten" dist/assets/*.js || { echo "built assets do not contain the jb-shortlink /shorten endpoint" >&2; exit 1; }
fi
npx wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
if [[ "$PROJECT" == "$DEFAULT_PROJECT" ]]; then
  echo "$STACK Page live at https://$DOMAIN/ (https://$PROJECT.pages.dev/)"
else
  echo "$STACK Page live at https://$PROJECT.pages.dev/"
fi
