# Understanding `netlify.toml`

## What is `netlify.toml`?

`netlify.toml` is Netlify's **configuration file** that tells Netlify how to build, deploy, and serve your site. It's written in TOML (Tom's Obvious Minimal Language) format.

Think of it as a "recipe" for Netlify:
- **What command to run** to build your site
- **Where to find** the built files
- **How to route** URLs
- **Where to find** serverless functions
- **What headers** to set
- And much more!

## Why Use It?

### Alternative: Netlify Dashboard
You *could* configure everything through Netlify's web dashboard, but `netlify.toml` is better because:
- ✅ **Version controlled** - Configuration lives in your repo
- ✅ **Reproducible** - Same config for everyone
- ✅ **Portable** - Easy to move between Netlify accounts
- ✅ **Documented** - Shows exactly how your site is configured
- ✅ **CI/CD friendly** - Works with automated deployments

## Your Current `netlify.toml` Explained

Let's break down your file line by line:

```toml
[build]
  command = "npm run build:netlify"
  publish = "dist"
  functions = "netlify/functions"
```

### `[build]` Section
This section tells Netlify how to build your site.

**`command = "npm run build:netlify"`**
- The command Netlify runs to build your site
- Runs in your repository root
- Must complete successfully (exit code 0) or deployment fails
- This runs `npm run build:netlify` which uses `vite.config.netlify.js`

**`publish = "dist"`**
- The directory containing your built/static files
- After the build command completes, Netlify serves files from this directory
- This is your "public" directory that gets deployed
- In your case, Vite builds to `dist/`

**`functions = "netlify/functions"`**
- Directory where Netlify looks for serverless functions
- Functions in this directory are automatically deployed
- Your `proxy-s3.js` function lives here
- Netlify will make these available at `/.netlify/functions/{function-name}`

```toml
[[redirects]]
  from = "/api/proxy-s3"
  to = "/.netlify/functions/proxy-s3"
  status = 200
```

### Redirects Section
Redirects tell Netlify how to route URLs.

**`[[redirects]]`** (double brackets = array, can have multiple)
- Each `[[redirects]]` block defines one redirect rule
- Processed in order (first match wins)

**`from = "/api/proxy-s3"`**
- The URL pattern to match
- When someone requests `/api/proxy-s3`, this rule applies
- Can use wildcards: `/api/*` matches all `/api/...` paths

**`to = "/.netlify/functions/proxy-s3"`**
- Where to route the request
- `/.netlify/functions/` is Netlify's internal path for functions
- This makes your function accessible at a cleaner URL

**`status = 200`**
- HTTP status code
- `200` = rewrite (URL doesn't change in browser)
- `301` = permanent redirect (browser sees new URL)
- `302` = temporary redirect
- `404` = not found

**Why this redirect?**
- Makes `/api/proxy-s3` work instead of `/.netlify/functions/proxy-s3`
- Cleaner, more user-friendly URL
- Hides Netlify's internal structure

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**`from = "/*"`**
- Matches **all** paths (wildcard `*`)
- This is a catch-all rule
- Must be **last** in the redirect list (order matters!)

**`to = "/index.html"`**
- Routes everything to `index.html`
- This enables **SPA (Single Page Application) routing**

**Why needed?**
- Your app uses client-side routing (React Router, Vue Router, etc.)
- When someone visits `/some/path`, the server doesn't have that file
- This rule sends all requests to `index.html`
- Your JavaScript router then handles the route

**Example:**
```
User visits: https://myapp.netlify.app/some/deep/path
Netlify serves: /index.html (because of this rule)
JavaScript router: Handles `/some/deep/path` client-side
```

## Common `netlify.toml` Sections

Here are other sections you might see (not in your file, but useful to know):

### Headers
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    Content-Security-Policy = "default-src 'self'"
```
Sets HTTP headers for security, caching, etc.

### Environment Variables
```toml
[build.environment]
  NODE_VERSION = "18"
  NPM_FLAGS = "--legacy-peer-deps"
```
Sets environment variables during build (not runtime)

### Context-Specific Settings
```toml
[context.production]
  command = "npm run build:prod"

[context.deploy-preview]
  command = "npm run build:preview"
```
Different settings for production vs preview deployments

### Plugins
```toml
[[plugins]]
  package = "@netlify/plugin-sitemap"
```
Adds Netlify plugins for additional functionality

## How Netlify Uses This File

### During Deployment:

1. **Clone Repository**
   - Netlify clones your repo

2. **Read `netlify.toml`**
   - Looks for `[build]` section
   - Reads build command, publish directory, functions directory

3. **Run Build Command**
   - Executes `npm run build:netlify`
   - Waits for it to complete

4. **Deploy Functions**
   - Scans `netlify/functions/` directory
   - Deploys each function as a serverless endpoint

5. **Deploy Static Files**
   - Serves files from `dist/` directory
   - Applies redirect rules
   - Applies header rules

6. **Site is Live!**
   - Your site is accessible at `your-app.netlify.app`

### When Handling Requests:

1. **User visits URL**
   - Browser requests `https://myapp.netlify.app/api/proxy-s3`

2. **Netlify Checks Redirects**
   - Matches `/api/proxy-s3` → routes to `/.netlify/functions/proxy-s3`

3. **Netlify Executes Function**
   - Runs your `proxy-s3.js` function
   - Returns response

4. **Or Serves Static File**
   - If no redirect matches, serves from `dist/` directory
   - If file not found and catch-all exists, serves `index.html`

## Order Matters!

**Important:** Redirects are processed **in order**, and the **first match wins**.

Your current order is correct:
```toml
# 1. Specific rule first
[[redirects]]
  from = "/api/proxy-s3"
  ...

# 2. Catch-all last
[[redirects]]
  from = "/*"
  ...
```

If you reversed them:
```toml
# ❌ WRONG ORDER
[[redirects]]
  from = "/*"          # Matches EVERYTHING first!
  to = "/index.html"

[[redirects]]
  from = "/api/proxy-s3"  # Never reached!
  ...
```

The catch-all would match `/api/proxy-s3` first, sending it to `index.html` instead of your function!

## File Location

`netlify.toml` must be in your **repository root**:
```
your-repo/
├── netlify.toml          ← Here!
├── package.json
├── src/
├── dist/
└── netlify/
    └── functions/
        └── proxy-s3.js
```

## Testing Locally

You can test Netlify configuration locally:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Test build
netlify build

# Test locally with Netlify Dev
netlify dev
```

This runs your site locally with Netlify's routing and functions!

## Summary

Your `netlify.toml` tells Netlify:

1. **Build:** Run `npm run build:netlify`
2. **Publish:** Serve files from `dist/`
3. **Functions:** Look for functions in `netlify/functions/`
4. **Redirects:**
   - `/api/proxy-s3` → function (clean URL)
   - Everything else → `index.html` (SPA routing)

It's like a blueprint for how Netlify should deploy and serve your site! 🏗️

