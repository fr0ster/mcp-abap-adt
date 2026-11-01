/**
 * A plain registration (`registry.registerAllTools(mcpServer)` on an SDK
 * `McpServer`, the `./handlers` export) lists the variant its groups state
 * (`HandlerContext.systemType`, `HandlerExporter`'s `systemType`): the same
 * tools, descriptions, schemas and search `_meta` a `BaseMcpServer` stating
 * that variant lists for the same groups. With none stated, the definitions
 * as they are. `SAP_SYSTEM_TYPE` is read by neither: an embedded library
 * takes no configuration from the environment.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { SYSTEM_TYPE_REQUIRED_WORDS } from '../../../lib/auth/serverRefusal';
import { variantOf } from '../../../lib/clients';
import { noopLogger } from '../../../lib/handlerLogger';
import { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
  type IHandlerGroup,
  type IHandlersRegistry,
  type SapEnvironment,
  type ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';

import { type Counting, countingConnection } from '../../helpers/batchHarness';
import { silentLogger } from '../../helpers/lowToCompact';

jest.setTimeout(120_000);

type Listed = Awaited<ReturnType<Client['listTools']>>['tools'];

/** The `BaseMcpServer` the plain listing is compared with. */
class StatedServer extends BaseMcpServer {
  constructor(registry: IHandlersRegistry, systemType?: SapEnvironment) {
    super({
      name: 'plain-registration',
      version: '1.0.0',
      logger: noopLogger,
      ...(systemType !== undefined && { systemType }),
    });
    this.registerHandlers(registry);
  }
}

async function listedOn(server: McpServer): Promise<Listed> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'plain-registration', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    return [...tools].sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await client.close();
  }
}

/** What a plain SDK server lists for `registry`. */
async function plainListing(registry: IHandlersRegistry): Promise<Listed> {
  const server = new McpServer({ name: 'plain', version: '1.0.0' });
  registry.registerAllTools(server);
  return listedOn(server);
}

/** A case's registry and the definitions its groups hold. */
interface Registered {
  readonly registry: IHandlersRegistry;
  readonly definitions: readonly ToolDefinition[];
}

/** The groups each case registers, built afresh for each listing. */
const REGISTRIES: Readonly<
  Record<string, (systemType?: SapEnvironment) => Registered>
> = {
  'HandlerExporter (./handlers)': (systemType) => {
    const exporter = new HandlerExporter({
      includeDebug: true,
      ...(systemType !== undefined && { systemType }),
    });
    return {
      registry: exporter.createRegistry(),
      definitions: exporter
        .getHandlerEntries()
        .map((entry) => entry.toolDefinition),
    };
  },
  'the compact groups': (systemType) => {
    const groups = compactToolSet.groups(
      {
        ...noConnectionContext(),
        ...(systemType !== undefined && { systemType }),
      },
      'stdio',
    );
    return {
      registry: new CompositeHandlersRegistry(groups),
      definitions: groups
        .flatMap((group) => group.getHandlers())
        .map((entry) => entry.toolDefinition),
    };
  },
};

describe.each(Object.entries(REGISTRIES))(
  'a plain registration of %s',
  (_label, registeredFor) => {
    const registryFor = (systemType?: SapEnvironment) =>
      registeredFor(systemType).registry;
    const previous = process.env.SAP_SYSTEM_TYPE;
    beforeEach(() => {
      delete process.env.SAP_SYSTEM_TYPE;
    });
    afterAll(() => {
      if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = previous;
      resetProcessLatchForTests();
    });

    it.each<SapEnvironment>(['cloud', 'onprem'])(
      'stating %s lists what a BaseMcpServer stating it lists: tools, descriptions, schemas, search members',
      async (systemType) => {
        const plain = await plainListing(registryFor(systemType));
        const stated = await listedOn(
          new StatedServer(registryFor(systemType), systemType),
        );
        expect(plain).toEqual(stated);
      },
    );

    it('cloud and onprem list differently (the comparison is not vacuous)', async () => {
      const cloud = await plainListing(registryFor('cloud'));
      const onprem = await plainListing(registryFor('onprem'));
      expect(cloud).not.toEqual(onprem);
    });

    it('stating none lists the definitions as they are', async () => {
      const { registry, definitions } = registeredFor();
      const plain = await plainListing(registry);
      expect(plain).toEqual(await listedOn(new StatedServer(registryFor())));
      expect(plain.map((tool) => tool.name)).toEqual(
        definitions
          .map((definition) => definition.name)
          .sort((a, b) => a.localeCompare(b)),
      );
      const described = new Map(
        definitions.map((definition) => [
          definition.name,
          definition.description,
        ]),
      );
      for (const tool of plain) {
        expect(tool.description).toBe(described.get(tool.name));
      }
    });

    it.each<SapEnvironment | undefined>(['cloud', 'onprem', undefined])(
      'registerTool lists each tool as registerAllTools does where the groups state %s',
      async (systemType) => {
        const { registry, definitions } = registeredFor(systemType);
        const all = await plainListing(registry);
        const server = new McpServer({ name: 'single', version: '1.0.0' });
        for (const definition of definitions) {
          registry.registerTool(
            server,
            definition.name,
            definition,
            async () => ({
              content: [],
            }),
          );
        }
        const single = await listedOn(server);
        const shown = (tools: Listed) =>
          tools.map((tool) => [tool.name, tool.description, tool._meta]);
        expect(shown(single)).toEqual(shown(all));
      },
    );

    it.each<SapEnvironment | undefined>(['cloud', 'onprem', undefined])(
      'getRegisteredTools names exactly the tools listed where %s is stated',
      async (systemType) => {
        const { registry } = registeredFor(systemType);
        const listed = await plainListing(registry);
        expect(
          [...registry.getRegisteredTools()].sort((a, b) => a.localeCompare(b)),
        ).toEqual(listed.map((tool) => tool.name));
      },
    );

    it('SAP_SYSTEM_TYPE changes nothing on the plain path', async () => {
      const unstated = await plainListing(registryFor());
      const stated = await plainListing(registryFor('onprem'));
      process.env.SAP_SYSTEM_TYPE = 'cloud';
      expect(await plainListing(registryFor())).toEqual(unstated);
      expect(await plainListing(registryFor('onprem'))).toEqual(stated);
    });
  },
);

/**
 * Groups that state different variants are refused at registration, before
 * anything is registered; the error names each group and what it states.
 * `registerAllTools` takes groups that state one variant beside groups that
 * state none (each lists as its own context says); `registerTool`, which
 * belongs to no group, takes only one variant stated by every group, or none
 * stated by any.
 */
describe('a plain registration of groups that state different variants', () => {
  const searchOn = (systemType?: SapEnvironment) =>
    new SearchHandlersGroup({
      ...noConnectionContext(),
      ...(systemType !== undefined && { systemType }),
    });
  const systemOn = (systemType?: SapEnvironment) =>
    new SystemHandlersGroup({
      ...noConnectionContext(),
      ...(systemType !== undefined && { systemType }),
    });

  /** A server holding one tool of its own, registered first. */
  const withSentinel = () => {
    const server = new McpServer({ name: 'sentinel', version: '1.0.0' });
    server.registerTool('Sentinel', { description: 'Sentinel.' }, async () => ({
      content: [],
    }));
    return server;
  };
  const someDefinition = () => {
    const [entry] = searchOn().getHandlers();
    if (entry === undefined) throw new Error('the search group has a tool');
    return entry.toolDefinition;
  };

  it('registerAllTools refuses cloud beside onprem, naming each group and its variant, and registers nothing', async () => {
    const registry = new CompositeHandlersRegistry([
      searchOn('cloud'),
      systemOn('onprem'),
    ]);
    const server = withSentinel();
    expect(() => registry.registerAllTools(server)).toThrow(
      'The handler groups state different system types: SearchHandlers states cloud, SystemHandlers states onprem',
    );
    expect((await listedOn(server)).map((tool) => tool.name)).toEqual([
      'Sentinel',
    ]);
    expect(registry.getRegisteredTools()).toEqual([]);
  });

  it('registerAllTools takes a group stating a variant beside one stating none', () => {
    const registry = new CompositeHandlersRegistry([
      searchOn('cloud'),
      systemOn(),
    ]);
    expect(() => registry.registerAllTools(withSentinel())).not.toThrow();
  });

  it.each<
    [string, SapEnvironment | undefined, SapEnvironment | undefined, string]
  >([
    [
      'cloud beside onprem',
      'cloud',
      'onprem',
      'The handler groups state different system types: SearchHandlers states cloud, SystemHandlers states onprem',
    ],
    [
      'cloud beside none',
      'cloud',
      undefined,
      'The handler groups state different system types: SearchHandlers states cloud, SystemHandlers states none',
    ],
  ])(
    'registerTool refuses %s, naming each group, and registers nothing',
    async (_label, search, system, words) => {
      const registry = new CompositeHandlersRegistry([
        searchOn(search),
        systemOn(system),
      ]);
      const definition = someDefinition();
      const server = withSentinel();
      expect(() =>
        registry.registerTool(
          server,
          definition.name,
          definition,
          async () => ({
            content: [],
          }),
        ),
      ).toThrow(words);
      expect((await listedOn(server)).map((tool) => tool.name)).toEqual([
        'Sentinel',
      ]);
    },
  );

  it.each<[string, SapEnvironment | undefined]>([
    ['none stated by any group', undefined],
    ['cloud stated by every group', 'cloud'],
  ])('registerTool takes %s', (_label, systemType) => {
    const registry = new CompositeHandlersRegistry([
      searchOn(systemType),
      systemOn(systemType),
    ]);
    const definition = someDefinition();
    expect(() =>
      registry.registerTool(
        withSentinel(),
        definition.name,
        definition,
        async () => ({ content: [] }),
      ),
    ).not.toThrow();
  });
});

/**
 * A call on the plain path takes its variant only from the groups' stated
 * `systemType`: with none stated it is refused `system_type_required`
 * whatever `SAP_SYSTEM_TYPE` says, before anything is sent.
 */
describe('a call on the plain path', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  afterEach(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  /** Answers the variant its call's ADT client is built for (`variantOf`). */
  class VariantProbeGroup extends BaseHandlerGroup {
    protected groupName = 'VariantProbe';
    getHandlers(): HandlerEntry[] {
      return [
        defineTool(
          {
            name: 'VariantProbe',
            description: 'Answers the variant of the call.',
            inputSchema: { type: 'object', properties: {} },
          },
          // Both parameters declared: the form decides how it is called.
          async (context, _args) => ({
            content: [{ type: 'text', text: variantOf(context.connection) }],
          }),
        ),
      ];
    }
  }

  async function probe(systemType: SapEnvironment | undefined) {
    const counting = countingConnection('document', undefined);
    const context: HandlerContext = {
      connection: counting.connection,
      logger: silentLogger,
      ...(systemType !== undefined && { systemType }),
    };
    const server = new McpServer({ name: 'plain-call', version: '1.0.0' });
    new CompositeHandlersRegistry([
      new VariantProbeGroup(context),
    ]).registerAllTools(server);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'plain-call', version: '1.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const answer = await client.callTool({
        name: 'VariantProbe',
        arguments: {},
      });
      return { answer: JSON.stringify(answer), sent: counting.sent };
    } finally {
      await client.close();
    }
  }

  it('with no systemType stated and SAP_SYSTEM_TYPE=cloud, is refused system_type_required, nothing sent', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    const { answer, sent } = await probe(undefined);
    expect(answer).toContain(SYSTEM_TYPE_REQUIRED_WORDS);
    expect(answer).toContain('"isError":true');
    expect(sent).toEqual([]);
  });

  it.each<[SapEnvironment, string]>([
    ['cloud', 'onprem'],
    ['onprem', 'cloud'],
  ])(
    'with systemType %s stated, runs on it whatever SAP_SYSTEM_TYPE (%s) says',
    async (systemType, environment) => {
      process.env.SAP_SYSTEM_TYPE = environment;
      const { answer } = await probe(systemType);
      expect(JSON.parse(answer)).toEqual({
        content: [{ type: 'text', text: systemType }],
      });
    },
  );
});

/**
 * The plain path calls each handler in the form it takes, as a server
 * instance does (`callInItsForm`): a handler declaring `(context, args)` gets
 * both, an args-only one (`(args) => handleX(this.context, args)`, every
 * compact and readonly tool) gets its arguments with its group's context set
 * for the call. Each tool answers on a plain `McpServer` as it answers
 * through a `BaseMcpServer` (`EmbeddableMcpServer`) on the same groups.
 */
describe('a plain registration calls each handler in the form it takes', () => {
  const groupsOn = (context: HandlerContext): IHandlerGroup[] => [
    ...compactToolSet.groups(context, 'stdio'),
    new ReadOnlyHandlersGroup(context),
    new BackgroundRunHandlersGroup(context),
  ];
  const contextOn = (counting: Counting): HandlerContext => ({
    connection: counting.connection,
    logger: silentLogger,
    systemType: 'onprem',
  });

  async function called(
    server: McpServer,
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'plain-form', version: '1.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      return JSON.stringify(await client.callTool({ name, arguments: args }));
    } finally {
      await client.close();
    }
  }

  async function onPlain(name: string, args: Record<string, unknown>) {
    const counting = countingConnection('document', undefined);
    const server = new McpServer({ name: 'plain-form', version: '1.0.0' });
    new CompositeHandlersRegistry(
      groupsOn(contextOn(counting)),
    ).registerAllTools(server);
    return { answer: await called(server, name, args), sent: counting.sent };
  }

  async function onServer(name: string, args: Record<string, unknown>) {
    const counting = countingConnection('document', undefined);
    const embedded = new EmbeddableMcpServer({
      connection: counting.connection,
      systemType: 'onprem',
      logger: noopLogger,
      handlersRegistry: new CompositeHandlersRegistry(
        groupsOn(contextOn(counting)),
      ),
    });
    return {
      answer: await called(embedded, name, args),
      sent: counting.sent,
    };
  }

  it.each<[string, string, Record<string, unknown>]>([
    [
      'a compact tool (args-only)',
      'HandlerCheckRun',
      { object_type: 'CLASS', object_name: 'ZCL_PLACEHOLDER' },
    ],
    [
      'a readonly tool (args-only)',
      'GetProgram',
      { program_name: 'ZPLACEHOLDER' },
    ],
    ['a context-taking tool', 'ListBackgroundRuns', {}],
  ])('%s answers as through a BaseMcpServer', async (_label, name, args) => {
    const plain = await onPlain(name, args);
    const served = await onServer(name, args);
    expect(plain).toEqual(served);
    expect(plain.answer).not.toContain('Cannot read properties');
  });
});
