/**
 * Fixture for headerCallSites.test.ts: the control. A header-taking member
 * called through `withAdtHeaders`, its pair the wrapper's.
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
  return withAdtHeaders({}, 'utils.getWhereUsed', (headers) =>
    utils.getWhereUsed({ object_name: 'X' }, { headers }),
  );
}
