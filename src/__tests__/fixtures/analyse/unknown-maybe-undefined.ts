/**
 * Fixture for analyseOmissions.test.ts — verdict: unknown.
 *
 * `analyse` is set to a value typed `T | undefined` — it may be a real
 * strategy or nothing, and this file gives the checker no way to narrow it
 * further. Reported as unprovable rather than as either definite answer.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { analyseException } from '@mcp-abap-adt/adt-strategies';

declare const client: AdtClient;
declare const maybe: typeof analyseException | undefined;

export const call = () =>
  client.getClass().read({ className: 'X' }, 'active', { analyse: maybe });
