/**
 * A tool call cannot be cancelled: it ends with its result or with the
 * session. A client's `notifications/cancelled` (the SDK's client sends it
 * when the caller's signal aborts) aborts nothing on the server:
 *
 * - a call whose system lookup is on the wire keeps running: its tool runs
 *   once the lookup is answered, and it stays a live call until then;
 * - a call queued behind another keeps its place and runs after it.
 *
 * The session's end (the transport closed, the instance closed) during a
 * pending lookup: the instance's close sends no logoff before the lookup
 * settled — no logoff under an in-flight request.
 */

import { TokenAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { activeTools } from '../../../lib/activeTools';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { closeInstance } from '../../../lib/instanceClose';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import {
  StandServer,
  shippedGroups,
  silent,
  until,
} from '../backgroundRuns/harness';
import { isLock, isUnlock, oneToolGroup, statefulStand } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const of = (name: string) => (r: StandInRequest) =>
  r.url.toLowerCase().includes(name.toLowerCase());

/** A real short wait: long enough for a send that is not held back to arrive. */
const settleWhile = () => new Promise((resolve) => setTimeout(resolve, 150));

const SOURCE =
  'CLASS zcl_x DEFINITION PUBLIC. ENDCLASS. CLASS zcl_x IMPLEMENTATION. ENDCLASS.';

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

/** A built ABAP Cloud instance on a token credential, serving ReadClass. */
async function cloudStand(standIn: AdtStandIn) {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  standIn.body(
    isLookup,
    JSON.stringify({ userName: 'TOKEN_USER', systemID: 'CLD' }),
  );
  const server = new StandServer({
    name: 'no-call-cancel',
    logger: silent,
    systemType: 'cloud',
    backgroundRuns: new InMemoryBackgroundRuns(),
  });
  server.use({
    settings: { url: standIn.url, client: '100', authType: 'jwt' },
    credential: TokenAuthProvider.fixed('placeholder.token.sig'),
  });
  server.register(shippedGroups());
  server.register(new CompositeHandlersRegistry([oneToolGroup('ReadClass')]));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'no-call-cancel', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const callWith = (
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) =>
    client.callTool({ name, arguments: args }, undefined, {
      timeout: 60_000,
      ...(signal !== undefined ? { signal } : {}),
    }) as Promise<{ isError?: boolean }>;
  return {
    server,
    client,
    callWith,
    close: async () => {
      await client.close().catch(() => undefined);
      await server.terminalClose();
    },
  };
}

const live = () =>
  activeTools().filter((tool) => tool.name === 'ReadClass').length;

it('a cancel sent while the call’s system lookup is on the wire aborts nothing: the tool runs once the lookup is answered', async () => {
  const standIn = await adtStandIn();
  const s = await cloudStand(standIn);
  try {
    const held = standIn.hold(isLookup);
    const cancel = new AbortController();
    const first = s
      .callWith('ReadClass', { class_name: 'ZCL_FIRST' }, cancel.signal)
      .catch(() => 'the client stopped waiting');
    await held.arrived;
    // The SDK's client sends notifications/cancelled for this request.
    cancel.abort('the user cancelled');
    expect(await first).toBe('the client stopped waiting');
    await settleWhile();
    // Still a live call, its signal not aborted.
    expect(live()).toBe(1);
    expect(activeTools().every((tool) => !tool.signal.aborted)).toBe(true);
    held.release();
    // The call ran to its end: its tool's request reached the system.
    await until(() => standIn.requests.some(of('ZCL_FIRST')));
    await until(() => live() === 0);
    const lookup = standIn.requests.findIndex(isLookup);
    expect(standIn.requests.findIndex(of('ZCL_FIRST'))).toBeGreaterThan(lookup);
  } finally {
    await s.close();
    await standIn.close();
  }
});

it('a cancel sent while the call waits in the main flow aborts nothing: it keeps its place and runs after the call ahead', async () => {
  const s = await statefulStand(['UpdateClass', 'ReadClass']);
  try {
    const held = s.standIn.hold((r) => isLock(r) && of('ZCL_HOLDER')(r));
    const holder = s.call('UpdateClass', {
      class_name: 'ZCL_HOLDER',
      source_code: SOURCE,
    });
    await held.arrived;
    const cancel = new AbortController();
    const queued = s
      .callWith('ReadClass', { class_name: 'ZCL_QUEUED' }, cancel.signal)
      .catch(() => 'the client stopped waiting');
    await until(() => activeTools().length === 2);
    cancel.abort('the user cancelled');
    expect(await queued).toBe('the client stopped waiting');
    await settleWhile();
    // Still queued: two live calls, nothing of the queued one sent.
    expect(activeTools()).toHaveLength(2);
    expect(s.standIn.requests.some(of('ZCL_QUEUED'))).toBe(false);
    held.release();
    await holder;
    await until(() => s.standIn.requests.some(of('ZCL_QUEUED')));
    await until(() => activeTools().length === 0);
    const unlock = s.standIn.requests.findIndex(
      (r) => isUnlock(r) && of('ZCL_HOLDER')(r),
    );
    expect(s.standIn.requests.findIndex(of('ZCL_QUEUED'))).toBeGreaterThan(
      unlock,
    );
  } finally {
    await s.close();
  }
});

it('the session ends while a call’s system lookup is on the wire: no logoff before the lookup settled', async () => {
  const standIn = await adtStandIn();
  const s = await cloudStand(standIn);
  try {
    const held = standIn.hold(isLookup);
    const first = s
      .callWith('ReadClass', { class_name: 'ZCL_FIRST' })
      .catch(() => 'the session ended');
    await held.arrived;
    // The session's end: the client's transport closes, and the instance
    // is closed — as an SSE connection's close does.
    await s.client.close();
    expect(await first).toBe('the session ended');
    let closed = false;
    const closing = closeInstance(s.server).then(() => {
      closed = true;
    });
    await settleWhile();
    expect(standIn.requests.filter((r) => isLogoff(r.url))).toEqual([]);
    expect(closed).toBe(false);
    held.release();
    await closing;
    // Logged off once the lookup was answered; the tool never ran.
    await until(() => standIn.requests.some((r) => isLogoff(r.url)));
    expect(standIn.requests.findIndex((r) => isLogoff(r.url))).toBeGreaterThan(
      standIn.requests.findIndex(isLookup),
    );
    expect(standIn.requests.some(of('ZCL_FIRST'))).toBe(false);
  } finally {
    await s.close();
    await standIn.close();
  }
});
