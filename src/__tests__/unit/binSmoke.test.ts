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
import { execFileSync, spawnSync } from 'node:child_process';
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
  const stdout = execFileSync(process.execPath, [bin], {
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
  // `npm pack` twice and an install of both tarballs: minutes on a cold cache.
  jest.setTimeout(10 * 60 * 1000);

  let workdir: string | undefined;

  afterAll(() => {
    if (workdir !== undefined)
      rmSync(workdir, { recursive: true, force: true });
  });

  it('answers --version and --help from each of the twelve bins, each with its own package', () => {
    if (process.env.SKIP_BIN_SMOKE === 'true') {
      console.log('[bin-smoke] skipped by SKIP_BIN_SMOKE');
      return;
    }

    workdir = mkdtempSync(join(tmpdir(), 'mcp-bin-smoke-'));

    // Pack all sixteen, because each depends on the others by version and the
    // versions being released are not on the registry yet. Every bin is a
    // chance to ship a launcher that cannot find its own manifest.
    installPackedRelease(workdir, [
      '.',
      'background-runs-memory',
      'http',
      'sse',
      'server',
      'compact-readonly-entries',
      'compact-modify',
      'compact',
      'compact-http',
      'compact-sse',
      'core-ro',
      'http-ro',
      'sse-ro',
      'compact-ro',
      'compact-http-ro',
      'compact-sse-ro',
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
      expect(existsSync(installed)).toBe(true);
      expect(runNode([installed, '--version'], workdir).trim()).toBe(
        version(`${manifest}/package.json`),
      );
      // `--help` goes to stderr, nothing to stdout, and exits 0.
      const usage = spawnSync(process.execPath, [installed, '--help'], {
        cwd: workdir,
        encoding: 'utf8',
      });
      expect({ status: usage.status, stdout: usage.stdout }).toEqual({
        status: 0,
        stdout: '',
      });
      expect(usage.stderr).toContain(`USAGE:\n  ${binName} [options]`);
    }

    expect(printed).toBe(version('server/package.json'));
    // And not the library's, which is what two levels up answered in a checkout
    // — the same number today, so this only bites when they diverge.
    expect(printed).not.toBe('');

    // `initialize` reports the same versions. It answered `1.0.0` whenever npm
    // had not started the process — under every MCP client and under Glama's
    // `mcp-proxy` — because it read `npm_package_version`.
    expect(serverInfoVersion(bin, workdir)).toBe(
      version('server/package.json'),
    );
    expect(serverInfoVersion(compactBin, workdir)).toBe(
      version('compact/package.json'),
    );
    // The stdio -ro bins too: each its own package's version.
    for (const [pkg, binName] of [
      ['core-ro', 'mcp-abap-adt-ro'],
      ['compact-ro', 'mcp-abap-adt-compact-ro'],
    ] as const) {
      expect(
        serverInfoVersion(
          installedFile(workdir, pkg, 'bin', `${binName}.js`),
          workdir,
        ),
      ).toBe(version(`${pkg}/package.json`));
    }
  });
});
