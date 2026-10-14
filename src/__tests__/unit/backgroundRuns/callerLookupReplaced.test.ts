/**
 * A background run's caller, for a token credential (it states no backend
 * user): the user SAP answers is cached per credential, and the cache is
 * forgotten when the instance's connection is replaced — a lookup asked on a
 * connection replaced meanwhile is not kept, and the next caller asks again.
 *
 * Against the stand-in, whose `systeminformation` answers the token's SAP
 * user.
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  adtStandIn,
  PROBE_PATH,
  probeGroup,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { callerOn } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');

beforeEach(() => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('CR11: a lookup asked on a connection replaced meanwhile is not kept — the next caller asks again', async () => {
  const standIn = await adtStandIn();
  standIn.systemInformation('USER_A');
  const previous = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const caller = await callerOn(standIn, new InMemoryBackgroundRuns(), {
    tokenUser: 'USER_A',
  });
  /** Outside the flow (a debugger tool's name): finds its session lost. */
  const loseOutside: HandlerEntry = {
    toolDefinition: {
      name: 'DebugWait',
      description: 'DebugWait',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: (async (
      context: { connection: { isConnected?: () => boolean } },
      _args: unknown,
    ) => {
      context.connection.isConnected = () => false;
      return { content: [{ type: 'text', text: 'lost' }] };
    }) as never,
  } as unknown as HandlerEntry;
  (
    caller.server as unknown as {
      register(registry: CompositeHandlersRegistry): void;
    }
  ).register(new CompositeHandlersRegistry([probeGroup([loseOutside])]));
  try {
    await caller.call('ProbeAdt', { id: 'warm' });
    const start = (name: string) =>
      caller.call('RuntimeRunClass', { class_name: name, background: true });

    // The first caller lookup is held inside the flow, on the first connection.
    const heldLookup = standIn.hold(isLookup);
    const first = start('ZCL_FIRST');
    await heldLookup.arrived;

    // Outside the flow the connection is found lost and replaced: a call's
    // own getConnection replaces it before that call waits for the flow.
    await caller.call('DebugWait', {});
    const replacer = caller.call('ProbeAdt', { id: 'replacer' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // The held lookup answers late, for the replaced connection.
    heldLookup.release();
    expect((await first).isError).toBe(false);
    await replacer;
    const before = standIn.requests.filter(isLookup).length;

    // The next caller is not answered from that late result: it asks again.
    expect((await start('ZCL_NEXT')).isError).toBe(false);
    const after = standIn.requests.filter(isLookup);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)?.session).toBe(
      standIn.requests.find((r) => r.url === `${PROBE_PATH}replacer`)?.session,
    );
  } finally {
    await caller.close();
    await standIn.close();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  }
});
