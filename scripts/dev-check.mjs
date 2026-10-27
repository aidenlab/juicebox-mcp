#!/usr/bin/env node
// Call one MCP tool on the Juicebot dev Worker, bound to a room, and print the result text.
//
//   node scripts/dev-check.mjs <room> <tool> ['<json args>']
//   node scripts/dev-check.mjs T35CHECKCQ list_panels
//   node scripts/dev-check.mjs T35CHECKCQ load_map '{"url":"https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/31811e40-e3ca-4456-8ba6-2ee66d6c7104/4DNFI7J8BQ4P.hic","panel":"new"}'
//   (a map known to load in the page; an ENCODE portal download URL may fail with "Failed to fetch")
//
// Use a throwaway room (open https://juicebot-view-dev.pages.dev/?room=<room> in a tab first), never
// a room someone is working in: the room asks its first live page for the session on every
// join, and a probe that does not ack breaks that room for everyone in it.
//
// Why this exists: the Claude Code juicebot plugin and Claude Desktop connectors point at
// production (juicebot-mcp.3dg.io), whose rooms are a different Durable Object namespace from
// the dev Worker's, so they cannot drive a page on the dev stack. MCP_URL overrides.
const [room, tool, argsJson = '{}'] = process.argv.slice(2);
if (!room || !tool) {
  console.error('usage: node scripts/dev-check.mjs <room> <tool> [json-args]');
  process.exit(2);
}
const url = process.env.MCP_URL || 'https://juicebot-view-mcp-dev.3dg.io/mcp';
const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

async function rpc(id, method, params, sessionId) {
  const res = await fetch(url, {
    method: 'POST',
    headers: sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = JSON.parse(text.match(/data: (.*)/)[1]); // SSE-framed answer
  }
  return [json, res.headers.get('mcp-session-id')];
}

const [, sessionId] = await rpc(1, 'initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'dev-check', version: '0' },
});
// A refused join leaves the session in its own new room, with no page: stop rather than probe it.
const [joined] = await rpc(2, 'tools/call', { name: 'join_room', arguments: { room } }, sessionId);
if (joined.result?.isError || joined.error) {
  const why = (joined.result?.content || []).map((c) => c.text).join('\n');
  console.error(why || JSON.stringify(joined, null, 2));
  process.exit(1);
}
const [reply] = await rpc(3, 'tools/call', { name: tool, arguments: JSON.parse(argsJson) }, sessionId);
const text = (reply.result?.content || []).map((c) => c.text).join('\n');
console.log(text || JSON.stringify(reply, null, 2));
if (reply.result?.isError || reply.error) process.exit(1);
