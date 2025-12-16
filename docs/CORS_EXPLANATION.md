# Understanding CORS and the S3 Proxy Solution

## What is CORS?

**CORS (Cross-Origin Resource Sharing)** is a browser security feature that restricts web pages from making requests to a different domain than the one that served the web page.

### The Same-Origin Policy

Browsers enforce the **Same-Origin Policy**, which means:
- A web page from `https://myapp.netlify.app` can freely request resources from `https://myapp.netlify.app`
- But it **cannot** directly request resources from `https://hicfiles.s3.amazonaws.com` (a different origin)

An "origin" is defined by three parts:
- **Protocol** (http vs https)
- **Domain** (netlify.app vs amazonaws.com)
- **Port** (if specified)

So `https://myapp.netlify.app` and `https://hicfiles.s3.amazonaws.com` are **different origins**.

## Why Does This Matter?

When your JavaScript code tries to fetch a file from S3:

```javascript
// This happens in the browser
fetch('https://hicfiles.s3.amazonaws.com/hiseq/huvec/in-situ/HIC080.hic')
```

The browser checks:
1. "Is this request going to the same origin as the page?"
2. If NO → "Does the S3 server allow requests from my origin?"
3. If S3 doesn't explicitly allow it → **BLOCK THE REQUEST** (403 Forbidden)

## Why It Works Locally But Not on Netlify

### Local Development (`localhost`)

When you run the app locally:
- Your page is served from: `http://localhost:5173` (or similar)
- The browser treats `localhost` as a special case
- CORS restrictions are **relaxed** for localhost
- Direct S3 requests work fine ✅

### Netlify Production

When your app is on Netlify:
- Your page is served from: `https://myapp.netlify.app`
- This is a **real domain** (not localhost)
- CORS restrictions are **fully enforced**
- S3 doesn't allow requests from `netlify.app` → **403 Forbidden** ❌

## Why Can't We Just Configure S3 CORS?

The S3 bucket (`hicfiles.s3.amazonaws.com`) is owned by Aiden Lab (the Juicebox project maintainers), not by you. To allow CORS, someone would need to:

1. Have AWS credentials for that bucket
2. Configure the bucket's CORS policy to allow `*.netlify.app`
3. This would allow **any** Netlify site to access the files

Even if we could configure it, there are reasons why they might not want to:
- Security: Opening CORS to all Netlify sites could be a security risk
- They might want to control who can access the files
- They might not want to maintain CORS configurations for every hosting platform

## How the Proxy Solves This

The proxy works by changing **where the request originates**:

### Without Proxy (Direct Request) ❌

```
Browser (netlify.app) 
  └─> Direct request to S3 (amazonaws.com)
      └─> Browser checks: "Different origin? S3 doesn't allow netlify.app"
          └─> BLOCKED (403 Forbidden)
```

**The request originates from the browser**, so CORS applies.

### With Proxy ✅

```
Browser (netlify.app)
  └─> Request to Netlify Function (/api/proxy-s3)
      └─> Netlify Server (netlify.app) 
          └─> Fetches from S3 (amazonaws.com)
              └─> Returns to browser
```

**The request to S3 originates from Netlify's server** (same origin as your page), so:
- No CORS restrictions apply (server-to-server requests don't have CORS)
- The browser receives the file from Netlify (same origin)
- Everything works! ✅

## Visual Flow Comparison

### Direct Request (Fails)

```
┌─────────────────┐
│  Your Browser   │
│ (netlify.app)   │
└────────┬────────┘
         │
         │ fetch('https://s3.../file.hic')
         │ ❌ CORS Error: Different origin
         ▼
┌─────────────────┐
│  S3 Bucket      │
│ (amazonaws.com) │
└─────────────────┘
```

### Proxy Request (Works)

```
┌─────────────────┐
│  Your Browser   │
│ (netlify.app)   │
└────────┬────────┘
         │
         │ fetch('/api/proxy-s3?url=...')
         │ ✅ Same origin - allowed!
         ▼
┌─────────────────┐      ┌─────────────────┐
│ Netlify Server  │─────>│  S3 Bucket      │
│ (netlify.app)   │      │ (amazonaws.com) │
└────────┬────────┘      └─────────────────┘
         │
         │ Returns file
         │ ✅ Same origin - allowed!
         ▼
┌─────────────────┐
│  Your Browser   │
│ (netlify.app)   │
└─────────────────┘
```

## Key Insight: Server vs Browser Requests

**The crucial difference:**

- **Browser requests** are subject to CORS
- **Server requests** are NOT subject to CORS

When your Netlify function (running on Netlify's server) requests from S3:
- It's a **server-to-server** request
- CORS doesn't apply (CORS is a browser security feature)
- The request succeeds

Then when Netlify returns the file to your browser:
- It's a **same-origin** request (both are `netlify.app`)
- CORS allows it
- Everything works!

## Why Not Use a CDN or Other Solutions?

### Alternative 1: Configure S3 CORS
- **Problem**: We don't own the S3 bucket
- **Problem**: Would need to allow all Netlify sites (security concern)

### Alternative 2: Use a CDN (CloudFront)
- **Problem**: Still need to configure CORS on the CDN
- **Problem**: Additional infrastructure and cost
- **Problem**: Still don't control the S3 bucket

### Alternative 3: Download Files Server-Side
- **Problem**: Large files (Hi-C files can be GBs)
- **Problem**: Would need to store/cache files
- **Problem**: Inefficient for range requests (partial file reads)

### Our Proxy Solution
- ✅ Works with existing S3 bucket (no changes needed)
- ✅ Only proxies when needed (on Netlify)
- ✅ Supports range requests (efficient partial reads)
- ✅ No additional infrastructure
- ✅ Transparent to the application code

## Real-World Example

Let's trace what happens when loading `HIC080.hic`:

### Step 1: Browser Detects Netlify
```javascript
// In igvRemoteFile.js
if (isNetlifyHosted()) {  // hostname.includes('netlify.app')
    // Convert S3 URL to proxy URL
    url = '/api/proxy-s3?url=' + encodeURIComponent(originalS3Url);
}
```

### Step 2: Browser Makes Request
```javascript
// Browser makes request to same origin
fetch('/api/proxy-s3?url=https://hicfiles.s3.amazonaws.com/.../HIC080.hic')
// ✅ Same origin (netlify.app) - CORS allows it!
```

### Step 3: Netlify Function Fetches from S3
```javascript
// In proxy-s3.js (runs on Netlify server)
const response = await fetch('https://hicfiles.s3.amazonaws.com/.../HIC080.hic');
// ✅ Server-to-server request - no CORS restrictions!
```

### Step 4: Netlify Returns to Browser
```javascript
// Function returns file to browser
return {
    statusCode: 200,
    headers: {
        'Access-Control-Allow-Origin': '*',  // Explicitly allow browser
        'Content-Type': 'application/octet-stream'
    },
    body: fileContent
};
// ✅ Browser receives from same origin - CORS allows it!
```

## Summary

**The Problem:**
- Browsers block cross-origin requests unless explicitly allowed
- S3 bucket doesn't allow requests from Netlify domains
- We can't configure the S3 bucket (don't own it)

**The Solution:**
- Proxy requests through Netlify's server
- Server-to-server requests bypass CORS
- Browser receives file from same origin (Netlify)
- Everything works transparently!

**Why It's Elegant:**
- No changes needed to S3 bucket
- Only activates when needed (on Netlify)
- Supports all features (range requests, etc.)
- Transparent to application code

