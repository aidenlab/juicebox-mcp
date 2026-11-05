#!/usr/bin/env bash
# Build juicebox-view and upload it to the dev stack's Cloudflare Pages project
# (docs/test-deployment.md):
#
#   juicebox-view (../juicebox-view, or --repo) → Pages "juicebox-view-dev",
#   https://juicebox-view-dev.pages.dev/, relay wss://juicebox-view-mcp-dev.3dg.io/ws
#
#   scripts/deploy-page.sh [--repo <path>] [--ref <branch-or-tag>]
#
# Direct upload, not a git build, so the npm pins in the Page's package.json are what ships.
# --repo (else PAGE_DIR, else VIEW_REPO, else ../juicebox-view), PROJECT and VITE_WS_URL
# override the defaults; scripts/deploy-prod.sh and scripts/deploy-view-prod.sh use them to
# release their production Pages.
#
# Vite inlines VITE_* vars at build time and a direct upload never sees the Pages
# project's variables, so everything the Page needs is passed here.
#
# The upload carries version.json at the Page's root, `{"version": "<ref> (<short sha>)"}` from
# scripts/version-label.sh for --ref (else PAGE_REF, else the checkout's HEAD), with -dirty after
# the sha when tracked files have uncommitted changes. --ref names how the checkout was reached
# (deploy-dev.sh's branch or tag, a release tag) and must be the commit checked out. After the
# upload, the Worker the Page talks to (VITE_WS_URL's host) must report that version as
# `viewer.version` on its /version (aidenlab/juicebox-mcp#23; scripts/check-version.sh).
#
# Pairs with the stack's Worker: `wrangler deploy --env view-dev` in packages/server; its
# BROWSER_URL points at this Page and ALLOWED_ORIGINS lists it.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USAGE="usage: scripts/deploy-page.sh [--repo <path>] [--ref <branch-or-tag>]"
ARGS=()
while (($#)); do
  case "$1" in
    --repo) PAGE_DIR="${2:?$USAGE}"; shift 2 ;;
    --repo=*) PAGE_DIR="${1#--repo=}"; shift ;;
    --ref) PAGE_REF="${2:?$USAGE}"; shift 2 ;;
    --ref=*) PAGE_REF="${1#--ref=}"; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"
[[ $# -eq 0 ]] || { echo "$USAGE" >&2; exit 2; }
PAGE_DIR="${PAGE_DIR:-${VIEW_REPO:-$REPO_ROOT/../juicebox-view}}"
DEFAULT_PROJECT=juicebox-view-dev
VITE_WS_URL="${VITE_WS_URL:-wss://juicebox-view-mcp-dev.3dg.io/ws}"
PROJECT="${PROJECT:-$DEFAULT_PROJECT}"
# Pages deploys run outside packages/server, so wrangler.toml's account_id is passed on here.
ACCOUNT_ID="$(sed -n 's/^account_id = "\(.*\)"$/\1/p' "$REPO_ROOT/packages/server/wrangler.toml")"
[[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "$ACCOUNT_ID" ]] || export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
PAGE_REF="${PAGE_REF:-HEAD}"
VERSION="$("$REPO_ROOT/scripts/version-label.sh" "$PAGE_DIR" "$PAGE_REF")"
SHA="${VERSION##* (}"; SHA="${SHA%)}"
[[ "$SHA" == "$(git -C "$PAGE_DIR" rev-parse --short HEAD)" ]] \
  || { echo "$PAGE_REF ($SHA) is not the commit checked out in $PAGE_DIR" >&2; exit 1; }
if [[ -n "$(git -C "$PAGE_DIR" status --porcelain --untracked-files=no)" ]]; then
  if [[ "$VERSION" == *")" ]]; then VERSION="${VERSION%)}-dirty)"; else VERSION="$VERSION-dirty"; fi
fi
# The Worker this Page talks to: its /version reads the Page's version.json.
WORKER_URL="${VITE_WS_URL%/ws}"; WORKER_URL="${WORKER_URL/#wss:/https:}"; WORKER_URL="${WORKER_URL/#ws:/http:}"
cd "$PAGE_DIR"
echo "building the Page $VERSION from $PAGE_DIR with VITE_WS_URL=$VITE_WS_URL"
VITE_WS_URL="$VITE_WS_URL" npm run build
grep -q "${VITE_WS_URL#wss://}" dist/assets/*.js || { echo "built assets do not contain $VITE_WS_URL" >&2; exit 1; }
VERSION="$VERSION" node -e 'process.stdout.write(JSON.stringify({ version: process.env.VERSION }) + "\n")' > dist/version.json
npx wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
echo "Page $VERSION live at https://$PROJECT.pages.dev/"
"$REPO_ROOT/scripts/check-version.sh" "$WORKER_URL/mcp" --viewer "$VERSION"
