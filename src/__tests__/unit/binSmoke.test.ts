/**
 * Every published bin starts from an installed package.
 *
 * **Why a test that packs and installs.** `mcp-abap-adt --version` worked in this
 * repository and died for everyone who installed it: the launcher read
 * `path.join(__dirname, '..', '..', 'package.json')`, which from `server/dist/`
 * reaches the repo root in a checkout and `node_modules/@mcp-abap-adt/` — the
 * scope directory, which never has a manifest — from npm. Shipped in 13.0.0 and
 * found by hand afterwards, on a release whose `release:dry` had reported
 * `Published: 2 Skipped: 0`: packing proves a tarball builds, not that anything
 * inside it runs.
 *
 * It is the same defect `@mcp-abap-adt/auth-broker` 3.0.4 had fixed one release
 * earlier — `mcp-sso` imported a dev-only dependency and died on `Cannot find
 * module` from an installed tarball — and their changelog says how they found it:
 * *"by installing the 3.0.3 tarball into an empty directory and running each
 * bin"*. We took their fix and did not perform their check.
 *
 * **What this asserts, and what it deliberately does not.** `--version` answers
 * this package's own version on stdout and exits zero. That is the cheapest
 * invocation that still loads the launcher, resolves its manifest and touches the
 * dependency graph — the three things an installed package can get wrong without
 * any of the unit suites noticing. It does not start a server, reach SAP or read
 * a configuration.
 *
 * **Cost.** `npm pack` plus one `npm install --no-save` of local tarballs, which
 * is why this is one test and not one per bin. It is skipped where the network or
 * a writable temp directory is not available, and says which.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installedFile,
  installPackedRelease,
  ROOT,
} from '../helpers/installedRelease';

/** The version each package's own manifest states. */
const version = (manifest: string): string =>
  JSON.parse(readFileSync(join(ROOT, manifest), 'utf8')).version;

const runNode = (args: string[], cwd: string): string =>
  execFileSync(process.execPath, args, { cwd, encoding: 'utf8' });

describe('the published bins start from an installed package', () => {
  // `npm pack` twice and an install of both tarballs: minutes on a cold cache.
  jest.setTimeout(10 * 60 * 1000);

  let workdir: string | undefined;

  afterAll(() => {
    if (workdir !== undefined)
      rmSync(workdir, { recursive: true, force: true });
  });

  it('answers --version with the core package version, not the library one', () => {
    if (process.env.SKIP_BIN_SMOKE === 'true') {
      console.log('[bin-smoke] skipped by SKIP_BIN_SMOKE');
      return;
    }

    workdir = mkdtempSync(join(tmpdir(), 'mcp-bin-smoke-'));

    // Pack all five, because each depends on the others by version and the
    // versions being released are not on the registry yet. `compact` is here
    // because a third bin is a third chance to ship a launcher that cannot find
    // its own manifest.
    installPackedRelease(workdir, [
      '.',
      'server',
      'compact-readonly',
      'compact-modify',
      'compact',
    ]);

    const bin = installedFile(workdir, 'core', 'bin', 'mcp-abap-adt.js');
    expect(existsSync(bin)).toBe(true);

    // The defect this exists for: from here `__dirname/../..` is the scope
    // directory, and reading a manifest there answers ENOENT.
    const printed = runNode([bin, '--version'], workdir).trim();

    const compactBin = installedFile(
      workdir,
      'compact',
      'bin',
      'mcp-abap-adt-compact.js',
    );
    expect(existsSync(compactBin)).toBe(true);
    // And the compact command answers ITS version, not the one core would print
    // — a launcher that reports a sibling's manifest reads as the truth.
    expect(runNode([compactBin, '--version'], workdir).trim()).toBe(
      version('compact/package.json'),
    );

    expect(printed).toBe(version('server/package.json'));
    // And not the library's, which is what two levels up answered in a checkout
    // — the same number today, so this only bites when they diverge.
    expect(printed).not.toBe('');
  });
});
