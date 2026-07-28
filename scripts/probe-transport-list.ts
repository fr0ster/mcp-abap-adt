/**
 * Dump the raw CTS transport-list payload (issue #168).
 *
 * `ListTransports` reports count 0 on systems where the user owns requests.
 * The endpoint negotiates `application/vnd.sap.adt.transportorganizertree.v1+xml`,
 * a *tree* representation, so the requests are expected to sit under status
 * containers rather than directly under the root. This script prints the raw
 * XML so the parser can be written against the real shape instead of a guess.
 *
 * Usage:
 *   npx tsx scripts/probe-transport-list.ts --env trial.env [--user <SAPUSER>] [--status D]
 *
 * With no --user the SAP_USERNAME from the env file is used.
 */
import * as path from 'node:path';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import * as dotenv from 'dotenv';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';

const ACCEPT_TRANSPORT_LIST =
  'application/vnd.sap.adt.transportorganizertree.v1+xml';

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const envFile = path.resolve(
    get('--env') || path.join(__dirname, '..', 'trial.env'),
  );
  dotenv.config({ path: envFile, override: true });

  const user = get('--user') || process.env.SAP_USERNAME || '';
  const status = get('--status');
  console.log(`env:  ${envFile}`);
  console.log(`user: ${user || '(empty)'}`);

  const query = new URLSearchParams({ user });
  if (status) query.append('status', status);
  const url = `/sap/bc/adt/cts/transportrequests?${query.toString()}`;
  console.log(`url:  ${url}\n`);

  const conn = createAbapConnection(getSapConfigFromEnv()) as any;
  try {
    const response = await conn.makeAdtRequest({
      url,
      method: 'GET',
      headers: { Accept: ACCEPT_TRANSPORT_LIST },
    });
    console.log(`--- HTTP ${response.status} ---`);
    console.log(String(response.data ?? ''));
  } catch (error) {
    const e = error as any;
    console.log(`--- FAILED HTTP ${e?.response?.status ?? '?'} ---`);
    console.log(e?.message);
    console.log(String(e?.response?.data ?? '').slice(0, 2000));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
