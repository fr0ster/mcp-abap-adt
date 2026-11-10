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
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  installedFile,
  installPackedRelease,
  RELEASE_DIRS,
  ROOT,
} from '../helpers/installedRelease';
import { assertEquals } from '../integration/helpers/liveAssert';

/** The version each package's own manifest states. */
const version = (manifest: string): string =>
  JSON.parse(readFileSync(join(ROOT, manifest), 'utf8')).version;

const runNode = (args: string[], cwd: string): string =>
  execFileSync(process.execPath, args, { cwd, encoding: 'utf8' });

/**
 * The `serverInfo.version` a bin answers to `initialize` over stdio, started the
 * way an MCP client or `mcp-proxy` starts it: no npm in between, so no
 * `npm_package_version` in the environment — the case that answered `1.0.0`.
 */
const serverInfoVersion = (bin: string, cwd: string): string => {
  const { npm_package_version: _unset, ...env } = process.env;
  const initialize = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'bin-smoke', version: '0' },
    },
  });
  // stdin closes after the request: the server answers, sees end of input, exits.
  // The inspection mode lists the declared variant's tools, so it is started
  // with one (`--system-type`): without it the start is refused.
  const stdout = execFileSync(process.execPath, [bin, '--system-type=onprem'], {
    cwd,
    env,
    input: `${initialize}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    timeout: 60_000,
  });
  const reply = stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
    .find((message) => message.id === 1);
  return reply.result.serverInfo.version;
};

describe('the published bins start from an installed package', () => {
  let workdir: string | undefined;

  after(() => {
    if (workdir !== undefined)
      rmSync(workdir, { recursive: true, force: true });
  });

  it('answers --version and --help from each of the twelve bins, each with its own package', {
    skip:
      process.env.SKIP_BIN_SMOKE === 'true'
        ? 'skipped by SKIP_BIN_SMOKE'
        : false,
  }, () => {
    workdir = mkdtempSync(join(tmpdir(), 'mcp-bin-smoke-'));

    // Pack all eighteen, because each depends on the others by version and the
    // versions being released are not on the registry yet. Every bin is a
    // chance to ship a launcher that cannot find its own manifest.
    installPackedRelease(workdir, [...RELEASE_DIRS]);

    const bin = installedFile(workdir, 'core', 'bin', 'mcp-abap-adt.js');
    assert.equal(existsSync(bin), true);

    // The defect this exists for: from here `__dirname/../..` is the scope
    // directory, and reading a manifest there answers ENOENT.
    const printed = runNode([bin, '--version'], workdir).trim();

    const compactBin = installedFile(
      workdir,
      'compact',
      'bin',
      'mcp-abap-adt-compact.js',
    );

    // The twelve bins: each answers ITS package's version — a launcher that
    // reports a sibling's manifest reads as the truth — and its own help,
    // whose USAGE names it.
    for (const [pkg, binName, manifest] of [
      ['core', 'mcp-abap-adt', 'server'],
      ['http', 'mcp-abap-adt-http', 'http'],
      ['sse', 'mcp-abap-adt-sse', 'sse'],
      ['compact', 'mcp-abap-adt-compact', 'compact'],
      ['compact-http', 'mcp-abap-adt-compact-http', 'compact-http'],
      ['compact-sse', 'mcp-abap-adt-compact-sse', 'compact-sse'],
      ['core-ro', 'mcp-abap-adt-ro', 'core-ro'],
      ['http-ro', 'mcp-abap-adt-http-ro', 'http-ro'],
      ['sse-ro', 'mcp-abap-adt-sse-ro', 'sse-ro'],
      ['compact-ro', 'mcp-abap-adt-compact-ro', 'compact-ro'],
      ['compact-http-ro', 'mcp-abap-adt-compact-http-ro', 'compact-http-ro'],
      ['compact-sse-ro', 'mcp-abap-adt-compact-sse-ro', 'compact-sse-ro'],
    ] as const) {
      const installed = installedFile(workdir, pkg, 'bin', `${binName}.js`);
      assert.equal(existsSync(installed), true);
      assert.equal(
        runNode([installed, '--version'], workdir).trim(),
        version(`${manifest}/package.json`),
      );
      // `--help` goes to stderr, nothing to stdout, and exits 0.
      const usage = spawnSync(process.execPath, [installed, '--help'], {
        cwd: workdir,
        encoding: 'utf8',
      });
      assertEquals(
        { status: usage.status, stdout: usage.stdout },
        {
          status: 0,
          stdout: '',
        },
      );
      assert.ok(usage.stderr.includes(`USAGE:\n  ${binName} [options]`));
    }

    assert.equal(printed, version('server/package.json'));
    // And not the library's, which is what two levels up answered in a checkout
    // — the same number today, so this only bites when they diverge.
    assert.notEqual(printed, '');

    // `initialize` reports the same versions. It answered `1.0.0` whenever npm
    // had not started the process — under every MCP client and under Glama's
    // `mcp-proxy` — because it read `npm_package_version`.
    assert.equal(
      serverInfoVersion(bin, workdir),
      version('server/package.json'),
    );
    assert.equal(
      serverInfoVersion(compactBin, workdir),
      version('compact/package.json'),
    );
    // The stdio -ro bins too: each its own package's version.
    for (const [pkg, binName] of [
      ['core-ro', 'mcp-abap-adt-ro'],
      ['compact-ro', 'mcp-abap-adt-compact-ro'],
    ] as const) {
      assert.equal(
        serverInfoVersion(
          installedFile(workdir, pkg, 'bin', `${binName}.js`),
          workdir,
        ),
        version(`${pkg}/package.json`),
      );
    }
  });
});
