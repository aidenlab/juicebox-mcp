/**
 * Cloudflare Worker entry point for Juicebox MCP Server.
 *
 * Routes:
 *   GET  /ws?room=        - WebSocket upgrade → the room's Durable Object (pages); Origin allow-list, room id check
 *   POST /mcp             - MCP protocol (tool calls, initialization)
 *   GET  /mcp             - 405 (SSE not supported; JSON responses only)
 *   DELETE /mcp           - MCP protocol (session termination)
 *   OPTIONS /mcp          - CORS preflight
 *   GET  /version         - what this Deployment runs: the Worker's version and the page's version.json
 *                           (JSON; a page instead when the request asks for HTML, as a browser does)
 *   GET  /*               - 404 (the viewer is hosted by the Page, juicebox-view, not this Worker)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerTools } from './mcp/toolHandlers.js';
import { roomForSession } from './room.js';
import { ROOM_ID, roomIdFromBytes, mintRoomId } from './roomId.js';
import { logInfo, logWarn, logError } from './lib/logger.js';
import { versionPage } from './versionPage.js';

// Re-export the Durable Object classes so Cloudflare can find them
export { WebSocketRoom } from './durableObjects/WebSocketRoom.js';
export { McpSession } from './durableObjects/McpSession.js';

/**
 * Derive a stable room id from a vendor-specific header value using HMAC-SHA256,
 * so the same value always binds the same room. Avoids leaking raw tokens
 * (e.g., x-openai-session) in URLs.
 */
async function deriveSessionId(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return roomIdFromBytes(new Uint8Array(sig));
}

const PAGE_VERSION_TIMEOUT_MS = 5000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id',
};

function corsResponse(response) {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- WebSocket upgrade → the room's Durable Object ---
    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      if (!env.ALLOWED_ORIGINS.includes(request.headers.get('Origin'))) {
        logWarn(`[WS] refused Origin: ${request.headers.get('Origin')}`);
        return new Response('Origin not allowed', { status: 403 });
      }
      // No room given: mint one. The Durable Object reads it back from the URL.
      const room = url.searchParams.get('room') || mintRoomId();
      if (!ROOM_ID.test(room)) {
        logWarn(`[WS] refused room: ${room}`);
        return new Response('room must be 10 Crockford base32 characters', { status: 400 });
      }
      url.searchParams.set('room', room);
      const stub = env.WEBSOCKET_ROOM.get(env.WEBSOCKET_ROOM.idFromName(room));
      return stub.fetch(new Request(url, request));
    }

    // --- CORS preflight for /mcp ---
    if (url.pathname === '/mcp' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // --- MCP protocol endpoints ---
    if (url.pathname === '/mcp') {
      // Reject GET /mcp (SSE streams) — Workers can't hold long-lived connections.
      // We use enableJsonResponse mode so SSE is not needed.
      if (request.method === 'GET') {
        return new Response('SSE not supported in Workers deployment. Use Streamable HTTP (POST) mode.', {
          status: 405,
          headers: { ...CORS_HEADERS, 'Allow': 'POST, DELETE, OPTIONS' }
        });
      }
      return corsResponse(await handleMcpRequest(request, env));
    }

    if (url.pathname === '/version' && request.method === 'GET') {
      return versionResponse(request, env);
    }

    // The viewer is hosted by the Page (juicebox-view), not this Worker.
    return new Response('Not Found', { status: 404 });
  }
};

/**
 * GET /version (aidenlab/juicebox-mcp#23): `{worker, viewer}`, the shape geenee reads from every
 * Upstream. `worker` is the MCP serverInfo.version; `viewer` is the page's own version.json (at
 * BROWSER_URL's root, written by scripts/deploy-page.sh), fetched now, not cached, with its `url`
 * added. A page that cannot be read gives `viewer: {url, error}`, and /version still answers 200.
 * A request whose Accept names text/html (a browser opening the address) gets the same answer as a
 * page; everything else (scripts/check-version.sh, curl) gets the JSON.
 */
async function versionResponse(request, env) {
  const url = new URL('/version.json', env.BROWSER_URL).href;
  const body = { worker: serverVersion(env), viewer: { url, ...await pageVersion(url) } };
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if ((request.headers.get('Accept') || '').includes('text/html')) {
    return new Response(versionPage(new URL(request.url).origin, body), {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  return Response.json(body, { headers });
}

/** The page's version.json as an object, else `{error}` saying what failed. */
async function pageVersion(url) {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(PAGE_VERSION_TIMEOUT_MS) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const page = await res.json().catch(() => null);
    // A page with no version.json may answer its index.html (single-page fallback) with 200.
    if (!page || typeof page !== 'object' || Array.isArray(page)) return { error: 'version.json is not a JSON object' };
    // `url` is where the Worker read the file, so a `url` in the file itself gives way to it.
    const { url: _pageUrl, ...rest } = page;
    return rest;
  } catch (error) {
    logWarn(`[version] ${url}: ${error.message}`);
    return { error: error.name === 'TimeoutError' ? `no answer in ${PAGE_VERSION_TIMEOUT_MS / 1000} s` : error.message };
  }
}

/** What this Deployment runs, `<tag or branch> (<short sha>)`: set from git by the deploy scripts
 * (`wrangler deploy --var SERVER_VERSION:…`, scripts/version-label.sh). Unset under `wrangler dev`
 * and the tests. */
function serverVersion(env) {
  return env.SERVER_VERSION || 'local';
}

/**
 * Handle MCP protocol requests (POST, GET, DELETE).
 *
 * Because Workers are stateless, we create a fresh McpServer + transport per request.
 * A stateless transport accepts tool calls without a prior initialize.
 */
async function handleMcpRequest(request, env) {
  try {
    // Parse the request body up front so we can inspect and replay it
    let body = null;
    if (request.method === 'POST') {
      body = await request.json();
    }

    const sessionId = request.headers.get('mcp-session-id');
    const openaiSession = request.headers.get('x-openai-session');
    logInfo(`[MCP] ${request.method} ${body?.method || 'N/A'} | mcp-session-id: ${sessionId || 'NONE'} | x-openai-session: ${openaiSession ? 'present' : 'NONE'}`);

    // Create a new MCP server for this request
    const mcpServer = new McpServer({
      // SERVER_NAME tells side-by-side stacks apart in a host's connector list ([env.view-dev]).
      name: env.SERVER_NAME || 'juicebox-server',
      version: serverVersion(env),
      // The aidenlab.org favicon; hosts that render serverInfo icons show it beside the connector.
      icons: [{ src: 'https://aidenlab.org/favicon.ico', mimeType: 'image/x-icon', sizes: ['16x16'] }]
    });

    // Stateless transport — no session ID validation.
    // We manage session IDs at the Worker level (from request headers).
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Build the deps object for tool handlers
    const browserUrl = env.BROWSER_URL || 'https://juicebox-mcp.workers.dev';

    // Fallback: ChatGPT doesn't echo mcp-session-id back, but sends x-openai-session on every request.
    // HMAC the raw token so it's not exposed in browser URLs. No secret, no fallback key.
    if (!sessionId && openaiSession && !env.SESSION_HMAC_SECRET) {
      logError('[MCP] SESSION_HMAC_SECRET is not set; refusing x-openai-session request');
      return Response.json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Server misconfigured: SESSION_HMAC_SECRET is not set' },
        id: body?.id ?? null
      }, { status: 500 });
    }
    const effectiveSessionId = sessionId ||
      (openaiSession ? await deriveSessionId(openaiSession, env.SESSION_HMAC_SECRET) : null);

    const deps = {
      sessionId: effectiveSessionId,
      browserUrl,
      log: { logInfo, logWarn, logError },
      room: roomForSession(env, effectiveSessionId),
    };

    // Register all tools
    registerTools(mcpServer, deps);

    // Connect the server to the transport
    await mcpServer.connect(transport);

    const isInit = body?.method === 'initialize' ||
      (Array.isArray(body) && body.some(m => m.method === 'initialize'));

    // Handle the actual request
    const response = await transport.handleRequest(request, body ? { parsedBody: body } : undefined);

    // For initialize responses in stateless mode, inject a session ID header
    // so MCP clients can use it for subsequent requests and WebSocket routing.
    if (isInit && !response.headers.has('mcp-session-id')) {
      const newSessionId = effectiveSessionId || mintRoomId();
      const patched = new Response(response.body, response);
      patched.headers.set('mcp-session-id', newSessionId);
      return patched;
    }

    return response;
  } catch (error) {
    logError('Error handling MCP request:', error);
    return Response.json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: null
    }, { status: 500 });
  }
}

