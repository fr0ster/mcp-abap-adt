/**
 * Fixture for headerCallSites.test.ts: a header-taking member called with a
 * pair of its own, outside the wrapper.
 */
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';

declare const utils: {
  getWhereUsed(
    params: { object_name: string },
    options: { headers: IAdtHeaders },
  ): Promise<unknown>;
};

const headers: IAdtHeaders = {
  accept: 'application/xml',
  contentType: 'application/xml',
};

export function callSite(): Promise<unknown> {
  return utils.getWhereUsed({ object_name: 'X' }, { headers });
}
