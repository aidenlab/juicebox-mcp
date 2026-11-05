#!/usr/bin/env bash
# Check that a live Deployment reports what was just deployed:
#   scripts/check-version.sh <mcp-url> [--worker <version>] [--viewer <version>]
#
#   --worker   the Worker's MCP serverInfo.version (an initialize to <mcp-url>) and `worker` on its
#              /version (aidenlab/juicebox-mcp#19, #23)
#   --viewer   `viewer.version` on the Worker's /version: the Page's version.json (#23)
#
# /version is <mcp-url> with /mcp replaced by /version. Retries for about a minute while the new
# versions spread; exits 1 if they never all show.
set -euo pipefail

USAGE="usage: scripts/check-version.sh <mcp-url> [--worker <version>] [--viewer <version>]"
URL="${1:?$USAGE}"; shift
WORKER=""; VIEWER=""
while (($#)); do
  case "$1" in
    --worker) WORKER="${2:?$USAGE}"; shift 2 ;;
    --viewer) VIEWER="${2:?$USAGE}"; shift 2 ;;
    *) echo "$USAGE" >&2; exit 2 ;;
  esac
done
[[ -n "$WORKER$VIEWER" ]] || { echo "$USAGE" >&2; exit 2; }
VERSION_URL="${URL%/mcp}/version"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"check-version","version":"0"}}}'
# Print the JSON on stdin's value at a dotted path, or nothing.
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=process.argv[1].split(".").reduce((o,k)=>o[k],JSON.parse(s));if(v!==undefined)console.log(typeof v==="string"?v:JSON.stringify(v))}catch{}})' "$1"; }

report=""
for _ in $(seq 12); do
  version="$(curl -s --max-time 15 "$VERSION_URL" || true)"
  ok=1; report=""
  if [[ -n "$WORKER" ]]; then
    init="$(curl -s --max-time 15 -X POST "$URL" \
        -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d "$INIT" \
      | field result.serverInfo.version || true)"
    worker="$(printf '%s' "$version" | field worker || true)"
    [[ "$init" == "$WORKER" && "$worker" == "$WORKER" ]] || ok=0
    report+="$URL serverInfo.version '${init:-nothing}', $VERSION_URL worker '${worker:-nothing}' (expected $WORKER); "
  fi
  if [[ -n "$VIEWER" ]]; then
    viewer="$(printf '%s' "$version" | field viewer.version || true)"
    [[ "$viewer" == "$VIEWER" ]] || ok=0
    [[ -n "$viewer" ]] || viewer="$(printf '%s' "$version" | field viewer.error || true)"
    report+="$VERSION_URL viewer '${viewer:-nothing}' (expected $VIEWER); "
  fi
  if ((ok)); then
    echo "${report%; }"
    exit 0
  fi
  sleep 5
done
echo "not the versions just deployed: ${report%; }" >&2
exit 1
