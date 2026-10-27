# Issue tracker: GitHub Issues

Issues and specs for this repo live as GitHub issues on `aidenlab/juicebox-mcp`. Use the `gh` CLI (`gh issue create|view|list|edit|comment|close --repo aidenlab/juicebox-mcp`).

Older features still have local markdown under `.scratch/<feature>/` (gitignored). Read them there; file new work on GitHub.

## Conventions

- One feature per spec: the spec is the parent issue, or a spec issue that the tickets name as their parent
- Implementation issues are one issue per ticket, titled `<Feature> NN: <title>`, numbered from `01`, never a single combined ticket
- Triage state is a label (see `triage-labels.md` for the strings); `enhancement` and `bug` mark the kind
- Blockers are a `**Blocked by:**` line near the top of the body, naming issues by `#N` or `owner/repo#N`
- Comments and conversation history are issue comments

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `gh issue create --repo aidenlab/juicebox-mcp`, with the triage label.

## When a skill says "fetch the relevant ticket"

`gh issue view <N> --repo aidenlab/juicebox-mcp --comments`. The user will normally pass the issue number or URL.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an issue with one **child** issue per ticket.

- **Map**: an issue titled `Map: <effort>`, with the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue titled `<effort> NN: <question>`, numbered from `01`, with `Parent: #<map>` and a `Type:` line (`research`/`prototype`/`grilling`/`task`) at the top of the body.
- **Blocking**: a `**Blocked by:** #N, #N` line near the top. A ticket is unblocked when every issue it lists is closed.
- **Frontier**: the open, unblocked, unassigned children of the map; first by number wins.
- **Claim**: assign the issue (`gh issue edit <N> --add-assignee @me`) before any work.
- **Resolve**: post the answer as a comment headed `## Answer`, close the issue, then append a context pointer (gist + link) to the map issue's Decisions-so-far.
