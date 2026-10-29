import { classDocuments } from '@mcp-abap-adt/adt-clients';
/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * An options object is passed, but it is empty — no `analyse` key at all.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;

export const call = () =>
  client.getClass(classDocuments).read({ className: 'X' }, 'active', {});
