import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DATA_SOURCES, getDataSource, getAllSourceIds, isValidSource } from './src/dataSourceConfigs.js';
import { parseDataSource } from './src/dataParsers.js';
import { filterMaps } from './src/mapFilter.js';
import { formatSearchResults, formatSearchResultsJSON } from './src/resultFormatter.js';

// Parse command line arguments
function parseCommandLineArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--browser-url' || arg === '-u') {
      args.browserUrl = process.argv[++i];
    } else if (arg.startsWith('--browser-url=')) {
      args.browserUrl = arg.split('=')[1];
    } else if (arg === '--http' || arg === '--http-mode') {
      args.httpMode = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node server.js [options]

Options:
  --browser-url, -u <url>    Browser URL for the Juicebox app (e.g., https://your-app.netlify.app)
                             Overrides BROWSER_URL environment variable
  --http, --http-mode        Force HTTP/SSE mode (for MCP Inspector and other HTTP clients)
  --help, -h                 Show this help message

Environment Variables:
  BROWSER_URL                Browser URL (used if --browser-url not provided)
  MCP_PORT                   MCP server port (default: 3010)
  WS_PORT                    WebSocket server port (default: 3011)
  MCP_TRANSPORT              Set to "http" or "sse" to force HTTP mode
  FORCE_HTTP_MODE            Set to "true" to force HTTP mode

Configuration Priority:
  1. Command line argument (--browser-url)
  2. Environment variable (BROWSER_URL)
  3. Default (http://localhost:5173)

Examples:
  node server.js --browser-url https://my-app.netlify.app
  node server.js -u http://localhost:5173
  node server.js --http  # Start in HTTP mode for MCP Inspector
      `);
      process.exit(0);
    }
  }
  return args;
}

const cliArgs = parseCommandLineArgs();

const MCP_PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3010;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 3011;
// Browser URL for the Juicebox app
// Priority: 1) Command line argument (--browser-url), 2) Environment variable (BROWSER_URL), 
//           3) Default (localhost)
const BROWSER_URL = cliArgs.browserUrl || process.env.BROWSER_URL || 'http://localhost:5173';

// Force HTTP mode if requested via command line
if (cliArgs.httpMode) {
  process.env.MCP_TRANSPORT = 'http';
}

// File-based logger for diagnostics (visible even when running in Claude Desktop)
// Default to temp directory to avoid cluttering user's home directory
const LOG_FILE = process.env.JUICEBOX_MCP_LOG_FILE || join(tmpdir(), 'juicebox-mcp-server.log');
const ENABLE_FILE_LOGGING = process.env.JUICEBOX_MCP_LOG !== 'false';

function logToFile(level, ...args) {
  if (!ENABLE_FILE_LOGGING) return;
  
  try {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    appendFileSync(LOG_FILE, logLine, 'utf8');
  } catch (error) {
    // Silently fail if we can't write to log file
    // Don't use console.error here to avoid infinite loops
  }
}

// Enhanced logging functions that write to both stderr and file
function logError(...args) {
  console.error(...args);
  logToFile('ERROR', ...args);
}

function logWarn(...args) {
  console.warn(...args);
  logToFile('WARN', ...args);
}

function logInfo(...args) {
  // Only log to file for info messages (don't pollute stderr)
  logToFile('INFO', ...args);
}

// Store connected WebSocket clients by session ID
// Map<sessionId, WebSocket>
const wsClients = new Map();

// State management removed - commands will simply update Juicebox without querying state

// Detect if we're running in STDIO mode (subprocess) or HTTP mode
// We need to check this early to handle WebSocket server errors appropriately
const forceHttpMode = process.env.MCP_TRANSPORT === 'http' || process.env.MCP_TRANSPORT === 'sse' || process.env.FORCE_HTTP_MODE === 'true';
const isStdioMode = !forceHttpMode && !process.stdin.isTTY;

// Create WebSocket server for browser communication
const wss = new WebSocketServer({ port: WS_PORT });

// Handle WebSocket server errors (e.g., port already in use)
wss.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logError(`\n⚠️  WARNING: Port ${WS_PORT} is already in use.`);
    logError(`   Another instance of the server may be running.`);
    if (isStdioMode) {
      // In STDIO mode, WebSocket server is optional - just warn and continue
      // The STDIO transport is the critical part for Claude Desktop
      logError(`   Continuing in STDIO mode (WebSocket server unavailable).`);
      logError(`   Browser connections will not work until port ${WS_PORT} is free.`);
      logError(`   To fix this:`);
      logError(`   1. Find the process using port ${WS_PORT}: lsof -i :${WS_PORT}`);
      logError(`   2. Kill it: kill <PID>`);
      logError(`   3. Or change WS_PORT in your environment\n`);
    } else {
      // In HTTP mode, WebSocket server is required - exit
      logError(`   This is required for HTTP mode. Exiting.\n`);
      process.exit(1);
    }
  } else {
    logError('WebSocket server error:', error);
    if (!isStdioMode) {
      // Only exit in HTTP mode - STDIO mode can continue without WebSocket server
      process.exit(1);
    } else {
      logError('Continuing in STDIO mode despite WebSocket server error.');
    }
  }
});

wss.on('listening', () => {
  // Log to file (and stderr) - won't interfere with MCP protocol on stdout
  logError(`WebSocket server listening on ws://localhost:${WS_PORT}`);
});

wss.on('connection', (ws) => {
  logInfo('Browser client connected (waiting for session ID)');
  let sessionId = null;

  ws.on('error', (error) => {
    logError(`WebSocket error (session: ${sessionId || 'unregistered'}):`, error);
  });

  // Handle incoming messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // First message should be session registration
      if (data.type === 'registerSession' && data.sessionId) {
        sessionId = data.sessionId;
        wsClients.set(sessionId, ws);
        logInfo(`Browser client registered with session ID: ${sessionId}`);
        
        // Send confirmation
        ws.send(JSON.stringify({
          type: 'sessionRegistered',
          sessionId: sessionId
        }));
      } else if (sessionId) {
        // Handle other messages (for testing/debugging)
        logInfo(`Received message from client (session ${sessionId}):`, data.type || 'unknown');
      } else {
        logWarn('Received message from unregistered client');
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Session not registered. Please send registerSession message first.'
        }));
      }
    } catch (error) {
      logError('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      logInfo(`Browser client disconnected (session: ${sessionId})`);
      wsClients.delete(sessionId);
    } else {
      logInfo('Browser client disconnected (unregistered)');
    }
  });

});

// Send command to a specific session's browser client
function sendToSession(sessionId, command) {
  const ws = wsClients.get(sessionId);
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    const message = JSON.stringify(command);
    try {
      ws.send(message);
      logInfo(`Command sent to session ${sessionId}: ${command.type}`);
      return true;
    } catch (error) {
      logError(`Error sending WebSocket message to session ${sessionId}: ${error.message}`);
      return false;
    }
  } else {
    logWarn(`No active WebSocket connection for session: ${sessionId} (available: ${Array.from(wsClients.keys()).join(', ') || 'none'})`);
    return false;
  }
}

// State query functions removed - we don't query or cache state

// Request-scoped context for current session ID using AsyncLocalStorage
// This maintains context across async operations
const sessionContext = new AsyncLocalStorage();

// Helper function for tool handlers to route commands to the current request's session
function routeToCurrentSession(command) {
  const sessionId = sessionContext.getStore();
  if (sessionId) {
    const sent = sendToSession(sessionId, command);
    if (!sent && wsClients.size > 0) {
      // Fallback: if specific session not found, broadcast to all clients
      logWarn(`Session ${sessionId} not found, broadcasting to all ${wsClients.size} client(s)`);
      broadcastToClients(command);
    }
  } else if (isStdioMode) {
    // In STDIO mode, route to the unique STDIO session ID
    if (STDIO_SESSION_ID) {
      const sent = sendToSession(STDIO_SESSION_ID, command);
      if (!sent && wsClients.size > 0) {
        // Fallback: if STDIO session not found, broadcast to all clients
        logWarn(`STDIO session ${STDIO_SESSION_ID} not found, broadcasting to all ${wsClients.size} client(s)`);
        broadcastToClients(command);
      } else if (!sent) {
        logWarn(`No WebSocket clients connected. Command not routed: ${command.type}`);
      }
    } else {
      logWarn('Routing command in STDIO mode - no session ID available, broadcasting to all clients');
      if (wsClients.size > 0) {
        broadcastToClients(command);
      } else {
        logWarn(`No WebSocket clients connected. Command not routed: ${command.type}`);
      }
    }
  } else {
    logWarn('Tool handler called but no session context available. Command not routed.');
  }
}

// Broadcast command to all connected browser clients (kept for backward compatibility if needed)
function broadcastToClients(command) {
  const message = JSON.stringify(command);
  wsClients.forEach((client, sessionId) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// Create MCP server
const mcpServer = new McpServer({
  name: 'juicebox-server',
  version: '1.0.0'
});

// Register MCP resources for data source configurations
mcpServer.setResourceRequestHandlers({
  list: async () => {
    return {
      resources: [
        {
          uri: 'juicebox://datasource/4dn',
          name: '4DN Contact Map Data Source',
          description: '4DN Hi-C contact map data source configuration',
          mimeType: 'application/json'
        },
        {
          uri: 'juicebox://datasource/encode',
          name: 'ENCODE Contact Map Data Source',
          description: 'ENCODE Hi-C contact map data source configuration',
          mimeType: 'application/json'
        }
      ]
    };
  },
  read: async (request) => {
    const { uri } = request.params;
    
    if (uri === 'juicebox://datasource/4dn') {
      const config = getDataSource('4dn');
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(config, null, 2)
        }]
      };
    } else if (uri === 'juicebox://datasource/encode') {
      const config = getDataSource('encode');
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(config, null, 2)
        }]
      };
    }
    
    throw new Error(`Unknown resource URI: ${uri}`);
  }
});

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Zod schema for color input - accepts hex codes
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color code (e.g., "#ff0000")')
  .describe('Hex color code (e.g., "#ff0000")');

// Register tool: load_map
mcpServer.registerTool(
  'load_map',
  {
    title: 'Load Map',
    description: 'Load a Hi-C contact map (.hic file) into Juicebox',
    inputSchema: {
      url: z.string().url().describe('URL to the .hic file'),
      name: z.string().optional().describe('Optional name for the map'),
      normalization: z.string().optional().describe('Normalization method (e.g., "VC", "VC_SQRT", "KR", "NONE")'),
      locus: z.string().optional().describe('Optional genomic locus (e.g., "1:1000000-2000000 1:1000000-2000000")')
    }
  },
  async ({ url, name, normalization, locus }) => {
    routeToCurrentSession({
      type: 'loadMap',
      url: url,
      name: name,
      normalization: normalization,
      locus: locus
    });

    return {
      content: [
        {
          type: 'text',
          text: `Loading map from ${url}${name ? ` (${name})` : ''}`
        }
      ]
    };
  }
);

// Register tool: load_control_map
mcpServer.registerTool(
  'load_control_map',
  {
    title: 'Load Control Map',
    description: 'Load a control map (.hic file) for comparison',
    inputSchema: {
      url: z.string().url().describe('URL to the control .hic file'),
      name: z.string().optional().describe('Optional name for the control map'),
      normalization: z.string().optional().describe('Normalization method (e.g., "VC", "VC_SQRT", "KR", "NONE")')
    }
  },
  async ({ url, name, normalization }) => {
    routeToCurrentSession({
      type: 'loadControlMap',
      url: url,
      name: name,
      normalization: normalization
    });

    return {
      content: [
        {
          type: 'text',
          text: `Loading control map from ${url}${name ? ` (${name})` : ''}`
        }
      ]
    };
  }
);

// Register tool: load_session
mcpServer.registerTool(
  'load_session',
  {
    title: 'Load Session',
    description: 'Load a Juicebox session from a URL or JSON object',
    inputSchema: {
      sessionUrl: z.string().url().optional().describe('URL to a session JSON file'),
      sessionJson: z.string().optional().describe('Session JSON as a string'),
      sessionObject: z.record(z.any()).optional().describe('Session object')
    }
  },
  async ({ sessionUrl, sessionJson, sessionObject }) => {
    if (!sessionUrl && !sessionJson && !sessionObject) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Must provide either sessionUrl, sessionJson, or sessionObject'
          }
        ],
        isError: true
      };
    }

    let sessionData = sessionObject;
    if (sessionJson) {
      try {
        sessionData = JSON.parse(sessionJson);
      } catch (e) {
        return {
          content: [
            {
              type: 'text',
              text: `Error parsing session JSON: ${e.message}`
            }
          ],
          isError: true
        };
      }
    }

    routeToCurrentSession({
      type: 'loadSession',
      sessionUrl: sessionUrl,
      sessionData: sessionData
    });

    return {
      content: [
        {
          type: 'text',
          text: `Loading session${sessionUrl ? ` from ${sessionUrl}` : ''}`
        }
      ]
    };
  }
);

// Register tool: zoom_in
mcpServer.registerTool(
  'zoom_in',
  {
    title: 'Zoom In',
    description: 'Zoom in on the contact map',
    inputSchema: {
      centerX: z.number().optional().describe('Optional X coordinate for zoom center (pixels)'),
      centerY: z.number().optional().describe('Optional Y coordinate for zoom center (pixels)')
    }
  },
  async ({ centerX, centerY }) => {
    routeToCurrentSession({
      type: 'zoomIn',
      centerX: centerX,
      centerY: centerY
    });

    return {
      content: [
        {
          type: 'text',
          text: 'Zooming in'
        }
      ]
    };
  }
);

// Register tool: zoom_out
mcpServer.registerTool(
  'zoom_out',
  {
    title: 'Zoom Out',
    description: 'Zoom out on the contact map',
    inputSchema: {
      centerX: z.number().optional().describe('Optional X coordinate for zoom center (pixels)'),
      centerY: z.number().optional().describe('Optional Y coordinate for zoom center (pixels)')
    }
  },
  async ({ centerX, centerY }) => {
    routeToCurrentSession({
      type: 'zoomOut',
      centerX: centerX,
      centerY: centerY
    });

    return {
      content: [
        {
          type: 'text',
          text: 'Zooming out'
        }
      ]
    };
  }
);

// Register tool: set_map_foreground_color
mcpServer.registerTool(
  'set_map_foreground_color',
  {
    title: 'Set Map Foreground Color',
    description: 'Set the foreground color scale for the contact map',
    inputSchema: {
      color: colorSchema,
      threshold: z.number().positive().optional().describe('Optional threshold value for the color scale')
    }
  },
  async ({ color, threshold }) => {
    const rgb = hexToRgb(color);
    if (!rgb) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid color: ${color}. Please use a hex code (e.g., "#ff0000")`
          }
        ],
        isError: true
      };
    }

    routeToCurrentSession({
      type: 'setForegroundColor',
      color: rgb,
      threshold: threshold
    });

    return {
      content: [
        {
          type: 'text',
          text: `Map foreground color set to ${color}${threshold ? ` with threshold ${threshold}` : ''}`
        }
      ]
    };
  }
);

// Register tool: set_map_background_color
mcpServer.registerTool(
  'set_map_background_color',
  {
    title: 'Set Map Background Color',
    description: 'Set the background color of the contact map',
    inputSchema: {
      color: colorSchema
    }
  },
  async ({ color }) => {
    const rgb = hexToRgb(color);
    if (!rgb) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid color: ${color}. Please use a hex code (e.g., "#000000")`
          }
        ],
        isError: true
      };
    }

    routeToCurrentSession({
      type: 'setBackgroundColor',
      color: rgb
    });

    return {
      content: [
        {
          type: 'text',
          text: `Map background color set to ${color}`
        }
      ]
    };
  }
);

// Register tool: create_shareable_url
mcpServer.registerTool(
  'create_shareable_url',
  {
    title: 'Create Shareable URL',
    description: 'Create a shareable URL for the current Juicebox session',
    inputSchema: {}
  },
  async () => {
    const sessionId = getCurrentSessionId();
    if (!sessionId) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No active session found.'
          }
        ],
        isError: true
      };
    }

    // Generate shareable URL with session ID
    const shareableUrl = `${BROWSER_URL}?sessionId=${sessionId}`;
    
    // Include connection status
    const registeredSessions = Array.from(wsClients.keys());
    const isConnected = registeredSessions.includes(sessionId);
    const connectionStatus = isConnected 
      ? `✅ WebSocket client connected and registered`
      : `⚠️  WebSocket client NOT connected (registered sessions: ${registeredSessions.length > 0 ? registeredSessions.join(', ') : 'none'})`;
    
    return {
      content: [
        {
          type: 'text',
          text: `Shareable URL for this session:\n\n${shareableUrl}\n\n${connectionStatus}\n\nCopy and paste this URL to share the current Juicebox session.`
        }
      ]
    };
  }
);

// Register tool: get_server_status
mcpServer.registerTool(
  'get_server_status',
  {
    title: 'Get Server Status',
    description: 'Get diagnostic information about the MCP server, WebSocket connections, and session status. Use this for debugging connection issues.',
    inputSchema: {}
  },
  async () => {
    const sessionId = getCurrentSessionId();
    const registeredSessions = Array.from(wsClients.keys());
    const isConnected = sessionId && registeredSessions.includes(sessionId);
    
    // Check WebSocket connection states
    const wsConnectionStates = {};
    wsClients.forEach((ws, sid) => {
      wsConnectionStates[sid] = {
        readyState: ws.readyState,
        readyStateName: ws.readyState === 0 ? 'CONNECTING' : ws.readyState === 1 ? 'OPEN' : ws.readyState === 2 ? 'CLOSING' : 'CLOSED'
      };
    });
    
    const statusInfo = {
      mode: isStdioMode ? 'STDIO' : 'HTTP/SSE',
      currentSessionId: sessionId || 'none',
      stdioSessionId: STDIO_SESSION_ID || 'not set',
      webSocketServerPort: WS_PORT,
      webSocketClientsConnected: wsClients.size,
      registeredSessionIds: registeredSessions,
      currentSessionConnected: isConnected,
      webSocketConnectionStates: wsConnectionStates,
      browserUrl: BROWSER_URL
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `Server Status:\n\n` +
            `Mode: ${statusInfo.mode}\n` +
            `Current Session ID: ${statusInfo.currentSessionId}\n` +
            `STDIO Session ID: ${statusInfo.stdioSessionId}\n` +
            `WebSocket Server Port: ${statusInfo.webSocketServerPort}\n` +
            `WebSocket Clients Connected: ${statusInfo.webSocketClientsConnected}\n` +
            `Registered Session IDs: ${statusInfo.registeredSessionIds.length > 0 ? statusInfo.registeredSessionIds.join(', ') : 'none'}\n` +
            `Current Session Connected: ${statusInfo.currentSessionConnected ? '✅ Yes' : '❌ No'}\n` +
            `Browser URL: ${statusInfo.browserUrl}\n\n` +
            (Object.keys(wsConnectionStates).length > 0 
              ? `WebSocket Connection States:\n${Object.entries(wsConnectionStates).map(([sid, state]) => `  ${sid}: ${state.readyStateName} (${state.readyState})`).join('\n')}\n`
              : 'No WebSocket connections')
        }
      ]
    };
  }
);

// Register tool: get_juicebox_url
mcpServer.registerTool(
  'get_juicebox_url',
  {
    title: 'Get Juicebox URL',
    description: 'Get the URL to open in your browser to connect the Juicebox visualization app. Use this when users ask how to connect, how to open the Juicebox app, or say things like "Hello juicebox", "Open juicebox", "Show me juicebox", "Launch juicebox", etc.',
    inputSchema: {}
  },
  async () => {
    // In STDIO mode, use the unique STDIO session ID generated at startup
    // In HTTP mode, get session ID from context
    const sessionId = getCurrentSessionId();
    
    if (!sessionId) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No active session found. Please ensure the MCP connection is properly initialized.'
          }
        ],
        isError: true
      };
    }

    const connectionUrl = `${BROWSER_URL}?sessionId=${sessionId}`;
    
    // Include diagnostic info for debugging
    const registeredSessions = Array.from(wsClients.keys());
    const isConnected = registeredSessions.includes(sessionId);
    const connectionStatus = isConnected 
      ? `✅ WebSocket client connected and registered`
      : `⚠️  WebSocket client NOT connected`;
    
    const diagnosticInfo = isStdioMode 
      ? `\n\n[Debug Info]\nMode: STDIO\nSTDIO Session ID: ${STDIO_SESSION_ID || 'not set'}\n${connectionStatus}\nRegistered WebSocket Sessions: ${registeredSessions.length > 0 ? registeredSessions.join(', ') : 'none'}\nWebSocket Server Port: ${WS_PORT}`
      : `\n\n[Debug Info]\nMode: HTTP/SSE\nCurrent Session ID: ${sessionId}\n${connectionStatus}\nRegistered WebSocket Sessions: ${registeredSessions.length > 0 ? registeredSessions.join(', ') : 'none'}\nWebSocket Server Port: ${WS_PORT}`;
    
    return {
      content: [
        {
          type: 'text',
          text: `Open this URL ${connectionUrl}\n\nto launch the Juicebox visualization app.${diagnosticInfo}`
        }
      ]
    };
  }
);

// Register tool: list_data_sources
mcpServer.registerTool(
  'list_data_sources',
  {
    title: 'List Data Sources',
    description: 'List available Hi-C contact map data sources (4DN, ENCODE) with their metadata columns. Use this when users ask what data sources are available, what maps can be searched, or want to understand the available metadata.',
    inputSchema: {}
  },
  async () => {
    const sources = getAllSourceIds().map(sourceId => {
      const config = getDataSource(sourceId);
      return {
        id: config.id,
        name: config.name,
        description: config.description,
        columns: config.columns,
        url: config.url
      };
    });
    
    const formatted = sources.map(source => {
      return `${source.name} (${source.id}):\n` +
        `  Description: ${source.description}\n` +
        `  Data URL: ${source.url}\n` +
        `  Available columns: ${source.columns.join(', ')}`;
    }).join('\n\n');
    
    return {
      content: [
        {
          type: 'text',
          text: `Available data sources:\n\n${formatted}`
        }
      ]
    };
  }
);

// Register tool: search_maps
mcpServer.registerTool(
  'search_maps',
  {
    title: 'Search Maps',
    description: 'Search for Hi-C contact maps using natural language queries. Searches across all metadata fields (Assembly, Biosource, Biosample, Description, etc.). Use this when users want to find specific maps, e.g., "human hg38 maps", "mouse cell lines", "K562 cells", etc. NOTE: Results are limited to 50 by default. For statistical questions like "what assemblies are covered" or "how many maps are there", use get_data_source_statistics instead.',
    inputSchema: {
      source: z.string().optional().describe("Data source ID ('4dn', 'encode') or 'all' to search all sources. Default: 'all'"),
      query: z.string().describe('Natural language search query (e.g., "human hg38", "mouse cells", "K562")'),
      limit: z.number().int().positive().optional().describe('Maximum number of results to return (default: 50)')
    }
  },
  async ({ source = 'all', query, limit = 50 }) => {
    try {
      if (!query || !query.trim()) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Search query is required'
            }
          ],
          isError: true
        };
      }
      
      const sourceIds = source === 'all' ? getAllSourceIds() : [source];
      
      // Validate source IDs
      for (const sourceId of sourceIds) {
        if (!isValidSource(sourceId)) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Unknown data source "${sourceId}". Available sources: ${getAllSourceIds().join(', ')}`
              }
            ],
            isError: true
          };
        }
      }
      
      // Fetch and parse data from all specified sources
      const allMaps = [];
      for (const sourceId of sourceIds) {
        try {
          const maps = await parseDataSource(sourceId);
          allMaps.push(...maps);
        } catch (error) {
          logError(`Error parsing data source ${sourceId}:`, error);
          // Continue with other sources even if one fails
        }
      }
      
      if (allMaps.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No data available from the specified source(s). This may be a temporary network issue.`
            }
          ],
          isError: true
        };
      }
      
      // Filter maps by query
      const filteredMaps = filterMaps(allMaps, query);
      
      // Apply limit
      const limitedMaps = filteredMaps.slice(0, limit);
      
      // Format results
      const formattedTable = formatSearchResults(limitedMaps, query, source);
      const jsonResults = formatSearchResultsJSON(limitedMaps);
      
      // Combine formatted table and JSON for Claude
      const resultText = `${formattedTable}\n\n[Structured data for programmatic access]\n${jsonResults}`;
      
      return {
        content: [
          {
            type: 'text',
            text: resultText
          }
        ]
      };
    } catch (error) {
      logError('Error in search_maps tool:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error searching maps: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register tool: get_data_source_statistics
mcpServer.registerTool(
  'get_data_source_statistics',
  {
    title: 'Get Data Source Statistics',
    description: 'Get statistical overview of a data source including total maps, assemblies covered, and breakdowns by metadata fields. Use this when users ask "what assemblies are available", "how many maps are there", "what cell types are covered", etc. This returns unfiltered statistics without search limits.',
    inputSchema: {
      source: z.string().describe("Data source ID ('4dn' or 'encode')")
    }
  },
  async ({ source }) => {
    try {
      if (!isValidSource(source)) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown data source "${source}". Available sources: ${getAllSourceIds().join(', ')}`
            }
          ],
          isError: true
        };
      }
      
      // Fetch all maps without filtering
      const maps = await parseDataSource(source);
      
      if (maps.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No data available from ${source} data source. This may be a temporary network issue.`
            }
          ],
          isError: true
        };
      }
      
      // Calculate statistics
      const stats = {
        totalMaps: maps.length,
        assemblies: {},
        biosources: {},
        labs: {},
        experiments: {}
      };
      
      maps.forEach(map => {
        // Count by Assembly
        const assembly = map.metadata?.Assembly || 'Unknown';
        stats.assemblies[assembly] = (stats.assemblies[assembly] || 0) + 1;
        
        // Count by Biosource/Biosample
        const biosource = map.metadata?.Biosource || map.metadata?.Biosample || 'Unknown';
        stats.biosources[biosource] = (stats.biosources[biosource] || 0) + 1;
        
        // Count by Lab
        const lab = map.metadata?.Lab || 'Unknown';
        stats.labs[lab] = (stats.labs[lab] || 0) + 1;
        
        // Count by Experiment
        const experiment = map.metadata?.Experiment || 'Unknown';
        stats.experiments[experiment] = (stats.experiments[experiment] || 0) + 1;
      });
      
      // Format output
      const config = getDataSource(source);
      let output = `${config.name} Data Source Statistics\n`;
      output += `${'='.repeat(50)}\n\n`;
      output += `Total Maps: ${stats.totalMaps}\n\n`;
      
      // Assemblies
      output += `Assemblies Covered (${Object.keys(stats.assemblies).length} total):\n`;
      const sortedAssemblies = Object.entries(stats.assemblies)
        .sort((a, b) => b[1] - a[1]); // Sort by count
      sortedAssemblies.forEach(([assembly, count]) => {
        output += `  ${assembly}: ${count} maps\n`;
      });
      output += '\n';
      
      // Top Biosources
      output += `Top Biosources/Biosamples (showing top 10):\n`;
      const sortedBiosources = Object.entries(stats.biosources)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedBiosources.forEach(([biosource, count]) => {
        output += `  ${biosource}: ${count} maps\n`;
      });
      output += '\n';
      
      // Top Labs
      output += `Top Labs (showing top 10):\n`;
      const sortedLabs = Object.entries(stats.labs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedLabs.forEach(([lab, count]) => {
        output += `  ${lab}: ${count} maps\n`;
      });
      
      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    } catch (error) {
      logError('Error in get_data_source_statistics tool:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting statistics: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register tool: get_map_details
mcpServer.registerTool(
  'get_map_details',
  {
    title: 'Get Map Details',
    description: 'Get detailed information about a specific Hi-C contact map. Use this when users want more information about a specific map from search results.',
    inputSchema: {
      source: z.string().describe("Data source ID ('4dn' or 'encode')"),
      index: z.number().int().nonnegative().optional().describe('Index from search results (0-based). Required if url is not provided.'),
      url: z.string().url().optional().describe('Direct URL to the map. Required if index is not provided.')
    }
  },
  async ({ source, index, url }) => {
    try {
      if (!isValidSource(source)) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown data source "${source}". Available sources: ${getAllSourceIds().join(', ')}`
            }
          ],
          isError: true
        };
      }
      
      if (index === undefined && !url) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Either index or url must be provided'
            }
          ],
          isError: true
        };
      }
      
      // Fetch maps from source
      const maps = await parseDataSource(source);
      
      let map = null;
      if (url) {
        // Find map by URL
        map = maps.find(m => m.url === url);
        if (!map) {
          return {
            content: [
              {
                type: 'text',
                text: `Map with URL "${url}" not found in ${source} data source.`
              }
            ],
            isError: true
          };
        }
      } else {
        // Get map by index
        if (index >= maps.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Index ${index} is out of range. ${source} data source has ${maps.length} maps (indices 0-${maps.length - 1}).`
              }
            ],
            isError: true
          };
        }
        map = maps[index];
      }
      
      // Format detailed information
      const details = [
        `Source: ${map.source}`,
        `Name: ${map.name}`,
        `URL: ${map.url}`,
        '',
        'Metadata:'
      ];
      
      if (map.metadata) {
        Object.entries(map.metadata).forEach(([key, value]) => {
          details.push(`  ${key}: ${value || '(empty)'}`);
        });
      }
      
      return {
        content: [
          {
            type: 'text',
            text: details.join('\n')
          }
        ]
      };
    } catch (error) {
      logError('Error in get_map_details tool:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting map details: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Set up Express HTTP server for MCP transport
const app = express();
app.use(express.json());

// Enable CORS for ChatGPT and other clients
app.use(
  cors({
    origin: '*', // Allow all origins (restrict in production)
    exposedHeaders: ['Mcp-Session-Id'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
  })
);

// STDIO mode detection moved earlier (before WebSocket server creation)

// Map to store transports by session ID (for HTTP mode)
const transports = {};

// For STDIO mode, generate a unique session ID for each process instance
let STDIO_SESSION_ID = null;

// Helper function to get the current session ID (works in both STDIO and HTTP modes)
function getCurrentSessionId() {
  if (isStdioMode) {
    return STDIO_SESSION_ID;
  } else {
    return sessionContext.getStore();
  }
}

// If running in STDIO mode (subprocess), set up STDIO transport
if (isStdioMode) {
  // Generate a unique session ID for this STDIO connection
  STDIO_SESSION_ID = randomUUID();
  
  logError('Running in STDIO mode (subprocess)');
  const stdioTransport = new StdioServerTransport();
  
  // Connect MCP server to STDIO transport
  mcpServer.connect(stdioTransport).catch((error) => {
    logError('Error connecting MCP server to STDIO transport:', error);
    process.exit(1);
  });
  
  logError('MCP server connected via STDIO transport');
  logError(`Browser URL configured: ${BROWSER_URL}`);
  logError(`STDIO session ID: ${STDIO_SESSION_ID}`);
  logInfo(`Diagnostic log file: ${LOG_FILE}`);
} else {
  logError('Running in HTTP/SSE mode');
  logError(`MCP Server endpoint: http://localhost:${MCP_PORT}/mcp`);
  logError(`For MCP Inspector:`);
  logError(`  - Transport type: "streamable HTTP" (not "SSE")`);
  logError(`  - Connection type: "direct"`);
  logError(`  - Connection URL: http://localhost:${MCP_PORT}/mcp`);
  logError(``);
  logError(`Note: Server defaults to STDIO mode for Claude Desktop compatibility.`);
  logError(`      Use --http flag or MCP_TRANSPORT=http to enable HTTP mode for testing.`);
  logInfo(`Diagnostic log file: ${LOG_FILE}`);
}

// Handle POST requests (initialization and tool calls) - only in HTTP mode
if (!isStdioMode) {
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  // Log request for debugging
  logInfo(`MCP request: ${req.body?.method || 'unknown'} (session: ${sessionId || 'none'})`);
  
  try {
    let transport;
    
    if (sessionId && transports[sessionId]) {
      // Reuse existing transport for subsequent requests
      transport = transports[sessionId];
    } else if (sessionId && !transports[sessionId]) {
      // Session ID provided but transport doesn't exist - session expired or lost
      // Allow re-initialization if this is an initialize request
      if (isInitializeRequest(req.body)) {
        logInfo(`Session ${sessionId} not found, creating new transport for re-initialization`);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId, // Reuse the same session ID
          onsessioninitialized: (sid) => {
            logInfo(`MCP session re-initialized: ${sid}`);
            transports[sid] = transport;
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            logInfo(`MCP session closed: ${sid}`);
            delete transports[sid];
          }
        };

        await mcpServer.connect(transport);
      } else {
        // Session ID exists but transport is missing and not an init request
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found'
          },
          id: req.body?.id || null
        });
        return;
      }
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // Create new transport for initialization
      logInfo('Creating new transport for initialization');
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          logInfo(`MCP session initialized: ${sid}`);
          transports[sid] = transport;
        }
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          logInfo(`MCP session closed: ${sid}`);
          delete transports[sid];
        }
      };

      // Connect transport to MCP server
      await mcpServer.connect(transport);
    } else {
      // Invalid request - no session ID or not initialization request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or invalid initialization request'
        },
        id: req.body?.id || null
      });
      return;
    }

    // Use AsyncLocalStorage to maintain session context across async operations
    try {
      await sessionContext.run(sessionId || null, async () => {
        // Detect tool calls and notify WebSocket clients
        if (req.body?.method === 'tools/call' && req.body?.params?.name && sessionId) {
          sendToSession(sessionId, {
            type: 'toolCall',
            toolName: req.body.params.name,
            timestamp: Date.now()
          });
        }

        // Handle the POST request - tool handlers will be called during this
        await transport.handleRequest(req, res, req.body);
      });
    } catch (error) {
      logError('Error handling MCP POST request:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        });
      }
    }
  } catch (error) {
    logError('Error in MCP POST handler (transport setup):', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});
}

// Handle GET requests for SSE streams - only in HTTP mode
if (!isStdioMode) {
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    const transport = transports[sessionId];
    const lastEventId = req.headers['last-event-id'];
    
    logInfo(`SSE stream ${lastEventId ? 'reconnecting' : 'establishing'} for session ${sessionId}`);
    
    await transport.handleRequest(req, res);
  } catch (error) {
    logError('Error handling MCP GET request:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing SSE stream');
    }
  }
});
}

// Handle DELETE requests for session termination - only in HTTP mode
if (!isStdioMode) {
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    logInfo(`Session termination request for session ${sessionId}`);
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    logError('Error handling session termination:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing session termination');
    }
  }
});
}

// Serve static files from dist folder (for unified deployment) - only in HTTP mode
if (!isStdioMode) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const distPath = join(__dirname, 'dist');

  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    // Serve index.html for all non-API routes (SPA routing)
    app.use((req, res, next) => {
      // Skip if this is an MCP route
      if (req.path.startsWith('/mcp')) {
        return next();
      }
      // Only handle GET requests for SPA routing
      if (req.method === 'GET') {
        res.sendFile(join(distPath, 'index.html'));
      } else {
        next();
      }
    });
  }

  // Start HTTP server
  app.listen(MCP_PORT, () => {
    // Use logError for startup messages to avoid interfering with MCP protocol on stdout
    logError(`MCP Server listening on http://localhost:${MCP_PORT}/mcp`);
    logError(`Browser URL configured: ${BROWSER_URL}`);
    logInfo(`Diagnostic log file: ${LOG_FILE}`);
    if (existsSync(distPath)) {
      logError(`Serving static files from ${distPath}`);
    }
  });
}

// Handle server shutdown
process.on('SIGINT', async () => {
  logWarn('Shutting down servers...');
  
  // Close all WebSocket connections
  wss.close();
  
  // Close all MCP transports
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
    } catch (error) {
      logError(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  
  await mcpServer.close();
  process.exit(0);
});

