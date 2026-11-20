/**
 * A launcher's manifest is read by its shape: a text `name` and a text
 * `version`, or the start stops in words.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { packageManifestOf } from '../../lib/packageManifest';
import { assertThrows } from '../helpers/assertions';

describe('packageManifestOf', () => {
  it('reads the name and the version', () => {
    assert.deepStrictEqual(
      packageManifestOf({ name: '@scope/pkg', version: '1.2.3', main: 'x' }),
      { name: '@scope/pkg', version: '1.2.3' },
    );
  });

  for (const [_case, value] of [
    ['no version', { name: '@scope/pkg' }],
    ['no name', { version: '1.2.3' }],
    ['a version that is no text', { name: '@scope/pkg', version: 1 }],
    ['a list', ['@scope/pkg', '1.2.3']],
    ['no object', 'package'],
    ['null', null],
  ]) {
    it(format('refuses %s', _case), () => {
      assertThrows(
        () => packageManifestOf(value),
        'package.json names no name and version',
      );
    });
  }
});
