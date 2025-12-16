/**
 * Netlify function to proxy S3 requests
 * This bypasses CORS restrictions when the frontend is hosted on Netlify
 * 
 * Usage: /api/proxy-s3?url=https://hicfiles.s3.amazonaws.com/path/to/file.hic
 */

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get the URL to proxy from query parameters
  const url = event.queryStringParameters?.url;
  
  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing url parameter' })
    };
  }

  // Validate that the URL is an S3 URL (security: only allow S3 URLs)
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('s3.amazonaws.com') && 
        !urlObj.hostname.includes('s3.') && 
        !urlObj.hostname.endsWith('.s3.amazonaws.com')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Only S3 URLs are allowed' })
      };
    }
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid URL format' })
    };
  }

  try {
    // Get the Range header if present (for partial content requests)
    const rangeHeader = event.headers['range'] || event.headers['Range'];
    
    // Build fetch options
    const fetchOptions = {
      method: 'GET',
      headers: {}
    };

    // Forward Range header if present
    if (rangeHeader) {
      fetchOptions.headers['Range'] = rangeHeader;
    }

    // Fetch from S3
    const response = await fetch(url, fetchOptions);

    // If the response is not ok, return error
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: `Failed to fetch from S3: ${response.status} ${response.statusText}` 
        })
      };
    }

    // Get the response body as ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // Get response headers to forward
    const responseHeaders = {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': response.headers.get('Content-Length') || arrayBuffer.byteLength.toString(),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
    };

    // Forward Content-Range header if present (for 206 Partial Content responses)
    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }

    // Forward Accept-Ranges header if present
    const acceptRanges = response.headers.get('Accept-Ranges');
    if (acceptRanges) {
      responseHeaders['Accept-Ranges'] = acceptRanges;
    }

    // Set status code (206 for partial content, 200 for full)
    const statusCode = response.status === 206 ? 206 : 200;

    return {
      statusCode,
      headers: responseHeaders,
      body: Buffer.from(arrayBuffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error('Error proxying S3 request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};

