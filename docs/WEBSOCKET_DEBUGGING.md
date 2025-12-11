# WebSocket Connection Debugging Guide

If you're seeing "No active WebSocket connection found for session" errors, follow these steps to diagnose and fix the issue.

## Symptoms

- Server logs show: `No active WebSocket connection found for session: <session-id>`
- Tool calls are received but not executed in the browser
- Browser shows "disconnected" status

## Step-by-Step Debugging

### 1. Verify WebSocket Server is Running

Check if the WebSocket server is listening on port 3001:

```bash
lsof -i :3001
```

You should see a `node` process listening. If not, start the server:

```bash
node server.js
```

### 2. Check Browser Console

Open your browser's developer console (F12) and look for:

**Expected logs:**
- `Connecting to WebSocket server at ws://localhost:3001...`
- `Session ID: <your-session-id>`
- `WebSocket connected to: ws://localhost:3001`
- `Session ID for registration: <your-session-id>`
- `Registering session ID: <your-session-id>`
- `✅ Session registered successfully: <your-session-id>`

**If you see errors:**
- `WebSocket error:` - Connection failed, check server is running
- `WebSocket closed. Code: 1006` - Connection closed unexpectedly
- `No sessionId found in URL` - URL missing sessionId parameter

### 3. Verify URL Has sessionId Parameter

The browser URL **must** include the `sessionId` query parameter:

**Correct:**
```
http://localhost:5173?sessionId=25d2db7e-921d-40f8-ac47-d795539cddf4
```

**Incorrect:**
```
http://localhost:5173
```

### 4. Get the Correct URL from MCP Server

The MCP server provides a tool to get the correct URL. In your MCP client (ChatGPT/Cursor), ask:

- "Get the Juicebox URL"
- "Open Juicebox"
- "Show me the connection URL"

Or call the tool directly: `get_juicebox_url`

This will return a URL like:
```
http://localhost:5173?sessionId=25d2db7e-921d-40f8-ac47-d795539cddf4
```

**Important:** Copy and paste this exact URL into your browser.

### 5. Verify Session ID Matches

The sessionId in the browser URL **must match** the sessionId in the server logs:

**Server log:**
```
Received MCP request for session: 25d2db7e-921d-40f8-ac47-d795539cddf4
```

**Browser URL:**
```
http://localhost:5173?sessionId=25d2db7e-921d-40f8-ac47-d795539cddf4
```

If they don't match, the WebSocket connection won't route commands correctly.

### 6. Check WebSocket URL Configuration

The frontend determines the WebSocket URL in this order:

1. **Explicit URL parameter** (if passed to `connect()`)
2. **Environment variable** `VITE_WS_URL` (for Netlify/production)
3. **Auto-detect** from current hostname (if not localhost)
4. **Default** to `ws://localhost:3001` (for localhost)

**For local development:**
- Should use: `ws://localhost:3001`
- Check browser console for: `Connecting to WebSocket server at ws://localhost:3001...`

**For Netlify:**
- Must set `VITE_WS_URL` environment variable in Netlify
- Should be: `wss://your-tunnel-url.loca.lt` (or your tunnel URL)
- Must use `wss://` (secure WebSocket) for HTTPS sites

### 7. Common Issues and Solutions

#### Issue: "No sessionId found in URL"
**Solution:** Make sure you're opening the URL provided by the `get_juicebox_url` tool, not just `http://localhost:5173`

#### Issue: "WebSocket error" or connection fails
**Solutions:**
- Verify server is running: `lsof -i :3001`
- Check firewall isn't blocking port 3001
- Try restarting the server
- Check server logs for errors

#### Issue: Session ID doesn't match
**Solution:** 
- Get a fresh URL from `get_juicebox_url` tool
- Make sure you're using the latest session ID
- Don't reuse old URLs from previous sessions

#### Issue: WebSocket connects but doesn't register
**Check:**
- Browser console should show: `Registering session ID: <id>`
- Server logs should show: `Browser client registered with session ID: <id>`
- If sessionId is `null` or `undefined`, the URL is missing the parameter

#### Issue: Works locally but not on Netlify
**Solutions:**
- Set `VITE_WS_URL` in Netlify environment variables
- Use `wss://` (not `ws://`) for secure WebSocket
- Ensure WebSocket tunnel is active and accessible
- Redeploy Netlify after setting environment variable

### 8. Testing the Connection

Once connected, you should see:

**Browser console:**
```
✅ Session registered successfully: <session-id>
```

**Server logs:**
```
Browser client registered with session ID: <session-id>
```

Then try calling a tool (e.g., `load_map`) and verify:
- Server logs show: `Routing command to session: <session-id> loadMap`
- Browser receives and executes the command
- No "No active WebSocket connection" errors

## Quick Checklist

- [ ] WebSocket server is running on port 3001
- [ ] Browser URL includes `?sessionId=<id>` parameter
- [ ] Session ID in URL matches session ID in server logs
- [ ] Browser console shows "WebSocket connected"
- [ ] Browser console shows "Session registered successfully"
- [ ] Server logs show "Browser client registered with session ID"
- [ ] No WebSocket errors in browser console
- [ ] For Netlify: `VITE_WS_URL` is set correctly

## Still Having Issues?

1. Check both browser console AND server logs
2. Verify the sessionId matches exactly (copy-paste to compare)
3. Try getting a fresh URL from `get_juicebox_url` tool
4. Restart both server and browser
5. Check for any CORS or network errors in browser console
