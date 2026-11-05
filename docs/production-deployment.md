# Production deployment

How to release juicebox-mcp to production: tag this repo, and, when the Page should change, first move the pinned version of Juicebox View (juicebox-view). Background on why there are two production Deployments is in [`why-two-prod-deployments.md`](why-two-prod-deployments.md); how the stacks fit together is in [`how-juicebot-deploys.html`](how-juicebot-deploys.html).

## What a release is

A release is **one tag on juicebox-mcp**. The tag fixes both halves:

- **The Worker** is built from juicebox-mcp at the tag.
- **The Page** is built from the juicebox-view commit named in `viewer.pin` at the tag. `viewer.pin` is a file at the root of this repo holding one line, the full 40-character sha of a juicebox-view commit that is on juicebox-view's origin. Both Deployments read the same pin.

juicebox-view gets no `prod-` or `view-prod-` tags ([#31](https://github.com/aidenlab/juicebox-mcp/issues/31)).

| Deployment | Tag | Script | Page | MCP server |
|---|---|---|---|---|
| Juicebot production | `prod-YYYY-MM-DD[.N]` | `scripts/deploy-prod.sh` | https://juicebot.3dg.io/ | `https://juicebot-mcp.3dg.io/mcp` |
| geenee's Juicebox prod | `view-prod-YYYY-MM-DD[.N]` | `scripts/deploy-view-prod.sh` | https://juicebox-view.pages.dev/ | `https://juicebox-view-mcp.3dg.io/mcp` |

Each script accepts only its own prefix, so a tag names exactly one release. The date is the release day; a second release that day adds `.1`, then `.2`, and so on.

## Before you start

- A clone of juicebox-view at `../juicebox-view` (beside this repo), or pass `--repo <path>` to the scripts. Its `origin` must be `aidenlab/juicebox-view`.
- `npx wrangler login` done for the Cloudflare account in `packages/server/wrangler.toml`.
- Push access to `aidenlab/juicebox-mcp`, for the tag and the pin commit.
- Your juicebox-mcp working tree doesn't need to be clean. The scripts build from throwaway worktrees at the tag, never from your checkout. They do run `scripts/resolve-viewer.sh` from your checkout, so be on a recent `main`.

## 1. Update the pinned Juicebox View (only when the Page should change)

Skip this step when the release changes only the Worker. The tag then carries the pin `main` already holds.

1. **Try the Page on dev first.** Deploy the juicebox-view commit you mean to pin, with the Worker you mean to release, to the dev stack:

   ```bash
   scripts/deploy-dev.sh ../juicebox-view main          # or a branch or tag of juicebox-view
   ```

   Then check it at https://juicebox-view-dev.pages.dev/ (see [`test-deployment.md`](test-deployment.md)).

2. **Move the pin** on a branch:

   ```bash
   git switch -c pin-juicebox-view main
   scripts/pin-viewer.sh                 # juicebox-view origin/main
   scripts/pin-viewer.sh <ref>           # or a branch, tag or sha of juicebox-view
   ```

   `pin-viewer.sh` fetches juicebox-view's origin, resolves `<ref>` to a full sha, and writes `viewer.pin`. It refuses a ref that names no commit, and a commit that no branch on juicebox-view's origin holds (one that is only in your clone, say). When it refuses, `viewer.pin` stays as it was. Push the juicebox-view commit first, then run it again.

3. **Commit, review, merge:**

   ```bash
   git diff viewer.pin
   git commit -am "pin juicebox-view to $(cut -c1-7 viewer.pin)"
   git push -u origin pin-juicebox-view
   gh pr create --fill
   ```

   The diff is one line, old sha to new sha. Reviewers can compare the two in juicebox-view with `git log <old>..<new>`. Merge to `main`.

## 2. Tag the release

Tag juicebox-mcp's `main` as it is on origin, so the tag carries the merged pin:

```bash
git fetch origin
git tag view-prod-2026-12-01 origin/main     # geenee's Juicebox prod
git tag prod-2026-12-01 origin/main          # and/or Juicebot production
git push origin view-prod-2026-12-01 prod-2026-12-01
```

Releasing both Deployments from the same commit takes two tags, one per prefix. Don't tag juicebox-view.

## 3. Deploy

```bash
scripts/deploy-view-prod.sh view-prod-2026-12-01   # [--repo <juicebox-view clone>]
scripts/deploy-prod.sh prod-2026-12-01
```

Each script:

1. Refuses a tag that is not on juicebox-mcp's origin.
2. Checks juicebox-mcp out at the tag, and reads `viewer.pin` from that checkout (`scripts/resolve-viewer.sh`).
3. Fetches juicebox-view's origin. It stops before anything deploys if the pin is not a full sha, or names a commit no branch on origin holds.
4. Prints a note, without stopping, when the pin is behind juicebox-view `origin/main`, like `note: viewer.pin b587dbc is 3 commits behind juicebox-view origin/main (…)`. That's fine when you meant to ship the older Page. Otherwise stop and do step 1.
5. Deploys the Worker, then builds and uploads the Page from the pinned commit.
6. Checks the live versions. It waits for both to show and fails if they don't.

## 4. Verify

`/version` reports what is live. Both halves carry the tag, each with its own repo's short sha:

```bash
curl -s https://juicebox-view-mcp.3dg.io/version -H 'Accept: application/json'
# {"worker":"view-prod-2026-12-01 (<juicebox-mcp sha>)","viewer":{"version":"view-prod-2026-12-01 (<juicebox-view sha>)"}}
```

The viewer's sha should be the first seven characters of `viewer.pin` at the tag (`git show view-prod-2026-12-01:viewer.pin`).

## Rolling back

Deploy the previous tag of the same prefix:

```bash
scripts/deploy-view-prod.sh view-prod-2026-11-05.3
```

The tag brings back its own pin, so the Worker and the Page go back together.

**Tags from before the pin** (`prod-2026-10-27`, `view-prod-2026-11-05` through `view-prod-2026-11-05.3`) have no `viewer.pin`. For those, the scripts build juicebox-view's tag of the same name, as releases did then. You'll see the note `<tag> has no viewer.pin; building juicebox-view's tag <tag>`. Those juicebox-view tags must stay on origin. Tags up to `prod-2026-10-11.1` built juicebox-web and have no juicebox-view tag, so they can't be redeployed this way (see `how-juicebot-deploys.html`).

## When a script stops

| Message | Cause | Fix |
|---|---|---|
| `tag … is not on juicebox-mcp's origin; push it first` | The tag is only local | `git push origin <tag>` |
| `viewer.pin at … names …, which is not on juicebox-view's origin` | The pinned commit was never pushed, or its branch was deleted | Push that commit to a juicebox-view branch, or re-pin (step 1) and re-tag |
| `viewer.pin at … holds '…', not a full 40-character sha` | Hand-edited pin | Re-pin with `scripts/pin-viewer.sh` and re-tag |
| `… has no viewer.pin, and juicebox-view's origin has no tag … to fall back to` | An old tag whose juicebox-view tag is missing | Use a later tag |
| `not the versions just deployed: …` | A version didn't show within about a minute | Re-run `scripts/check-version.sh <mcp-url> --worker '<label>' --viewer '<label>'`; if it still differs, redeploy |

A tag that has been pushed and deployed is not moved. To fix a release, cut the next one (`.1`).
