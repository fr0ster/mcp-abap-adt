/**
 * Fixture for headerCallSites.test.ts: a literal pair inside the wrapper —
 * not the pair the wrapper hands it.
 */
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../../src/lib/adtHeaders/withAdtHeaders';

declare const utils: {
  getWhereUsed(
    params: { object_name: string },
    options: { headers: IAdtHeaders },
  ): Promise<unknown>;
};

export function callSite(): Promise<unknown> {
  return withAdtHeaders({}, 'utils.getWhereUsed', (_headers) =>
    utils.getWhereUsed(
      { object_name: 'X' },
      { headers: { accept: 'application/xml', contentType: 'application/xml' } },
    ),
  );
}
