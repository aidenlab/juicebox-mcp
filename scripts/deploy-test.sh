#!/usr/bin/env bash
# Deploy a tagged Page and its Worker to one of the two Juicebot dev stacks, for testing before a
# release (docs/test-deployment.md):
#   scripts/deploy-test.sh <web|view> <page-repo> [branch-or-tag] [mcp-ref]
#
#   web   juicebox-web fork → Pages juicebot-web-dev (juicebot-dev.3dg.io),
#         Worker juicebot-mcp-dev (wrangler --env dev, juicebot-mcp-dev.3dg.io)
#   view  juicebox-view → Pages juicebot-view-dev (juicebot-view-dev.pages.dev),
#         Worker juicebot-view-mcp-dev (wrangler --env view-dev, juicebot-view-mcp-dev.3dg.io)
#
# <page-repo> is your clone of juicebox-web (web) or juicebox-view (view). It is checked out at
# [branch-or-tag] (default: the repo's main branch, master for juicebox-web and main for
# juicebox-view) into a throwaway worktree and uploaded by scripts/deploy-web-dev.sh. A tag or a
# local branch is used as it is in the clone; a branch only on origin is fetched. The Worker is deployed from juicebox-mcp at [mcp-ref] (default HEAD),
# also from a worktree, so uncommitted changes never ship. WORKER=0 deploys the Page only.
# A deploy to one stack never touches the other.
set -euo pipefail

USAGE="usage: scripts/deploy-test.sh <web|view> <page-repo> [branch-or-tag] [mcp-ref]"
STACK="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$STACK" in
  web)
    WRANGLER_ENV=dev
    PAGE_URL=https://juicebot-dev.3dg.io/
    MCP_URL=https://juicebot-mcp-dev.3dg.io/mcp ;;
  view)
    WRANGLER_ENV=view-dev
    PAGE_URL=https://juicebot-view-dev.pages.dev/
    MCP_URL=https://juicebot-view-mcp-dev.3dg.io/mcp ;;
  *)
    echo "$USAGE" >&2; exit 2 ;;
esac
PAGE_REPO="${2:?$USAGE}"
MCP_REF="${4:-HEAD}"
git -C "$PAGE_REPO" rev-parse --git-dir >/dev/null 2>&1 || { echo "$PAGE_REPO is not a git clone" >&2; exit 1; }
git -C "$PAGE_REPO" fetch -q --tags origin || echo "could not fetch $PAGE_REPO's origin; using what the clone has" >&2
PAGE_REF="${3:-$(git -C "$PAGE_REPO" ls-remote --symref origin HEAD | sed -n 's|^ref: refs/heads/\(.*\)\tHEAD$|\1|p')}"
[[ -n "$PAGE_REF" ]] || { echo "could not find $PAGE_REPO's main branch; give a branch or tag" >&2; exit 1; }
WORKER="${WORKER:-1}"

WORK="$(mktemp -d)"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORK/mcp" 2>/dev/null || true
  git -C "$PAGE_REPO" worktree remove --force "$WORK/page" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

PAGE_COMMIT=""
for ref in "refs/tags/$PAGE_REF" "refs/heads/$PAGE_REF" "refs/remotes/origin/$PAGE_REF"; do
  if PAGE_COMMIT="$(git -C "$PAGE_REPO" rev-parse -q --verify "$ref^{commit}")"; then break; fi
done
[[ -n "$PAGE_COMMIT" ]] || { echo "$PAGE_REF is neither a tag nor a branch of $PAGE_REPO" >&2; exit 1; }
git -C "$PAGE_REPO" worktree add -q --detach "$WORK/page" "$PAGE_COMMIT"
echo "$STACK Page $(git -C "$WORK/page" rev-parse --short HEAD) at $PAGE_REF"

if [[ "$WORKER" != 0 ]]; then
  git -C "$REPO_ROOT" worktree add -q --detach "$WORK/mcp" "$MCP_REF"
  echo "juicebox-mcp $(git -C "$WORK/mcp" rev-parse --short HEAD) at $MCP_REF"
  (cd "$WORK/mcp" && npm install --no-audit --no-fund --loglevel=error)
  (cd "$WORK/mcp/packages/server" && npx wrangler deploy --env "$WRANGLER_ENV" --message "test $STACK: page $PAGE_REF, mcp $MCP_REF")
fi

if [[ "$STACK" == web ]]; then
  # juicebox-web depends on igvteam/infinite-table by git URL; npm >= 12 refuses git deps unless allowed.
  (cd "$WORK/page" && npm ci --allow-git=root --no-audit --no-fund --loglevel=error)
else
  (cd "$WORK/page" && npm ci --no-audit --no-fund --loglevel=error)
fi
PAGE_DIR="$WORK/page" "$REPO_ROOT/scripts/deploy-web-dev.sh" "$STACK"
echo "test deploy of $STACK at $PAGE_REF: $PAGE_URL and $MCP_URL"
