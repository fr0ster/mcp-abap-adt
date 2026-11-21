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
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import { InMemoryBackgroundRuns } from '../../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { compactToolSet } from '../../../../compact/src/launcher';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { ServedTransport } from '../../../lib/config/binaries';
import type {
  IHandlersRegistry,
  SapEnvironment,
} from '../../../lib/handlers/interfaces';
import {
  type AbapPrompt,
  membersOn,
  type PromptSource,
} from '../../../lib/prompts';
import { registryOf, type ToolSet } from '../../../lib/toolSet';
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
  constructor(registry: IHandlersRegistry, options: ServerOptions = {}) {
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
    this.registerHandlers(registry);
  }

  get source(): PromptSource | undefined {
    return this.promptSource;
  }

  get prompts(): readonly AbapPrompt[] {
    return this.listedPrompts;
  }
}

async function connected(server: BaseMcpServer): Promise<Client> {
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
