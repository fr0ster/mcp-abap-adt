import { classDocuments } from '@mcp-abap-adt/adt-clients';
/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * The `analyse` key IS present, but its value is `undefined` — a key that
 * says nothing. `carriesAnalyse` reads the TYPE of the value, not the
 * spelling of the key, so this must answer the same as omitting it.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;

export const call = () =>
  client
    .getClass(classDocuments)
    .read({ className: 'X' }, 'active', { analyse: undefined });
