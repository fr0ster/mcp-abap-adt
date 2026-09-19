/**
 * Fixture for analyseOmissions.test.ts — verdict: unknown.
 *
 * `{ analyse: analyseException, ...opaque() }` — the same two pieces as
 * `yes-spread-then-analyse.ts`, in the opposite order. Read right to left,
 * the spread is the last property and it may or may not carry its own
 * `analyse`, so nothing here proves the strategy survives. This is one half
 * of the pair that catches a left-to-right regression in `carriesAnalyse`:
 * scanned left to right, this file would wrongly read as `yes`.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';

declare const client: AdtClient;
declare function opaque(): Record<string, unknown>;

export const call = () =>
  client.getClass().read({ className: 'X' }, 'active', {
    analyse: analyseException,
    ...opaque(),
  });
