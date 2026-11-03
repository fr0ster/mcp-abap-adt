/**
 * A launcher's manifest is read by its shape: a text `name` and a text
 * `version`, or the start stops in words.
 */
import { packageManifestOf } from '../../lib/packageManifest';

describe('packageManifestOf', () => {
  it('reads the name and the version', () => {
    expect(
      packageManifestOf({ name: '@scope/pkg', version: '1.2.3', main: 'x' }),
    ).toEqual({ name: '@scope/pkg', version: '1.2.3' });
  });

  it.each([
    ['no version', { name: '@scope/pkg' }],
    ['no name', { version: '1.2.3' }],
    ['a version that is no text', { name: '@scope/pkg', version: 1 }],
    ['a list', ['@scope/pkg', '1.2.3']],
    ['no object', 'package'],
    ['null', null],
  ])('refuses %s', (_case, value) => {
    expect(() => packageManifestOf(value)).toThrow(
      'package.json names no name and version',
    );
  });
});
