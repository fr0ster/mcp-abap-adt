/**
 * The staging cache of `npm run portable:build` (scripts/portable/staging.cjs):
 * which SDK it was staged with, when it counts as staged, and which RFC binding
 * it takes — the one sap-rfc-lite's own loader (node-gyp-build) resolves: a
 * compiled build/Release first, else the prebuilt one the package installs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const staging = require('../../../../scripts/portable/staging.cjs');

const made: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-stage-'));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});
const pkgOf = (dir: string) =>
  path.join(dir, 'node_modules/@mcp-abap-adt/sap-rfc-lite');

// A staged sap-rfc-lite with the real node-gyp-build beside it (the copy the
// repository installed with sap-rfc-lite), so the loader under test is the
// package's own.
const realLoader = path.dirname(
  require.resolve('node-gyp-build/package.json', {
    paths: [require.resolve('@mcp-abap-adt/sap-rfc-lite/package.json')],
  }),
);
const stagePackage = (dir: string) => {
  const pkg = pkgOf(dir);
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    '{"name":"@mcp-abap-adt/sap-rfc-lite"}',
  );
  fs.cpSync(realLoader, path.join(pkg, 'node_modules/node-gyp-build'), {
    recursive: true,
  });
  return pkg;
};
// The prebuild of this platform, named as prebuildify names sap-rfc-lite's.
const prebuildOf = (pkg: string) =>
  path.join(
    pkg,
    'prebuilds',
    `${process.platform}-${process.arch}`,
    `@mcp-abap-adt+sap-rfc-lite${process.platform === 'linux' ? '.glibc' : ''}.node`,
  );
const write = (file: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'addon');
  return file;
};
const withAddon = (dir: string) => write(prebuildOf(stagePackage(dir)));

describe('portable staging', () => {
  it('requires SAPNWRFC_HOME', () => {
    expect(() => staging.sdkHome({})).toThrow(/set SAPNWRFC_HOME/);
  });

  it('refuses a relative SAPNWRFC_HOME: node-gyp would not find it', () => {
    expect(() => staging.sdkHome({ SAPNWRFC_HOME: 'nwrfcsdk' })).toThrow(
      /absolute path/,
    );
  });

  it('keeps SAPNWRFC_HOME as given, trailing slash included', () => {
    expect(staging.sdkHome({ SAPNWRFC_HOME: ' /opt/nwrfcsdk/ ' })).toBe(
      '/opt/nwrfcsdk/',
    );
  });

  it('takes the prebuilt binding sap-rfc-lite installs (0.2.3 and later: no build/Release)', () => {
    const dir = tmp();
    const prebuilt = withAddon(dir);
    expect(staging.stagedAddon(dir)).toBe(prebuilt);
  });

  it('takes a compiled build/Release over the prebuild, as the package loads it', () => {
    const dir = tmp();
    withAddon(dir);
    const compiled = write(
      path.join(pkgOf(dir), 'build/Release/sapnwrfc.node'),
    );
    expect(staging.stagedAddon(dir)).toBe(compiled);
  });

  it('finds no binding when there is neither, or no package', () => {
    const empty = tmp();
    expect(staging.stagedAddon(empty)).toBeUndefined();
    const dir = tmp();
    stagePackage(dir);
    expect(staging.stagedAddon(dir)).toBeUndefined();
  });

  it('is not staged until the RFC binding exists — no marker for a failed install', () => {
    const dir = tmp();
    stagePackage(dir);
    expect(() =>
      staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' }),
    ).toThrow(/RFC binding is not in the staged/);
    expect(staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' })).toBe(
      false,
    );
  });

  it('is built for the version and the SDK it was staged with', () => {
    const dir = tmp();
    withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    expect(staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' })).toBe(
      true,
    );
  });

  it('is rebuilt for another SDK', () => {
    const dir = tmp();
    withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    expect(
      staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/other-sdk' }),
    ).toBe(false);
  });

  it('is rebuilt when a source build is asked for, or no longer asked for', () => {
    const dir = tmp();
    withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    expect(
      staging.isStaged(dir, {
        version: '1.0.0',
        sdk: '/opt/sdk',
        fromSource: true,
      }),
    ).toBe(false);
    staging.markStaged({
      dir,
      version: '1.0.0',
      sdk: '/opt/sdk',
      fromSource: true,
    });
    expect(staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' })).toBe(
      false,
    );
  });

  it('is rebuilt when the binding disappeared after staging', () => {
    const dir = tmp();
    const addon = withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    fs.rmSync(addon);
    expect(staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' })).toBe(
      false,
    );
  });
});
