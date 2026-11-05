// The release scripts' viewer pin (aidenlab/juicebox-mcp#31), driven as commands against
// throwaway git repos: a bare "origin" of juicebox-view, a clone of it, and a juicebox-mcp
// checkout that does or does not hold viewer.pin.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};

let dir;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (script, args, cwd = dir) => {
  const r = spawnSync('bash', [script, ...args], { cwd, env: ENV, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
};
const commit = (repo, message) => {
  git(repo, 'commit', '-q', '--allow-empty', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
};

// origin (bare) ← upstream (where juicebox-view's history is made and pushed) and view (the
// release machine's clone, the --repo the scripts are given).
let origin, upstream, view, mcp;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'viewer-pin-'));
  origin = join(dir, 'origin.git');
  upstream = join(dir, 'upstream');
  view = join(dir, 'view');
  mcp = join(dir, 'mcp');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, upstream);
  git(upstream, 'checkout', '-q', '-b', 'main');
  commit(upstream, 'first');
  git(upstream, 'push', '-q', 'origin', 'main');
  git(dir, 'clone', '-q', origin, view);
  mkdirSync(join(mcp, 'scripts'), { recursive: true });
  for (const s of ['resolve-viewer.sh', 'pin-viewer.sh']) copyFileSync(join(SCRIPTS, s), join(mcp, 'scripts', s));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const resolve = (tag) => run(join(mcp, 'scripts', 'resolve-viewer.sh'), [mcp, view, tag]);
const pin = (...args) => run(join(mcp, 'scripts', 'pin-viewer.sh'), [...args, '--repo', view]);
const writePin = (sha) => writeFileSync(join(mcp, 'viewer.pin'), `${sha}\n`);

describe('resolve-viewer.sh: the juicebox-view commit a release tag builds', () => {
  it('is the commit viewer.pin names, fetched from origin into the clone', () => {
    const pinned = commit(upstream, 'second');
    git(upstream, 'push', '-q', 'origin', 'main');
    writePin(pinned);

    const r = resolve('view-prod-2026-12-01');

    expect(r).toMatchObject({ code: 0, out: pinned });
    expect(git(view, 'cat-file', '-t', pinned)).toBe('commit');
  });

  it('notes, without failing, a pin behind origin/main', () => {
    const pinned = git(upstream, 'rev-parse', 'HEAD');
    commit(upstream, 'second');
    const main = commit(upstream, 'third');
    git(upstream, 'push', '-q', 'origin', 'main');
    writePin(pinned);

    const r = resolve('view-prod-2026-12-01');

    expect(r).toMatchObject({ code: 0, out: pinned });
    expect(r.err).toContain('2 commits behind');
    expect(r.err).toContain(main.slice(0, 7));
  });

  it('says nothing when the pin is origin/main', () => {
    writePin(git(upstream, 'rev-parse', 'HEAD'));

    expect(resolve('view-prod-2026-12-01')).toMatchObject({ code: 0, err: '' });
  });

  it('stops when viewer.pin names a commit that is not on origin', () => {
    const local = commit(upstream, 'never pushed');
    writePin(local);

    const r = resolve('view-prod-2026-12-01');

    expect(r.code).not.toBe(0);
    expect(r.out).toBe('');
    expect(r.err).toContain(local);
    expect(r.err).toMatch(/not on .*origin/);
  });

  it('stops when the only branch that held the pinned commit is gone from origin', () => {
    git(upstream, 'checkout', '-q', '-b', 'feature');
    const pinned = commit(upstream, 'on a branch');
    git(upstream, 'push', '-q', 'origin', 'feature');
    git(view, 'fetch', '-q', 'origin');
    git(upstream, 'push', '-q', 'origin', '--delete', 'feature');
    writePin(pinned);

    const r = resolve('view-prod-2026-12-01');

    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/not on .*origin/);
  });

  it('stops when viewer.pin is not a full sha', () => {
    writePin(git(upstream, 'rev-parse', '--short', 'HEAD'));

    const r = resolve('view-prod-2026-12-01');

    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/viewer\.pin/);
  });

  describe('a tag whose commit has no viewer.pin (releases before #31)', () => {
    it('is the same-named tag on juicebox-view origin, fetched into the clone', () => {
      const tagged = commit(upstream, 'released');
      commit(upstream, 'later');
      git(upstream, 'push', '-q', 'origin', 'main');
      git(upstream, 'tag', 'view-prod-2026-11-05.3', tagged);
      git(upstream, 'push', '-q', 'origin', 'view-prod-2026-11-05.3');

      const r = resolve('view-prod-2026-11-05.3');

      expect(r).toMatchObject({ code: 0, out: tagged });
      expect(git(view, 'rev-parse', 'refs/tags/view-prod-2026-11-05.3^{commit}')).toBe(tagged);
    });

    it('stops when juicebox-view origin has no such tag', () => {
      const r = resolve('prod-2026-10-11');

      expect(r.code).not.toBe(0);
      expect(r.out).toBe('');
      expect(r.err).toContain('prod-2026-10-11');
      expect(r.err).toMatch(/viewer\.pin/);
    });
  });
});

describe('pin-viewer.sh: moving the pin', () => {
  const readPin = () => readFileSync(join(mcp, 'viewer.pin'), 'utf8');

  it('writes the full sha of juicebox-view origin/main by default, fetching it first', () => {
    const main = commit(upstream, 'second');
    git(upstream, 'push', '-q', 'origin', 'main');

    const r = pin();

    expect(r.code).toBe(0);
    expect(readPin()).toBe(`${main}\n`);
  });

  it('writes the commit a given ref names, when origin has it', () => {
    const older = git(upstream, 'rev-parse', 'HEAD');
    commit(upstream, 'second');
    git(upstream, 'push', '-q', 'origin', 'main');
    git(view, 'fetch', '-q', 'origin');

    expect(pin(older.slice(0, 7)).code).toBe(0);
    expect(readPin()).toBe(`${older}\n`);
  });

  it('refuses a commit that is not on origin, leaving viewer.pin as it was', () => {
    writePin('a'.repeat(40));
    git(view, 'commit', '-q', '--allow-empty', '-m', 'local only');

    const r = pin('HEAD');

    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/not on .*origin/);
    expect(readPin()).toBe(`${'a'.repeat(40)}\n`);
  });

  it('refuses a commit whose branch is gone from origin', () => {
    git(upstream, 'checkout', '-q', '-b', 'feature');
    const gone = commit(upstream, 'on a branch');
    git(upstream, 'push', '-q', 'origin', 'feature');
    git(view, 'fetch', '-q', 'origin');
    git(upstream, 'push', '-q', 'origin', '--delete', 'feature');

    expect(pin(gone).code).not.toBe(0);
  });

  it('refuses a ref that names no commit', () => {
    const r = pin('no-such-branch');

    expect(r.code).not.toBe(0);
    expect(r.err).toContain('no-such-branch');
  });
});
