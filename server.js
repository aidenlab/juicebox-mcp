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
import { existsSync } from 'node:fs';

// Parse command line arguments
function parseCommandLineArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--browser-url' || arg === '-u') {
      args.browserUrl = process.argv[++i];
    } else if (arg.startsWith('--browser-url=')) {
      args.browserUrl = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node server.js [options]

Options:
  --browser-url, -u <url>    Browser URL for the Juicebox app (e.g., https://your-app.netlify.app)
                             Overrides BROWSER_URL environment variable
  --help, -h                 Show this help message

Environment Variables:
  BROWSER_URL                Browser URL (used if --browser-url not provided)
  MCP_PORT                   MCP server port (default: 3000)
  WS_PORT                    WebSocket server port (default: 3001)

Configuration Priority:
  1. Command line argument (--browser-url)
  2. Environment variable (BROWSER_URL)
  3. Default (http://localhost:5173)

Examples:
  node server.js --browser-url https://my-app.netlify.app
  node server.js -u http://localhost:5173
      `);
      process.exit(0);
    }
  }
  return args;
}

const cliArgs = parseCommandLineArgs();

const MCP_PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3000;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 3001;
// Browser URL for the Juicebox app
// Priority: 1) Command line argument (--browser-url), 2) Environment variable (BROWSER_URL), 
//           3) Default (localhost)
const BROWSER_URL = cliArgs.browserUrl || process.env.BROWSER_URL || 'http://localhost:5173';

// Store connected WebSocket clients by session ID
// Map<sessionId, WebSocket>
const wsClients = new Map();

// State management removed - commands will simply update Juicebox without querying state

// Create WebSocket server for browser communication
const wss = new WebSocketServer({ port: WS_PORT });

// Handle WebSocket server errors (e.g., port already in use)
wss.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${WS_PORT} is already in use.`);
    console.error(`   Another instance of the server may be running.`);
    console.error(`   To fix this:`);
    console.error(`   1. Find the process using port ${WS_PORT}: lsof -i :${WS_PORT}`);
    console.error(`   2. Kill it: kill <PID>`);
    console.error(`   3. Or change WS_PORT in your environment\n`);
    process.exit(1);
  } else {
    console.error('WebSocket server error:', error);
    process.exit(1);
  }
});

wss.on('listening', () => {
  // Use console.error to avoid interfering with MCP protocol on stdout
  console.error(`WebSocket server listening on ws://localhost:${WS_PORT}`);
});

wss.on('connection', (ws) => {
  console.warn('Browser client connected (waiting for session ID)');
  let sessionId = null;

  // Handle incoming messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // First message should be session registration
      if (data.type === 'registerSession' && data.sessionId) {
        sessionId = data.sessionId;
        wsClients.set(sessionId, ws);
        console.warn(`Browser client registered with session ID: ${sessionId}`);
        
        // Send confirmation
        ws.send(JSON.stringify({
          type: 'sessionRegistered',
          sessionId: sessionId
        }));
      } else if (sessionId) {
        // Handle other messages (for testing/debugging)
        console.warn(`Received message from client (session ${sessionId}):`, data);
      } else {
        console.warn('Received message from unregistered client');
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Session not registered. Please send registerSession message first.'
        }));
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      console.warn(`Browser client disconnected (session: ${sessionId})`);
      wsClients.delete(sessionId);
    } else {
      console.warn('Browser client disconnected (unregistered)');
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error (session: ${sessionId || 'unregistered'}):`, error);
  });
});

// Send command to a specific session's browser client
function sendToSession(sessionId, command) {
  const ws = wsClients.get(sessionId);
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    const message = JSON.stringify(command);
    ws.send(message);
    return true;
  } else {
    console.warn(`No active WebSocket connection found for session: ${sessionId}`);
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
    console.error(`Routing command to session: ${sessionId}`, command.type);
    sendToSession(sessionId, command);
  } else if (isStdioMode) {
    // In STDIO mode, route to the unique STDIO session ID
    if (STDIO_SESSION_ID) {
      console.error(`Routing command in STDIO mode to session: ${STDIO_SESSION_ID}`, command.type);
      sendToSession(STDIO_SESSION_ID, command);
    } else {
      console.error('Routing command in STDIO mode - no session ID available, broadcasting to all clients:', command.type);
      if (wsClients.size > 0) {
        broadcastToClients(command);
      } else {
        console.error('No WebSocket clients connected. Command not routed:', command.type);
      }
    }
  } else {
    console.warn('Tool handler called but no session context available. Command not routed.');
    console.warn('Current request session ID:', sessionId);
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
    
    return {
      content: [
        {
          type: 'text',
          text: `Shareable URL for this session:\n\n${shareableUrl}\n\nCopy and paste this URL to share the current Juicebox session.`
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
    
    return {
      content: [
        {
          type: 'text',
          text: `Open this URL ${connectionUrl}\n\nto launch the Juicebox visualization app.`
        }
      ]
    };
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

// Detect if we're running in STDIO mode (subprocess) or HTTP mode
const forceHttpMode = process.env.MCP_TRANSPORT === 'http' || process.env.MCP_TRANSPORT === 'sse' || process.env.FORCE_HTTP_MODE === 'true';
const isStdioMode = !forceHttpMode && !process.stdin.isTTY;

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
  
  console.error('Running in STDIO mode (subprocess)');
  const stdioTransport = new StdioServerTransport();
  
  // Connect MCP server to STDIO transport
  mcpServer.connect(stdioTransport).catch((error) => {
    console.error('Error connecting MCP server to STDIO transport:', error);
    process.exit(1);
  });
  
  console.error('MCP server connected via STDIO transport');
  console.error(`Browser URL configured: ${BROWSER_URL}`);
  console.error(`STDIO session ID: ${STDIO_SESSION_ID}`);
} else {
  console.error('Running in HTTP/SSE mode');
}

// Handle POST requests (initialization and tool calls) - only in HTTP mode
if (!isStdioMode) {
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  // Log request for debugging (use stderr to avoid interfering with MCP protocol on stdout)
  if (sessionId) {
    console.error(`Received MCP request for session: ${sessionId}, method: ${req.body?.method || 'unknown'}`);
  } else {
    console.error(`Received MCP request (no session), method: ${req.body?.method || 'unknown'}`);
  }
  
  try {
    let transport;
    
    if (sessionId && transports[sessionId]) {
      // Reuse existing transport for subsequent requests
      transport = transports[sessionId];
    } else if (sessionId && !transports[sessionId]) {
      // Session ID provided but transport doesn't exist - session expired or lost
      // Allow re-initialization if this is an initialize request
      if (isInitializeRequest(req.body)) {
        console.error(`Session ${sessionId} not found, creating new transport for re-initialization`);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId, // Reuse the same session ID
          onsessioninitialized: (sid) => {
            console.error(`MCP session re-initialized: ${sid}`);
            transports[sid] = transport;
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.error(`MCP session closed: ${sid}`);
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
      console.error('Creating new transport for initialization');
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          console.error(`MCP session initialized: ${sid}`);
          transports[sid] = transport;
        }
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.error(`MCP session closed: ${sid}`);
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
        console.error(`Setting request context for session: ${sessionId || 'null'}`);

        // Detect tool calls and notify WebSocket clients
        if (req.body?.method === 'tools/call' && req.body?.params?.name) {
          const toolName = req.body.params.name;
          console.error(`MCP tool called: ${toolName} (session: ${sessionId || 'unknown'})`);
          
          // Send tool call notification to specific session's browser client
          if (sessionId) {
            const sent = sendToSession(sessionId, {
              type: 'toolCall',
              toolName: toolName,
              timestamp: Date.now()
            });
            if (!sent) {
              console.warn(`Tool call notification not sent - no browser connected for session: ${sessionId}`);
            }
          }
        }

        // Handle the POST request - tool handlers will be called during this
        await transport.handleRequest(req, res, req.body);
        
        console.error(`Request handling complete for session: ${sessionId || 'null'}`);
      });
    } catch (error) {
      console.error('Error handling MCP POST request:', error);
      
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
    console.error('Error in MCP POST handler (transport setup):', error);
    
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
    
    if (lastEventId) {
      console.error(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.error(`Establishing new SSE stream for session ${sessionId}`);
    }
    
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP GET request:', error);
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
    console.error(`Received session termination request for session ${sessionId}`);
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling session termination:', error);
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
    // Use console.error for startup messages to avoid interfering with MCP protocol on stdout
    console.error(`MCP Server listening on http://localhost:${MCP_PORT}/mcp`);
    console.error(`Browser URL configured: ${BROWSER_URL}`);
    if (existsSync(distPath)) {
      console.error(`Serving static files from ${distPath}`);
    }
  });
}

// Handle server shutdown
process.on('SIGINT', async () => {
  console.warn('Shutting down servers...');
  
  // Close all WebSocket connections
  wss.close();
  
  // Close all MCP transports
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  
  await mcpServer.close();
  process.exit(0);
});

