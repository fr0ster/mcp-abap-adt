/**
 * Fixture for legacyExposure.test.ts — a tool legacy is never offered.
 *
 * `available_in` names two environments and omits `'legacy'`, so
 * `legacyEnabledHandlers` must exclude this file before `legacyExposure` ever
 * walks it — a call to a member the ledger tracks is not evidence of
 * exposure when the tool never reaches a legacy system to begin with.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const TOOL_DEFINITION = {
  name: 'CreatePackage',
  available_in: ['onprem', 'cloud'] as const,
} as const;

export const call = () => client.getPackage().create({ packageName: 'ZP' });
