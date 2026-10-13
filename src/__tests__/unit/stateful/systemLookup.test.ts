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
