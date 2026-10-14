/**
 * A background run's caller of a token credential on a cloud system whose
 * `systeminformation` names no user: the same `system_without_user` the
 * per-call lookup answers — one rule, one code. Nothing is kept: once the
 * system names its user, the next call asks again and goes on.
 */

import { TokenAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { adtStandIn, type StandInRequest } from '../../helpers/adtStandIn';
import { clientOf, StandServer, shippedGroups, silent } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

/** `systeminformation` answers that name no user. */
const WITHOUT_USER: Array<[string, string]> = [
  ['no userName', JSON.stringify({ systemID: 'CLD' })],
  ['a blank userName', JSON.stringify({ userName: ' ', systemID: 'CLD' })],
  ['a body that is no JSON', 'not json'],
  ['a JSON array', JSON.stringify([{ userName: 'ARRAY_USER' }])],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
];

it.each(WITHOUT_USER)(
  'a caller lookup answered with %s is system_without_user, and is not kept',
  async (_what, body) => {
    const standIn = await adtStandIn();
    let fixed = false;
    standIn.body((r) => isLookup(r) && !fixed, body);
    standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    const server = new StandServer({
      name: 'caller-without-user',
      logger: silent,
      systemType: 'cloud',
      backgroundRuns: new InMemoryBackgroundRuns(),
    });
    server.use({
      settings: { url: standIn.url, client: '100', authType: 'jwt' },
      credential: TokenAuthProvider.fixed('placeholder.token.sig'),
    });
    server.register(shippedGroups());
    const client = await clientOf(server);
    try {
      // A management tool: its caller is looked up with no per-call lookup.
      const first = await client.call('GetBackgroundRun', {
        run_handle: 'unknown-handle',
      });
      expect(first.isError).toBe(true);
      expect(first.payload).toMatchObject({ error: 'system_without_user' });

      fixed = true;
      const second = await client.call('GetBackgroundRun', {
        run_handle: 'unknown-handle',
      });
      expect(second.payload).not.toMatchObject({
        error: 'system_without_user',
      });
    } finally {
      await client.close();
      await server.terminalClose();
      await standIn.close();
    }
  },
);
