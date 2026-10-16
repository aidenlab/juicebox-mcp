#!/usr/bin/env bash
# Deploy a tagged juicebox-web to the Juicebot dev stack, for testing before a release:
#   scripts/deploy-test.sh <web-tag> [mcp-ref]
# The juicebox-web fork is checked out at <web-tag> (local, else fetched from origin) into a
# throwaway worktree and uploaded to Pages `juicebot-web-dev` (juicebot-dev.3dg.io) by
# scripts/deploy-web-dev.sh. The dev Worker `juicebot-mcp-dev` (wrangler --env dev,
# juicebot-mcp-dev.3dg.io) is deployed from juicebox-mcp at [mcp-ref] (default HEAD), also
# from a worktree, so uncommitted changes never ship. WORKER=0 deploys the page only.
# Production is untouched; it is released only by scripts/deploy-prod.sh.
set -euo pipefail

WEB_TAG="${1:?usage: scripts/deploy-test.sh <web-tag> [mcp-ref]}"
MCP_REF="${2:-HEAD}"
WORKER="${WORKER:-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_REPO="${WEB_REPO:-$REPO_ROOT/../juicebox-web}"
WORK="$(mktemp -d)"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORK/mcp" 2>/dev/null || true
  git -C "$WEB_REPO" worktree remove --force "$WORK/web" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if ! git -C "$WEB_REPO" rev-parse -q --verify "refs/tags/$WEB_TAG" >/dev/null; then
  git -C "$WEB_REPO" fetch -q origin "refs/tags/$WEB_TAG:refs/tags/$WEB_TAG" \
    || { echo "tag $WEB_TAG is neither in $WEB_REPO nor on its origin" >&2; exit 1; }
fi
git -C "$WEB_REPO" worktree add -q --detach "$WORK/web" "refs/tags/$WEB_TAG"
echo "juicebox-web $(git -C "$WORK/web" rev-parse --short HEAD) at $WEB_TAG"

if [[ "$WORKER" != 0 ]]; then
  git -C "$REPO_ROOT" worktree add -q --detach "$WORK/mcp" "$MCP_REF"
  echo "juicebox-mcp $(git -C "$WORK/mcp" rev-parse --short HEAD) at $MCP_REF"
  (cd "$WORK/mcp" && npm install --no-audit --no-fund --loglevel=error)
  (cd "$WORK/mcp/packages/server" && npx wrangler deploy --env dev --message "test: web $WEB_TAG, mcp $MCP_REF")
fi

# juicebox-web depends on igvteam/infinite-table by git URL; npm >= 12 refuses git deps unless allowed.
(cd "$WORK/web" && npm ci --allow-git=root --no-audit --no-fund --loglevel=error)
WEB_DIR="$WORK/web" "$REPO_ROOT/scripts/deploy-web-dev.sh"
echo "test deploy of $WEB_TAG: https://juicebot-dev.3dg.io/ and https://juicebot-mcp-dev.3dg.io/mcp"
