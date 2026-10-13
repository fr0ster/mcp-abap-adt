/**
 * The ABAP Cloud system-context lookup (`systeminformation`) is part of the
 * connect (spec §5.7): sent once per connection, inside `getConnection`,
 * before any tool proceeds — never a send of a tool outside the main flow.
 * The tool wrapper reads its answer and sends nothing.
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
import { SystemContextMissingError } from '../../../lib/systemContextGuard';
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

it('ABAP Cloud: the lookup is sent once per connection, at connect, before the first tool request', async () => {
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
 * The lookup at connect never widens failures (C15 round 4): when it is
 * refused the connect succeeds and the connection carries no system
 * context. Only a tool that needs the context — a create, refused by the
 * guard for want of a responsible — asks again, from inside the main flow;
 * a read and every tool outside the flow send no lookup.
 */
describe('ABAP Cloud, the lookup at connect refused', () => {
  // A service definition's create writes `adtcore:responsible`: the guard
  // refuses it for want of one (a class create sends none).
  const isClassCreate = (r: StandInRequest) =>
    r.method === 'POST' &&
    r.url.split('?')[0] === '/sap/bc/adt/ddic/srvd/sources';

  async function refusedAtConnect() {
    const standIn = await adtStandIn();
    // The connect's lookup is refused once; a later one as told per case.
    standIn.answerOnce(isLookup, 500);
    const s = await builtStand(standIn, 'cloud');
    s.register(oneToolGroup('CreateServiceDefinition'));
    return { standIn, s };
  }

  it('a read tool works, and asks nothing again', async () => {
    const { standIn, s } = await refusedAtConnect();
    try {
      const read = await s.call('ReadClass', { class_name: 'ZCL_READ' });
      expect(read.isError).toBe(false);
      await s.call('ReadClass', { class_name: 'ZCL_READ_AGAIN' });
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a create asks again and is refused when the retry is refused too; nothing created', async () => {
    const { standIn, s } = await refusedAtConnect();
    standIn.answer(isLookup, 500);
    try {
      const created = await s.call('CreateServiceDefinition', {
        service_definition_name: 'ZSD_CREATED',
        package_name: '$TMP',
      });
      expect(created.isError).toBe(true);
      expect(created.payload).toMatchObject({ error: 'system_lookup_failed' });
      expect(standIn.requests.filter(isLookup)).toHaveLength(2);
      expect(standIn.requests.some(isClassCreate)).toBe(false);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a create asks again and goes on with the answer when the retry is answered', async () => {
    const { standIn, s } = await refusedAtConnect();
    standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    try {
      await s.call('CreateServiceDefinition', {
        service_definition_name: 'ZSD_CREATED',
        package_name: '$TMP',
      });
      const lookups = standIn.requests
        .map((r, i) => (isLookup(r) ? i : -1))
        .filter((i) => i >= 0);
      expect(lookups).toHaveLength(2);
      const create = standIn.requests.findIndex(isClassCreate);
      expect(create).toBeGreaterThan(lookups[1] ?? Number.MAX_SAFE_INTEGER);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a tool outside the flow sends no lookup and is not refused', async () => {
    const { standIn, s } = await refusedAtConnect();
    try {
      const started = await s.call('RuntimeRunClass', {
        class_name: 'ZCL_BACKGROUND',
        background: true,
      });
      expect(started.isError).toBe(false);
      await until(() => standIn.requests.some(isClassRun));
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await s.close();
      await standIn.close();
    }
  });
});

it('ABAP Cloud, the lookup at connect refused: a tool outside the flow that the guard refuses asks nothing again', async () => {
  // A debugger-listed name (outside the flow) whose handler meets the guard,
  // as a create would: the refusal stands, and no lookup is sent for it.
  const guarded: HandlerEntry = {
    toolDefinition: {
      name: 'DebugWait',
      description: 'DebugWait',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: (async (_context: unknown, _args: unknown) => {
      throw new SystemContextMissingError();
    }) as never,
  } as unknown as HandlerEntry;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  const s = await statefulStand(['ReadClass'], {
    systemType: 'cloud',
    groups: [
      {
        getName: () => 'guarded-out-of-flow',
        getHandlers: () => [guarded],
        registerHandlers: () => {},
      } as unknown as IHandlerGroup,
    ],
  });
  s.standIn.answer(isLookup, 500);
  try {
    const answer = await s.call('DebugWait', {});
    expect(answer.isError).toBe(true);
    // The one lookup of the connection's first use, and no retry.
    expect(s.standIn.requests.filter(isLookup)).toHaveLength(1);
  } finally {
    await s.close();
  }
});
