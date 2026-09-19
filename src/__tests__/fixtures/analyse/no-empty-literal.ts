/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * An options object is passed, but it is empty — no `analyse` key at all.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const call = () =>
  client.getClass().read({ className: 'X' }, 'active', {});
