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
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import type { HandlerContext } from '../../handlers/interfaces';
import { createAdtClient } from '../../lib/clients';
import { createAbapConnection } from '../../lib/connectionFactory';
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

const credential: IAuthProvider = {
  kind: 'test',
  prepare: async () => ({ ok: true as const }),
  establish: async () => ({ ok: true as const }),
  authorize: async () => ({ ok: true as const }),
  rejected: async () => ({ ok: true as const }),
};

/**
 * Connections built by the factory, so the system kind is the one they were
 * built for: a jwt is cloud, anything else on-premise, SAP_SYSTEM_TYPE wins.
 * The URL decides nothing.
 */
function built(settings: Partial<SapConfig>): IAbapConnection {
  return createAbapConnection(settings as SapConfig, credential);
}

function cloudConn(): IAbapConnection {
  return built({ url: 'https://system.example.invalid', authType: 'jwt' });
}

/** An https URL without a port: a URL guess could not call it on-premise. */
function onPremConn(): IAbapConnection {
  return built({ url: 'https://system.example.invalid', authType: 'basic' });
}

/** A connection the factory did not build (an embedder's own). */
function foreignConn(url: string): IAbapConnection {
  return { getBaseUrl: async () => url } as unknown as IAbapConnection;
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

const savedSystemType = process.env.SAP_SYSTEM_TYPE;
afterEach(() => {
  if (savedSystemType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = savedSystemType;
});

beforeEach(() => {
  delete process.env.SAP_SYSTEM_TYPE;
  resetSystemContextCache();
  setSystemContext({});
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

  it('returns null on-premise without asking the system, whatever the URL', async () => {
    await expect(defaultSystemContextResolver(onPremConn())).resolves.toBe(
      null,
    );
    await expect(
      defaultSystemContextResolver(
        built({
          url: 'https://system.abap.example.hana.ondemand.com',
          authType: 'basic',
        }),
      ),
    ).resolves.toBe(null);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('SAP_SYSTEM_TYPE states the kind: a jwt on-premise is not asked', async () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    await expect(defaultSystemContextResolver(cloudConn())).resolves.toBe(null);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    ['https://system.abap.example.hana.ondemand.com'],
    ['https://system.example.invalid'],
  ])(
    'a connection the factory did not build: SAP_SYSTEM_TYPE alone, never the URL (%s)',
    async (url) => {
      await expect(
        defaultSystemContextResolver(foreignConn(url)),
      ).resolves.toBe(null);
      expect(lookup).not.toHaveBeenCalled();
      process.env.SAP_SYSTEM_TYPE = 'cloud';
      await expect(
        defaultSystemContextResolver(foreignConn(url)),
      ).resolves.toEqual({ responsible: 'CB_USER', masterSystem: 'CLD' });
      expect(lookup).toHaveBeenCalledTimes(1);
    },
  );

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
      { responsible: 'ALICE', masterSystem: 'SID' },
      () =>
        withResolvedSystemContext(conn, () => {
          createAdtClient(conn);
        }),
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(lastOptions()).toMatchObject({
      responsible: 'ALICE',
      masterSystem: 'SID',
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

  it('a scope carrying responsible as undefined is filled from the system, like an absent one', async () => {
    // Ruling 17: a host that always enters a scope with both keys — values
    // possibly undefined (cloud-llm-hub) — must still get the cloud values.
    // An empty value is missing, whether its key is present or not.
    const conn = cloudConn();
    await runWithRequestContext({ responsible: undefined }, () =>
      withResolvedSystemContext(conn, () => {
        createAdtClient(conn);
      }),
    );
    expect(lastOptions()).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying both keys as undefined asks the system and fills both', async () => {
    const conn = cloudConn();
    await runWithRequestContext(
      { responsible: undefined, masterSystem: undefined },
      () =>
        withResolvedSystemContext(conn, () => {
          createAdtClient(conn);
        }),
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lastOptions()).toMatchObject({
      responsible: 'CB_USER',
      masterSystem: 'CLD',
    });
  });

  it('a scope carrying both keys as undefined does not inherit the process values', async () => {
    // Key presence still decides against the process cache: what stops one
    // user's process-wide value reaching another user's scope.
    setSystemContext({ responsible: 'PROC_USER', masterSystem: 'PROC_SYS' });
    const result = await runWithRequestContext(
      { responsible: undefined, masterSystem: undefined },
      () => withResolvedSystemContext(onPremConn(), seen),
    );
    expect(result.responsible).toBeUndefined();
    expect(result.masterSystem).toBeUndefined();
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
    // The class only: a lookup's message may quote what the system answered (H4).
    expect(String(warn.mock.calls[0][0])).toContain('Error');
    expect(String(warn.mock.calls[0][0])).not.toContain('ICM down');
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
    const exporter = new HandlerExporter({});
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

  it.each([
    ['cloud', 1, { responsible: 'CB_USER', masterSystem: 'CLD' }],
    ['onprem', 0, {}],
  ] as const)(
    "an injected connection: the server's systemType %s states the kind, SAP_SYSTEM_TYPE unset",
    async (systemType, lookups, expected) => {
      const server = new EmbeddableMcpServer({
        connection: foreignConn(
          'https://system.abap.example.hana.ondemand.com',
        ) as never,
        handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
        systemType,
      });
      const result = textOf(await callTool(server, 'WithContext'));
      expect(lookup).toHaveBeenCalledTimes(lookups);
      expect(result).toMatchObject(expected);
      if (lookups === 0) expect(result.masterSystem).toBeUndefined();
    },
  );

  it("two servers stating systemType 'cloud' over one connection make one lookup", async () => {
    // A host builds a server per request: the memo must span server instances.
    const connection = foreignConn(
      'https://system.abap.example.hana.ondemand.com',
    );
    for (let i = 0; i < 2; i++) {
      const server = new EmbeddableMcpServer({
        connection: connection as never,
        handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
        systemType: 'cloud',
      });
      expect(textOf(await callTool(server, 'WithContext'))).toMatchObject({
        responsible: 'CB_USER',
        masterSystem: 'CLD',
      });
    }
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("a factory-built connection follows its recorded settings, not the server's systemType", async () => {
    const server = new EmbeddableMcpServer({
      connection: onPremConn() as never,
      handlersRegistry: new CompositeHandlersRegistry([jsonGroup()]),
      systemType: 'cloud',
    });
    await callTool(server, 'WithContext');
    expect(lookup).not.toHaveBeenCalled();
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
