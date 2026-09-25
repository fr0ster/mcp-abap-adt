/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * `IAdtOperationOptions` declares `analyse` OPTIONAL, so a `const` typed
 * with it and initialized empty satisfies `getProperty('analyse')` at the
 * type level while carrying no strategy at all. The type says what may be
 * there; only the value — followed here to its literal initializer — says
 * what is.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAdtOperationOptions } from '@mcp-abap-adt/interfaces-adt';

declare const client: AdtClient;

export const call = () => {
  const options: IAdtOperationOptions = {};
  return client.getClass().read({ className: 'X' }, 'active', options);
};
