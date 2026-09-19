/**
 * Fixture for analyseOmissions.test.ts — verdict: yes.
 *
 * The options object is not inline at the call site but a `const` bound to
 * an object literal in the same file — a `const` binding is the one case
 * `carriesAnalyse` follows an identifier through, because its initializer
 * still describes the value at the call.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';

declare const client: AdtClient;

export const call = () => {
  const options = { analyse: analyseException };
  return client.getClass().read({ className: 'X' }, 'active', options);
};
