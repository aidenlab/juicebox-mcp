#!/usr/bin/env bash
# Deploy Juicebot production from one release tag, never from a working tree:
#   scripts/deploy-prod.sh prod-YYYY-MM-DD [--repo <path>]
# --repo is the juicebox-view clone (default ../juicebox-view). The tag must exist on origin
# in both juicebox-mcp and juicebox-view (same name). Both are checked out into throwaway
# worktrees at the tag; the Worker `juicebot-mcp` (wrangler --env prod, juicebot-mcp.3dg.io) and
# the Pages project `juicebot-web` (juicebot.3dg.io) are deployed from there. Roll back by
# deploying the previous tag with the script from that tag: up to prod-2026-10-11.1 the page was
# juicebox-web and the script at those tags builds it. Releasing: tag juicebox-mcp main and
# juicebox-view main with the same `prod-` name, push both tags, run this.
set -euo pipefail

USAGE="usage: scripts/deploy-prod.sh prod-YYYY-MM-DD [--repo <path>]"
ARGS=()
while (($#)); do
  case "$1" in
    --repo) VIEW_REPO="${2:?$USAGE}"; shift 2 ;;
    --repo=*) VIEW_REPO="${1#--repo=}"; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"
TAG="${1:?$USAGE}"
[[ "$TAG" =~ ^prod-[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$ ]] || { echo "not a release tag: $TAG (prod-YYYY-MM-DD[.N])" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIEW_REPO="${VIEW_REPO:-$REPO_ROOT/../juicebox-view}"
WORK="$(mktemp -d)"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORK/mcp" 2>/dev/null || true
  git -C "$VIEW_REPO" worktree remove --force "$WORK/view" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

for repo in "$REPO_ROOT" "$VIEW_REPO"; do
  git -C "$repo" ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null \
    || { echo "tag $TAG is not on origin of $repo; push it first" >&2; exit 1; }
  git -C "$repo" fetch -q origin "refs/tags/$TAG:refs/tags/$TAG"
done

git -C "$REPO_ROOT" worktree add -q --detach "$WORK/mcp" "$TAG"
git -C "$VIEW_REPO" worktree add -q --detach "$WORK/view" "$TAG"
echo "juicebox-mcp $(git -C "$WORK/mcp" rev-parse --short HEAD), juicebox-view $(git -C "$WORK/view" rev-parse --short HEAD) at $TAG"

(cd "$WORK/mcp" && npm install --no-audit --no-fund --loglevel=error)
(cd "$WORK/mcp/packages/server" && npx wrangler deploy --env prod --message "$TAG")

(cd "$WORK/view" && npm ci --no-audit --no-fund --loglevel=error)
PAGE_DIR="$WORK/view" PROJECT=juicebot-web VITE_WS_URL=wss://juicebot-mcp.3dg.io/ws \
  "$WORK/mcp/scripts/deploy-web-dev.sh"
echo "released $TAG: https://juicebot.3dg.io/ and https://juicebot-mcp.3dg.io/mcp"
