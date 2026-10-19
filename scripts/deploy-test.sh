#!/usr/bin/env bash
# Deploy a tagged Page and its Worker to one of the two Juicebot dev stacks, for testing before a
# release (docs/test-deployment.md):
#   scripts/deploy-test.sh <web|view> <tag> [mcp-ref]
#
#   web   juicebox-web fork at <tag> → Pages juicebot-web-dev (juicebot-dev.3dg.io),
#         Worker juicebot-mcp-dev (wrangler --env dev, juicebot-mcp-dev.3dg.io)
#   view  juicebox-view at <tag> → Pages juicebot-view-dev (juicebot-view-dev.3dg.io),
#         Worker juicebot-view-mcp-dev (wrangler --env view-dev, juicebot-view-mcp-dev.3dg.io)
#
# The Page repo (WEB_REPO / VIEW_REPO, default ../juicebox-web / ../juicebox-view) is checked out
# at <tag> (local, else fetched from origin) into a throwaway worktree and uploaded by
# scripts/deploy-web-dev.sh. The Worker is deployed from juicebox-mcp at [mcp-ref] (default HEAD),
# also from a worktree, so uncommitted changes never ship. WORKER=0 deploys the Page only.
# A deploy to one stack never touches the other. Production is released only by
# scripts/deploy-prod.sh.
set -euo pipefail

USAGE="usage: scripts/deploy-test.sh <web|view> <tag> [mcp-ref]"
STACK="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$STACK" in
  web)
    PAGE_REPO="${WEB_REPO:-$REPO_ROOT/../juicebox-web}"
    WRANGLER_ENV=dev
    PAGE_URL=https://juicebot-dev.3dg.io/
    MCP_URL=https://juicebot-mcp-dev.3dg.io/mcp ;;
  view)
    PAGE_REPO="${VIEW_REPO:-$REPO_ROOT/../juicebox-view}"
    WRANGLER_ENV=view-dev
    PAGE_URL=https://juicebot-view-dev.3dg.io/
    MCP_URL=https://juicebot-view-mcp-dev.3dg.io/mcp ;;
  *)
    echo "$USAGE" >&2; exit 2 ;;
esac
TAG="${2:?$USAGE}"
MCP_REF="${3:-HEAD}"
WORKER="${WORKER:-1}"

WORK="$(mktemp -d)"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORK/mcp" 2>/dev/null || true
  git -C "$PAGE_REPO" worktree remove --force "$WORK/page" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if ! git -C "$PAGE_REPO" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  git -C "$PAGE_REPO" fetch -q origin "refs/tags/$TAG:refs/tags/$TAG" \
    || { echo "tag $TAG is neither in $PAGE_REPO nor on its origin" >&2; exit 1; }
fi
git -C "$PAGE_REPO" worktree add -q --detach "$WORK/page" "refs/tags/$TAG"
echo "$STACK Page $(git -C "$WORK/page" rev-parse --short HEAD) at $TAG"

if [[ "$WORKER" != 0 ]]; then
  git -C "$REPO_ROOT" worktree add -q --detach "$WORK/mcp" "$MCP_REF"
  echo "juicebox-mcp $(git -C "$WORK/mcp" rev-parse --short HEAD) at $MCP_REF"
  (cd "$WORK/mcp" && npm install --no-audit --no-fund --loglevel=error)
  (cd "$WORK/mcp/packages/server" && npx wrangler deploy --env "$WRANGLER_ENV" --message "test $STACK: page $TAG, mcp $MCP_REF")
fi

if [[ "$STACK" == web ]]; then
  # juicebox-web depends on igvteam/infinite-table by git URL; npm >= 12 refuses git deps unless allowed.
  (cd "$WORK/page" && npm ci --allow-git=root --no-audit --no-fund --loglevel=error)
else
  (cd "$WORK/page" && npm ci --no-audit --no-fund --loglevel=error)
fi
PAGE_DIR="$WORK/page" "$REPO_ROOT/scripts/deploy-web-dev.sh" "$STACK"
echo "test deploy of $STACK at $TAG: $PAGE_URL and $MCP_URL"
