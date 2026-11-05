#!/usr/bin/env bash
# Deploy geenee's Juicebox prod Deployment ("view-prod") from one release tag, never from a
# working tree:
#   scripts/deploy-view-prod.sh view-prod-YYYY-MM-DD[.N] [--repo <path>]
# --repo is the juicebox-view clone (default ../juicebox-view). The tag must exist on origin in
# both juicebox-mcp and juicebox-view (same name). Both are checked out into throwaway worktrees
# at the tag; the Worker `juicebox-view-mcp` (wrangler --env view-prod, juicebox-view-mcp.3dg.io)
# and the Pages project `juicebox-view` (juicebox-view.pages.dev) are deployed from there. Roll
# back by deploying the previous view-prod- tag. The Worker reports `<tag> (<short sha>)` as its
# MCP serverInfo.version, checked live after deploying. Releasing: tag juicebox-mcp main and
# juicebox-view main with the same `view-prod-` name, push both tags, run this.
#
# Juicebot production (`prod-` tags, scripts/deploy-prod.sh) is a separate Deployment; the
# `view-prod-` prefix keeps a tag naming exactly one release (aidenlab/juicebox-mcp#21).
#
# Once, before the first release (from packages/server):
#   CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e \
#     npx wrangler pages project create juicebox-view --production-branch main
# and after it, the Worker's secrets (or DEPLOY_ENV=view-prod scripts/deploy-wizard.sh):
#   npx wrangler secret put TINYURL_API_KEY --env view-prod
#   npx wrangler secret put SESSION_HMAC_SECRET --env view-prod
set -euo pipefail

USAGE="usage: scripts/deploy-view-prod.sh view-prod-YYYY-MM-DD[.N] [--repo <path>]"
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
[[ $# -eq 1 ]] || { echo "$USAGE" >&2; exit 2; }
[[ "$TAG" =~ ^view-prod-[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$ ]] \
  || { echo "not a view-prod release tag: $TAG (view-prod-YYYY-MM-DD[.N])" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_URL=https://juicebox-view-mcp.3dg.io/mcp
PAGE_URL=https://juicebox-view.pages.dev/
VIEW_REPO="${VIEW_REPO:-$REPO_ROOT/../juicebox-view}"
[[ -d "$VIEW_REPO/.git" || -f "$VIEW_REPO/.git" ]] || { echo "no juicebox-view clone at $VIEW_REPO; pass --repo" >&2; exit 1; }
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
VERSION="$("$REPO_ROOT/scripts/version-label.sh" "$REPO_ROOT" "$TAG")"
(cd "$WORK/mcp/packages/server" && npx wrangler deploy --env view-prod --var "SERVER_VERSION:$VERSION" --message "$TAG")

(cd "$WORK/view" && npm ci --no-audit --no-fund --loglevel=error)
PAGE_DIR="$WORK/view" PROJECT=juicebox-view VITE_WS_URL=wss://juicebox-view-mcp.3dg.io/ws \
  "$WORK/mcp/scripts/deploy-page.sh"
# After the Page, so a slow Worker rollout never leaves the old Page beside the new Worker.
"$REPO_ROOT/scripts/check-version.sh" "$MCP_URL" "$VERSION"
echo "released $TAG: $PAGE_URL and $MCP_URL"
