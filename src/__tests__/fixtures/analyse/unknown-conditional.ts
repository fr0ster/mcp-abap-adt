import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
/**
 * Fixture for analyseOmissions.test.ts — verdict: unknown.
 *
 * `analyse` is set from a conditional expression that may produce
 * `undefined` on one branch. Same shape as `unknown-maybe-undefined.ts` in
 * substance — a value the checker can only type as a union with
 * `undefined` — reached through a different piece of syntax.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;
declare const strict: boolean;

export const call = () =>
  client.getClass(classDocuments).read({ className: 'X' }, 'active', {
    analyse: strict ? analyseException : undefined,
  });
