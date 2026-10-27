#!/usr/bin/env bash
# Deploy juicebox-view and its Worker to the Juicebot dev stack, for testing before a release
# (docs/test-deployment.md):
#   scripts/deploy-test.sh [view] <page-repo> [branch-or-tag] [mcp-ref]
#
#   juicebox-view → Pages juicebot-view-dev (juicebot-view-dev.pages.dev),
#   Worker juicebot-view-mcp-dev (wrangler --env view-dev, juicebot-view-mcp-dev.3dg.io)
#
# <page-repo> is your clone of juicebox-view. It is checked out at [branch-or-tag] (default: its
# main branch) into a throwaway worktree and uploaded by scripts/deploy-web-dev.sh. A tag or a
# local branch is used as it is in the clone; a branch only on origin is fetched. The Worker is
# deployed from juicebox-mcp at [mcp-ref] (default HEAD), also from a worktree, so uncommitted
# changes never ship. WORKER=0 deploys the Page only. The leading `view` is optional, kept for
# the commands written when a second (juicebox-web) stack existed.
set -euo pipefail

USAGE="usage: scripts/deploy-test.sh [view] <page-repo> [branch-or-tag] [mcp-ref]"
[[ "${1:-}" == view ]] && shift
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER_ENV=view-dev
PAGE_URL=https://juicebot-view-dev.pages.dev/
MCP_URL=https://juicebot-view-mcp-dev.3dg.io/mcp
PAGE_REPO="${1:?$USAGE}"
MCP_REF="${3:-HEAD}"
git -C "$PAGE_REPO" rev-parse --git-dir >/dev/null 2>&1 || { echo "$PAGE_REPO is not a git clone" >&2; exit 1; }
git -C "$PAGE_REPO" fetch -q --tags origin || echo "could not fetch $PAGE_REPO's origin; using what the clone has" >&2
PAGE_REF="${2:-$(git -C "$PAGE_REPO" ls-remote --symref origin HEAD | sed -n 's|^ref: refs/heads/\(.*\)\tHEAD$|\1|p')}"
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
echo "Page $(git -C "$WORK/page" rev-parse --short HEAD) at $PAGE_REF"

if [[ "$WORKER" != 0 ]]; then
  git -C "$REPO_ROOT" worktree add -q --detach "$WORK/mcp" "$MCP_REF"
  echo "juicebox-mcp $(git -C "$WORK/mcp" rev-parse --short HEAD) at $MCP_REF"
  (cd "$WORK/mcp" && npm install --no-audit --no-fund --loglevel=error)
  (cd "$WORK/mcp/packages/server" && npx wrangler deploy --env "$WRANGLER_ENV" --message "test: page $PAGE_REF, mcp $MCP_REF")
fi

(cd "$WORK/page" && npm ci --no-audit --no-fund --loglevel=error)
PAGE_DIR="$WORK/page" "$REPO_ROOT/scripts/deploy-web-dev.sh"
echo "test deploy at $PAGE_REF: $PAGE_URL and $MCP_URL"
