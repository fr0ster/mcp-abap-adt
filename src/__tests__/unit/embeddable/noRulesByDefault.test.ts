/**
 * An embedder gets no rule unless it passes one: lib keeps the mechanism
 * (the resolver hook, the per-destination store, the main flow) and applies
 * none of the rules that name the responsible, the user and the system
 * (`@mcp-abap-adt/responsible-rules`, which the transports pass).
 *
 * - no kind is required at construction (`EmbeddableMcpServer`,
 *   `HandlerExporter`);
 * - nothing is looked up unless a resolver is passed (an instance, an
 *   exported handler, a handler group registered on its own);
 * - with a resolver and no rules, the information is applied, no
 *   information leaves the configured values and nothing is refused;
 * - the debugger's request user and a background run's caller are the
 *   stated value (the responsible, else the login).
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { HandlerContext } from '../../../handlers/interfaces';
import { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import {
  createDefaultHandlerExporter,
  HandlerExporter,
} from '../../../lib/handlers/HandlerExporter';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { runWithRequestContext } from '../../../lib/requestContext';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import {
  getStatedSystemContext,
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../../lib/systemContext';
import { shippedGroups } from '../backgroundRuns/harness';

const KEYS = ['SAP_SYSTEM_TYPE', 'SAP_USERNAME', 'SAP_RESPONSIBLE'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetSystemContextCache();
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetSystemContextCache();
});

/**
 * A host's connection that records every request; `systeminformation`
 * answers `answer` (a status other than 2xx is handed back as such).
 */
function recorded(answer: { status: number; data: string }) {
  const requests: Array<{ url: string }> = [];
  const connection = {
    getBaseUrl: async () => 'https://system.example.invalid',
    makeAdtRequest: async (options: { url: string }) => {
      requests.push(options);
      return options.url.includes('systeminformation')
        ? answer
        : { status: 200, data: '' };
    },
  };
  const lookups = () =>
    requests.filter((r) => r.url.includes('systeminformation')).length;
  return { connection, requests, lookups };
}

const NO_ENDPOINT = { status: 404, data: '' };
const NAMED = {
  status: 200,
  data: JSON.stringify({ userName: 'system_user', systemID: 'SID' }),
};

/** A group whose one tool reports the responsible it runs with. */
class ReportingGroup extends BaseHandlerGroup {
  protected groupName = 'reporting';
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: {
          name: 'Report',
          description: 'd',
          inputSchema: { type: 'object', properties: {} },
        } as never,
        handler: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                responsible: getStatedSystemContext().responsible ?? null,
              }),
            },
          ],
        }),
      },
    ];
  }
}

type Registered = Record<
  string,
  { handler: (args: unknown) => Promise<{ content: { text: string }[] }> }
>;

async function callTool(
  server: EmbeddableMcpServer,
  name: string,
  args: unknown = {},
) {
  const tools = (server as unknown as { _registeredTools: Registered })
    ._registeredTools;
  return tools[name].handler(args);
}

describe('no kind is required at construction', () => {
  it.each([
    ['nothing stated', undefined],
    ['a blank SAP_SYSTEM_TYPE', ' '],
    ['an SAP_SYSTEM_TYPE of no kind', 'abap-cloud'],
  ])(
    '%s: EmbeddableMcpServer and HandlerExporter construct, nothing sent',
    (_what, env) => {
      if (env !== undefined) process.env.SAP_SYSTEM_TYPE = env;
      const { connection, requests } = recorded(NO_ENDPOINT);
      expect(
        () => new EmbeddableMcpServer({ connection: connection as never }),
      ).not.toThrow();
      expect(() => new HandlerExporter()).not.toThrow();
      expect(() => createDefaultHandlerExporter()).not.toThrow();
      expect(requests).toEqual([]);
    },
  );
});

describe('nothing is looked up without a resolver', () => {
  it('an instance: its tool runs, no systeminformation sent, nothing refused', async () => {
    const { connection, lookups } = recorded(NO_ENDPOINT);
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: new CompositeHandlersRegistry([
        new ReportingGroup({ connection: null as never }),
      ]),
    });
    const result = await callTool(server, 'Report');
    expect(JSON.parse(result.content[0].text)).toEqual({ responsible: null });
    expect(lookups()).toBe(0);
  });

  it('an exporter: its handlers are handed out unwrapped', () => {
    const exporter = new HandlerExporter();
    const raw = (
      exporter as unknown as {
        handlerGroups: Array<{ getHandlers(): HandlerEntry[] }>;
      }
    ).handlerGroups.flatMap((g) =>
      g.getHandlers().map((e) => e.toolDefinition.name),
    );
    const wrapped = exporter.getHandlerEntries();
    expect(wrapped.map((e) => e.toolDefinition.name)).toEqual(raw);
    expect(wrapped.length).toBeGreaterThan(0);
  });

  it('a handler group registered on its own: no lookup unless its context carries a resolver', async () => {
    for (const [context, expected] of [
      [{}, 0],
      [{ systemContextResolver: defaultSystemContextResolver }, 1],
    ] as const) {
      const { connection, lookups } = recorded(NAMED);
      const group = new ReportingGroup({
        connection: connection as never,
        ...context,
      } as HandlerContext);
      let callback: ((args: unknown) => Promise<unknown>) | undefined;
      group.registerHandlers({
        registerTool: (_n: string, _c: unknown, cb: typeof callback) => {
          callback = cb;
        },
      } as unknown as McpServer);
      await callback?.({});
      expect(lookups()).toBe(expected);
    }
  });
});

describe('a resolver and no rules: the information applied, nothing refused', () => {
  it('the system names its user: it is the responsible', async () => {
    const { connection, lookups } = recorded(NAMED);
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: new CompositeHandlersRegistry([
        new ReportingGroup({ connection: null as never }),
      ]),
      systemContextResolver: defaultSystemContextResolver,
    });
    const result = await callTool(server, 'Report');
    expect(JSON.parse(result.content[0].text)).toEqual({
      responsible: 'system_user',
    });
    await callTool(server, 'Report');
    expect(lookups()).toBe(1);
  });

  it.each(['cloud', 'onprem'] as const)(
    'on %s no information and nothing stated: the tool runs as configured, no refusal',
    async (systemType) => {
      const { connection } = recorded(NO_ENDPOINT);
      const server = new EmbeddableMcpServer({
        connection: connection as never,
        handlersRegistry: new CompositeHandlersRegistry([
          new ReportingGroup({ connection: null as never }),
        ]),
        systemType,
        systemContextResolver: defaultSystemContextResolver,
      });
      const result = (await callTool(server, 'Report')) as {
        isError?: boolean;
        content: { text: string }[];
      };
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content[0].text)).toEqual({
        responsible: null,
      });
    },
  );
});

describe('a background run’s caller: the stated value', () => {
  const list = async (scope: { login?: string; responsible?: string }) => {
    const { connection, lookups } = recorded(NAMED);
    const strategy = new InMemoryBackgroundRuns();
    const listed = jest.spyOn(strategy, 'list');
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: shippedGroups(),
      backgroundRuns: strategy,
    });
    const result = (await runWithRequestContext(scope, () =>
      callTool(server, 'ListBackgroundRuns'),
    )) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(lookups()).toBe(0);
    return { result, user: listed.mock.calls.at(-1)?.[0].user };
  };

  it.each([
    ['responsible only', { responsible: 'resp_user' }, 'RESP_USER'],
    ['login only', { login: 'login_user' }, 'LOGIN_USER'],
    ['both', { responsible: 'resp_user', login: 'login_user' }, 'RESP_USER'],
  ])('%s: nothing looked up', async (_case, scope, expected) => {
    expect((await list(scope)).user).toBe(expected);
  });

  it('neither stated: system_user_unknown — the process SAP_USERNAME does not stand in', async () => {
    process.env.SAP_USERNAME = 'process_login';
    const none = await list({});
    expect(none.result.isError).toBe(true);
    expect(none.result.content[0].text).toContain('system_user_unknown');
  });
});
