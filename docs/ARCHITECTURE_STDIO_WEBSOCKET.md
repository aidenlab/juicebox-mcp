# Architecture: STDIO vs WebSocket Communication Channels

This document clarifies the relationship between STDIO (Standard I/O) transport and WebSocket connections in the Juicebox MCP server, and how they work together to enable communication between Claude Desktop, the MCP server, and the browser frontend.

## Overview: Two Independent Communication Channels

The Juicebox MCP server uses **two separate, independent communication channels** that serve completely different purposes:

1. **MCP Protocol Channel** (STDIO or HTTP/SSE) - For Claude Desktop ↔ MCP Server communication
2. **WebSocket Channel** - For MCP Server ↔ Browser Frontend communication

These channels operate **simultaneously** and are **complementary**, not alternatives.

## Channel 1: MCP Protocol (STDIO or HTTP/SSE)

### Purpose
Communication between Claude Desktop (or other MCP clients) and the MCP server.

### How It Works

**STDIO Mode (Claude Desktop):**
- Claude Desktop spawns your server as a subprocess
- Communication happens via `stdin` and `stdout`
- Uses JSON-RPC messages following the MCP protocol specification
- Claude Desktop sends tool call requests → Server responds with results

**HTTP/SSE Mode (ChatGPT, Cursor, etc.):**
- Uses HTTP POST requests and Server-Sent Events (SSE)
- Same MCP protocol messages, different transport mechanism
- Useful for remote clients or when STDIO isn't available

### What This Channel Handles
- Tool registration (server tells Claude what tools are available)
- Tool calls (Claude requests: "load this map", "zoom in", etc.)
- Tool responses (server returns: "Map loaded successfully")
- MCP protocol messages (initialization, capabilities, etc.)

### Code Location
```javascript
// STDIO transport setup (lines ~602-617)
if (isStdioMode) {
  const stdioTransport = new StdioServerTransport();
  mcpServer.connect(stdioTransport);
}

// HTTP/SSE transport setup (lines ~622-764)
if (!isStdioMode) {
  app.post('/mcp', async (req, res) => {
    // Handle HTTP/SSE transport
  });
}
```

## Channel 2: WebSocket (Always Active)

### Purpose
Communication between the MCP server and the Juicebox browser frontend application.

### How It Works
- WebSocket server runs on port 3001 (configurable via `WS_PORT`)
- Browser connects to `ws://localhost:3001`
- Server sends JSON commands to control the visualization
- Browser sends session registration and status updates

### What This Channel Handles
- Visualization commands (`loadMap`, `zoomIn`, `setForegroundColor`, etc.)
- Browser session registration (browser identifies itself with a session ID)
- Real-time visualization updates
- Custom protocol messages (not MCP protocol)

### Code Location
```javascript
// WebSocket server creation (line ~69)
const wss = new WebSocketServer({ port: WS_PORT });

// WebSocket message handling (lines ~92-139)
wss.on('connection', (ws) => {
  // Handle browser connections
});
```

## Complete Communication Flow

### When Using Claude Desktop

```
┌─────────────────┐
│ Claude Desktop  │
│  (Claude AI)    │
└────────┬────────┘
         │
         │ STDIO Channel (MCP Protocol)
         │ JSON-RPC: {"method": "tools/call", "params": {...}}
         │
         ▼
┌─────────────────┐
│   MCP Server    │
│  (your server)  │
│                 │
│  Tool Handler:  │
│  load_map()     │
└────────┬────────┘
         │
         │ WebSocket Channel (Custom Protocol)
         │ JSON: {type: "loadMap", url: "...", name: "..."}
         │
         ▼
┌─────────────────┐
│  Browser Tab    │
│  (Juicebox App) │
│  Frontend       │
└─────────────────┘
```

### Step-by-Step Example: Loading a Map

1. **User asks Claude**: "Load the map from this URL"
2. **Claude Desktop → Server (STDIO)**:
   ```json
   {
     "jsonrpc": "2.0",
     "method": "tools/call",
     "params": {
       "name": "load_map",
       "arguments": {
         "url": "https://example.com/data.hic"
       }
     }
   }
   ```
3. **Server processes tool call**: The `load_map` tool handler executes
4. **Server → Browser (WebSocket)**:
   ```json
   {
     "type": "loadMap",
     "url": "https://example.com/data.hic",
     "name": null
   }
   ```
5. **Browser updates visualization**: Juicebox loads and displays the map
6. **Server → Claude Desktop (STDIO)**:
   ```json
   {
     "jsonrpc": "2.0",
     "result": {
       "content": [{
         "type": "text",
         "text": "Loading map from https://example.com/data.hic"
       }]
     }
   }
   ```

## Key Points

### 1. STDIO is NOT a replacement for WebSocket

- **STDIO** handles MCP protocol messages (Claude ↔ Server)
- **WebSocket** handles visualization commands (Server ↔ Browser)
- They serve **different purposes** and **both are needed**

### 2. WebSocket is ALWAYS active

The WebSocket server is created unconditionally (line 69) because:
- It's needed regardless of whether you're in STDIO or HTTP mode
- Browser connections are independent of the MCP transport mechanism
- Visualization commands must reach the browser regardless of how Claude connects

### 3. Both channels operate simultaneously

When Claude Desktop runs your server:
- ✅ STDIO transport handles MCP protocol messages from Claude Desktop
- ✅ WebSocket server runs on port 3001 for browser connections
- ✅ Both channels operate independently and simultaneously

### 4. Session ID linking

The server uses session IDs to link MCP requests with browser connections:
- **STDIO mode**: One unique session ID per process instance (generated at startup)
- **HTTP mode**: Session ID comes from HTTP headers
- **Browser**: Registers with the same session ID to receive commands

## Why Both Are Required

| Without STDIO | Without WebSocket |
|---------------|-------------------|
| ❌ Claude Desktop can't communicate with server | ❌ Browser can't receive visualization commands |
| ❌ Tool calls won't work | ❌ Maps won't load, zoom won't work, etc. |
| ❌ MCP protocol broken | ❌ Visualization broken |

**Both channels are essential** - they're complementary, not alternatives.

## Error Handling: STDIO Mode Priority

In STDIO mode (Claude Desktop), the server prioritizes STDIO transport:

- **STDIO transport failure**: Server exits (critical - Claude Desktop can't work)
- **WebSocket port unavailable**: Server logs warning but continues (browser connections won't work, but Claude Desktop still can)

This is why the WebSocket error handler was updated to be less aggressive in STDIO mode - the STDIO transport is the critical path for Claude Desktop functionality.

## Mode Detection

The server automatically detects which mode to use:

```javascript
// Detect STDIO mode (subprocess) vs HTTP mode
const forceHttpMode = process.env.MCP_TRANSPORT === 'http' || 
                      process.env.MCP_TRANSPORT === 'sse' || 
                      process.env.FORCE_HTTP_MODE === 'true';
const isStdioMode = !forceHttpMode && !process.stdin.isTTY;
```

- **STDIO mode**: `stdin` is not a TTY (running as subprocess)
- **HTTP mode**: `stdin` is a TTY (running manually) OR forced via environment variable

## Summary

- **STDIO/HTTP**: MCP protocol channel (Claude ↔ Server) - handles tool calls
- **WebSocket**: Visualization channel (Server ↔ Browser) - handles UI commands
- **Both active**: They operate simultaneously and independently
- **Different protocols**: STDIO uses JSON-RPC (MCP), WebSocket uses custom JSON
- **Different purposes**: STDIO for AI communication, WebSocket for visualization

Understanding this architecture helps clarify why both channels exist and why they're both necessary for the complete system to function.
