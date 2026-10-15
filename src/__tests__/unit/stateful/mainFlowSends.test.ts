/**
 * Every send on the instance's connection is inside its main flow; only work
 * on a connection of its own is outside it.
 *
 * - A background run's caller and the debugger's request user are the
 *   connection's parameters, made with it: no lookup of their own.
 * - From inside a call that holds the flow, a send (`onMainConnection`) runs
 *   directly: no wait behind itself.
 * - The debugger tools whose SAP work is on the debugger's own connections
 *   (here a `DebugWait` that holds) do not block a parallel `ReadClass`.
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { liveDebugPorts } from '../../../lib/debugger/ports';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { readSystemInformation } from '../../../lib/systemInformation';
import { adtStandIn, type StandInRequest } from '../../helpers/adtStandIn';
import { callerOn } from '../backgroundRuns/harness';
import { isLock, isUnlock, oneToolGroup, statefulStand } from './harness';

jest.setTimeout(30_000);

const SOURCE = 'CLASS zcl_placeholder DEFINITION. ENDCLASS.';
const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const of = (name: string) => (r: StandInRequest) =>
  r.url.toLowerCase().includes(name.toLowerCase());

/** Real time for a call that is not queued to reach the stand-in. */
const settleWhile = () => new Promise((resolve) => setTimeout(resolve, 100));

function indexOf(
  requests: StandInRequest[],
  match: (r: StandInRequest) => boolean,
): number {
  return requests.findIndex(match);
}

/**
 * A group of test tools. Each handler declares both parameters: the wrapper
 * hands the context only to a handler of two.
 */
function testGroup(
  tools: Record<
    string,
    (context: HandlerContext, args: Record<string, unknown>) => Promise<unknown>
  >,
): IHandlerGroup {
  const entries: HandlerEntry[] = Object.entries(tools).map(
    ([name, handler]) =>
      ({
        toolDefinition: {
          name,
          description: name,
          inputSchema: { type: 'object', properties: {} },
        },
        handler,
      }) as unknown as HandlerEntry,
  );
  return {
    getName: () => 'flow-test-tools',
    getHandlers: () => entries,
    registerHandlers: () => {},
  } as unknown as IHandlerGroup;
}

/**
 * Cases on a cloud system (the kind of a connection the factory built comes
 * from `SAP_SYSTEM_TYPE`); the identity lookups are asked on both kinds.
 */
let previousType: string | undefined;
function onCloud(): void {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
}
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  previousType = undefined;
});

const text = (value: string) => ({
  content: [{ type: 'text', text: value }],
});

it('a holding DebugWait blocks no ReadClass; the request user sends nothing', async () => {
  onCloud();
  let releaseWait!: () => void;
  const waiting = new Promise<void>((resolve) => {
    releaseWait = resolve;
  });
  const s = await statefulStand(['UpdateClass', 'ReadClass'], {
    systemType: 'cloud',
    groups: [
      testGroup({
        // As a DebugWait holding for its `hold_seconds`: nothing on the
        // instance's connection.
        DebugWait: async () => {
          await waiting;
          return text('waited');
        },
        // As a start in user mode: the request user, asked of the
        // instance's connection through the debugger's port.
        DebugStartListener: async (context, _args) => {
          const user = await liveDebugPorts()
            .requestUser(context)
            .catch(() => 'unknown');
          return text(user);
        },
      }),
    ],
  });
  try {
    // A DebugWait holding: a ReadClass beside it still runs.
    const wait = s.call('DebugWait', {});
    await settleWhile();
    const read = await s.call('ReadClass', { class_name: 'ZCL_READ' });
    expect(read.isError).not.toBe(true);
    expect(s.standIn.requests.some(of('ZCL_READ'))).toBe(true);
    releaseWait();
    await wait;

    // The request user: the connection's parameters, nothing sent.
    const lookupsBefore = s.standIn.requests.filter(isLookup).length;
    const start = await s.call('DebugStartListener', {});
    expect(start.isError).not.toBe(true);
    expect(s.standIn.requests.filter(isLookup).length).toBe(lookupsBefore);
  } finally {
    releaseWait();
    await s.close();
  }
});

it('a lookup from inside a call that holds the flow runs directly, without waiting behind itself', async () => {
  onCloud();
  const s = await statefulStand([], {
    systemType: 'cloud',
    groups: [
      testGroup({
        LookupInside: async (context, _args) => {
          const send = context.onMainConnection;
          if (!send) throw new Error('no onMainConnection');
          const user = await send(
            async (connection) =>
              (await readSystemInformation(connection)).user,
          );
          return text(user ?? 'none');
        },
      }),
    ],
  });
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadlock = new Promise<'deadlock'>((resolve) => {
      timer = setTimeout(() => resolve('deadlock'), 3_000);
    });
    const outcome = await Promise.race([
      s
        .call('LookupInside', {})
        .then((a) => (a.isError ? 'failed' : 'answered')),
      deadlock,
    ]);
    clearTimeout(timer);
    expect(outcome).toBe('answered');
    expect(s.standIn.requests.some(isLookup)).toBe(true);
  } finally {
    await s.close();
  }
});
