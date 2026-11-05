#!/usr/bin/env bash
# Print the full sha of the juicebox-view commit a release builds the Page from, and fetch it
# into the clone (aidenlab/juicebox-mcp#31):
#   scripts/resolve-viewer.sh <mcp-checkout> <view-repo> <tag>
#
# <mcp-checkout> is juicebox-mcp checked out at the release <tag>; <view-repo> a clone of
# juicebox-view. The commit is the one <mcp-checkout>/viewer.pin names, and it must be on
# juicebox-view's origin. A tag from before the pin (no viewer.pin in its commit) builds the
# juicebox-view tag of the same name, as releases did then, so rolling back to it still works.
# A pin behind juicebox-view's origin/main is noted on stderr, not refused.
set -euo pipefail

USAGE="usage: scripts/resolve-viewer.sh <mcp-checkout> <view-repo> <tag>"
[[ $# -eq 3 ]] || { echo "$USAGE" >&2; exit 2; }
MCP="$1"; VIEW="$2"; TAG="$3"
g() { git -C "$VIEW" "$@"; }

g fetch -q --prune origin
if [[ ! -f "$MCP/viewer.pin" ]]; then
  g ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null \
    || { echo "$TAG has no viewer.pin, and juicebox-view's origin has no tag $TAG to fall back to" >&2; exit 1; }
  g fetch -q origin "refs/tags/$TAG:refs/tags/$TAG"
  echo "$TAG has no viewer.pin; building juicebox-view's tag $TAG" >&2
  g rev-parse "refs/tags/$TAG^{commit}"
  exit 0
fi
SHA="$(tr -d '[:space:]' < "$MCP/viewer.pin")"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "viewer.pin at $TAG holds '$SHA', not a full 40-character sha" >&2; exit 1; }
# On origin: reachable from one of origin's branches, so the pinned Page can always be rebuilt.
[[ -n "$(g for-each-ref --count=1 --contains "$SHA" refs/remotes/origin 2>/dev/null)" ]] \
  || { echo "viewer.pin at $TAG names $SHA, which is not on juicebox-view's origin (no branch there holds it); push it first" >&2; exit 1; }
BEHIND="$(g rev-list --count "$SHA..refs/remotes/origin/main" 2>/dev/null || echo 0)"
if ((BEHIND > 0)); then
  echo "note: viewer.pin ${SHA:0:7} is $BEHIND commits behind juicebox-view origin/main ($(g rev-parse --short refs/remotes/origin/main)); scripts/pin-viewer.sh moves it" >&2
fi
echo "$SHA"
