/**
 * Fixture for headerCallSites.test.ts: the control. A header-taking member
 * called through `withAdtHeaders`, its pair the wrapper's.
 */
import type { IAdtHeaders, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../../src/lib/adtHeaders/withAdtHeaders';

declare const utils: {
  getWhereUsed(
    params: { object_name: string },
    options: { headers: IAdtHeaders },
  ): Promise<IAdtResponse<string>>;
};

export function callSite(): Promise<IAdtResponse<string>> {
  return withAdtHeaders({}, 'utils.getWhereUsed', (headers) =>
    utils.getWhereUsed({ object_name: 'X' }, { headers }),
  );
}
