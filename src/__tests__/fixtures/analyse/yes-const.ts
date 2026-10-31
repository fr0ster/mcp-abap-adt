import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
/**
 * Fixture for analyseOmissions.test.ts — verdict: yes.
 *
 * The options object is not inline at the call site but a `const` bound to
 * an object literal in the same file — a `const` binding is the one case
 * `carriesAnalyse` follows an identifier through, because its initializer
 * still describes the value at the call.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;

export const call = () => {
  const options = { analyse: analyseException };
  return client
    .getClass(classDocuments)
    .read({ className: 'X' }, 'active', options);
};
