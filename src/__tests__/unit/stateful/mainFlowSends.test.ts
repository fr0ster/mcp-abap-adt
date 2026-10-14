/**
 * Every send on the instance's connection is inside its main flow; only work
 * on a connection of its own is outside it (spec §5.7).
 *
 * - The identity lookups (`systeminformation`) made by tools outside the flow
 *   — a background run's caller, the debugger's request user — take their
 *   turn: sent only after the call holding the flow ended.
 * - From inside a call that holds the flow, such a send runs directly: no
 *   wait behind itself.
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
import { systemUserOf } from '../../../lib/systemUser';
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
 * `systeminformation` exists only on ABAP Cloud, so the identity lookups are
 * asked only there: the cases about them run against a cloud system (the
 * kind of a connection the factory built comes from `SAP_SYSTEM_TYPE`).
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

it("a background run's caller lookup takes its turn behind the call holding the flow", async () => {
  const standIn = await adtStandIn();
  // A token credential names no user: the caller is asked of SAP.
  const caller = await callerOn(standIn, new InMemoryBackgroundRuns(), {
    tokenUser: 'RUN_USER',
  });
  (
    caller.server as unknown as {
      register(registry: CompositeHandlersRegistry): void;
    }
  ).register(new CompositeHandlersRegistry([oneToolGroup('UpdateClass')]));
  try {
    const held = standIn.hold((r) => isLock(r) && of('ZCL_HOLDER')(r));
    const holder = caller.call('UpdateClass', {
      class_name: 'ZCL_HOLDER',
      source_code: SOURCE,
    });
    await held.arrived;
    const lookupsBefore = standIn.requests.filter(isLookup).length;
    const background = caller.call('RuntimeRunClass', {
      class_name: 'ZCL_BACKGROUND',
      background: true,
    });
    await settleWhile();
    // The lookup waits for the flow: nothing of it reached SAP yet.
    expect(standIn.requests.filter(isLookup).length).toBe(lookupsBefore);
    held.release();
    await holder;
    await background;
    const unlock = indexOf(
      standIn.requests,
      (r) => isUnlock(r) && of('ZCL_HOLDER')(r),
    );
    const lookups = standIn.requests
      .map((r, i) => (isLookup(r) ? i : -1))
      .filter((i) => i >= 0);
    expect(lookups.length).toBeGreaterThan(lookupsBefore);
    expect(lookups.at(-1)).toBeGreaterThan(unlock);
  } finally {
    await caller.close();
    await standIn.close();
  }
});

it("the debugger's request-user lookup takes its turn; a holding DebugWait blocks no ReadClass", async () => {
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

    // The request user waits for the call that holds the flow.
    const held = s.standIn.hold((r) => isLock(r) && of('ZCL_HOLDER')(r));
    const holder = s.call('UpdateClass', {
      class_name: 'ZCL_HOLDER',
      source_code: SOURCE,
    });
    await held.arrived;
    const lookupsBefore = s.standIn.requests.filter(isLookup).length;
    const start = s.call('DebugStartListener', {});
    await settleWhile();
    expect(s.standIn.requests.filter(isLookup).length).toBe(lookupsBefore);
    held.release();
    await holder;
    await start;
    const unlock = indexOf(
      s.standIn.requests,
      (r) => isUnlock(r) && of('ZCL_HOLDER')(r),
    );
    const last = s.standIn.requests
      .map((r, i) => (isLookup(r) ? i : -1))
      .filter((i) => i >= 0)
      .at(-1);
    expect(last).toBeGreaterThan(unlock);
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
          const user = await send((connection) => systemUserOf(connection));
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
