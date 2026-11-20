/**
 * The registry and Glama metadata is part of a release, not an afterthought.
 *
 * Every file a registry reads names the version npm will carry, so a release
 * that bumps the manifests and forgets one of them goes red here, before the
 * tag. 17.0.0 shipped with the Glama image unpinned (`latest`), and
 * `server-compact.json` sat at 14.0.1 for three majors with a description the
 * MCP Registry refuses; neither was caught by anything.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { repositoryRoot } from '../helpers/repoRoot';

const root = repositoryRoot(__dirname);
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file: string) => JSON.parse(read(file));

const manifests = {
  lib: json('package.json'),
  core: json('server/package.json'),
  http: json('http/package.json'),
  sse: json('sse/package.json'),
  compact: json('compact/package.json'),
  'compact-http': json('compact-http/package.json'),
  'compact-sse': json('compact-sse/package.json'),
  'background-runs-memory': json('background-runs-memory/package.json'),
  'responsible-rules': json('responsible-rules/package.json'),
  'compact-readonly-entries': json('compact-readonly-entries/package.json'),
  'compact-modify': json('compact-modify/package.json'),
  'server-runtime': json('server-runtime/package.json'),
  'core-ro': json('core-ro/package.json'),
  'http-ro': json('http-ro/package.json'),
  'sse-ro': json('sse-ro/package.json'),
  'compact-ro': json('compact-ro/package.json'),
  'compact-http-ro': json('compact-http-ro/package.json'),
  'compact-sse-ro': json('compact-sse-ro/package.json'),
};
const version: string = manifests.lib.version;
const major = version.split('.')[0];

describe('release metadata names the version npm will carry', () => {
  it('the eighteen packages are released together', () => {
    for (const [name, manifest] of Object.entries(manifests)) {
      assert.equal(`${name} ${manifest.version}`, `${name} ${version}`);
    }
  });

  // A sibling range is a caret on this major; its floor may be raised to the
  // release that ships what the dependant needs (17.2.0: `lib/debugger` and
  // `lib/state`), never above the version released here. A peer range too
  // (19.2.0: the packages below the binaries take lib, and server-runtime
  // also background-runs-memory and responsible-rules, as peers): a peer the
  // release cannot satisfy is a conflict at every install.
  it('every sibling range, dependency or peer, is a caret on this major, its floor at most this version', () => {
    const siblings = Object.values(manifests).map((m) => m.name);
    const parts = (v: string) => v.split('.').map(Number);
    const atMost = (floor: string, top: string) => {
      const [a, b] = [parts(floor), parts(top)];
      for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
      return true;
    };
    const ranges = (manifest: {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    }) => [
      ...Object.entries(manifest.dependencies ?? {}).map(
        ([dep, range]) => ['dependency', dep, range] as const,
      ),
      ...Object.entries(manifest.peerDependencies ?? {}).map(
        ([dep, range]) => ['peer', dep, range] as const,
      ),
    ];
    let peers = 0;
    for (const manifest of Object.values(manifests)) {
      for (const [kind, dep, range] of ranges(manifest)) {
        if (!siblings.includes(dep)) continue;
        if (kind === 'peer') peers++;
        const floor = /^\^(\d+\.\d+\.\d+)$/.exec(String(range))?.[1];
        assert.match(
          `${manifest.name} → ${dep} ${range}`,
          new RegExp(`→ ${dep} \\^${major}\\.\\d+\\.\\d+$`),
        );
        assert.equal(
          `${manifest.name} → ${dep} floor within ${version}: ${floor !== undefined && atMost(floor, version)}`,
          `${manifest.name} → ${dep} floor within ${version}: true`,
        );
      }
    }
    // The peers were read at all: lib in the five packages below the binaries,
    // and the runtime's two state packages.
    assert.equal(peers, 7);
  });

  // The runtime is a library of the twelve servers, not a server: it carries
  // no binary and has no MCP Registry entry of its own.
  it('server-runtime has no registry entry: no binary, no mcpName, no server*.json naming it', () => {
    const runtime = manifests['server-runtime'];
    assert.equal(runtime.bin, undefined);
    assert.equal(runtime.mcpName, undefined);
    const naming = fs
      .readdirSync(root)
      .filter((file) => file.startsWith('server') && file.endsWith('.json'))
      .filter((file) =>
        (json(file).packages ?? []).some(
          (p: { identifier?: string }) => p.identifier === runtime.name,
        ),
      );
    assert.deepStrictEqual(naming, []);
  });

  // The MCP Registry: one entry per server package, published separately
  // (`mcp-publisher publish <file>`) — a different tool list or transport is
  // a different server. The entry names the package's transport: stdio for
  // the four destination servers, Streamable HTTP and SSE for the eight
  // listeners, which take their credentials from x-sap-* headers.
  const entries: Array<
    [
      string,
      {
        name: string;
        version: string;
        mcpName?: string;
        bin: Record<string, string>;
      },
      string,
    ]
  > = [
    ['server.json', manifests.core, 'stdio'],
    ['server-compact.json', manifests.compact, 'stdio'],
    ['server-ro.json', manifests['core-ro'], 'stdio'],
    ['server-compact-ro.json', manifests['compact-ro'], 'stdio'],
    ['server-http.json', manifests.http, 'streamable-http'],
    ['server-compact-http.json', manifests['compact-http'], 'streamable-http'],
    ['server-http-ro.json', manifests['http-ro'], 'streamable-http'],
    [
      'server-compact-http-ro.json',
      manifests['compact-http-ro'],
      'streamable-http',
    ],
    ['server-sse.json', manifests.sse, 'sse'],
    ['server-compact-sse.json', manifests['compact-sse'], 'sse'],
    ['server-sse-ro.json', manifests['sse-ro'], 'sse'],
    ['server-compact-sse-ro.json', manifests['compact-sse-ro'], 'sse'],
  ];

  it('every server package has its entry, and no other entry exists', () => {
    const files = fs
      .readdirSync(root)
      .filter((file) => file.startsWith('server') && file.endsWith('.json'))
      .sort();
    assert.deepStrictEqual(files, entries.map(([file]) => file).sort());
  });

  for (const [file, manifest, transport] of entries) {
    describe(format('%s', file), () => {
      const entry = json(file);

      it('is the package it publishes, at its version', () => {
        assert.notEqual(manifest.mcpName, undefined);
        assert.equal(entry.name, manifest.mcpName);
        assert.equal(entry.version, manifest.version);
        assert.equal(entry.packages.length, 1);
        assert.equal(entry.packages[0].identifier, manifest.name);
        assert.equal(entry.packages[0].version, manifest.version);
      });

      it("is named after the package's binary", () => {
        assert.equal(Object.keys(manifest.bin).length, 1);
        assert.equal(
          entry.name,
          `io.github.fr0ster/${Object.keys(manifest.bin)[0]}`,
        );
      });

      it(`names the ${transport} transport, where the binary serves it`, () => {
        const served = entry.packages[0].transport;
        assert.equal(served.type, transport);
        // The listener's own defaults: its port variable and its endpoint path.
        const url = {
          stdio: undefined,
          'streamable-http': 'http://localhost:{MCP_HTTP_PORT}/mcp/stream/http',
          sse: 'http://localhost:{MCP_SSE_PORT}/sse',
        }[transport];
        assert.equal(served.url, url);
        const variables = (entry.packages[0].environmentVariables ?? []).map(
          (variable: { name: string }) => variable.name,
        );
        if (transport === 'stdio') {
          assert.equal(served.headers, undefined);
        } else {
          assert.ok(
            variables.includes(
              transport === 'sse' ? 'MCP_SSE_PORT' : 'MCP_HTTP_PORT',
            ),
          );
          assert.equal(
            served.headers.find((h: { name: string }) => h.name === 'x-sap-url')
              ?.isRequired,
            true,
          );
        }
        // The system type is required everywhere: never a default.
        const systemType = entry.packages[0].environmentVariables.find(
          (variable: { name: string }) => variable.name === 'SAP_SYSTEM_TYPE',
        );
        assert.equal(systemType?.isRequired, true);
        assert.equal(systemType?.default, undefined);
      });

      it('has a description the registry accepts (at most 100 characters)', () => {
        assert.ok(entry.description.length <= 100);
      });
    });
  }

  // One Dockerfile builds every variant: a stage per package, named by its
  // directory, that runs the package's own binary.
  it('docker/Dockerfile has a stage for each server package, running its binary', () => {
    const dockerfile = read('docker/Dockerfile');
    for (const [, manifest] of entries) {
      const variant = manifest.name.replace('@mcp-abap-adt/', '');
      const bin = Object.keys(manifest.bin)[0];
      assert.ok(dockerfile.includes(`AS ${variant}\nENTRYPOINT ["${bin}"]\n`));
    }
  });

  // Glama builds from npm; each reference image (one per system type) pins
  // the release, so a rebuild cannot put a newer package under an older
  // release number.
  for (const variant of ['onprem', 'cloud']) {
    it(
      format('the Glama image of %s installs this release of core', variant),
      () => {
        const pinned = read(`docker/Dockerfile.inspect.${variant}`).match(
          /^ARG CORE_VERSION=(\S+)$/m,
        )?.[1];
        assert.equal(pinned, manifests.core.version);
      },
    );
  }

  // Each image starts the inspection with its system type: the tools listed
  // are those of the variant's ADT type table. `--` ends mcp-proxy's own
  // options, so the flag reaches the server.
  for (const variant of ['onprem', 'cloud']) {
    // The title formats the row alone: the second %s stays as written.
    it(
      format(
        'the Glama image of %s starts the inspection with --system-type=%s',
        variant,
      ),
      () => {
        assert.ok(
          read(`docker/Dockerfile.inspect.${variant}`).includes(
            `CMD ["mcp-proxy", "--", "mcp-abap-adt", "--system-type=${variant}"]`,
          ),
        );
      },
    );
  }
});
