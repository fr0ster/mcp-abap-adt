/**
 * The staging cache of `npm run portable:build` (scripts/portable/staging.cjs):
 * which SDK it was built with, when it counts as built, and the RUNPATH the RFC
 * addon carries — the string binding.gyp wrote, not a normalised path.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const staging = require('../../../../scripts/portable/staging.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'portable-stage-'));
const withAddon = (dir: string) => {
  const built = staging.builtAddon(dir);
  fs.mkdirSync(path.dirname(built), { recursive: true });
  fs.writeFileSync(built, 'addon');
};

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

  it('names the RUNPATH exactly as binding.gyp builds it: <SAPNWRFC_HOME>/lib', () => {
    expect(staging.addonRpath('/opt/nwrfcsdk')).toBe('/opt/nwrfcsdk/lib');
    expect(staging.addonRpath('/opt/nwrfcsdk/')).toBe('/opt/nwrfcsdk//lib');
  });

  it('is not built until the RFC addon exists — no marker for a failed build', () => {
    const dir = tmp();
    expect(() =>
      staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' }),
    ).toThrow(/RFC addon was not built/);
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

  it('is rebuilt when the addon disappeared after staging', () => {
    const dir = tmp();
    withAddon(dir);
    staging.markStaged({ dir, version: '1.0.0', sdk: '/opt/sdk' });
    fs.rmSync(staging.builtAddon(dir));
    expect(staging.isStaged(dir, { version: '1.0.0', sdk: '/opt/sdk' })).toBe(
      false,
    );
  });
});
