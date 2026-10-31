import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
/**
 * Fixture for analyseOmissions.test.ts — verdict: yes.
 *
 * `analyse` is set inline to a value whose type the checker can prove is
 * never `undefined`. This is the shape the brief itself gives as the
 * baseline example.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;

export const call = () =>
  client
    .getClass(classDocuments)
    .read({ className: 'X' }, 'active', { analyse: analyseException });
