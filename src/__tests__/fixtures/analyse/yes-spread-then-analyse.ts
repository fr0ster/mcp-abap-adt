import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
/**
 * Fixture for analyseOmissions.test.ts — verdict: yes.
 *
 * `{ ...opaque(), analyse: analyseException }` — the spread comes first and
 * `analyse` is written after it, so the explicit property wins whatever the
 * opaque spread carries. Read right to left, this is the first property
 * encountered and it settles the verdict immediately. Paired with
 * `unknown-analyse-then-spread.ts`, which writes the same two pieces in the
 * opposite order: a left-to-right scan would get this one right and that
 * one wrong, and only the pair together proves the scan direction.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;
declare function opaque(): Record<string, unknown>;

export const call = () =>
  client.getClass(classDocuments).read({ className: 'X' }, 'active', {
    ...opaque(),
    analyse: analyseException,
  });
