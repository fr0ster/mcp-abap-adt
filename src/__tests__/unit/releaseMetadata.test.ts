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
  'compact-readonly': json('compact-readonly/package.json'),
  'compact-modify': json('compact-modify/package.json'),
};
const version: string = manifests.lib.version;
const major = version.split('.')[0];

describe('release metadata names the version npm will carry', () => {
  it('the five packages are released together', () => {
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
  // (`mcp-publisher publish server.json`, `… server-compact.json`).
  describe.each([
    ['server.json', manifests.core],
    ['server-compact.json', manifests.compact],
  ])('%s', (file, manifest) => {
    const entry = json(file);

    it('is the package it publishes, at its version', () => {
      expect(entry.name).toBe(manifest.mcpName);
      expect(entry.version).toBe(manifest.version);
      expect(entry.packages).toHaveLength(1);
      expect(entry.packages[0].identifier).toBe(manifest.name);
      expect(entry.packages[0].version).toBe(manifest.version);
    });

    it('has a description the registry accepts (at most 100 characters)', () => {
      expect(entry.description.length).toBeLessThanOrEqual(100);
    });
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
