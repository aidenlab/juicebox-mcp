# MCP Server Tools

This document lists all the tools provided by `server.js` and explains how they are used.

## Map Loading Tools

### `load_map`
Loads a Hi-C contact map (.hic file) into Juicebox.

**Parameters:**
- `url` (required): URL to the .hic file
- `name` (optional): Optional name for the map
- `normalization` (optional): Normalization method (e.g., "VC", "VC_SQRT", "KR", "NONE")
- `locus` (optional): Optional genomic locus (e.g., "1:1000000-2000000 1:1000000-2000000")

**Usage:** Use this tool to load a Hi-C contact map from a URL into the Juicebox visualization.

---

### `load_control_map`
Loads a control map (.hic file) for comparison with the main map.

**Parameters:**
- `url` (required): URL to the control .hic file
- `name` (optional): Optional name for the control map
- `normalization` (optional): Normalization method (e.g., "VC", "VC_SQRT", "KR", "NONE")

**Usage:** Use this tool to load a control map that can be compared with the main contact map.

---

### `load_session`
Loads a Juicebox session from JSON data, attached file, or remote URL. Sessions restore browser configurations, loci, tracks, and visualization state.

**Parameters:**
- `sessionData` (optional): JSON string of session data (use when pasting JSON directly into chat)
- `sessionUrl` (optional): URL to fetch session JSON from remote source (e.g., Dropbox, AWS S3, GitHub raw file URL)
- `fileContent` (optional): Content of attached session file (use when user attaches a .json file to the chat)

**Usage:** Supports three input methods: (1) direct JSON paste, (2) file attachment, (3) URL-based loading from remote sources. The tool automatically normalizes Dropbox URLs (converts preview links to download links).

---

## Navigation Tools

### `goto_locus`
Navigates to a specific genomic locus in the currently loaded map.

**Parameters:**
- `locus` (required): Can be a string (natural language, standard format, or gene name) or an object with `chr`, `start`, and `end` properties
  - String examples: "chr1:1000-2000", "BRCA1", "chromosome 1 from 1000 to 2000"
  - Object format: `{chr: "chr1", start: 1000, end: 2000}`

**Usage:** Supports natural language, gene names, standard format, and structured objects. When a single chromosome is specified, it applies to both axes of the Hi-C contact map.

---

### `zoom_in`
Zooms in on the contact map.

**Parameters:**
- `centerX` (optional): X coordinate for zoom center (pixels)
- `centerY` (optional): Y coordinate for zoom center (pixels)

**Usage:** Zooms in on the contact map, optionally centered at specific pixel coordinates.

---

### `zoom_out`
Zooms out on the contact map.

**Parameters:**
- `centerX` (optional): X coordinate for zoom center (pixels)
- `centerY` (optional): Y coordinate for zoom center (pixels)

**Usage:** Zooms out on the contact map, optionally centered at specific pixel coordinates.

---

## Color Configuration Tools

### `set_map_foreground_color`
Sets the foreground color scale for the contact map.

**Parameters:**
- `color` (required): Hex color code (e.g., "#ff0000")
- `threshold` (optional): Optional threshold value for the color scale

**Usage:** Sets the foreground color used to display contact map data. The color is specified as a hex code and optionally includes a threshold value.

---

### `set_map_background_color`
Sets the background color of the contact map.

**Parameters:**
- `color` (required): Hex color code (e.g., "#000000")

**Usage:** Sets the background color of the contact map visualization.

---

## Session Management Tools

### `save_session`
Saves the current Juicebox session to a JSON file. The session includes all loaded maps, tracks, current view state, color scales, and other configuration.

**Parameters:**
- `filePath` (optional): Full path to save the session file. If not provided, saves to Desktop with filename: `juicebox-session-YYYY-MM-DD-HHMMSS.json`

**Usage:** Saves the complete session state to a file. By default, saves to the Desktop with a timestamped filename. The session can later be restored using `load_session`.

---

### `create_shareable_url`
Creates a shareable URL for the current Juicebox session.

**Parameters:** None

**Usage:** Generates a URL that can be shared with others to view the current Juicebox session. The URL includes compressed session data and is automatically shortened using TinyURL if configured. The URL is self-contained and doesn't require Claude Desktop connection.

---

## Data Source Tools

### `list_data_sources`
Lists available Hi-C contact map data sources (4DN, ENCODE) with their metadata columns.

**Parameters:** None

**Usage:** Use this when users ask what data sources are available, what maps can be searched, or want to understand the available metadata. Returns information about each data source including its ID, name, description, data URL, and available columns.

---

### `search_maps`
Searches for Hi-C contact maps using natural language queries. Searches across all metadata fields (Assembly, Biosource, Biosample, Description, etc.).

**Parameters:**
- `query` (required): Natural language search query (e.g., "human hg38", "mouse cells", "K562")
- `source` (optional): Data source ID ('4dn', 'encode') or 'all' to search all sources. Default: 'all'
- `limit` (optional): Maximum number of results to return (default: 50)

**Usage:** Use this when users want to find specific maps. Results are limited to 50 by default. For statistical questions like "what assemblies are covered" or "how many maps are there", use `get_data_source_statistics` instead.

---

### `get_data_source_statistics`
Gets statistical overview of a data source including total maps, assemblies covered, and breakdowns by metadata fields.

**Parameters:**
- `source` (required): Data source ID ('4dn' or 'encode')

**Usage:** Use this when users ask "what assemblies are available", "how many maps are there", "what cell types are covered", etc. This returns unfiltered statistics without search limits. Provides counts by Assembly, Biosource/Biosample, Lab, and Experiment.

---

### `get_map_details`
Gets detailed information about a specific Hi-C contact map.

**Parameters:**
- `source` (required): Data source ID ('4dn' or 'encode')
- `index` (optional): Index from search results (0-based). Required if `url` is not provided.
- `url` (optional): Direct URL to the map. Required if `index` is not provided.

**Usage:** Use this when users want more information about a specific map from search results. Returns the map's source, name, URL, and all metadata fields.

---

## Connection and Status Tools

### `get_juicebox_url`
Gets the URL to open in your browser to connect the Juicebox visualization app.

**Parameters:** None

**Usage:** Use this when users ask how to connect, how to open the Juicebox app, or say things like "Hello juicebox", "Open juicebox", "Show me juicebox", "Launch juicebox", etc. Returns a URL with the session ID parameter that connects the browser to the MCP server.

---

### `get_server_status`
Gets diagnostic information about the MCP server, WebSocket connections, and session status.

**Parameters:** None

**Usage:** Use this for debugging connection issues. Returns information about the server mode (STDIO or HTTP/SSE), current session ID, WebSocket server port, number of connected clients, registered session IDs, connection states, and browser URL.

---

## Notes

- All tools that interact with the browser visualization route commands through WebSocket connections to the appropriate session.
- Tools that require browser connection (like `save_session` and `create_shareable_url`) check for active WebSocket connections before executing.
- The server supports both STDIO mode (for Claude Desktop) and HTTP/SSE mode (for MCP Inspector and other HTTP clients).
- Session management uses AsyncLocalStorage to maintain context across async operations in HTTP mode, and a unique STDIO session ID in STDIO mode.

