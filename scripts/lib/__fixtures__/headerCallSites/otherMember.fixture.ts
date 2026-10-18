/**
 * Fixture for headerCallSites.test.ts: the wrapper given the operation of
 * another member than the one called.
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
  return withAdtHeaders({}, 'utils.getWhereUsedScope', (headers) =>
    utils.getWhereUsed({ object_name: 'X' }, { headers }),
  );
}
