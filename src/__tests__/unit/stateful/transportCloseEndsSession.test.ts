/**
 * The transport's close and the session's end. By default (stdio, an SSE
 * stream, an embedder's connected transport) the transport's close is the
 * session's end: every live call's signal aborts, and a call still waiting
 * before its tool — here its system lookup — never reaches it. A host with a
 * transport per request (Streamable HTTP) states `transportCloseEndsSession:
 * false`: the transport's close ends no call, and the waiting call runs its
 * tool once.
 */

import { TokenAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { activeTools } from '../../../lib/activeTools';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { StandServer, silent, until } from '../backgroundRuns/harness';
import { oneToolGroup } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const of = (name: string) => (r: StandInRequest) =>
  r.url.toLowerCase().includes(name.toLowerCase());

/** A real short wait: long enough for a send that is not held back to arrive. */
const settleWhile = () => new Promise((resolve) => setTimeout(resolve, 150));

let previousType: string | undefined;
let standIn: AdtStandIn;
beforeEach(async () => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  standIn = await adtStandIn();
  standIn.body(
    isLookup,
    JSON.stringify({ userName: 'TOKEN_USER', systemID: 'CLD' }),
  );
});
afterEach(async () => {
  await standIn.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function stand(transportCloseEndsSession: boolean | undefined) {
  const server = new StandServer({
    name: 'transport-close',
    logger: silent,
    systemType: 'cloud',
    ...(transportCloseEndsSession !== undefined && {
      transportCloseEndsSession,
    }),
  });
  server.use({
    settings: { url: standIn.url, client: '100', authType: 'jwt' },
    credential: TokenAuthProvider.fixed('placeholder.token.sig'),
  });
  server.register(new CompositeHandlersRegistry([oneToolGroup('ReadClass')]));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'transport-close', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = client
    .callTool({ name: 'ReadClass', arguments: { class_name: 'ZCL_WAITS' } })
    .catch(() => 'the transport closed');
  return { server, client, call };
}

const live = () => activeTools().filter((tool) => tool.name === 'ReadClass');

it.each([
  ['by default', undefined],
  ['stated true', true],
])(
  '%s the transport’s close ends the session: the waiting call’s signal aborts and its tool never runs',
  async (_label, option) => {
    const s = await stand(option);
    try {
      const held = standIn.hold(isLookup);
      await held.arrived;
      await s.client.close();
      expect(await s.call).toBe('the transport closed');
      await settleWhile();
      expect(live()).toHaveLength(1);
      expect(live().every((tool) => tool.signal.aborted)).toBe(true);
      held.release();
      await until(() => live().length === 0);
      await settleWhile();
      expect(standIn.requests.some(of('ZCL_WAITS'))).toBe(false);
    } finally {
      await s.server.terminalClose();
    }
  },
);

it('stated false (a transport per request): the transport’s close ends no call — the waiting call runs its tool once', async () => {
  const s = await stand(false);
  try {
    const held = standIn.hold(isLookup);
    await held.arrived;
    await s.client.close();
    expect(await s.call).toBe('the transport closed');
    await settleWhile();
    expect(live()).toHaveLength(1);
    expect(live().every((tool) => !tool.signal.aborted)).toBe(true);
    held.release();
    await until(() => live().length === 0);
    // The tool ran once: its source read reached the system once.
    expect(
      standIn.requests.filter((r) =>
        r.url.toLowerCase().includes('zcl_waits/source/main'),
      ),
    ).toHaveLength(1);
    expect(standIn.requests.findIndex(of('ZCL_WAITS'))).toBeGreaterThan(
      standIn.requests.findIndex(isLookup),
    );
  } finally {
    await s.server.terminalClose();
  }
});
