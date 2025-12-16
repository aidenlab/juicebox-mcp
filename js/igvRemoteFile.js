/*
 * @author Jim Robinson Dec-2020
 */

/**
 * Implementation of "RemoteFile" for hic-straw that uses the igv.xhr object.  This object is google aware, and handle
 * oAuth and apiKey automatically.
 */

import {igvxhr} from '../node_modules/igv-utils/src/index.js'

/**
 * Check if we're running on Netlify
 * @returns {boolean}
 */
export function isNetlifyHosted() {
    // Check if hostname is a Netlify domain
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname.includes('netlify.app') || hostname.includes('netlify.com');
}

/**
 * Check if a URL is an S3 URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isS3Url(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('s3.amazonaws.com') || 
               urlObj.hostname.includes('.s3.') || 
               urlObj.hostname.endsWith('.s3.amazonaws.com');
    } catch (e) {
        return false;
    }
}

/**
 * Convert an S3 URL to use the Netlify proxy
 * @param {string} url - Original S3 URL
 * @returns {string} - Proxied URL
 */
export function proxyS3Url(url) {
    if (!isNetlifyHosted() || !isS3Url(url)) {
        return url;
    }
    // Use Netlify function to proxy the request
    const encodedUrl = encodeURIComponent(url);
    return `/api/proxy-s3?url=${encodedUrl}`;
}

class IGVRemoteFile {


    constructor(args) {
        this.config = args
        // Proxy S3 URLs when on Netlify
        const originalUrl = args.path || args.url;
        this.url = proxyS3Url(originalUrl);
    }


    async read(position, length) {

        const range = {start: position, size: length};

        return igvxhr.loadArrayBuffer(this.url, {range});

    }
}

export default IGVRemoteFile
