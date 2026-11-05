#!/usr/bin/env bash
# Print the version a Worker built from <ref> of <repo> reports as its MCP serverInfo.version:
#   scripts/version-label.sh <repo> [ref]      (ref defaults to HEAD)
#
#   a tag            → prod-2026-11-12 (a1b2c3d)     (prod-…, view-prod-…, any tag)
#   a branch         → main (d4e5f6a)                (local, origin's, or origin/main → main)
#   HEAD             → its branch, else a tag at HEAD, else the bare short sha
#   any other commit → a tag at it, else the bare short sha
#
# The deploy scripts pass it to `wrangler deploy --var SERVER_VERSION:<label>`; nothing is bumped
# by hand (aidenlab/juicebox-mcp#19). A commit with no branch or tag (a detached HEAD, a sha) is
# reported as its bare short sha; with several tags, git describe picks one.
set -euo pipefail

REPO="${1:?usage: scripts/version-label.sh <repo> [ref]}"
REF="${2:-HEAD}"
g() { git -C "$REPO" "$@"; }

# The name decides which ref is read, so a tag and a branch sharing a name cannot mix.
NAME=""
FULL="$REF"
if g rev-parse -q --verify "refs/tags/$REF" >/dev/null; then
  NAME="$REF"; FULL="refs/tags/$REF"
elif [[ "$REF" == HEAD ]]; then
  NAME="$(g symbolic-ref -q --short HEAD || true)"
elif g rev-parse -q --verify "refs/heads/$REF" >/dev/null; then
  NAME="$REF"; FULL="refs/heads/$REF"
elif g rev-parse -q --verify "refs/remotes/origin/$REF" >/dev/null; then
  NAME="$REF"; FULL="refs/remotes/origin/$REF"
elif g rev-parse -q --verify "refs/remotes/$REF" >/dev/null; then
  NAME="${REF#*/}"; FULL="refs/remotes/$REF"
fi
SHA="$(g rev-parse -q --verify --short "$FULL^{commit}")" || { echo "$REF is not a commit of $REPO" >&2; exit 1; }
[[ -n "$NAME" ]] || NAME="$(g describe --tags --exact-match "$FULL^{commit}" 2>/dev/null || true)"

if [[ -n "$NAME" ]]; then echo "$NAME ($SHA)"; else echo "$SHA"; fi
