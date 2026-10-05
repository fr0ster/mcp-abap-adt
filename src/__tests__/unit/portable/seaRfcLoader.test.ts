/**
 * The loader a portable executable uses for the RFC addon
 * (scripts/portable/sea-rfc-loader.cjs): which SDK folder it reads, what it
 * refuses, and that it writes nothing when the archive already holds the addon.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const loader = require('../../../../scripts/portable/sea-rfc-loader.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sea-loader-'));
const addon = Buffer.from('addon-bytes');
const escapeRegExp = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

describe('portable RFC loader', () => {
  it('names the SDK library per platform', () => {
    expect(loader.sdkLibraryName('win32')).toBe('sapnwrfc.dll');
    expect(loader.sdkLibraryName('darwin')).toBe('libsapnwrfc.dylib');
    expect(loader.sdkLibraryName('linux')).toBe('libsapnwrfc.so');
  });

  it('prefers SAPNWRFC_HOME/lib, else nwrfcsdk/lib beside the executable', () => {
    const execPath = path.join('/opt', 'p', 'mcp-abap-adt');
    expect(
      loader.resolveSdkLibDir({ env: { SAPNWRFC_HOME: '/sdk' }, execPath }),
    ).toBe(path.join('/sdk', 'lib'));
    expect(
      loader.resolveSdkLibDir({ env: { SAPNWRFC_HOME: '  ' }, execPath }),
    ).toBe(path.join('/opt', 'p', 'nwrfcsdk', 'lib'));
  });

  it('refuses a folder without the SDK library, naming it', () => {
    const dir = tmp();
    expect(() =>
      loader.prepareAddon({ dir, addon, platform: 'linux' }),
    ).toThrow(
      new RegExp(`${escapeRegExp(dir)}.*libsapnwrfc\\.so was not found`),
    );
  });

  it('says so when SAPNWRFC_HOME chose the folder', () => {
    const dir = tmp();
    expect(() =>
      loader.prepareAddon({ dir, addon, platform: 'linux', fromEnv: true }),
    ).toThrow(/SAPNWRFC_HOME is set/);
  });

  it('writes nothing when the identical addon is already there (read-only folder)', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    fs.writeFileSync(path.join(dir, 'sapnwrfc.node'), addon);
    const writeFileSync = jest.fn();
    const file = loader.prepareAddon({
      dir,
      addon,
      platform: 'linux',
      fsImpl: { ...fs, writeFileSync },
    });
    expect(file).toBe(path.join(dir, 'sapnwrfc.node'));
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('replaces a stale addon with the embedded one', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    fs.writeFileSync(path.join(dir, 'sapnwrfc.node'), 'old');
    loader.prepareAddon({ dir, addon, platform: 'linux' });
    expect(fs.readFileSync(path.join(dir, 'sapnwrfc.node'))).toEqual(addon);
  });

  it('names an unwritable folder', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    const writeFileSync = () => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    };
    expect(() =>
      loader.prepareAddon({
        dir,
        addon,
        platform: 'linux',
        fsImpl: { ...fs, writeFileSync },
      }),
    ).toThrow(/could not be written into .*EACCES.*must be writable/);
  });
});
