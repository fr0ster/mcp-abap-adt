/**
 * Fixture for headerCallSites.test.ts: a pair of its own under the name
 * `ABAPGIT_HEADERS`, declared here rather than in `src/lib/abapGit/client.ts`.
 */
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';

declare const client: {
  pullRepo(
    args: { key: string },
    options: { headers: IAdtHeaders },
  ): Promise<unknown>;
};

const ABAPGIT_HEADERS: { readonly pull: IAdtHeaders } = {
  pull: { accept: 'application/xml', contentType: 'application/xml' },
};

export function callSite(): Promise<unknown> {
  return client.pullRepo({ key: '000001' }, { headers: ABAPGIT_HEADERS.pull });
}
