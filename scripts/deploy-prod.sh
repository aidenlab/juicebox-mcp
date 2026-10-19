#!/usr/bin/env bash
# Deploy Juicebot production from one release tag, never from a working tree:
#   scripts/deploy-prod.sh prod-YYYY-MM-DD
# The tag must exist on origin in both juicebox-mcp and the juicebox-web fork (same name). Both
# are checked out into throwaway worktrees at the tag; the Worker `juicebot-mcp` (wrangler
# --env prod, juicebot-mcp.3dg.io) and the Pages project `juicebot-web` (juicebot.3dg.io) are
# deployed from there. Roll back by deploying the previous tag. Releasing: tag juicebox-mcp
# main and juicebox-web master with the same `prod-` name, push both tags, run this.
set -euo pipefail

TAG="${1:?usage: scripts/deploy-prod.sh prod-YYYY-MM-DD}"
[[ "$TAG" =~ ^prod-[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$ ]] || { echo "not a release tag: $TAG (prod-YYYY-MM-DD[.N])" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_REPO="${WEB_REPO:-$REPO_ROOT/../juicebox-web}"
WORK="$(mktemp -d)"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORK/mcp" 2>/dev/null || true
  git -C "$WEB_REPO" worktree remove --force "$WORK/web" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

for repo in "$REPO_ROOT" "$WEB_REPO"; do
  git -C "$repo" ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null \
    || { echo "tag $TAG is not on origin of $repo; push it first" >&2; exit 1; }
  git -C "$repo" fetch -q origin "refs/tags/$TAG:refs/tags/$TAG"
done

git -C "$REPO_ROOT" worktree add -q --detach "$WORK/mcp" "$TAG"
git -C "$WEB_REPO" worktree add -q --detach "$WORK/web" "$TAG"
echo "juicebox-mcp $(git -C "$WORK/mcp" rev-parse --short HEAD), juicebox-web $(git -C "$WORK/web" rev-parse --short HEAD) at $TAG"

(cd "$WORK/mcp" && npm install --no-audit --no-fund --loglevel=error)
(cd "$WORK/mcp/packages/server" && npx wrangler deploy --env prod --message "$TAG")

# juicebox-web depends on igvteam/infinite-table by git URL; npm >= 12 refuses git deps unless allowed.
(cd "$WORK/web" && npm ci --allow-git=root --no-audit --no-fund --loglevel=error)
WEB_DIR="$WORK/web" PROJECT=juicebot-web VITE_WS_URL=wss://juicebot-mcp.3dg.io/ws \
  "$WORK/mcp/scripts/deploy-web-dev.sh" web
echo "released $TAG: https://juicebot.3dg.io/ and https://juicebot-mcp.3dg.io/mcp"
