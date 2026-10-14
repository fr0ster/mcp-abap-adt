/**
 * The ABAP Cloud system-context lookup (`systeminformation`) is asked once
 * per connection, before the first tool on it runs, inside the main flow
 * (spec §5.7) — never after a tool, so no tool runs twice. The tool wrapper
 * reads its answer and sends nothing. (A stdio process asks it at its start:
 * `startBirth.test.ts`.)
 *
 * - On ABAP Cloud, a built connection sends it once, before the first tool
 *   request, and never again for later calls.
 * - A tool outside the main flow — a background run, a debugger wait — sends
 *   no lookup on the instance's connection, also when it is the first call.
 * - On-premise nothing is asked.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { requireSystemContextForCreate } from '../../../lib/systemContextGuard';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import {
  clientOf,
  isClassRun,
  StandServer,
  shippedGroups,
  silent,
} from '../backgroundRuns/harness';
import { oneToolGroup, statefulStand } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const of = (name: string) => (r: StandInRequest) =>
  r.url.toLowerCase().includes(name.toLowerCase());

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

/** A built instance (the server's own connection) of `kind` on the stand-in. */
async function builtStand(standIn: AdtStandIn, kind: 'cloud' | 'onprem') {
  process.env.SAP_SYSTEM_TYPE = kind;
  const server = new StandServer({
    name: 'system-lookup',
    logger: silent,
    systemType: kind,
    backgroundRuns: new InMemoryBackgroundRuns(),
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
  server.register(shippedGroups());
  server.register(new CompositeHandlersRegistry([oneToolGroup('ReadClass')]));
  const client = await clientOf(server);
  return {
    call: client.call,
    register: (group: IHandlerGroup) =>
      server.register(new CompositeHandlersRegistry([group])),
    close: async () => {
      await client.close();
      await server.terminalClose();
    },
  };
}

it('ABAP Cloud: the lookup is sent once per connection, before the first tool request', async () => {
  const standIn = await adtStandIn();
  const s = await builtStand(standIn, 'cloud');
  try {
    await s.call('ReadClass', { class_name: 'ZCL_FIRST' });
    await s.call('ReadClass', { class_name: 'ZCL_SECOND' });
    const lookups = standIn.requests.filter(isLookup);
    expect(lookups).toHaveLength(1);
    const lookup = standIn.requests.findIndex(isLookup);
    const firstTool = standIn.requests.findIndex(of('ZCL_FIRST'));
    expect(lookup).toBeGreaterThanOrEqual(0);
    expect(firstTool).toBeGreaterThan(lookup);
    // In the instance's own session.
    expect(lookups[0]?.session).toBe(
      standIn.requests.find(of('ZCL_FIRST'))?.session,
    );
  } finally {
    await s.close();
    await standIn.close();
  }
});

it('ABAP Cloud: a background run sends no lookup on the instance’s connection, also as the first call', async () => {
  const standIn = await adtStandIn();
  const s = await builtStand(standIn, 'cloud');
  try {
    const started = await s.call('RuntimeRunClass', {
      class_name: 'ZCL_BACKGROUND',
      background: true,
    });
    expect(started.isError).toBe(false);
    await until(() => standIn.requests.some(isClassRun));
    await s.call('RuntimeRunClass', {
      class_name: 'ZCL_BACKGROUND_TWO',
      background: true,
    });
    await until(() => standIn.requests.filter(isClassRun).length === 2);
    // The connect's one lookup, and none of the runs'.
    const lookups = standIn.requests.filter(isLookup);
    expect(lookups).toHaveLength(1);
    const runSessions = new Set(
      standIn.requests.filter(isClassRun).map((r) => r.session),
    );
    expect(runSessions.has(lookups[0]?.session ?? '')).toBe(false);
  } finally {
    await s.close();
    await standIn.close();
  }
});

it('ABAP Cloud: a debugger wait sends no lookup; the injected connection is looked up once, before any tool', async () => {
  const waitTool: HandlerEntry = {
    toolDefinition: {
      name: 'DebugWait',
      description: 'DebugWait',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: (async (_context: unknown, _args: unknown) => ({
      content: [{ type: 'text', text: 'waited' }],
    })) as never,
  } as unknown as HandlerEntry;
  // A factory-built connection follows its recorded settings and the
  // environment: cloud.
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  const s = await statefulStand(['ReadClass'], {
    systemType: 'cloud',
    groups: [
      {
        getName: () => 'debug-wait',
        getHandlers: () => [waitTool],
        registerHandlers: () => {},
      } as unknown as IHandlerGroup,
    ],
  });
  try {
    await s.call('DebugWait', {});
    await s.call('DebugWait', {});
    await s.call('ReadClass', { class_name: 'ZCL_AFTER' });
    const lookups = s.standIn.requests.filter(isLookup);
    expect(lookups).toHaveLength(1);
    expect(s.standIn.requests.findIndex(of('ZCL_AFTER'))).toBeGreaterThan(
      s.standIn.requests.findIndex(isLookup),
    );
  } finally {
    await s.close();
  }
});

it('on-premise: no lookup is sent', async () => {
  const standIn = await adtStandIn();
  const s = await builtStand(standIn, 'onprem');
  try {
    await s.call('ReadClass', { class_name: 'ZCL_ONPREM' });
    await s.call('RuntimeRunClass', {
      class_name: 'ZCL_ONPREM_RUN',
      background: true,
    });
    await until(() => standIn.requests.some(isClassRun));
    expect(standIn.requests.filter(isLookup)).toEqual([]);
    expect(
      standIn.requests.filter((r) => !isLogoff(r.url)).length,
    ).toBeGreaterThan(0);
  } finally {
    await s.close();
    await standIn.close();
  }
});

/**
 * A lookup that fails is the call's answer, asked before the tool runs —
 * never after a refusal, so no tool runs twice. The connection stays, and
 * the next call asks again: the system may have been restarted.
 */
describe('ABAP Cloud, the lookup refused', () => {
  /**
   * `TwoStep`: as `CreateCdsUnitTest` (a check sent before its guarded
   * create) — sends `before-<id>`, then reads the responsible a create needs
   * and sends `create-<responsible>`.
   */
  const twoStep: HandlerEntry = {
    toolDefinition: {
      name: 'TwoStep',
      description: 'TwoStep',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: (async (
      context: {
        connection: { makeAdtRequest(o: object): Promise<unknown> };
      },
      args: { id: string },
    ) => {
      await context.connection.makeAdtRequest({
        url: `/sap/bc/adt/probe/before-${args.id}`,
        method: 'GET',
        timeout: 10_000,
      });
      const { responsible } = requireSystemContextForCreate();
      await context.connection.makeAdtRequest({
        url: `/sap/bc/adt/probe/create-${responsible}`,
        method: 'GET',
        timeout: 10_000,
      });
      return { content: [{ type: 'text', text: responsible }] };
    }) as never,
  } as unknown as HandlerEntry;
  const sent = (standIn: AdtStandIn, what: string) =>
    standIn.requests.filter((r) => r.url === `/sap/bc/adt/probe/${what}`)
      .length;

  async function refusedFirst() {
    const standIn = await adtStandIn();
    // The first lookup is refused; the next answered.
    standIn.answerOnce(isLookup, 500);
    standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    const s = await builtStand(standIn, 'cloud');
    s.register({
      getName: () => 'two-step',
      getHandlers: () => [twoStep],
      registerHandlers: () => {},
    } as unknown as IHandlerGroup);
    return { standIn, s };
  }

  it('the first call answers the error and its tool does not run; the next call asks again, and its tool runs once', async () => {
    const { standIn, s } = await refusedFirst();
    try {
      const first = await s.call('TwoStep', { id: 'one' });
      expect(first.isError).toBe(true);
      expect(first.payload).toMatchObject({ error: 'system_lookup_failed' });
      expect(sent(standIn, 'before-one')).toBe(0);

      const second = await s.call('TwoStep', { id: 'two' });
      expect(second.isError).toBe(false);
      expect(standIn.requests.filter(isLookup)).toHaveLength(2);
      // Ran once: one check, one create — nothing replayed.
      expect(sent(standIn, 'before-two')).toBe(1);
      expect(sent(standIn, 'create-CLOUD_USER')).toBe(1);
      const lookup = standIn.requests.map(isLookup).lastIndexOf(true);
      expect(
        standIn.requests.findIndex(
          (r) => r.url === '/sap/bc/adt/probe/before-two',
        ),
      ).toBeGreaterThan(lookup);
      // Known from now on: asked no more.
      await s.call('TwoStep', { id: 'three' });
      expect(standIn.requests.filter(isLookup)).toHaveLength(2);
      expect(sent(standIn, 'before-three')).toBe(1);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a read is refused the same way, and works on the next call', async () => {
    const { standIn, s } = await refusedFirst();
    try {
      const first = await s.call('ReadClass', { class_name: 'ZCL_READ' });
      expect(first.isError).toBe(true);
      expect(first.payload).toMatchObject({ error: 'system_lookup_failed' });
      expect(standIn.requests.some(of('ZCL_READ'))).toBe(false);
      const second = await s.call('ReadClass', { class_name: 'ZCL_AGAIN' });
      expect(second.isError).toBe(false);
      expect(standIn.requests.filter(of('ZCL_AGAIN')).length).toBeGreaterThan(
        0,
      );
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a lookup refused every time: each call asks again, and no tool runs', async () => {
    const { standIn, s } = await refusedFirst();
    standIn.answer(isLookup, 500);
    try {
      for (const id of ['a', 'b', 'c']) {
        const answer = await s.call('TwoStep', { id });
        expect(answer.payload).toMatchObject({ error: 'system_lookup_failed' });
        expect(sent(standIn, `before-${id}`)).toBe(0);
      }
      expect(standIn.requests.filter(isLookup)).toHaveLength(3);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a background run as the first call: refused before anything starts, asked again on the next call', async () => {
    const { standIn, s } = await refusedFirst();
    try {
      const first = await s.call('RuntimeRunClass', {
        class_name: 'ZCL_BACKGROUND',
        background: true,
      });
      expect(first.isError).toBe(true);
      expect(first.payload).toMatchObject({ error: 'system_lookup_failed' });
      const second = await s.call('RuntimeRunClass', {
        class_name: 'ZCL_BACKGROUND',
        background: true,
      });
      expect(second.isError).toBe(false);
      await until(() => standIn.requests.some(isClassRun));
      expect(standIn.requests.filter(isClassRun)).toHaveLength(1);
      expect(standIn.requests.filter(isLookup)).toHaveLength(2);
    } finally {
      await s.close();
      await standIn.close();
    }
  });
});

it('ABAP Cloud, the lookup refused: a tool outside the flow is refused before it runs', async () => {
  let ran = 0;
  const outOfFlow: HandlerEntry = {
    toolDefinition: {
      name: 'DebugWait',
      description: 'DebugWait',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: (async (_context: unknown, _args: unknown) => {
      ran += 1;
      return { content: [{ type: 'text', text: 'waited' }] };
    }) as never,
  } as unknown as HandlerEntry;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  const s = await statefulStand(['ReadClass'], {
    systemType: 'cloud',
    groups: [
      {
        getName: () => 'out-of-flow',
        getHandlers: () => [outOfFlow],
        registerHandlers: () => {},
      } as unknown as IHandlerGroup,
    ],
  });
  s.standIn.answerOnce(isLookup, 500);
  try {
    const answer = await s.call('DebugWait', {});
    expect(answer.isError).toBe(true);
    expect(ran).toBe(0);
    const again = await s.call('DebugWait', {});
    expect(again.isError).toBeFalsy();
    expect(ran).toBe(1);
    expect(s.standIn.requests.filter(isLookup)).toHaveLength(2);
  } finally {
    await s.close();
  }
});
