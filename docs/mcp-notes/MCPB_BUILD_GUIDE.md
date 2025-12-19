# MCPB Package Build Guide

This guide walks you through building an MCPB (Model Context Protocol Bundle) package for Juicebox MCP server. The MCPB file is a self-contained ZIP archive that can be installed directly in Claude Desktop and other MCP clients.

## Overview

The MCPB build process:
1. **Bundles** the server code and all dependencies into a single file using esbuild
2. **Packages** the bundled server and manifest.json into a ZIP archive (.mcpb file)
3. **Creates** a self-contained package that can be installed without Node.js or npm

## Prerequisites

- Node.js 18+ installed
- npm installed
- Git repository cloned

## Build Process

### Step 1: Install Dependencies

First, ensure all dependencies are installed, including the build tools:

```bash
npm install
```

This installs:
- Runtime dependencies: `@modelcontextprotocol/sdk`, `express`, `cors`, `ws`, `zod`
- Build dependencies: `esbuild`, `archiver`

### Step 2: Build the Bundle

Create the bundled server file:

```bash
npm run build:mcpb:bundle
```

This command:
- Bundles `server.js` and all dependencies into `dist/juicebox-mcp-server.js`
- Handles Node.js built-ins correctly (keeps them external)
- Includes the `__require` polyfill for dynamic requires
- Outputs an ESM module compatible with Node.js 18+

**Expected output:**
```
✅ __require function patched to handle Node.js built-ins
✅ Bundle created with express bundled (self-contained package)
```

**Output file:** `dist/juicebox-mcp-server.js`

### Step 3: Test the Bundle (Optional)

Before creating the package, you can test the bundled server:

```bash
npm run start:mcpb
```

This runs the bundled server from `dist/juicebox-mcp-server.js`. Verify that:
- The server starts without errors
- WebSocket server is listening on port 3011
- MCP server is ready (STDIO mode) or HTTP server is listening (HTTP mode)

Press `Ctrl+C` to stop the server.

### Step 4: Create the MCPB Package

Create the final `.mcpb` package:

```bash
npm run build:mcpb:package
```

This command:
- Creates a ZIP archive with timestamp: `juicebox-mcp-YYYYMMDD-HHMMSS.mcpb`
- Includes `manifest.json` in the root
- Includes the `dist/` directory with the bundled server
- Uses maximum compression (level 9)

**Expected output:**
```
✅ Package created: juicebox-mcp-20241215-143022.mcpb (1234567 bytes)
```

**Output file:** `juicebox-mcp-YYYYMMDD-HHMMSS.mcpb` (in project root)

### Step 5: Full Build (Bundle + Package)

Alternatively, you can do both steps in one command:

```bash
npm run build:mcpb
```

This runs both `build:mcpb:bundle` and `build:mcpb:package` sequentially.

## Available Build Scripts

| Script | Description |
|--------|-------------|
| `npm run build:mcpb` | Full build: bundle + package |
| `npm run build:mcpb:bundle` | Create bundle only (`dist/juicebox-mcp-server.js`) |
| `npm run build:mcpb:package` | Create package only (requires existing bundle) |
| `npm run start:mcpb` | Run bundled server for testing |

**Note:** The `build:mcpb` scripts are separate from the library build scripts (`build`, `build:netlify`) to avoid conflicts.

## Package Contents

The `.mcpb` file is a ZIP archive containing:

```
juicebox-mcp-YYYYMMDD-HHMMSS.mcpb
├── manifest.json                    # Package configuration
└── dist/
    └── juicebox-mcp-server.js       # Bundled server code
```

### manifest.json

The manifest file tells Claude Desktop how to run the server:

```json
{
  "manifest_version": "0.1",
  "name": "juicebox-mcp-server",
  "version": "0.0.1",
  "description": "MCP server for controlling Juicebox Hi-C contact map visualization...",
  "author": { "name": "Douglass Turner" },
  "server": {
    "type": "node",
    "entry_point": "dist/juicebox-mcp-server.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/dist/juicebox-mcp-server.js"],
      "env": {
        "BROWSER_URL": "http://localhost:5173",
        "MCP_PORT": "3010",
        "WS_PORT": "3011"
      }
    }
  }
}
```

## Installation in Claude Desktop

1. **Open Claude Desktop Settings**
   - macOS: `Cmd + ,` or Claude Desktop → Settings
   - Windows: `Ctrl + ,` or File → Settings

2. **Navigate to Extensions**
   - Go to "Extensions" or "Advanced Settings"

3. **Install Extension**
   - Click "Install Extension" or "Add Extension"
   - Select your `.mcpb` file

4. **Verify Installation**
   - The server should appear in your extensions list
   - Claude Desktop will extract and configure the server automatically

## Troubleshooting

### Build Fails: "Cannot find module 'esbuild'"

**Solution:** Install dependencies:
```bash
npm install
```

### Build Fails: "Cannot find module 'archiver'"

**Solution:** Install dependencies:
```bash
npm install
```

### Bundle Creation Fails: "__require function not found"

**Issue:** esbuild output format may have changed.

**Solution:** Check `esbuild.config.js` - the `__require` patching logic may need updates for newer esbuild versions.

### Package Creation Fails: "dist/ directory not found"

**Issue:** Bundle step didn't complete successfully.

**Solution:** Run `npm run build:mcpb:bundle` first, then verify `dist/juicebox-mcp-server.js` exists.

### Server Won't Start from Bundle

**Issue:** Bundled server has runtime errors.

**Solution:**
1. Test the unbundled server: `npm start`
2. Compare behavior with bundled server: `npm run start:mcpb`
3. Check for missing dependencies or path issues
4. Verify Node.js version is 18+

### Package Installs but Server Doesn't Start

**Issue:** Environment variables or paths incorrect.

**Solution:**
1. Check `manifest.json` has correct `entry_point` path
2. Verify environment variables in `manifest.json` match your setup
3. Check Claude Desktop logs for error messages
4. Ensure Node.js 18+ is installed on the system

## Configuration

### Updating manifest.json

Before building, you can customize `manifest.json`:

- **Version:** Update `version` field (e.g., "0.0.1" → "0.0.2")
- **BROWSER_URL:** Change default frontend URL if deploying to Netlify
- **Ports:** Adjust `MCP_PORT` or `WS_PORT` if needed
- **TinyURL API Key:** Replace `YOUR_TINYURL_API_KEY_HERE` with your actual TinyURL API key
- **TinyURL:** Adjust `TINYURL_DOMAIN` or `TINYURL_ENDPOINT` if needed

**Important:** After changing `manifest.json`, rebuild the package:
```bash
npm run build:mcpb
```

### Environment Variables

The server reads environment variables in this priority order:
1. Command-line arguments (`--browser-url`)
2. Environment variables (`BROWSER_URL`, `MCP_PORT`, `WS_PORT`, `TINYURL_API_KEY`, etc.)
3. Default values from `manifest.json`

Users can override `manifest.json` defaults by setting environment variables before starting Claude Desktop, but this is optional - all configuration is included in the `.mcpb` file for simple one-file installation.

#### TinyURL Configuration

The `TINYURL_API_KEY` is included directly in `manifest.json` for simple installation. Before building the `.mcpb` package:

1. Open `manifest.json`
2. Find `"TINYURL_API_KEY": "YOUR_TINYURL_API_KEY_HERE"`
3. Replace `YOUR_TINYURL_API_KEY_HERE` with your actual TinyURL API key
4. Build the package: `npm run build:mcpb`

**Note:** If `TINYURL_API_KEY` is not set or invalid, the server will still function but URLs will be returned unshortened (graceful degradation).

## Development Workflow

### During Development

Use the unbundled server for faster iteration:

```bash
npm start
# or
npm run mcp:server
```

### Before Release

1. **Update version** in `manifest.json` and `package.json`
2. **Test bundled server:**
   ```bash
   npm run build:mcpb:bundle
   npm run start:mcpb
   ```
3. **Create package:**
   ```bash
   npm run build:mcpb
   ```
4. **Test installation** in Claude Desktop
5. **Distribute** the `.mcpb` file

## File Structure

```
juicebox-mcp/
├── server.js                 # Source server code
├── esbuild.config.js         # Build configuration
├── build-mcpb.js            # Package creation script
├── manifest.json            # Package manifest
├── package.json             # Dependencies and scripts
├── dist/                    # Build output (gitignored)
│   └── juicebox-mcp-server.js
└── docs/
    └── MCPB_BUILD_GUIDE.md  # This file
```

## Additional Resources
- [Netlify Setup Guide](../docs/NETLIFY_SETUP.md) - Frontend deployment

## Summary

Building an MCPB package is straightforward:

1. `npm install` - Install dependencies
2. `npm run build:mcpb` - Create bundle and package
3. Install `.mcpb` file in Claude Desktop

The resulting package is self-contained and can be distributed without requiring users to have Node.js or npm installed.
