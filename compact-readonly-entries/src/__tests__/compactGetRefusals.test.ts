/**
 * Each `HandlerGet` route table has its refusal table, member for member:
 * a route without its refusal would be refused only after the call took a
 * connection, and a refusal without its route would refuse what the call
 * answers otherwise.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  CONTENTS_REFUSALS,
  draftRefusals,
  METADATA_REFUSALS,
  mainProgramsRefusals,
  SOURCE_REFUSALS,
  URL_REFUSALS,
} from '../handlers/compactGetRefusals';
import {
  compactContentsRoutes,
  compactDraftRoutes,
  compactMainProgramsRoutes,
  compactMetadataRoutes,
  compactUrlRoutes,
} from '../handlers/compactPartRoutes';
import { compactReadRouterMap } from '../handlers/compactReadRoutes';

const keys = (table: object) => Object.keys(table).sort();

describe('HandlerGet: every route has its refusal', () => {
  it('source', () => {
    const routed = Object.entries(compactReadRouterMap)
      .filter(([, operations]) => operations.get !== undefined)
      .map(([member]) => member)
      .sort();
    assert.deepStrictEqual(keys(SOURCE_REFUSALS), routed);
  });

  for (const [_part, refusals, routes] of [
    ['metadata', METADATA_REFUSALS, compactMetadataRoutes],
    ['urls', URL_REFUSALS, compactUrlRoutes],
    ['contents', CONTENTS_REFUSALS, compactContentsRoutes],
  ] as const) {
    it(format('%s', _part), () => {
      assert.deepStrictEqual(keys(refusals), keys(routes));
    });
  }

  for (const variant of ['onprem', 'cloud'] as const) {
    it(format('main_programs and draft on %s', variant), () => {
      assert.deepStrictEqual(
        keys(mainProgramsRefusals(variant)),
        keys(compactMainProgramsRoutes(variant)),
      );
      assert.deepStrictEqual(
        keys(draftRefusals(variant)),
        keys(compactDraftRoutes(variant)),
      );
    });
  }
});
