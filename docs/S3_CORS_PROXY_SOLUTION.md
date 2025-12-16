# S3 CORS Proxy Solution for Netlify

## Problem

When the Juicebox frontend is hosted on Netlify, direct requests to Amazon S3 files fail with a `403 Forbidden` error due to CORS (Cross-Origin Resource Sharing) restrictions. The S3 bucket doesn't allow requests from the Netlify domain.

## Solution

We've implemented a proxy solution that routes S3 requests through a Netlify serverless function, which bypasses CORS restrictions since the request originates from Netlify's server (same origin) rather than the browser.

## Implementation

### 1. Netlify Function (`netlify/functions/proxy-s3.js`)

A serverless function that:
- Accepts S3 URLs as a query parameter
- Validates that only S3 URLs are proxied (security measure)
- Forwards Range headers for partial content requests
- Returns the file content with proper CORS headers
- Handles both full file requests and range requests (206 Partial Content)

### 2. Frontend Code Updates

#### `js/igvRemoteFile.js`
- Added helper functions to detect Netlify hosting and S3 URLs
- Automatically converts S3 URLs to use the proxy when running on Netlify
- Exports `isNetlifyHosted()` and `isS3Url()` for use in other modules

#### `js/hicDataset.js`
- Updated to use `IGVRemoteFile` for S3 URLs when on Netlify (similar to how Google URLs are handled)
- Ensures all S3 file requests go through the proxy

### 3. Netlify Configuration (`netlify.toml`)

- Added `functions = "netlify/functions"` to specify the functions directory
- Added a redirect rule to map `/api/proxy-s3` to `/.netlify/functions/proxy-s3` for cleaner URLs

## How It Works

1. When the frontend detects it's running on Netlify (hostname contains `netlify.app` or `netlify.com`)
2. And encounters an S3 URL (hostname contains `s3.amazonaws.com` or `.s3.`)
3. It automatically converts the URL from:
   ```
   https://hicfiles.s3.amazonaws.com/hiseq/huvec/in-situ/HIC080.hic
   ```
   to:
   ```
   /api/proxy-s3?url=https%3A%2F%2Fhicfiles.s3.amazonaws.com%2Fhiseq%2Fhuvec%2Fin-situ%2FHIC080.hic
   ```
4. The Netlify function fetches the file from S3 and returns it to the browser
5. Since the request comes from Netlify's server, CORS restrictions don't apply

## Testing

After deploying to Netlify:

1. Open your Netlify site in a browser
2. Try loading a session file that references S3 URLs
3. Check the browser console - you should see requests to `/api/proxy-s3` instead of direct S3 URLs
4. Files should load successfully without CORS errors

## Security Considerations

- The proxy function validates that only S3 URLs are proxied
- This prevents abuse of the proxy for arbitrary URLs
- The proxy only accepts GET requests
- Range headers are properly forwarded for efficient partial content loading

## Local Development

The proxy is only active when running on Netlify. When running locally (`localhost`), files are loaded directly from S3, which works fine since there are no CORS restrictions for local development.

## Troubleshooting

### Function Not Found (404)
- Ensure `netlify.toml` has `functions = "netlify/functions"`
- Verify the function file is at `netlify/functions/proxy-s3.js`
- Redeploy after adding the function

### Still Getting CORS Errors
- Check browser console to see if URLs are being proxied (should see `/api/proxy-s3` in network tab)
- Verify Netlify hostname detection is working (check `window.location.hostname` in console)
- Ensure the redirect rule in `netlify.toml` is correct

### 403 Errors from Proxy
- Check that the S3 URL is valid and accessible
- Verify the URL is actually an S3 URL (the proxy validates this)
- Check Netlify function logs for detailed error messages

