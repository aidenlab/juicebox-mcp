# MCP Inspector Connection Guide

## Overview

This guide explains how to connect the MCP Inspector to the Juicebox MCP server for testing and debugging.

## Important: Default Mode Behavior

**The server defaults to STDIO mode, not HTTP mode.** This is intentional and important to understand:

### Why STDIO Mode is the Default

1. **Claude Desktop Integration**: When Claude Desktop launches the server (as an MCPB bundle or subprocess), it pipes stdin/stdout. The server automatically detects this and uses STDIO mode - no configuration needed.

2. **MCPB Bundling**: The MCPB (MCP Bundle) format expects STDIO mode. Defaulting to STDIO ensures the server works correctly when bundled and distributed.

3. **Production Use**: In production with Claude Desktop, STDIO mode is the standard and expected behavior.

### When You Need HTTP Mode

HTTP mode is only needed for:
- **Testing with MCP Inspector** - The MCP Inspector requires HTTP/SSE transport
- **Development and debugging** - When you want to test the server independently

### How Mode Detection Works

The server detects the mode using:
```javascript
const isStdioMode = !forceHttpMode && !process.stdin.isTTY;
```

- **STDIO mode**: When `process.stdin.isTTY` is `false` (stdin is piped/redirected, as when spawned by Claude Desktop)
- **HTTP mode**: When `process.stdin.isTTY` is `true` (running in an interactive terminal) OR when explicitly forced with `--http` flag

**Important**: Even when running in a terminal, you must use the `--http` flag to ensure HTTP mode, as some environments may not reliably detect TTY status.

## Transport Types

The MCP Inspector UI distinguishes between two transport types:

1. **Streamable HTTP** - Full bidirectional transport using:
   - POST requests for client-to-server messages (JSON-RPC requests)
   - GET requests with Server-Sent Events (SSE) for server-to-client messages
   - This is what our server implements using `StreamableHTTPServerTransport`

2. **SSE** - Server-Sent Events only (unidirectional from server to client)
   - Not supported by our server implementation

## Connection Instructions

### Step 1: Start the Server in HTTP Mode

**You must explicitly enable HTTP mode** - the server defaults to STDIO mode for Claude Desktop compatibility.

Start the server with the `--http` flag to enable HTTP/SSE mode:

```bash
node server.js --http
```

Or using environment variable:

```bash
MCP_TRANSPORT=http node server.js
```

**Why the explicit flag?** The server defaults to STDIO mode because:
- Claude Desktop spawns it as a subprocess with piped stdin/stdout
- MCPB bundles expect STDIO mode
- This ensures production use works without configuration

For testing with MCP Inspector, you must explicitly request HTTP mode.

The server will display:
```
Running in HTTP/SSE mode
MCP Server endpoint: http://localhost:3010/mcp
For MCP Inspector:
  - Transport type: "streamable HTTP" (not "SSE")
  - Connection type: "direct"
  - Connection URL: http://localhost:3010/mcp
```

### Step 2: Configure MCP Inspector

In the MCP Inspector UI:

1. **Transport Type**: Select **"streamable HTTP"** (NOT "SSE")
2. **Connection Type**: Select **"direct"**
3. **Connection URL**: Enter `http://localhost:3010/mcp`

### Step 3: Connect

Click the connect button. The MCP Inspector should establish a connection and you should see:
- Initialization handshake
- Available tools listed
- Available resources listed

## Troubleshooting

### Connection Fails

1. **Verify server is running in HTTP mode**
   - Check that you see "Running in HTTP/SSE mode" in the server logs
   - If you see "Running in STDIO mode", restart with `--http` flag

2. **Check port availability**
   - Default port is 3010
   - Verify no other process is using it: `lsof -i :3010`
   - Change port if needed: `MCP_PORT=3012 node server.js --http`

3. **Verify transport type**
   - Must use "streamable HTTP", not "SSE"
   - The server uses `StreamableHTTPServerTransport` which requires both POST and GET/SSE endpoints

4. **Check CORS**
   - Server allows all origins by default (CORS configured)
   - If issues persist, check browser console for CORS errors

### Server Not Responding

1. **Check server logs**
   - Look for error messages in stderr
   - Check diagnostic log file (default: `/tmp/juicebox-mcp-server.log`)

2. **Test with curl**
   ```bash
   curl -X POST http://localhost:3010/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
   ```
   - Should return SSE stream with initialization response

## Technical Details

### Streamable HTTP Transport

The server implements the MCP streamable HTTP transport which uses:

- **POST `/mcp`**: For sending JSON-RPC requests from client to server
  - Requires `Content-Type: application/json`
  - Requires `Accept: application/json, text/event-stream`
  - Uses `mcp-session-id` header for session management

- **GET `/mcp`**: For receiving Server-Sent Events from server to client
  - Requires `mcp-session-id` header matching the POST session
  - Returns `text/event-stream` content type
  - Supports `last-event-id` header for reconnection

- **DELETE `/mcp`**: For session termination
  - Requires `mcp-session-id` header

### Session Management

1. Client sends POST request without `mcp-session-id` header (initialization)
2. Server creates new transport and generates session ID
3. Server returns session ID in `Mcp-Session-Id` response header
4. Client uses this session ID in subsequent requests
5. Client opens GET request with session ID to receive SSE stream
6. All subsequent POST requests include the session ID

## Example Session Flow

```
1. POST /mcp (no session ID)
   → Server creates session: abc-123
   → Response header: Mcp-Session-Id: abc-123
   → Response body: SSE stream with initialization result

2. GET /mcp (header: mcp-session-id: abc-123)
   → Server opens SSE stream for session abc-123
   → Client receives server messages via SSE

3. POST /mcp (header: mcp-session-id: abc-123)
   → Server routes to session abc-123 transport
   → Response via SSE stream opened in step 2
```

## Notes

- The server supports both STDIO mode (for Claude Desktop) and HTTP/SSE mode (for MCP Inspector)
- Only one mode can be active at a time
- Use `--http` flag to force HTTP mode when testing with MCP Inspector
- The WebSocket server (port 3011) is separate and used for browser communication, not MCP protocol

