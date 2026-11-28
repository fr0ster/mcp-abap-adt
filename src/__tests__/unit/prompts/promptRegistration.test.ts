/**
 * Where the prompts are registered: a `BaseMcpServer` lists them from the
 * tools it listed (its composite branch), `prompts: false` lists none and
 * declares no `prompts` capability, and a registry registering its own tools
 * gets none. The source a server builds equals the test helper's for every
 * binary's set.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import { InMemoryBackgroundRuns } from '../../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { compactToolSet } from '../../../../compact/src/launcher';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { ServedTransport } from '../../../lib/config/binaries';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type {
  IHandlersRegistry,
  SapEnvironment,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { registerAbapPrompts } from '../../../lib/prompts/register';
import { membersOn } from '../../../lib/prompts/source';
import type { AbapPrompt, PromptSource } from '../../../lib/prompts/types';
import { registryOf, type ToolSet } from '../../../lib/toolSet';
import { completionOf } from '../../helpers/promptCalls';
import { promptSourceFor } from '../../helpers/promptSources';
import { KINDS, TRANSPORTS, toolSets } from '../../helpers/servedTools';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** How a test server is built. */
interface ServerOptions {
  readonly systemType?: SapEnvironment;
  readonly prompts?: boolean;
  readonly backgroundRuns?: boolean;
  readonly stateHandleArgument?: boolean;
}

/** A server registering `registry` as every binary does, reading back its prompts. */
class PromptServer extends BaseMcpServer {
  constructor(
    registry: IHandlersRegistry | undefined,
    options: ServerOptions = {},
  ) {
    super({
      name: 'prompt-registration',
      logger: silent,
      systemType: options.systemType,
      systemTypeFromEnvironment: false,
      prompts: options.prompts,
      stateHandleArgument: options.stateHandleArgument,
      ...(options.backgroundRuns === true && {
        backgroundRuns: new InMemoryBackgroundRuns(),
      }),
    });
    if (registry !== undefined) this.registerHandlers(registry);
  }

  register(registry: IHandlersRegistry): void {
    this.registerHandlers(registry);
  }

  get source(): PromptSource | undefined {
    return this.promptSource;
  }

  get prompts(): readonly AbapPrompt[] {
    return this.listedPrompts;
  }
}

async function connected(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'prompt-registration', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const compactOnprem = () =>
  new PromptServer(registryOf(compactToolSet, 'stdio', { dataTools: false }), {
    systemType: 'onprem',
    backgroundRuns: true,
  });

describe('BaseMcpServer lists the prompts', () => {
  it('the compact stdio set on onprem answers prompts/list with all nine', async () => {
    const client = await connected(compactOnprem());
    try {
      const { prompts } = await client.listPrompts();
      assert.deepEqual(
        prompts.map(({ name }) => name),
        [
          'create',
          'get',
          'update',
          'delete',
          'activate',
          'check',
          'unit_test',
          'where_used',
          'transport',
        ],
      );
    } finally {
      await client.close();
    }
  });

  it('prompts: false declares no prompts capability and refuses prompts/list', async () => {
    const server = new PromptServer(
      registryOf(compactToolSet, 'stdio', { dataTools: false }),
      { systemType: 'onprem', backgroundRuns: true, prompts: false },
    );
    assert.deepEqual(server.prompts, []);
    const client = await connected(server);
    try {
      assert.equal(client.getServerCapabilities()?.prompts, undefined);
      await assert.rejects(client.listPrompts(), (error: Error) => {
        assert.ok(error instanceof McpError);
        assert.equal(error.code, ErrorCode.MethodNotFound);
        return true;
      });
    } finally {
      await client.close();
    }
  });

  it('a second registration rebuilds the prompts from every tool listed so far', async () => {
    const server = new PromptServer(undefined, {
      systemType: 'onprem',
      backgroundRuns: true,
    });
    server.register(
      registryOf(toolSets.stdio['core-ro'], 'stdio', { dataTools: false }),
    );
    assert.deepEqual(
      server.prompts.map(({ name }) => name),
      ['get', 'check', 'where_used', 'transport'],
    );
    server.register(registryOf(compactToolSet, 'stdio', { dataTools: false }));
    const client = await connected(server);
    try {
      const listed = (await client.listPrompts()).prompts.map(
        ({ name }) => name,
      );
      assert.deepEqual(
        listed,
        server.prompts.map(({ name }) => name),
      );
      assert.equal(listed.length, 9);
      const source = server.source;
      assert.ok(source);
      assert.ok(source.tools.has('GetClass'), 'the first registration stays');
      assert.ok(source.tools.has('HandlerCreate'), 'the second one joins');
      // Each prompt serves at least the types the compact set alone serves:
      // a full read the first registration listed hides no compact update.
      const alone = new PromptServer(
        registryOf(compactToolSet, 'stdio', { dataTools: false }),
        { systemType: 'onprem', backgroundRuns: true },
      );
      for (const prompt of alone.prompts) {
        const joined = server.prompts.find(({ name }) => name === prompt.name);
        assert.ok(joined, `${prompt.name} stays listed`);
        const closed = prompt.name === 'transport' ? 'action' : 'object_type';
        const served = new Set(await completionOf(joined, closed));
        assert.deepEqual(
          (await completionOf(prompt, closed)).filter(
            (value) => !served.has(value),
          ),
          [],
          `${prompt.name} serves the compact types`,
        );
      }
    } finally {
      await client.close();
    }
  });

  it('transport answers prompts/get with an argument its action reads none of', async () => {
    for (const [kind, args, headline] of [
      [
        'core',
        { action: 'get', number: 'SOME_TASK', description: 'unread' },
        'Get the transport request or task "SOME_TASK".',
      ],
      [
        'core-ro',
        { action: 'list', object_type: 'class' },
        'List transport requests.',
      ],
    ] as const) {
      const server = new PromptServer(
        registryOf(toolSets.stdio[kind], 'stdio', { dataTools: false }),
        { systemType: 'onprem', backgroundRuns: true },
      );
      const client = await connected(server);
      try {
        const { messages } = await client.getPrompt({
          name: 'transport',
          arguments: args,
        });
        const [first] = messages;
        assert.ok(first?.content.type === 'text', kind);
        assert.ok(first.content.text.startsWith(`${headline}\n`), kind);
      } finally {
        await client.close();
      }
    }
  });

  it('legacy lists no prompt', () => {
    const server = new PromptServer(
      registryOf(compactToolSet, 'stdio', { dataTools: false }),
      { systemType: 'legacy', backgroundRuns: true },
    );
    assert.equal(server.source, undefined);
    assert.deepEqual(server.prompts, []);
  });

  it('a registry registering its own tools lists no prompt', async () => {
    const own: IHandlersRegistry = {
      registerAllTools(server) {
        server.registerTool('Own', { description: 'answers' }, async () => ({
          content: [{ type: 'text', text: 'own' }],
        }));
      },
      registerTool() {},
      getRegisteredTools: () => ['Own'],
    };
    const server = new PromptServer(own, { systemType: 'onprem' });
    assert.equal(server.source, undefined);
    assert.deepEqual(server.prompts, []);
    const client = await connected(server);
    try {
      assert.equal(client.getServerCapabilities()?.prompts, undefined);
    } finally {
      await client.close();
    }
  });
});

describe('EmbeddableMcpServer passes prompts through', () => {
  const embedded = (prompts?: boolean) =>
    new EmbeddableMcpServer({
      connection: {} as never,
      systemType: 'onprem',
      handlersRegistry: registryOf(compactToolSet, 'stdio', {
        dataTools: false,
      }),
      ...(prompts !== undefined && { prompts }),
    });

  it('absent, the prompts are listed', async () => {
    const client = await connected(embedded());
    try {
      assert.ok((await client.listPrompts()).prompts.length > 0);
    } finally {
      await client.close();
    }
  });

  it('false, no prompts capability is declared', async () => {
    const client = await connected(embedded(false));
    try {
      assert.equal(client.getServerCapabilities()?.prompts, undefined);
    } finally {
      await client.close();
    }
  });
});

/** What a source states, comparable across two builds of the same set. */
function statedBy(source: PromptSource) {
  return {
    kind: source.kind,
    stateHandle: source.stateHandle,
    tools: [...source.tools.values()]
      .map((tool) => ({
        name: tool.definition.name,
        members: membersOn(tool, source.kind),
        inputSchema: z.toJSONSchema(tool.inputSchema, { io: 'input' }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function serverSource(
  set: ToolSet,
  transport: ServedTransport,
): PromptSource | undefined {
  return new PromptServer(registryOf(set, transport, { dataTools: false }), {
    systemType: 'onprem',
    backgroundRuns: set.backgroundRuns,
    stateHandleArgument: transport === 'http',
  }).source;
}

describe("the server's prompt source equals the helper's", () => {
  for (const transport of TRANSPORTS) {
    for (const kind of KINDS) {
      it(`${kind} on ${transport}, onprem`, () => {
        const set = toolSets[transport][kind];
        const source = serverSource(set, transport);
        assert.ok(source, 'the composite branch builds a source');
        assert.deepEqual(
          statedBy(source),
          statedBy(
            promptSourceFor(set, 'onprem', {
              transport,
              backgroundRuns: set.backgroundRuns,
            }),
          ),
        );
      });
    }
  }
});

/** The registry `exporter.createRegistry()` hands out. */
const exportedRegistry = (exporter: HandlerExporter) =>
  exporter.createRegistry();

/** The arguments a prompt's closed set is completed for. */
const CLOSED_ARGUMENTS = ['object_type', 'action'];

/**
 * What `client`'s server answers: its listing, and for each prompt and each
 * value its closed argument completes, the text (or the refusal) of a
 * `prompts/get` with every required argument filled.
 */
async function answers(client: Client) {
  const { prompts } = await client.listPrompts();
  const gets: Array<{ prompt: string; value: string; outcome: string }> = [];
  for (const prompt of prompts) {
    const closed = prompt.arguments?.find(({ name }) =>
      CLOSED_ARGUMENTS.includes(name),
    );
    assert.ok(closed, `${prompt.name} takes a closed argument`);
    const { completion } = await client.complete({
      ref: { type: 'ref/prompt', name: prompt.name },
      argument: { name: closed.name, value: '' },
    });
    for (const value of completion.values) {
      const args: Record<string, string> = {};
      for (const argument of prompt.arguments ?? []) {
        if (argument.name === closed.name) args[argument.name] = value;
        else if (argument.required === true) args[argument.name] = 'SOME_NAME';
      }
      const outcome = await client
        .getPrompt({ name: prompt.name, arguments: args })
        .then(
          ({ messages }) =>
            messages
              .map(({ content }) =>
                content.type === 'text' ? content.text : content.type,
              )
              .join('\n'),
          (error: Error) => error.message,
        );
      gets.push({ prompt: prompt.name, value, outcome });
    }
  }
  return { prompts, gets };
}

/** An SDK server with `registry`'s tools registered plainly, and its prompts. */
function plainServer(registry: CompositeHandlersRegistry): McpServer {
  const server = new McpServer({ name: 'plain', version: '1' });
  registry.registerAllTools(server);
  registerAbapPrompts(server, registry);
  return server;
}

const noConnection = () => {
  throw new Error('no call reaches a connection here');
};

describe('registerAbapPrompts: the opt-in for a plain registration', () => {
  it('registerAllTools alone lists no prompt', async () => {
    const server = new McpServer({ name: 'plain', version: '1' });
    exportedRegistry(
      new HandlerExporter({ systemType: 'onprem' }),
    ).registerAllTools(server);
    const client = await connected(server);
    try {
      assert.equal(client.getServerCapabilities()?.prompts, undefined);
      await assert.rejects(client.listPrompts(), (error: Error) => {
        assert.ok(error instanceof McpError);
        assert.equal(error.code, ErrorCode.MethodNotFound);
        return true;
      });
    } finally {
      await client.close();
    }
  });

  const cases: ReadonlyArray<{
    readonly name: string;
    readonly systemType: SapEnvironment | undefined;
    readonly registry: () => CompositeHandlersRegistry;
  }> = [
    {
      name: "the exporter's groups on onprem",
      systemType: 'onprem',
      registry: () =>
        exportedRegistry(new HandlerExporter({ systemType: 'onprem' })),
    },
    {
      name: "the exporter's groups on cloud",
      systemType: 'cloud',
      registry: () =>
        exportedRegistry(new HandlerExporter({ systemType: 'cloud' })),
    },
    {
      name: 'the compact groups, no kind stated',
      systemType: undefined,
      registry: () => registryOf(compactToolSet, 'stdio', { dataTools: false }),
    },
  ];
  for (const { name, systemType, registry } of cases) {
    it(`lists what BaseMcpServer lists, texts included: ${name}`, async () => {
      const plain = await connected(plainServer(registry()));
      const served = await connected(
        new PromptServer(registry(), {
          ...(systemType !== undefined && { systemType }),
        }),
      );
      try {
        const expected = await answers(served);
        assert.ok(expected.prompts.length > 0);
        assert.deepEqual(await answers(plain), expected);
      } finally {
        await plain.close();
        await served.close();
      }
    });
  }

  it('plainListing lists the tools registerAllTools registers', () => {
    for (const registry of [
      registryOf(compactToolSet, 'stdio', { dataTools: false }),
      exportedRegistry(new HandlerExporter({ systemType: 'cloud' })),
    ]) {
      registry.registerAllTools(new McpServer({ name: 'plain', version: '1' }));
      assert.deepEqual(
        registry
          .plainListing()
          .tools.map(({ definition }) => definition.name)
          .sort(),
        registry.getRegisteredTools().sort(),
      );
    }
  });

  it('groups stating different kinds are refused before any prompt', () => {
    const registry = new CompositeHandlersRegistry([
      ...exportedRegistry(
        new HandlerExporter({ systemType: 'onprem' }),
      ).getHandlerGroups(),
      ...exportedRegistry(
        new HandlerExporter({ systemType: 'cloud' }),
      ).getHandlerGroups(),
    ]);
    const server = new McpServer({ name: 'plain', version: '1' });
    assert.throws(() => registerAbapPrompts(server, registry), {
      message: /^The handler groups state different system types: /,
    });
  });

  it('legacy lists no prompt', async () => {
    const client = await connected(
      plainServer(
        exportedRegistry(new HandlerExporter({ systemType: 'legacy' })),
      ),
    );
    try {
      assert.equal(client.getServerCapabilities()?.prompts, undefined);
    } finally {
      await client.close();
    }
  });

  it("the exporter's registry: where_used names no background argument", async () => {
    const client = await connected(
      plainServer(
        exportedRegistry(new HandlerExporter({ systemType: 'onprem' })),
      ),
    );
    try {
      const { messages } = await client.getPrompt({
        name: 'where_used',
        arguments: { object_type: 'class', name: 'SOME_CLASS' },
      });
      const [message] = messages;
      assert.ok(message && message.content.type === 'text');
      assert.ok(message.content.text.includes('GetWhereUsed'));
      assert.ok(!message.content.text.includes('background'));
    } finally {
      await client.close();
    }
  });

  it("a second registerAbapPrompts throws the SDK's words for the first prompt", () => {
    const registry = exportedRegistry(
      new HandlerExporter({ systemType: 'onprem' }),
    );
    const server = plainServer(registry);
    const first = new PromptServer(
      exportedRegistry(new HandlerExporter({ systemType: 'onprem' })),
      { systemType: 'onprem' },
    ).prompts[0];
    assert.ok(first);
    assert.throws(() => registerAbapPrompts(server, registry), {
      message: `Prompt ${first.name} is already registered`,
    });
  });

  it("registerOnServer, then registerAbapPrompts, lists the full set's prompts", async () => {
    const exporter = new HandlerExporter({ systemType: 'onprem' });
    const server = new McpServer({ name: 'embedder', version: '1' });
    exporter.registerOnServer(server, noConnection);
    registerAbapPrompts(server, exportedRegistry(exporter));
    const client = await connected(server);
    const served = await connected(
      new PromptServer(exportedRegistry(exporter), { systemType: 'onprem' }),
    );
    try {
      assert.deepEqual(
        (await client.listPrompts()).prompts,
        (await served.listPrompts()).prompts,
      );
    } finally {
      await client.close();
      await served.close();
    }
  });
});
