/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * No options argument at all — `read`'s third parameter is fully optional,
 * and this call never reaches for it. Nothing was omitted from a passed
 * object; nothing was passed.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const call = () => client.getClass().read({ className: 'X' });
