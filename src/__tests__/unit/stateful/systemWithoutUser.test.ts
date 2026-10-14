/**
 * A system whose `systeminformation` answers but names no user — the field
 * missing, empty, blank, not a string, or a body that is no JSON — is not a
 * valid ABAP system for this server: an error, as a failed lookup is. On a
 * built instance (http, sse) the call answers `system_without_user` and its
 * tool does not run; nothing of the answer is kept, so the next call asks
 * again and, once the system names its user, its tool runs once. (A stdio
 * start ends with its own words: `server/src/__tests__/startConnector.test.ts`.)
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { clientOf, StandServer, silent } from '../backgroundRuns/harness';
import { oneToolGroup } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const of = (name: string) => (r: StandInRequest) =>
  r.url.toLowerCase().includes(name.toLowerCase());

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function cloudStand(standIn: AdtStandIn) {
  const server = new StandServer({
    name: 'system-without-user',
    logger: silent,
    systemType: 'cloud',
  });
  server.use({
    settings: {
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'LOOKUP_USER',
    },
    credential: new BasicAuthProvider('LOOKUP_USER', 'lookup-password'),
  });
  server.register(new CompositeHandlersRegistry([oneToolGroup('ReadClass')]));
  const client = await clientOf(server);
  return {
    call: client.call,
    close: async () => {
      await client.close();
      await server.terminalClose();
    },
  };
}

const WITHOUT_USER: Array<[string, string]> = [
  ['no userName', JSON.stringify({ systemID: 'CLD' })],
  ['an empty userName', JSON.stringify({ userName: '', systemID: 'CLD' })],
  ['a blank userName', JSON.stringify({ userName: '  ', systemID: 'CLD' })],
  ['a userName that is no string', JSON.stringify({ userName: 42 })],
  ['a body that is no JSON', 'not json'],
  ['an empty body', ''],
];

it.each(WITHOUT_USER)(
  'systeminformation with %s: the call answers system_without_user, its tool not run; the next call asks again',
  async (_what, body) => {
    const standIn = await adtStandIn();
    // The first lookup is answered `body`; once the system is fixed, it names
    // its user.
    let fixed = false;
    standIn.body((r) => isLookup(r) && !fixed, body);
    standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    const s = await cloudStand(standIn);
    try {
      const first = await s.call('ReadClass', { class_name: 'ZCL_FIRST' });
      expect(first.isError).toBe(true);
      expect(first.payload).toMatchObject({ error: 'system_without_user' });
      expect(standIn.requests.some(of('ZCL_FIRST'))).toBe(false);

      // Nothing kept: still refused while the system names no user.
      const again = await s.call('ReadClass', { class_name: 'ZCL_AGAIN' });
      expect(again.payload).toMatchObject({ error: 'system_without_user' });
      expect(standIn.requests.filter(isLookup)).toHaveLength(2);

      fixed = true;
      const second = await s.call('ReadClass', { class_name: 'ZCL_SECOND' });
      expect(second.isError).toBe(false);
      expect(standIn.requests.filter(isLookup)).toHaveLength(3);
      expect(standIn.requests.filter(of('ZCL_SECOND')).length).toBeGreaterThan(
        0,
      );
      expect(standIn.requests.some(of('ZCL_FIRST'))).toBe(false);
    } finally {
      await s.close();
      await standIn.close();
    }
  },
);
