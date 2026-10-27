#!/usr/bin/env bash
# Build juicebox-view and upload it to the dev stack's Cloudflare Pages project
# (docs/test-deployment.md):
#
#   juicebox-view (../juicebox-view, or --repo) → Pages "juicebot-view-dev",
#   https://juicebot-view-dev.pages.dev/, relay wss://juicebot-view-mcp-dev.3dg.io/ws
#
#   scripts/deploy-page.sh [--repo <path>]
#
# Direct upload, not a git build, so the npm pins in the Page's package.json are what ships.
# --repo (else PAGE_DIR, else VIEW_REPO, else ../juicebox-view), PROJECT and VITE_WS_URL
# override the defaults; scripts/deploy-prod.sh uses them to release the production Page.
#
# Vite inlines VITE_* vars at build time and a direct upload never sees the Pages
# project's variables, so everything the Page needs is passed here.
#
# Pairs with the stack's Worker: `wrangler deploy --env view-dev` in packages/server; its
# BROWSER_URL points at this Page and ALLOWED_ORIGINS lists it.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USAGE="usage: scripts/deploy-page.sh [--repo <path>]"
ARGS=()
while (($#)); do
  case "$1" in
    --repo) PAGE_DIR="${2:?$USAGE}"; shift 2 ;;
    --repo=*) PAGE_DIR="${1#--repo=}"; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"
[[ $# -eq 0 ]] || { echo "$USAGE" >&2; exit 2; }
PAGE_DIR="${PAGE_DIR:-${VIEW_REPO:-$REPO_ROOT/../juicebox-view}}"
DEFAULT_PROJECT=juicebot-view-dev
VITE_WS_URL="${VITE_WS_URL:-wss://juicebot-view-mcp-dev.3dg.io/ws}"
PROJECT="${PROJECT:-$DEFAULT_PROJECT}"
# Pages deploys run outside packages/server, so wrangler.toml's account_id is passed on here.
ACCOUNT_ID="$(sed -n 's/^account_id = "\(.*\)"$/\1/p' "$REPO_ROOT/packages/server/wrangler.toml")"
[[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "$ACCOUNT_ID" ]] || export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
cd "$PAGE_DIR"
echo "building the Page from $PAGE_DIR with VITE_WS_URL=$VITE_WS_URL"
VITE_WS_URL="$VITE_WS_URL" npm run build
grep -q "${VITE_WS_URL#wss://}" dist/assets/*.js || { echo "built assets do not contain $VITE_WS_URL" >&2; exit 1; }
npx wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
echo "Page live at https://$PROJECT.pages.dev/"
