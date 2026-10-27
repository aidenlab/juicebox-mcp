# Local testing cheat sheet

Running this repo's MCP server and the juicebox-view page on your own machine, and driving
them from Claude, is in `docs/juicebox-view-development.md`. This sheet covers what is
left: previewing the join card, the automated tests, and driving the hosted dev stack from a
script.

## Preview the join card on its own

The card Claude shows for `get_juicebox_url` is `packages/server/src/mcp/juiceboxView.js`.
It only fills in when a host hands it a tool result, so it cannot be opened directly. To
work on it without Claude, the relay, the page or the tunnel:

```bash
cd /Users/turner/AidenLabDevelopment/juicebox-mcp
node scripts/preview-view.mjs
```

Open `http://localhost:5199/`. Edit `juiceboxView.js`, save, refresh the browser: the
preview re-reads the file on every load. `Ctrl-C` stops it.

| Address | Shows |
|---|---|
| `http://localhost:5199/` | The card as in Claude Desktop |
| `http://localhost:5199/?platform=web` | The card in any other host |
| `http://localhost:5199/?state=waiting` | Before the join link arrives |
| `http://localhost:5199/?state=nolink` | A tool result with no link in it |

What is fake: the room is `PREVIEW123`, the QR code is a real one for that link, and
pressing **Open Juicebox** shows an alert with the link the host would open. The preview
fills the browser window, while Claude shows the card in a narrow frame, so narrow the
window to judge layout. `PORT=5200 node scripts/preview-view.mjs` uses another port.

The preview only imitates what a host reports. Before calling a change done, check it in
Claude Desktop, in a new chat. If the old card still appears, remove the connector and add
it again.

## Automated tests

```bash
npm run test:run                                            # everything, once
npm run test:run -- packages/server/test/search.test.js     # one file
npm run test:run -- -t "substring of name"                  # one test
npm test                                                    # watch mode
```

The server tests run the real Worker and Durable Objects locally, with no Cloudflare account.

## Drive the dev stack from a script (no local relay needed)

The Juicebot dev stack is the Worker at `juicebot-view-mcp-dev.3dg.io` and the page at
`juicebot-view-dev.pages.dev` (CLAUDE.md names the deploy commands). The Claude Code juicebot
plugin and Claude Desktop connectors point at production, `juicebot-mcp.3dg.io`, whose rooms
are a different Durable Object namespace, so they cannot drive a page on the dev site.
`scripts/dev-check.mjs` talks to the dev Worker's `/mcp` directly:

```bash
ROOM=T$(tr -dc 'A-HJKMNP-TV-Z0-9' </dev/urandom | head -c9)   # a fresh throwaway room
# open https://juicebot-view-dev.pages.dev/?room=$ROOM in one or two tabs, then:
node scripts/dev-check.mjs $ROOM list_panels
node scripts/dev-check.mjs $ROOM load_map '{"url":"https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/31811e40-e3ca-4456-8ba6-2ee66d6c7104/4DNFI7J8BQ4P.hic","name":"GM"}'
node scripts/dev-check.mjs $ROOM load_map '{"url":"https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/31811e40-e3ca-4456-8ba6-2ee66d6c7104/4DNFI7J8BQ4P.hic","name":"GM2","panel":"new"}'
```

Always a fresh room, never one someone is working in: the room asks its first live page for
the session on every join, and a probe that does not ack breaks that room. For a headless
peer, `playwright-cli -s=<name> open "https://juicebot-view-dev.pages.dev/?room=$ROOM"` and count
`.hic-root` elements after each call; the gene track draws nothing at whole-genome zoom, so
a colour check needs a gene-dense locus first (`goto_locus` with `"panel":"all"`).

A new command or sync event type needs the dev Worker redeployed even when no server file
changed: the room validates types against the protocol catalogue bundled at deploy time.
