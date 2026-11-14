/**
 * What the portable build reads, in plain code (scripts/portable/readings.cjs),
 * and how it bundles without an esbuild plugin (scripts/portable/bundling.cjs):
 * `node-gyp-build` aliased to the embedded-addon loader, the version modules
 * fixed in the stage.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build } from 'esbuild';

const readings = require('../../../../scripts/portable/readings.cjs');
const bundling = require('../../../../scripts/portable/bundling.cjs');
const args = require('../../../../scripts/portable/args.cjs');
const tools = require('../../../../scripts/portable/tools.cjs');

const made: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-readings-'));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

describe('versions and environment keys', () => {
  it('takes a semver with a pre-release or a dist-tag, nothing else', () => {
    for (const ok of ['1.2.3', '24.0.0-alpha.6', 'latest', 'next-1']) {
      expect(readings.isVersionSpec(ok)).toBe(true);
    }
    for (const bad of ['1.2', '1.2.3-', 'Latest', '1.2.3 ', '', '1..3']) {
      expect(readings.isVersionSpec(bad)).toBe(false);
    }
    expect(() => args.parseArgs(['--version=1.2'], 'linux-x64')).toThrow(
      'not a version',
    );
  });
  it('drops npm settings in any case, keeps the rest', () => {
    expect(
      readings.withoutNpmSettings({ npm_a: '1', NPM_B: '2', PATH: 'p' }),
    ).toEqual({ PATH: 'p' });
  });
  it('drops the keys that state a system, in any case', () => {
    const env = tools.smokeEnv(
      {
        sap_url: 'x',
        MCP_X: 'y',
        SapNwRfc_Home: 'z',
        AUTH_BROKER_PATH: 'w',
        HOME: 'h',
      },
      'lib.so',
      () => false,
    );
    expect(env).toEqual({ HOME: 'h' });
    // A long s upper-cases to S: no Unicode case mapping, the key stays.
    expect(
      tools.smokeEnv({ '\u017FAP_URL': 'x' }, 'lib.so', () => false),
    ).toEqual({ '\u017FAP_URL': 'x' });
  });
  it('starts npm through a .js or .cjs npm_execpath', () => {
    const exists = () => true;
    for (const file of ['/n/npm-cli.js', '/n/npm-cli.cjs']) {
      expect(
        tools.npmCommand({
          env: { npm_execpath: file },
          execPath: '/node',
          exists,
        }).args,
      ).toEqual([file]);
    }
    expect(
      tools.npmCommand({
        env: { npm_execpath: '/n/npm-cli.mjs' },
        execPath: '/node',
        platform: 'linux',
        exists,
      }).cmd,
    ).toBe('npm');
  });
});

describe('tool output', () => {
  it("drops otool's offset after an LC_RPATH path", () => {
    expect(readings.withoutOffset('@loader_path (offset 12)')).toBe(
      '@loader_path',
    );
    expect(readings.withoutOffset('/a (offset x)')).toBe('/a (offset x)');
  });
  it('reads the dynamic entries of readelf -d and what the patch must leave', () => {
    const output = [
      'Dynamic section at offset 0x1 contains 3 entries:',
      '  Tag        Type                         Name/Value',
      ' 0x0000000000000001 (NEEDED)             Shared library: [libsapnwrfc.so]',
      ' 0x000000000000000e (SONAME)             Library soname: [x.node]',
      ' 0x000000000000001d (RUNPATH)            Library runpath: [/opt/sdk]',
      ' 0x000000000000000c (INIT)               0x1000',
    ].join('\n');
    const entries = readings.dynamicEntries(output);
    expect(entries).toEqual([
      '(NEEDED)             Shared library: [libsapnwrfc.so]',
      '(SONAME)             Library soname: [x.node]',
      '(RUNPATH)            Library runpath: [/opt/sdk]',
    ]);
    expect(readings.expectedDynamicEntries(entries)).toEqual([
      '(NEEDED) Shared library: [libsapnwrfc.so]',
      '(SONAME) Library soname: [x.node]',
      '(RUNPATH) Library runpath: [$ORIGIN]',
    ]);
    expect(readings.expectedDynamicEntries(entries.slice(0, 2))).toEqual([
      '(NEEDED) Shared library: [libsapnwrfc.so]',
      '(RUNPATH) Library runpath: [$ORIGIN]',
    ]);
  });
  it("reads the server's own stderr for the SDK and an RFC key", () => {
    expect(readings.sdkMissing('x needs the SAP NW RFC SDK y')).toBe(true);
    expect(readings.sdkMissing('all fine')).toBe(false);
    expect(
      readings.namesRfcKey('[MCP] failed (RFC_COMMUNICATION_FAILURE)'),
    ).toBe(true);
    expect(readings.namesRfcKey('[MCP] failed (RFC_)')).toBe(false);
    expect(readings.namesRfcKey('[MCP] failed (rfc_x)')).toBe(false);
  });
});

describe('bundling', () => {
  it('fixes every installed version module from its own manifest', () => {
    const stage = tmp();
    const put = (dir: string, name: string, version: string, file: string) => {
      fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name, version }),
      );
      fs.writeFileSync(path.join(dir, file), 'require("../package.json")');
    };
    const core = path.join(stage, 'node_modules/@mcp-abap-adt/core');
    put(core, '@mcp-abap-adt/core', '9.1.0', 'dist/coreVersion.js');
    const nested = path.join(
      stage,
      'node_modules/x/node_modules/@mcp-abap-adt/server-runtime',
    );
    fs.mkdirSync(path.join(stage, 'node_modules/x'), { recursive: true });
    put(
      nested,
      '@mcp-abap-adt/server-runtime',
      '2.0.0',
      'dist/runtimeVersion.js',
    );

    expect([...bundling.fixVersionModules(stage)].sort()).toEqual(
      [
        path.join(core, 'dist/coreVersion.js'),
        path.join(nested, 'dist/runtimeVersion.js'),
      ].sort(),
    );
    expect(
      fs.readFileSync(path.join(core, 'dist/coreVersion.js'), 'utf8'),
    ).toBe(
      'exports.CORE_VERSION = "9.1.0";\nexports.CORE_PACKAGE = "@mcp-abap-adt/core";',
    );
    expect(
      fs.readFileSync(path.join(nested, 'dist/runtimeVersion.js'), 'utf8'),
    ).toBe('exports.RUNTIME_VERSION = "2.0.0";');
  });

  it('bundles node-gyp-build as the loader, wherever it is required', async () => {
    const dir = tmp();
    const loader = path.join(dir, 'loader.cjs');
    fs.writeFileSync(loader, 'module.exports = "THE-EMBEDDED-LOADER";\n');
    const entry = path.join(dir, 'entry.cjs');
    fs.writeFileSync(entry, 'module.exports = require("node-gyp-build");\n');
    const outfile = path.join(dir, 'out.cjs');

    const result = await build(
      bundling.bundleOptions({ entry, outfile, loader }),
    );

    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(outfile, 'utf8')).toContain('THE-EMBEDDED-LOADER');
  });
});
