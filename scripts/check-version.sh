#!/usr/bin/env bash
# Check that a live Worker reports the version just deployed (its MCP serverInfo.version):
#   scripts/check-version.sh <mcp-url> <expected-version>
# Retries for about a minute while the new version spreads; exits 1 if it never shows.
set -euo pipefail

URL="${1:?usage: scripts/check-version.sh <mcp-url> <expected-version>}"
EXPECTED="${2:?usage: scripts/check-version.sh <mcp-url> <expected-version>}"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"check-version","version":"0"}}}'

live=""
for _ in $(seq 12); do
  live="$(curl -s --max-time 15 -X POST "$URL" \
      -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d "$INIT" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).result.serverInfo.version)}catch{}})' \
    || true)"
  if [[ "$live" == "$EXPECTED" ]]; then
    echo "$URL reports $live"
    exit 0
  fi
  sleep 5
done
echo "$URL reports '${live:-nothing}', not the $EXPECTED just deployed" >&2
exit 1
