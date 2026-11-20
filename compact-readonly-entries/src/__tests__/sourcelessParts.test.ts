/**
 * lib's `SOURCELESS` is the handler's own choice of parts: a type in it offers
 * `metadata` and no source, and every other read type offers `source`. A prompt
 * reads the same set to pass `part: "metadata"`, so what it asks is what
 * `HandlerGet` answers.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPACT_READ,
  isSourceless,
  SOURCELESS,
} from '@mcp-abap-adt/lib/compact-shared';
import { hasSourcePart, partsFor } from '../handlers/compactPartRoutes';

/** The read members that answer a run or a request's entries, not an object's part. */
const NOT_A_PART = new Set(['UNIT_TEST', 'CDS_UNIT_TEST', 'TRANSPORT']);

describe('SOURCELESS', () => {
  it('holds the five types read as their metadata document', () => {
    assert.deepEqual(
      [...SOURCELESS],
      ['PACKAGE', 'DOMAIN', 'DATA_ELEMENT', 'FUNCTION_GROUP', 'TABLE_TYPE'],
    );
  });
});

for (const variant of ['onprem', 'cloud'] as const) {
  describe(`SOURCELESS against HandlerGet's parts (${variant})`, () => {
    for (const type of SOURCELESS) {
      it(`${type} offers metadata and no source`, () => {
        assert.equal(hasSourcePart(type), false);
        assert.equal(isSourceless(type), true);
        assert.ok(
          partsFor(type, hasSourcePart(type), variant).includes('metadata'),
        );
      });
    }
    for (const type of COMPACT_READ[variant]) {
      if (SOURCELESS.has(type) || NOT_A_PART.has(type)) continue;
      it(`${type} offers source`, () => {
        assert.equal(isSourceless(type), false);
        assert.ok(
          partsFor(type, hasSourcePart(type), variant).includes('source'),
        );
      });
    }
  });
}
