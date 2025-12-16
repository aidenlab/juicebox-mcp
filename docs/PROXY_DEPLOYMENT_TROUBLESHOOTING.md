# Troubleshooting S3 Proxy Function Deployment

## Changes Made

I've updated the proxy function to fix the 403 error:

1. **Added HEAD request support** - The `igvxhr` library makes HEAD requests to check content length before GET requests
2. **Added OPTIONS support** - For CORS preflight requests
3. **Updated redirect pattern** - Changed from `/api/proxy-s3` to `/api/proxy-s3*` to match query strings
4. **Added `force = true`** - Ensures the redirect takes precedence over other rules

## If You're Still Getting 403 Errors

### Step 1: Verify Function is Deployed

The 403 error suggests the function might not be deployed. Check:

1. **Is the function file committed?**
   ```bash
   git status
   # Should show netlify/functions/proxy-s3.js
   ```

2. **Is it pushed to your repository?**
   ```bash
   git push
   ```

3. **Has Netlify redeployed?**
   - Go to Netlify dashboard → Deploys
   - Check if there's a new deployment after you added the function
   - If not, trigger a new deployment

### Step 2: Check Function Directory Structure

Netlify expects functions in a specific structure:

```
your-repo/
├── netlify.toml          ← Must specify functions directory
└── netlify/
    └── functions/
        └── proxy-s3.js   ← Function file
```

Your `netlify.toml` should have:
```toml
[build]
  functions = "netlify/functions"  ← This line is critical!
```

### Step 3: Test Function Directly

Try accessing the function directly (bypassing the redirect):

```
https://juicebox-mcp.netlify.app/.netlify/functions/proxy-s3?url=https://hicfiles.s3.amazonaws.com/hiseq/huvec/in-situ/HIC080.hic
```

- **If this works**: The function is deployed, but the redirect isn't working
- **If this gives 404**: The function isn't deployed
- **If this gives 403**: There's a different issue (check Netlify logs)

### Step 4: Check Netlify Function Logs

1. Go to Netlify dashboard
2. Navigate to: **Functions** tab
3. Click on `proxy-s3`
4. Check **Logs** tab for errors

Common errors:
- **"Function not found"**: Function file isn't in the right location
- **"Module not found"**: Missing dependencies (shouldn't happen with our function)
- **"Syntax error"**: Check the function code

### Step 5: Verify Redirect Configuration

Your `netlify.toml` should have:

```toml
[[redirects]]
  from = "/api/proxy-s3*"  ← Note the * to match query strings
  to = "/.netlify/functions/proxy-s3"
  status = 200
  force = true  ← Ensures this takes precedence
```

**Important**: The redirect must come **before** the catch-all `/*` rule!

### Step 6: Test Locally with Netlify CLI

Install Netlify CLI and test locally:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Test the function locally
netlify dev
```

Then visit: `http://localhost:8888/api/proxy-s3?url=https://hicfiles.s3.amazonaws.com/hiseq/huvec/in-situ/HIC080.hic`

This will help identify if it's a deployment issue or a code issue.

## Common Issues and Solutions

### Issue: Function Returns 403

**Possible causes:**
1. Function not deployed (most common)
2. Redirect not working
3. Function code error

**Solution:**
- Verify function is in `netlify/functions/` directory
- Check `netlify.toml` has `functions = "netlify/functions"`
- Trigger a new deployment
- Check Netlify function logs

### Issue: Function Returns 404

**Possible causes:**
1. Function file not found
2. Wrong directory structure
3. Function name mismatch

**Solution:**
- Verify file is at `netlify/functions/proxy-s3.js`
- Check `netlify.toml` configuration
- Ensure function name matches file name (without `.js`)

### Issue: HEAD Requests Fail

**Fixed!** The function now supports HEAD requests. Make sure you've deployed the updated version.

### Issue: CORS Errors Still Occur

**Possible causes:**
1. Function not being used (URLs not proxied)
2. CORS headers not set correctly

**Solution:**
- Check browser console - are requests going to `/api/proxy-s3`?
- Verify `isNetlifyHosted()` is detecting Netlify correctly
- Check function response headers include CORS headers

## Verification Checklist

After deploying, verify:

- [ ] Function file exists at `netlify/functions/proxy-s3.js`
- [ ] `netlify.toml` has `functions = "netlify/functions"`
- [ ] `netlify.toml` has redirect rule for `/api/proxy-s3*`
- [ ] Redirect comes before catch-all `/*` rule
- [ ] Changes are committed and pushed
- [ ] Netlify has deployed (check Deploys tab)
- [ ] Function appears in Netlify Functions tab
- [ ] Direct function URL works: `/.netlify/functions/proxy-s3?url=...`
- [ ] Redirect URL works: `/api/proxy-s3?url=...`

## Still Not Working?

If you've checked everything above:

1. **Check Netlify Build Logs**
   - Go to Deploys → Click on latest deploy → View build log
   - Look for errors about functions

2. **Check Browser Network Tab**
   - Open DevTools → Network tab
   - Try loading a session
   - Check what URL is being requested
   - Check the response status and headers

3. **Test with curl**
   ```bash
   curl -I "https://juicebox-mcp.netlify.app/api/proxy-s3?url=https://hicfiles.s3.amazonaws.com/hiseq/huvec/in-situ/HIC080.hic"
   ```
   This will show headers and status code

4. **Contact Netlify Support**
   - If function appears in dashboard but returns 403
   - Include function logs and `netlify.toml` content

