/**
 * A tool whose schema depends on the variant (a type list) is checked on
 * the variant of the call — never on the fallback schema of no variant —
 * and, with no kind to read, refused `system_type_required` before
 * anything is acquired:
 *
 * - a search name only the cloud table offers (`SIA1`) and one only the
 *   on-premise table offers each pass on their own variant and are refused
 *   on the other — on the server, on a plain McpServer, through compact
 *   `HandlerSystem`'s target and through `HandlerExporter`;
 * - with no kind stated and none recorded on the connection, every
 *   variant-dependent long tool is refused `system_type_required` before
 *   the fresh-connection factory is called, on the server and on a plain
 *   McpServer.
 */

import { ADT_SEARCH_TYPES_ONPREM } from '@mcp-abap-adt/interfaces-adt';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { registerFreshConnectionFactory } from '../../../lib/packageSessions';
import { notASearchType, searchNameOf } from '../../../lib/searchTypes';
import { declareSystemKind } from '../../../lib/systemKind';

jest.setTimeout(60_000);

const saved = process.env.SAP_SYSTEM_TYPE;
beforeEach(() => {
  delete process.env.SAP_SYSTEM_TYPE;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
  jest.restoreAllMocks();
});

type Variant = 'onprem' | 'cloud';

/** A search name of the on-premise table the cloud one does not read. */
const ONPREM_ONLY =
  Object.keys(ADT_SEARCH_TYPES_ONPREM).find(
    (name) => searchNameOf('cloud', name) === undefined,
  ) ?? '';

/** A search name only that variant's table offers. */
const ONLY: Readonly<Record<Variant, string>> = {
  cloud: 'SIA1',
  onprem: ONPREM_ONLY,
};

it('the names are each one table’s alone', () => {
  expect(ONPREM_ONLY).not.toBe('');
  expect(searchNameOf('cloud', ONLY.cloud)).toBeDefined();
  expect(searchNameOf('onprem', ONLY.cloud)).toBeUndefined();
  expect(searchNameOf('onprem', ONLY.onprem)).toBeDefined();
  expect(searchNameOf('cloud', ONLY.onprem)).toBeUndefined();
});

/** A connection that records each request and answers 200 with no body. */
function recording() {
  const requests: string[] = [];
  const connection = {
    getBaseUrl: async () => 'https://system.example.invalid',
    makeAdtRequest: async (options: { url: string }) => {
      requests.push(options.url);
      return { status: 200, data: '' };
    },
  };
  return { connection, requests };
}

const textOf = (answer: { content?: Array<{ text?: string }> }): string =>
  (answer.content ?? []).map((c) => c.text ?? '').join('\n');

/** The type-list cases: each name on each variant, refused off its own. */
const TYPE_CASES = (['onprem', 'cloud'] as const).flatMap((variant) =>
  (['onprem', 'cloud'] as const).map(
    (owner) => [variant, owner, variant !== owner] as const,
  ),
);

const searchArgs = (type: string) => ({
  object_name: 'Z*',
  object_type: type,
  background: false,
});

/** The groups that serve the tools of these cases. */
function groups(context: HandlerContext): BaseHandlerGroup[] {
  return [
    new ReadOnlyHandlersGroup(context),
    new SearchHandlersGroup(context),
    new SystemHandlersGroup(context),
    new CompactReadOnlyHandlersGroup(context),
  ];
}

async function clientOn(server: McpServer | EmbeddableMcpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'variant-rules', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe.each(TYPE_CASES)(
  'on %s, the %s-only search name',
  (variant, owner, refused) => {
    const type = ONLY[owner];
    const words = notASearchType('object_type', type);
    const calls = [
      ['SearchObject', searchArgs(type)],
      ['HandlerSystem', { action: 'search_object', ...searchArgs(type) }],
    ] as const;

    it.each(calls)('the server: %s', async (tool, args) => {
      const { connection } = recording();
      declareSystemKind(connection, variant);
      const placeholder = {
        connection: null,
        logger: undefined,
      } as unknown as HandlerContext;
      const server = new EmbeddableMcpServer({
        connection: connection as never,
        systemType: variant,
        handlersRegistry: new CompositeHandlersRegistry(groups(placeholder)),
      });
      const client = await clientOn(server);
      try {
        const text = textOf(
          (await client.callTool({ name: tool, arguments: args })) as {
            content?: Array<{ text?: string }>;
          },
        );
        if (refused) expect(text).toContain(words);
        else expect(text).not.toContain(words);
      } finally {
        await client.close();
      }
    });

    it.each(calls)('a plain McpServer: %s', async (tool, args) => {
      const { connection } = recording();
      declareSystemKind(connection, variant);
      const context = {
        connection,
        logger: undefined,
        systemType: variant,
      } as unknown as HandlerContext;
      const group = groups(context).find((g) =>
        g.getHandlers().some((e) => e.toolDefinition.name === tool),
      );
      const entry = group
        ?.getHandlers()
        .find((e) => e.toolDefinition.name === tool);
      if (group === undefined || entry === undefined) throw new Error(tool);
      const server = new McpServer({ name: 'plain', version: '1.0.0' });
      group.registerOneTool(server, entry, async () => context);
      const client = await clientOn(server);
      try {
        const text = textOf(
          (await client.callTool({ name: tool, arguments: args })) as {
            content?: Array<{ text?: string }>;
          },
        );
        if (refused) expect(text).toContain(words);
        else expect(text).not.toContain(words);
      } finally {
        await client.close();
      }
    });

    it('compact HandlerSystem’s target, called through its entry', async () => {
      const { connection } = recording();
      declareSystemKind(connection, variant);
      const context = {
        connection,
        logger: undefined,
      } as unknown as HandlerContext;
      const entry = new CompactReadOnlyHandlersGroup(context)
        .getHandlers()
        .find((e) => e.toolDefinition.name === 'HandlerSystem');
      if (entry === undefined) throw new Error('HandlerSystem');
      const { background: _b, ...args } = searchArgs(type);
      const thrown = await entry
        .call(context, { action: 'search_object', ...args })
        .then(
          (answer) => textOf(answer),
          (error: Error) => error.message,
        );
      if (refused) expect(thrown).toContain(words);
      else expect(thrown).not.toContain(words);
    });

    it('HandlerExporter: SearchObject', async () => {
      const { connection } = recording();
      const entry = new HandlerExporter({ systemType: variant })
        .getHandlerEntries()
        .find((e) => e.toolDefinition.name === 'SearchObject');
      if (entry === undefined) throw new Error('SearchObject');
      const { background: _b, ...args } = searchArgs(type);
      const thrown = await entry
        .call({ connection, logger: undefined } as never, args)
        .then(
          (answer) => textOf(answer),
          (error: Error) => error.message,
        );
      if (refused) expect(thrown).toContain(words);
      else expect(thrown).not.toContain(words);
    });
  },
);

/** Each variant-dependent long tool, its arguments, no kind anywhere. */
const NO_KIND: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['GetObjectInfo', { parent_type: 'INVALID', parent_name: 'ZTEST' }],
  [
    'GetObjectsList',
    {
      parent_name: 'ZTEST',
      parent_tech_name: 'ZTEST',
      parent_type: 'INVALID',
    },
  ],
  ['GetWhereUsed', { object_name: 'ZTEST', object_type: 'INVALID' }],
  ['GetIncludesList', { object_name: 'ZTEST', object_type: 'PROG/P' }],
  ['SearchObject', { object_name: 'Z*', object_type: 'INVALID' }],
  ['HandlerGet', { object_type: 'CLASS', class_name: 'ZCL_A' }],
  ['HandlerSystem', { action: 'search_object', object_name: 'Z*' }],
];

describe('no kind stated or recorded: system_type_required before anything', () => {
  it.each(NO_KIND)('the server: %s', async (tool, args) => {
    const { connection, requests } = recording();
    const fresh = jest.fn(async () => {
      throw new Error('the factory was called');
    });
    const placeholder = {
      connection: null,
      logger: undefined,
    } as unknown as HandlerContext;
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      freshConnection: fresh,
      handlersRegistry: new CompositeHandlersRegistry(groups(placeholder)),
    });
    const client = await clientOn(server);
    try {
      const text = textOf(
        (await client.callTool({
          name: tool,
          arguments: { ...args, background: false },
        })) as { content?: Array<{ text?: string }> },
      );
      expect(text).toContain('system_type_required');
      expect(fresh).not.toHaveBeenCalled();
      expect(requests).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it.each(NO_KIND)('a plain McpServer: %s', async (tool, args) => {
    const { connection, requests } = recording();
    const fresh = jest.fn(async () => {
      throw new Error('the factory was called');
    });
    registerFreshConnectionFactory(connection, fresh as never);
    const context = {
      connection,
      logger: undefined,
    } as unknown as HandlerContext;
    const group = groups(context).find((g) =>
      g.getHandlers().some((e) => e.toolDefinition.name === tool),
    );
    const entry = group
      ?.getHandlers()
      .find((e) => e.toolDefinition.name === tool);
    if (group === undefined || entry === undefined) throw new Error(tool);
    const server = new McpServer({ name: 'plain', version: '1.0.0' });
    group.registerOneTool(server, entry, async () => context);
    const client = await clientOn(server);
    try {
      const text = textOf(
        (await client.callTool({ name: tool, arguments: args })) as {
          content?: Array<{ text?: string }>;
        },
      );
      expect(text).toContain('system_type_required');
      expect(fresh).not.toHaveBeenCalled();
      expect(requests).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
