import { classDocuments } from '@mcp-abap-adt/adt-clients';
import type { IAdtOperationOptions } from '@mcp-abap-adt/interfaces-adt';
/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * `IAdtOperationOptions` declares `analyse` OPTIONAL, so a `const` typed
 * with it and initialized empty satisfies `getProperty('analyse')` at the
 * type level while carrying no strategy at all. The type says what may be
 * there; only the value — followed here to its literal initializer — says
 * what is.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;

export const call = () => {
  const options: IAdtOperationOptions = {};
  return client
    .getClass(classDocuments)
    .read({ className: 'X' }, 'active', options);
};
