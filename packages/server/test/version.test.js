/**
 * GET /version: what this Deployment runs, the Worker's version and the Viewer page's
 * (aidenlab/juicebox-mcp#23). The page's version.json is fetched from BROWSER_URL's root on every
 * request; `fetch` is stubbed to stand in for the page.
 */
import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, afterEach, vi } from 'vitest';
import worker from '../src/index.js';

afterEach(() => vi.restoreAllMocks());

const PAGE = 'https://juicebox-view-dev.pages.dev/';

function getVersion(vars = {}, headers = {}) {
  const workerEnv = { ...env, SERVER_VERSION: 'main (83f47ca)', BROWSER_URL: PAGE, ...vars };
  return worker.fetch(new Request('https://jbmcp.test/version', { headers }), workerEnv, createExecutionContext());
}

/** What a browser sends when the address is opened. */
const BROWSER = { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

/** Serve `response` (or throw it, if an Error) for the page fetch; returns the spy. */
function page(response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe('GET /version', () => {
  it('answers the Worker\'s version and the page\'s version.json, fetched from the page\'s root, with its url added', async () => {
    const fetched = page(Response.json({ version: 'main (9e1d2b7)' }));

    const res = await getVersion();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      worker: 'main (83f47ca)',
      viewer: { url: 'https://juicebox-view-dev.pages.dev/version.json', version: 'main (9e1d2b7)' },
    });
    expect(String(fetched.mock.calls[0][0])).toBe('https://juicebox-view-dev.pages.dev/version.json');
  });

  it('keeps whatever else the page\'s file holds; the url is always where it was fetched from', async () => {
    page(Response.json({ version: 'view-prod-2026-11-12 (9e1d2b7-dirty)', built: '2026-11-12', url: 'elsewhere' }));

    const res = await getVersion({ BROWSER_URL: 'https://juicebox-view.pages.dev/app/', SERVER_VERSION: undefined });

    expect(await res.json()).toEqual({
      worker: 'local',
      viewer: { url: 'https://juicebox-view.pages.dev/version.json', version: 'view-prod-2026-11-12 (9e1d2b7-dirty)', built: '2026-11-12' },
    });
  });

  it.each([
    ['answers 404', () => new Response('Not Found', { status: 404 }), 'HTTP 404'],
    ['cannot be reached', () => new TypeError('Network connection lost.'), 'Network connection lost.'],
    ['is not JSON', () => new Response('<!doctype html>'), 'version.json is not a JSON object'],
    ['is a JSON string, not an object', () => Response.json('main (9e1d2b7)'), 'version.json is not a JSON object'],
  ])('a page that %s gives viewer {url, error}, and /version still answers 200', async (_, response, error) => {
    page(response());

    const res = await getVersion();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      worker: 'main (83f47ca)',
      viewer: { url: 'https://juicebox-view-dev.pages.dev/version.json', error },
    });
  });

  it('answers JSON to curl and scripts, which do not ask for HTML', async () => {
    page(Response.json({ version: 'main (9e1d2b7)' }));

    const res = await getVersion({}, { Accept: '*/*' });

    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
  });

  describe('opened in a browser', () => {
    it('answers a page naming both versions and where each runs', async () => {
      page(Response.json({ version: 'main (9e1d2b7)' }));

      const res = await getVersion({}, BROWSER);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const html = await res.text();
      expect(html).toMatch(/^<!doctype html>/);
      expect(html).toContain('main (83f47ca)');
      expect(html).toContain('main (9e1d2b7)');
      expect(html).toContain('jbmcp.test');
      expect(html).toContain('juicebox-view-dev.pages.dev');
    });

    it('shows why the page\'s version could not be read', async () => {
      page(new Response('Not Found', { status: 404 }));

      const html = await (await getVersion({}, BROWSER)).text();

      expect(html).toContain('HTTP 404');
    });

    it('escapes what the page\'s file says', async () => {
      page(Response.json({ version: '<script>alert(1)</script>' }));

      const html = await (await getVersion({}, BROWSER)).text();

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&#60;script&#62;');
    });
  });
});
