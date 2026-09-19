/**
 * Fixture for analyseOmissions.test.ts — verdict: yes.
 *
 * `analyse` is set inline to a value whose type the checker can prove is
 * never `undefined`. This is the shape the brief itself gives as the
 * baseline example.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';

declare const client: AdtClient;

export const call = () =>
  client
    .getClass()
    .read({ className: 'X' }, 'active', { analyse: analyseException });
