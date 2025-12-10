# Juicebox MCP Implementation Plan

## Overview

This document outlines the implementation of an MCP (Model Context Protocol) server for Juicebox, enabling control of Juicebox visualizations via MCP clients (e.g., ChatGPT, Claude Desktop).

## Architecture

The implementation follows a similar pattern to the hello3dmcp project:

1. **MCP Server** (`server.js`): Node.js server that:
   - Implements the MCP protocol (supports both STDIO and HTTP/SSE transports)
   - Manages WebSocket connections to browser clients
   - Registers MCP tools for Juicebox operations
   - Routes commands from MCP clients to browser sessions

2. **WebSocket Client** (`src/WebSocketClient.js`): Browser-side client that:
   - Connects to the MCP server WebSocket
   - Handles session registration
   - Processes incoming commands from the server
   - Sends state updates back to the server

3. **Application Wrapper** (`src/Application.js`): Main application class that:
   - Initializes Juicebox browser
   - Sets up WebSocket client
   - Maps WebSocket commands to Juicebox API calls
   - Provides state query functionality

4. **Frontend Entry Point** (`index.html`): HTML page that:
   - Initializes the Application wrapper
   - Provides UI for connection status
   - Displays tool call notifications

## MCP Tools Implemented

### 1. `load_map`
Loads a Hi-C contact map (.hic file) into Juicebox.

**Parameters:**
- `url` (required): URL to the .hic file
- `name` (optional): Name for the map
- `normalization` (optional): Normalization method (e.g., "VC", "VC_SQRT", "KR", "NONE")
- `locus` (optional): Genomic locus (e.g., "1:1000000-2000000 1:1000000-2000000")

### 2. `load_control_map`
Loads a control map (.hic file) for comparison.

**Parameters:**
- `url` (required): URL to the control .hic file
- `name` (optional): Name for the control map
- `normalization` (optional): Normalization method

### 3. `load_session`
Loads a Juicebox session from a URL or JSON object.

**Parameters:**
- `sessionUrl` (optional): URL to a session JSON file
- `sessionJson` (optional): Session JSON as a string
- `sessionObject` (optional): Session object

### 4. `zoom_in`
Zooms in on the contact map.

**Parameters:**
- `centerX` (optional): X coordinate for zoom center (pixels)
- `centerY` (optional): Y coordinate for zoom center (pixels)

### 5. `zoom_out`
Zooms out on the contact map.

**Parameters:**
- `centerX` (optional): X coordinate for zoom center (pixels)
- `centerY` (optional): Y coordinate for zoom center (pixels)

### 6. `set_map_foreground_color`
Sets the foreground color scale for the contact map.

**Parameters:**
- `color` (required): Hex color code (e.g., "#ff0000")
- `threshold` (optional): Threshold value for the color scale

### 7. `set_map_background_color`
Sets the background color of the contact map.

**Parameters:**
- `color` (required): Hex color code (e.g., "#000000")

### 8. `create_shareable_url`
Creates a shareable URL for the current Juicebox session.

**Parameters:** None

## File Structure

```
juicebox-mcp/
├── server.js                 # MCP server (Node.js)
├── index.html               # Frontend entry point
├── package.json             # Dependencies and scripts
├── src/
│   ├── Application.js      # Application wrapper
│   └── WebSocketClient.js   # WebSocket client
└── docs/
    └── MCP_IMPLEMENTATION_PLAN.md  # This file
```

## Setup and Usage

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the MCP Server

```bash
npm start
# or
node server.js
```

The server will:
- Start MCP server on port 3000 (or MCP_PORT env var)
- Start WebSocket server on port 3001 (or WS_PORT env var)
- Serve static files from `dist/` folder (if built)

### 3. Start the Frontend

```bash
npm run dev
```

This starts Vite dev server on port 5173 (or configured port).

### 4. Connect via MCP Client

Open the browser with a session ID:
```
http://localhost:5173/?sessionId=<session-id>
```

The MCP client (e.g., Claude Desktop) will use the session ID to route commands to the correct browser instance.

## Configuration

### Environment Variables

- `MCP_PORT`: MCP server port (default: 3000)
- `WS_PORT`: WebSocket server port (default: 3001)
- `BROWSER_URL`: Browser URL for shareable links (default: http://localhost:5173)
- `MCP_TRANSPORT`: Force transport mode ("http", "sse", or leave unset for auto-detect)

### Command Line Arguments

- `--browser-url` or `-u`: Override browser URL
- `--help` or `-h`: Show help message

## Implementation Details

### Session Management

- Each MCP client connection gets a unique session ID
- Browser clients register with the server using the session ID
- Commands are routed to the correct browser session via WebSocket

### State Management

- Browser state is queried on-demand from the browser
- State updates are pushed to the server after command execution
- State caching is used as a fallback if browser is disconnected

### WebSocket Protocol

**Browser → Server:**
- `registerSession`: Register browser session
- `stateResponse`: Response to state query
- `stateUpdate`: Push state update
- `stateError`: Error response to state query

**Server → Browser:**
- `requestState`: Request current state
- `toolCall`: Notification of tool call
- Command objects: `loadMap`, `zoomIn`, `setBackgroundColor`, etc.

## Future Enhancements

1. **Additional Tools:**
   - Pan operations
   - Locus navigation
   - Track management
   - Normalization changes
   - Resolution changes

2. **State Persistence:**
   - Save/restore sessions
   - Session history

3. **Multi-Browser Support:**
   - Manage multiple browser instances
   - Browser selection/switching

4. **Error Handling:**
   - Better error messages
   - Retry logic
   - Validation

## Notes

- The implementation follows the same pattern as hello3dmcp-server for consistency
- WebSocket client automatically reconnects if connection is lost
- State queries timeout after 2 seconds if browser doesn't respond
- The server supports both STDIO (for Claude Desktop) and HTTP/SSE (for web clients) transports

