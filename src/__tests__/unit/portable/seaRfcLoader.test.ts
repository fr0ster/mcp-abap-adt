/**
 * The loader a portable executable uses for the RFC addon
 * (scripts/portable/sea-rfc-loader.cjs): which SDK folder it reads, what it
 * refuses, and that it writes nothing when the archive already holds the addon.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { assertThrows } from '../../helpers/assertions';
import { repositoryRoot } from '../../helpers/repoRoot';

const loader = require(
  path.join(
    repositoryRoot(__dirname),
    'scripts',
    'portable',
    'sea-rfc-loader.cjs',
  ),
);

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sea-loader-'));
const addon = Buffer.from('addon-bytes');
const escapeRegExp = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

describe('portable RFC loader', () => {
  it('names the SDK library per platform', () => {
    assert.equal(loader.sdkLibraryName('win32'), 'sapnwrfc.dll');
    assert.equal(loader.sdkLibraryName('darwin'), 'libsapnwrfc.dylib');
    assert.equal(loader.sdkLibraryName('linux'), 'libsapnwrfc.so');
  });

  it('prefers SAPNWRFC_HOME/lib, else nwrfcsdk/lib beside the executable', () => {
    const execPath = path.join('/opt', 'p', 'mcp-abap-adt');
    assert.equal(
      loader.resolveSdkLibDir({ env: { SAPNWRFC_HOME: '/sdk' }, execPath }),
      path.join('/sdk', 'lib'),
    );
    assert.equal(
      loader.resolveSdkLibDir({ env: { SAPNWRFC_HOME: '  ' }, execPath }),
      path.join('/opt', 'p', 'nwrfcsdk', 'lib'),
    );
  });

  it('refuses a folder without the SDK library, naming it', () => {
    const dir = tmp();
    assertThrows(
      () => loader.prepareAddon({ dir, addon, platform: 'linux' }),
      new RegExp(`${escapeRegExp(dir)}.*libsapnwrfc\\.so was not found`),
    );
  });

  it('says so when SAPNWRFC_HOME chose the folder', () => {
    const dir = tmp();
    assertThrows(
      () =>
        loader.prepareAddon({ dir, addon, platform: 'linux', fromEnv: true }),
      /SAPNWRFC_HOME points at .* fix it, or clear SAPNWRFC_HOME to use nwrfcsdk\/lib/,
    );
  });

  it('writes nothing when the identical addon is already there (read-only folder)', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    fs.writeFileSync(path.join(dir, 'sapnwrfc.node'), addon);
    const writeFileSync = mock.fn();
    const file = loader.prepareAddon({
      dir,
      addon,
      platform: 'linux',
      fsImpl: { ...fs, writeFileSync },
    });
    assert.equal(file, path.join(dir, 'sapnwrfc.node'));
    assert.equal(writeFileSync.mock.callCount(), 0);
  });

  it('replaces a stale addon with the embedded one', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    fs.writeFileSync(path.join(dir, 'sapnwrfc.node'), 'old');
    loader.prepareAddon({ dir, addon, platform: 'linux' });
    assert.deepStrictEqual(
      fs.readFileSync(path.join(dir, 'sapnwrfc.node')),
      addon,
    );
  });

  it('replaces the addon atomically — a temporary file renamed over it', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    fs.writeFileSync(path.join(dir, 'sapnwrfc.node'), 'old');
    const renameSync = mock.fn(fs.renameSync);
    const writeFileSync = mock.fn(fs.writeFileSync);
    loader.prepareAddon({
      dir,
      addon,
      platform: 'linux',
      fsImpl: { ...fs, renameSync, writeFileSync },
    });
    const written = String(writeFileSync.mock.calls[0]?.arguments[0]);
    assert.notEqual(written, path.join(dir, 'sapnwrfc.node'));
    assert.ok(
      renameSync.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          written,
          path.join(dir, 'sapnwrfc.node'),
        ]),
      ),
    );
    assert.deepStrictEqual(
      fs.readFileSync(path.join(dir, 'sapnwrfc.node')),
      addon,
    );
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), [
      'libsapnwrfc.so',
      'sapnwrfc.node',
    ]);
  });

  it('suggests clearing SAPNWRFC_HOME when the folder it chose is not writable', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    const writeFileSync = () => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' });
    };
    assertThrows(
      () =>
        loader.prepareAddon({
          dir,
          addon,
          platform: 'linux',
          fromEnv: true,
          fsImpl: { ...fs, writeFileSync },
        }),
      /SAPNWRFC_HOME chose it.*clear SAPNWRFC_HOME/,
    );
  });

  it('names an unwritable folder', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    const writeFileSync = () => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    };
    assertThrows(
      () =>
        loader.prepareAddon({
          dir,
          addon,
          platform: 'linux',
          fsImpl: { ...fs, writeFileSync },
        }),
      /could not be written into .*EACCES.*must be writable/,
    );
  });
});
