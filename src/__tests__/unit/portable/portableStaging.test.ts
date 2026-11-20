/**
 * The staging cache of `npm run portable:build` (scripts/portable/staging.cjs):
 * which SDK it was staged with, when it counts as staged, and which RFC binding
 * it takes — the one sap-rfc-lite's own loader (node-gyp-build) resolves, the
 * prebuilt one the package carries (a build/Release would win, as the loader
 * prefers it) — and which staged copies of sap-rfc-lite are too old to
 * load inside an executable.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { assertThrows } from '../../helpers/assertions';
import { repositoryRoot } from '../../helpers/repoRoot';

const staging = require(
  path.join(repositoryRoot(__dirname), 'scripts', 'portable', 'staging.cjs'),
);

const made: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-stage-'));
  made.push(dir);
  return dir;
};
after(() => {
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
    assertThrows(() => staging.sdkHome({}), /set SAPNWRFC_HOME/);
  });

  it('refuses a relative SAPNWRFC_HOME', () => {
    assertThrows(
      () => staging.sdkHome({ SAPNWRFC_HOME: 'nwrfcsdk' }),
      /absolute path/,
    );
  });

  it('keeps SAPNWRFC_HOME as given, trailing slash included', () => {
    assert.equal(
      staging.sdkHome({ SAPNWRFC_HOME: ' /opt/nwrfcsdk/ ' }),
      '/opt/nwrfcsdk/',
    );
  });

  it('takes the prebuilt binding sap-rfc-lite carries (no build/Release)', () => {
    const dir = tmp();
    const prebuilt = withAddon(dir);
    assert.equal(staging.stagedAddon(dir), prebuilt);
  });

  it('takes a build/Release over the prebuild, as the package loader does', () => {
    const dir = tmp();
    withAddon(dir);
    const compiled = write(
      path.join(pkgOf(dir), 'build/Release/sapnwrfc.node'),
    );
    assert.equal(staging.stagedAddon(dir), compiled);
  });

  it('finds no binding when there is neither, or no package', () => {
    const empty = tmp();
    assert.equal(staging.stagedAddon(empty), undefined);
    const dir = tmp();
    stagePackage(dir);
    assert.equal(staging.stagedAddon(dir), undefined);
  });

  it('is not staged until the RFC binding exists — no marker for a failed install', () => {
    const dir = tmp();
    stagePackage(dir);
    assertThrows(
      () => staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' }),
      /RFC binding is not in the staged/,
    );
    assert.equal(
      staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' }),
      false,
    );
  });

  it('is built for the version and the SDK it was staged with', () => {
    const dir = tmp();
    withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    assert.equal(
      staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' }),
      true,
    );
  });

  it('is rebuilt for another SDK', () => {
    const dir = tmp();
    withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    assert.equal(
      staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/other-sdk' }),
      false,
    );
  });

  it('is rebuilt for another version', () => {
    const dir = tmp();
    withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    assert.equal(
      staging.isStaged(dir, { version: '1.0.1', sdk: '/opt/sdk' }),
      false,
    );
  });

  it('is rebuilt when the binding disappeared after staging', () => {
    const dir = tmp();
    const addon = withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    fs.rmSync(addon);
    assert.equal(
      staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' }),
      false,
    );
  });
});

describe('staged sap-rfc-lite copies older than 0.3.0', () => {
  const copy = (modules: string, version: string) => {
    const pkg = path.join(modules, '@mcp-abap-adt/sap-rfc-lite');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: '@mcp-abap-adt/sap-rfc-lite', version }),
    );
    return pkg;
  };

  it('finds none when every copy is 0.3.0 or later', () => {
    const dir = tmp();
    copy(path.join(dir, 'node_modules'), '0.3.2');
    copy(
      path.join(dir, 'node_modules/@mcp-abap-adt/connection/node_modules'),
      '1.0.0',
    );
    assert.deepStrictEqual(staging.rfcLiteTooOld(dir), []);
  });

  it('finds an older copy nested under the package that pinned it', () => {
    const dir = tmp();
    copy(path.join(dir, 'node_modules'), '0.3.2');
    const nested = copy(
      path.join(dir, 'node_modules/@mcp-abap-adt/connection/node_modules'),
      '0.2.4',
    );
    assert.deepStrictEqual(staging.rfcLiteTooOld(dir), [
      { dir: nested, version: '0.2.4' },
    ]);
  });

  it('finds a hoisted older copy, and one with no readable version', () => {
    const dir = tmp();
    const hoisted = copy(path.join(dir, 'node_modules'), '0.2.3');
    const broken = path.join(
      dir,
      'node_modules/other/node_modules/@mcp-abap-adt/sap-rfc-lite',
    );
    fs.mkdirSync(broken, { recursive: true });
    {
      const actual = staging.rfcLiteTooOld(dir);
      for (const expected of [
        { dir: hoisted, version: '0.2.3' },
        { dir: broken, version: 'undefined' },
      ]) {
        assert.ok(actual.some((e: unknown) => isDeepStrictEqual(e, expected)));
      }
    }
  });

  it('finds nothing in a stage with no node_modules', () => {
    assert.deepStrictEqual(staging.rfcLiteTooOld(tmp()), []);
  });
});
