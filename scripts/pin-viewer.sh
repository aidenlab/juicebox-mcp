#!/usr/bin/env bash
# Pin the juicebox-view commit production Pages are built from (aidenlab/juicebox-mcp#31):
#   scripts/pin-viewer.sh [<ref>] [--repo <path>]
#
# --repo is the juicebox-view clone (default ../juicebox-view). Fetches its origin, resolves
# <ref> (default origin/main) to a full sha, refuses one no branch on origin holds, and writes
# it to viewer.pin at this repo's root.
# Commit that as "pin juicebox-view to <short sha>"; the next release tag carries it.
set -euo pipefail

USAGE="usage: scripts/pin-viewer.sh [<ref>] [--repo <path>]"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARGS=()
while (($#)); do
  case "$1" in
    --repo) VIEW_REPO="${2:?$USAGE}"; shift 2 ;;
    --repo=*) VIEW_REPO="${1#--repo=}"; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"
[[ $# -le 1 ]] || { echo "$USAGE" >&2; exit 2; }
REF="${1:-origin/main}"
VIEW_REPO="${VIEW_REPO:-$REPO_ROOT/../juicebox-view}"
g() { git -C "$VIEW_REPO" "$@"; }

g fetch -q --prune --tags origin
SHA="$(g rev-parse -q --verify "$REF^{commit}")" || { echo "$REF is not a commit of $VIEW_REPO" >&2; exit 1; }
# The same rule scripts/resolve-viewer.sh applies at release: a branch on origin holds it.
[[ -n "$(g for-each-ref --count=1 --contains "$SHA" refs/remotes/origin)" ]] \
  || { echo "$REF ($SHA) is not on juicebox-view's origin (no branch there holds it); push it first" >&2; exit 1; }
echo "$SHA" > "$REPO_ROOT/viewer.pin"
echo "viewer.pin → juicebox-view $(g rev-parse --short "$SHA") ($REF)"
