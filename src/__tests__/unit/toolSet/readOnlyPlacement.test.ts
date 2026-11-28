/**
 * Where a read belongs: in the read-only set. The local includes of a class
 * are read on core-ro as on core.
 *
 * Run: npm test -- src/__tests__/unit/toolSet/readOnlyPlacement.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { servedCatalog, setOf } from '../descriptions/catalog';

describe('every read is in the read-only set', () => {
  it('the local includes of a class are read on core-ro', async () => {
    const ro = new Set(
      (await servedCatalog(setOf('core-ro'))).map((tool) => tool.name),
    );
    for (const name of [
      'GetLocalTypes',
      'GetLocalDefinitions',
      'GetLocalMacros',
      'GetLocalTestClass',
    ]) {
      assert.deepEqual([name, ro.has(name)], [name, true]);
    }
  });
});
