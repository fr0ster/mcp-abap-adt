/**
 * Each `HandlerGet` route table has its refusal table, member for member:
 * a route without its refusal would be refused only after the call took a
 * connection, and a refusal without its route would refuse what the call
 * answers otherwise.
 */

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
    expect(keys(SOURCE_REFUSALS)).toEqual(routed);
  });

  it.each([
    ['metadata', METADATA_REFUSALS, compactMetadataRoutes],
    ['urls', URL_REFUSALS, compactUrlRoutes],
    ['contents', CONTENTS_REFUSALS, compactContentsRoutes],
  ] as const)('%s', (_part, refusals, routes) => {
    expect(keys(refusals)).toEqual(keys(routes));
  });

  it.each(['onprem', 'cloud'] as const)(
    'main_programs and draft on %s',
    (variant) => {
      expect(keys(mainProgramsRefusals(variant))).toEqual(
        keys(compactMainProgramsRoutes(variant)),
      );
      expect(keys(draftRefusals(variant))).toEqual(
        keys(compactDraftRoutes(variant)),
      );
    },
  );
});
