/**
 * Fixture for headerCallSites.test.ts: an abapGit new form's pair taken
 * straight from `ABAPGIT_HEADERS` (the owner's exception: no resend of a
 * credentialed request).
 */
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import { ABAPGIT_HEADERS } from '../../../../src/lib/abapGit/client';

declare const client: {
  pullRepo(
    args: { key: string },
    options: { headers: IAdtHeaders },
  ): Promise<unknown>;
};

export function callSite(): Promise<unknown> {
  return client.pullRepo({ key: '000001' }, { headers: ABAPGIT_HEADERS.pull });
}
