#!/usr/bin/env bash
# Deploy geenee's Juicebox prod Deployment ("view-prod") from one release tag, never from a
# working tree:
#   scripts/deploy-view-prod.sh view-prod-YYYY-MM-DD[.N] [--repo <path>]
# --repo is the juicebox-view clone (default ../juicebox-view). The tag must be on juicebox-mcp's
# origin; juicebox-view gets no release tags. juicebox-mcp is checked out at the tag and
# juicebox-view at the commit the tag's viewer.pin names (scripts/resolve-viewer.sh; a tag
# without viewer.pin uses juicebox-view's tag of the same name), each into a throwaway worktree.
# The Worker `juicebox-view-mcp` (wrangler --env view-prod, juicebox-view-mcp.3dg.io) and the
# Pages project `juicebox-view` (juicebox-view.pages.dev) are deployed from there. Roll back by
# deploying the previous view-prod- tag. The Worker reports `<tag> (<short sha>)` as its MCP
# serverInfo.version and the Page `<tag> (<juicebox-view short sha>)` as /version's viewer, both
# checked live after deploying. Releasing (docs/production-deployment.md): move the pin with
# scripts/pin-viewer.sh if the Page should change and merge that to main, tag juicebox-mcp main
# with a `view-prod-` name, push the tag, run this.
#
# Juicebot production (`prod-` tags, scripts/deploy-prod.sh) is a separate Deployment; the
# `view-prod-` prefix keeps a tag naming exactly one release (aidenlab/juicebox-mcp#21).
#
# Once, before the first release (from packages/server):
#   CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e \
#     npx wrangler pages project create juicebox-view --production-branch main
# and after it, the Worker's secret (or DEPLOY_ENV=view-prod scripts/deploy-wizard.sh):
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

git -C "$REPO_ROOT" ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null \
  || { echo "tag $TAG is not on juicebox-mcp's origin; push it first" >&2; exit 1; }
git -C "$REPO_ROOT" fetch -q origin "refs/tags/$TAG:refs/tags/$TAG"
git -C "$REPO_ROOT" worktree add -q --detach "$WORK/mcp" "$TAG"
# The Page's commit: viewer.pin at the tag, else (older tags) juicebox-view's tag of the same name.
VIEW_SHA="$("$REPO_ROOT/scripts/resolve-viewer.sh" "$WORK/mcp" "$VIEW_REPO" "$TAG")"
git -C "$VIEW_REPO" worktree add -q --detach "$WORK/view" "$VIEW_SHA"
echo "juicebox-mcp $(git -C "$WORK/mcp" rev-parse --short HEAD) at $TAG, juicebox-view $(git -C "$WORK/view" rev-parse --short HEAD)"

(cd "$WORK/mcp" && npm install --no-audit --no-fund --loglevel=error)
VERSION="$("$REPO_ROOT/scripts/version-label.sh" "$REPO_ROOT" "$TAG")"
(cd "$WORK/mcp/packages/server" && npx wrangler deploy --env view-prod --var "SERVER_VERSION:$VERSION" --message "$TAG")

(cd "$WORK/view" && npm ci --no-audit --no-fund --loglevel=error)
# PAGE_NAME labels the Page with the tag; PAGE_REF is for the deploy-page.sh of tags from before
# viewer.pin, which reads the label from juicebox-view's tag of the same name.
PAGE_DIR="$WORK/view" PAGE_REF="$TAG" PAGE_NAME="$TAG" PROJECT=juicebox-view VITE_WS_URL=wss://juicebox-view-mcp.3dg.io/ws \
  "$WORK/mcp/scripts/deploy-page.sh"
# After the Page, so a slow Worker rollout never leaves the old Page beside the new Worker.
"$REPO_ROOT/scripts/check-version.sh" "$MCP_URL" --worker "$VERSION"
echo "released $TAG: $PAGE_URL and $MCP_URL"
