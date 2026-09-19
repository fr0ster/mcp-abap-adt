/**
 * Fixture for analyseOmissions.test.ts — verdict: unknown.
 *
 * `analyse` is set from a conditional expression that may produce
 * `undefined` on one branch. Same shape as `unknown-maybe-undefined.ts` in
 * substance — a value the checker can only type as a union with
 * `undefined` — reached through a different piece of syntax.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';

declare const client: AdtClient;
declare const strict: boolean;

export const call = () =>
  client.getClass().read({ className: 'X' }, 'active', {
    analyse: strict ? analyseException : undefined,
  });
