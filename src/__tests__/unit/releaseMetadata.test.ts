/**
 * The registry and Glama metadata is part of a release, not an afterthought.
 *
 * Every file a registry reads names the version npm will carry, so a release
 * that bumps the manifests and forgets one of them goes red here, before the
 * tag. 17.0.0 shipped with the Glama image unpinned (`latest`), and
 * `server-compact.json` sat at 14.0.1 for three majors with a description the
 * MCP Registry refuses; neither was caught by anything.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file: string) => JSON.parse(read(file));

const manifests = {
  lib: json('package.json'),
  core: json('server/package.json'),
  compact: json('compact/package.json'),
  'background-runs-memory': json('background-runs-memory/package.json'),
  'responsible-rules': json('responsible-rules/package.json'),
  'compact-readonly-entries': json('compact-readonly-entries/package.json'),
  'compact-modify': json('compact-modify/package.json'),
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
  it('the thirteen packages are released together', () => {
    for (const [name, manifest] of Object.entries(manifests)) {
      expect(`${name} ${manifest.version}`).toBe(`${name} ${version}`);
    }
  });

  // A sibling range is a caret on this major; its floor may be raised to the
  // release that ships what the dependant needs (17.2.0: `lib/debugger` and
  // `lib/state`), never above the version released here.
  it('every sibling range is a caret on this major, its floor at most this version', () => {
    const siblings = Object.values(manifests).map((m) => m.name);
    const parts = (v: string) => v.split('.').map(Number);
    const atMost = (floor: string, top: string) => {
      const [a, b] = [parts(floor), parts(top)];
      for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
      return true;
    };
    for (const manifest of Object.values(manifests)) {
      for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
        if (!siblings.includes(dep)) continue;
        const floor = /^\^(\d+\.\d+\.\d+)$/.exec(String(range))?.[1];
        expect(`${manifest.name} → ${dep} ${range}`).toMatch(
          new RegExp(`→ ${dep} \\^${major}\\.\\d+\\.\\d+$`),
        );
        expect(
          `${manifest.name} → ${dep} floor within ${version}: ${floor !== undefined && atMost(floor, version)}`,
        ).toBe(`${manifest.name} → ${dep} floor within ${version}: true`);
      }
    }
  });

  // The MCP Registry: one entry per server package, published separately
  // (`mcp-publisher publish <file>`) — a different tool list or transport is
  // a different server. The entry names the package's transport: stdio for
  // the four destination servers, Streamable HTTP and SSE for the eight
  // listeners, which take their credentials from x-sap-* headers.
  const listeners = {
    http: json('http/package.json'),
    sse: json('sse/package.json'),
    'compact-http': json('compact-http/package.json'),
    'compact-sse': json('compact-sse/package.json'),
  };
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
    ['server-http.json', listeners.http, 'streamable-http'],
    ['server-compact-http.json', listeners['compact-http'], 'streamable-http'],
    ['server-http-ro.json', manifests['http-ro'], 'streamable-http'],
    [
      'server-compact-http-ro.json',
      manifests['compact-http-ro'],
      'streamable-http',
    ],
    ['server-sse.json', listeners.sse, 'sse'],
    ['server-compact-sse.json', listeners['compact-sse'], 'sse'],
    ['server-sse-ro.json', manifests['sse-ro'], 'sse'],
    ['server-compact-sse-ro.json', manifests['compact-sse-ro'], 'sse'],
  ];

  it('every server package has its entry, and no other entry exists', () => {
    const files = fs
      .readdirSync(root)
      .filter((file) => file.startsWith('server') && file.endsWith('.json'))
      .sort();
    expect(files).toEqual(entries.map(([file]) => file).sort());
  });

  describe.each(entries)('%s', (file, manifest, transport) => {
    const entry = json(file);

    it('is the package it publishes, at its version', () => {
      expect(manifest.mcpName).toBeDefined();
      expect(entry.name).toBe(manifest.mcpName);
      expect(entry.version).toBe(manifest.version);
      expect(entry.packages).toHaveLength(1);
      expect(entry.packages[0].identifier).toBe(manifest.name);
      expect(entry.packages[0].version).toBe(manifest.version);
    });

    it("is named after the package's binary", () => {
      expect(Object.keys(manifest.bin)).toHaveLength(1);
      expect(entry.name).toBe(
        `io.github.fr0ster/${Object.keys(manifest.bin)[0]}`,
      );
    });

    it(`names the ${transport} transport, where the binary serves it`, () => {
      const served = entry.packages[0].transport;
      expect(served.type).toBe(transport);
      // The listener's own defaults: its port variable and its endpoint path.
      const url = {
        stdio: undefined,
        'streamable-http': 'http://localhost:{MCP_HTTP_PORT}/mcp/stream/http',
        sse: 'http://localhost:{MCP_SSE_PORT}/sse',
      }[transport];
      expect(served.url).toBe(url);
      const variables = (entry.packages[0].environmentVariables ?? []).map(
        (variable: { name: string }) => variable.name,
      );
      if (transport === 'stdio') {
        expect(served.headers).toBeUndefined();
      } else {
        expect(variables).toContain(
          transport === 'sse' ? 'MCP_SSE_PORT' : 'MCP_HTTP_PORT',
        );
        expect(
          served.headers.find((h: { name: string }) => h.name === 'x-sap-url')
            ?.isRequired,
        ).toBe(true);
      }
      // The system type is required everywhere: never a default.
      const systemType = entry.packages[0].environmentVariables.find(
        (variable: { name: string }) => variable.name === 'SAP_SYSTEM_TYPE',
      );
      expect(systemType?.isRequired).toBe(true);
      expect(systemType?.default).toBeUndefined();
    });

    it('has a description the registry accepts (at most 100 characters)', () => {
      expect(entry.description.length).toBeLessThanOrEqual(100);
    });
  });

  // One Dockerfile builds every variant: a stage per package, named by its
  // directory, that runs the package's own binary.
  it('docker/Dockerfile has a stage for each server package, running its binary', () => {
    const dockerfile = read('docker/Dockerfile');
    for (const [, manifest] of entries) {
      const variant = manifest.name.replace('@mcp-abap-adt/', '');
      const bin = Object.keys(manifest.bin)[0];
      expect(dockerfile).toContain(`AS ${variant}\nENTRYPOINT ["${bin}"]\n`);
    }
  });

  // Glama builds from npm; the reference image pins the release, so a rebuild
  // cannot put a newer package under an older release number.
  it('the Glama image installs this release of core', () => {
    const pinned = read('docker/Dockerfile.inspect').match(
      /^ARG CORE_VERSION=(\S+)$/m,
    )?.[1];
    expect(pinned).toBe(manifests.core.version);
  });
});
