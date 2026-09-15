/**
 * A host that serves several SAP users from one process passes the responsible
 * person and master system per request (#202). For an ABAP Cloud connection a
 * request that does not carry them must still get them — from the system the
 * connection points at, resolved inside the library, per request, keyed by the
 * connection so nothing leaks between users.
 */
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtClient: jest.fn(),
  AdtClientLegacy: jest.fn(),
  getSystemInformation: jest.fn(),
}));

import { AdtClient, getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import type { HandlerContext } from '../../handlers/interfaces';
import { createAdtClient } from '../../lib/clients';
import { BaseHandlerGroup } from '../../lib/handlers/base/BaseHandlerGroup';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { logger } from '../../lib/logger';
import {
  defaultSystemContextResolver,
  runWithRequestContext,
  type SystemContextResolver,
  withResolvedSystemContext,
} from '../../lib/requestContext';
import {
  getEffectiveSystemContext,
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';

const lookup = getSystemInformation as jest.Mock;

function cloudConn(): IAbapConnection {
  return {
    getBaseUrl: async () => 'https://my-abap.abap.eu10.hana.ondemand.com',
  } as unknown as IAbapConnection;
}

function onPremConn(): IAbapConnection {
  return {
    getBaseUrl: async () => 'http://sap-e19.local:8000',
  } as unknown as IAbapConnection;
}

type Options =
  | { responsible?: string; masterSystem?: string; masterLanguage?: string }
  | undefined;

function lastOptions(): Options {
  return (AdtClient as jest.Mock).mock.calls.at(-1)?.[2];
}

function seen() {
  const ctx = getEffectiveSystemContext();
  return {
    responsible: ctx.responsible,
    masterSystem: ctx.masterSystem,
    masterLanguage: ctx.masterLanguage,
  };
}

beforeEach(() => {
  resetSystemContextCache();
  setSystemContext({ isLegacy: false });
  (AdtClient as jest.Mock).mockClear();
  lookup.mockReset();
  lookup.mockResolvedValue({ systemID: 'CLD', userName: 'CB_USER' });
});

describe('defaultSystemContextResolver', () => {
  it('maps a cloud system to responsible and master system', async () => {
    await expect(defaultSystemContextResolver(cloudConn())).resolves.toEqual({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('returns null on-premise without asking the system', async () => {
    await expect(defaultSystemContextResolver(onPremConn())).resolves.toBe(
      null,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('returns null when the system information is null', async () => {
    lookup.mockResolvedValue(null);
    await expect(defaultSystemContextResolver(cloudConn())).resolves.toBe(null);
  });
});

describe('memoisation per connection', () => {
  it('two concurrent calls on one connection make one lookup', async () => {
    const conn = cloudConn();
    await Promise.all([
      withResolvedSystemContext(conn, seen),
      withResolvedSystemContext(conn, seen),
    ]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('two different connections make two lookups', async () => {
    await withResolvedSystemContext(cloudConn(), seen);
    await withResolvedSystemContext(cloudConn(), seen);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('a rejected lookup is not cached', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const conn = cloudConn();
    lookup.mockRejectedValueOnce(new Error('ICM down'));
    await withResolvedSystemContext(conn, seen);
    const second = await withResolvedSystemContext(conn, seen);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ responsible: 'CB_USER' });
    warn.mockRestore();
  });

  it('an injected resolver is not served from the default cache', async () => {
    const conn = cloudConn();
    await withResolvedSystemContext(conn, seen);
    const injected: SystemContextResolver = jest.fn(async () => ({
      responsible: 'INJ',
      masterSystem: 'INJ_SYS',
    }));
    const result = await withResolvedSystemContext(conn, seen, injected);
    expect(injected).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      responsible: 'INJ',
      masterSystem: 'INJ_SYS',
    });
  });
});

describe('withResolvedSystemContext', () => {
  it('a scope carrying both makes no lookup and createAdtClient sees the scope', async () => {
    const conn = cloudConn();
    await runWithRequestContext(
      { responsible: 'ALICE', masterSystem: 'E19' },
      () =>
        withResolvedSystemContext(conn, () => {
          createAdtClient(conn);
        }),
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(lastOptions()).toMatchObject({
      responsible: 'ALICE',
      masterSystem: 'E19',
    });
  });

  it('a scope carrying responsible only gets the master system from the system', async () => {
    const conn = cloudConn();
    await runWithRequestContext({ responsible: 'ALICE' }, () =>
      withResolvedSystemContext(conn, () => {
        createAdtClient(conn);
      }),
    );
    expect(lastOptions()).toMatchObject({
      responsible: 'ALICE',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying responsible as undefined keeps it empty, and still fills the master system', async () => {
    // 10.1.0's rule, which this must not quietly overturn: a key the scope
    // carries has answered the question, even when its value is `undefined`.
    // Deciding by truthiness instead would fill exactly the case a host
    // deliberately emptied, and would make CLIENT_CONFIGURATION.md's
    // "present (even `undefined`) → the scope's value" row false on cloud.
    const conn = cloudConn();
    await runWithRequestContext({ responsible: undefined }, () =>
      withResolvedSystemContext(conn, () => {
        createAdtClient(conn);
      }),
    );
    expect(lastOptions()?.responsible).toBeUndefined();
    expect(lastOptions()).toMatchObject({ masterSystem: 'CLD' });
  });

  it('a scope carrying both keys as undefined asks the system nothing', async () => {
    const conn = cloudConn();
    await runWithRequestContext(
      { responsible: undefined, masterSystem: undefined },
      () =>
        withResolvedSystemContext(conn, () => {
          createAdtClient(conn);
        }),
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(lastOptions()?.responsible).toBeUndefined();
    expect(lastOptions()?.masterSystem).toBeUndefined();
  });

  it('with no scope and an empty process context, fills and keeps the process language', async () => {
    setSystemContext({ masterLanguage: 'EN' });
    const conn = cloudConn();
    await withResolvedSystemContext(conn, () => {
      createAdtClient(conn);
    });
    expect(lastOptions()).toEqual({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      masterLanguage: 'EN',
    });
  });

  it("keeps an outer scope's masterLanguage", async () => {
    const result = await runWithRequestContext({ masterLanguage: 'DE' }, () =>
      withResolvedSystemContext(cloudConn(), seen),
    );
    expect(result).toEqual({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      masterLanguage: 'DE',
    });
  });

  it('a null resolver makes no lookup', async () => {
    const result = await withResolvedSystemContext(cloudConn(), seen, null);
    expect(lookup).not.toHaveBeenCalled();
    expect(result.responsible).toBeUndefined();
  });

  it('a throwing lookup logs a warning, runs fn and does not throw', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    lookup.mockRejectedValue(new Error('ICM down'));
    const result = await withResolvedSystemContext(cloudConn(), seen);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(result.responsible).toBeUndefined();
    warn.mockRestore();
  });
});

/** A group whose handlers report the context they ran under. */
function fakeGroup(connection: IAbapConnection | null): IHandlerGroup & {
  context: HandlerContext;
} {
  const group = {
    context: { connection } as HandlerContext,
    getName: () => 'fake',
    registerHandlers: () => {},
    getHandlers(): HandlerEntry[] {
      return [
        {
          toolDefinition: { name: 'WithContext', description: 'd' } as never,
          handler: async (_context: HandlerContext, _args: unknown) => seen(),
        },
        {
          toolDefinition: { name: 'Closure', description: 'd' } as never,
          handler: (async (_args: unknown) => ({
            ...seen(),
            connection: group.context.connection,
          })) as never,
        },
      ];
    },
  };
  return group;
}

function exporterWith(
  groups: IHandlerGroup[],
  options?: ConstructorParameters<typeof HandlerExporter>[0],
): HandlerExporter {
  const exporter = new HandlerExporter(options);
  (exporter as unknown as { handlerGroups: IHandlerGroup[] }).handlerGroups =
    groups;
  return exporter;
}

describe('HandlerExporter.getHandlerEntries', () => {
  it('keeps every handler arity the embedders branch on', () => {
    const exporter = new HandlerExporter({ includeCompact: true });
    const raw = (
      exporter as unknown as { handlerGroups: IHandlerGroup[] }
    ).handlerGroups.flatMap((g) => g.getHandlers());
    const wrapped = exporter.getHandlerEntries();
    expect(wrapped.map((e) => e.handler.length)).toEqual(
      raw.map((e) => e.handler.length),
    );
    expect(wrapped.map((e) => e.toolDefinition)).toEqual(
      raw.map((e) => e.toolDefinition),
    );
    const arities = new Set(raw.map((e) => e.handler.length));
    expect(arities.has(1)).toBe(true);
  });

  it('a context+args handler runs with values filled from its connection', async () => {
    const exporter = exporterWith([fakeGroup(null)]);
    const entry = exporter.getHandlerEntries()[0];
    expect(entry.handler.length).toBe(2);
    await expect(
      entry.handler({ connection: cloudConn() }, {}),
    ).resolves.toMatchObject({ responsible: 'CB_USER', masterSystem: 'CLD' });
  });

  it("an args-only handler resolves the group's swapped connection", async () => {
    const group = fakeGroup(null);
    const entry = exporterWith([group]).getHandlerEntries()[1];
    expect(entry.handler.length).toBe(1);
    const conn = cloudConn();
    group.context = { connection: conn };
    const result = await (entry.handler as unknown as (a: unknown) => unknown)(
      {},
    );
    expect(result).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
      connection: conn,
    });
  });

  it('systemContextResolver: null disables resolution', async () => {
    const exporter = exporterWith([fakeGroup(null)], {
      systemContextResolver: null,
    });
    const result = await exporter
      .getHandlerEntries()[0]
      .handler({ connection: cloudConn() }, {});
    expect(lookup).not.toHaveBeenCalled();
    expect(result.responsible).toBeUndefined();
  });
});

class ReportingGroup extends BaseHandlerGroup {
  protected groupName = 'reporting';
  observed: ReturnType<typeof seen> | undefined;
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: { name: 'Report', description: 'd' } as never,
        handler: async () => {
          this.observed = seen();
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
    ];
  }
}

describe('BaseHandlerGroup.registerToolOnServer', () => {
  it('fills values from the group context connection', async () => {
    const group = new ReportingGroup({ connection: cloudConn() });
    let callback: ((args: unknown) => Promise<unknown>) | undefined;
    const server = {
      registerTool: (_n: string, _c: unknown, cb: typeof callback) => {
        callback = cb;
      },
    } as unknown as McpServer;
    group.registerHandlers(server);
    await callback?.({});
    expect(group.observed).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });
});

describe('BaseMcpServer.registerHandlers', () => {
  type Registered = Record<
    string,
    { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }
  >;

  function callTool(server: EmbeddableMcpServer, name: string) {
    const tools = (server as unknown as { _registeredTools: Registered })
      ._registeredTools;
    return tools[name].handler({});
  }

  function textOf(result: { content: { text: string }[] }) {
    return JSON.parse(result.content[0].text);
  }

  function jsonGroup(): IHandlerGroup {
    const inner = fakeGroup(null);
    return {
      ...inner,
      getHandlers: () =>
        inner.getHandlers().map((e) => ({
          ...e,
          handler: (e.handler.length >= 2
            ? async (c: HandlerContext, a: unknown) => ({
                content: [
                  { type: 'text', text: JSON.stringify(await e.handler(c, a)) },
                ],
              })
            : async (_a: unknown) => ({
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      await (e.handler as unknown as (a: unknown) => unknown)(
                        _a,
                      ),
                    ),
                  },
                ],
              })) as never,
        })),
    };
  }

  it('fills values for both handler arities', async () => {
    const server = new EmbeddableMcpServer({
      connection: cloudConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
    });
    expect(textOf(await callTool(server, 'WithContext'))).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    expect(textOf(await callTool(server, 'Closure'))).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('systemContextResolver: null disables resolution', async () => {
    const server = new EmbeddableMcpServer({
      connection: cloudConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemContextResolver: null,
    });
    const result = textOf(await callTool(server, 'WithContext'));
    expect(lookup).not.toHaveBeenCalled();
    expect(result.responsible).toBeUndefined();
  });
});
