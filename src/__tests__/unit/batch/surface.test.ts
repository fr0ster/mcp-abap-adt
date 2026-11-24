/**
 * The batch tools on the surface (spec §3): batch mode is the compact sets'
 * (`HandlerBatch`), the full sets serve none and describe none; the schemas
 * and descriptions, the sentence every other compact tool's description ends
 * with, and `HandlerBatch` working on no connection for `begin` / `answers`.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ConnectionSource } from '../../../embeddable/ConnectionContext';
import { isBatchTool } from '../../../lib/batch/batchTools';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { batchSentence } from '../../../lib/batch/sentence';
import type { ToolSetKind } from '../../../lib/config/binaries';
import * as connectionFactory from '../../../lib/connectionFactory';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ServedTransport,
  type ToolSet,
} from '../../../lib/toolSet';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
const connectionBuilt = mock.method(
  connectionFactory,
  'createAbapConnection',
  () => {
    throw new Error('no connection may be built here');
  },
);

const silent = { info() {}, debug() {}, warn() {}, error() {} };

const SETS: ReadonlyArray<readonly [ToolSetKind, ToolSet]> = [
  ['core', fullToolSet],
  ['core-ro', fullReadOnlyToolSet],
  [
    'compact',
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
      modify: compactModifyEntries,
    }),
  ],
  [
    'compact-ro',
    compactReadOnlyToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
    }),
  ],
];
const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];
const isCompact = (kind: ToolSetKind) =>
  kind === 'compact' || kind === 'compact-ro';

// HandlerBatch's words, copied here, never imported: the test is the copy.
const PURPOSE_WORDS =
  "Records the calls of the tools that allow it and sends them to SAP together, then reads each call's answer by its number.";
const BEGIN_WORDS =
  'starts recording the calls of the tools that allow it, each under the next number, to send them together.';
const END_WORDS =
  "sends the recorded calls to SAP together, with the credentials in force, and splits SAP's answer by call.";
const ANSWERS_WORDS =
  'reads the answer of each recorded call of the last sending, by its number.';
const HANDLE_WORDS =
  'Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).';
const RECORDABLE_TAIL =
  'recordable: in batch mode a call is recorded under the next number, and its answer comes back under that number after the batch ends.';
const ELIGIBLE_WORDS = `Recordable: ${RECORDABLE_TAIL.slice('recordable: '.length)}`;
const OUTSIDE_WORDS = 'Runs outside batch mode.';

class SurfaceServer extends BaseMcpServer {
  constructor(
    registry: IHandlersRegistry,
    options: {
      batch?: InstanceBatch;
      source?: ConnectionSource;
      backgroundRuns?: boolean;
    } = {},
  ) {
    super({
      name: 'batch-surface',
      version: '1.0.0',
      logger: silent as never,
      systemType: 'onprem',
      ...(options.batch !== undefined ? { batch: options.batch } : {}),
      ...(options.backgroundRuns === true
        ? { backgroundRuns: new InMemoryBackgroundRuns() }
        : {}),
    });
    this.registerHandlers(registry);
    if (options.source !== undefined) {
      this.setConnectionContext({
        kind: 'built',
        source: options.source,
      });
    }
  }

  get handle(): string {
    return this.state.handle;
  }
}

async function served(
  registry: IHandlersRegistry,
  options: {
    batch?: InstanceBatch;
    source?: ConnectionSource;
    backgroundRuns?: boolean;
  } = {},
) {
  const server = new SurfaceServer(registry, options);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'surface', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { server, client };
}

const textOf = (answer: unknown) =>
  (answer as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '';

describe('the batch tools on the surface', () => {
  it('the compact sets serve HandlerBatch; the full sets no batch tool', () => {
    for (const [kind, set] of SETS) {
      for (const transport of TRANSPORTS) {
        const names = set
          .groups({ connection: undefined as never }, transport, {
            dataTools: false,
          })
          .flatMap((group) =>
            group.getHandlers().map((entry) => entry.toolDefinition.name),
          );
        const batchNames = names.filter(
          (name) => name.startsWith('Batch') || name === 'HandlerBatch',
        );
        assert.deepStrictEqual(
          { kind, transport, batchNames },
          {
            kind,
            transport,
            batchNames: isCompact(kind) ? ['HandlerBatch'] : [],
          },
        );
      }
    }
  });

  it('no batch tool has a state_handle property', () => {
    for (const [, set] of SETS) {
      for (const group of set.groups(
        { connection: undefined as never },
        'http',
        { dataTools: false },
      )) {
        for (const entry of group.getHandlers()) {
          const name = entry.toolDefinition.name;
          if (!isBatchTool(name)) continue;
          assert.ok(
            !Object.keys(entry.toolDefinition.inputSchema.shape).includes(
              'state_handle',
            ),
          );
        }
      }
    }
  });

  for (const [_kind, set] of SETS.filter(([kind]) => !isCompact(kind)).map(
    ([kind, set]) => [kind, set] as const,
  )) {
    it(
      format(
        'no tool description in %s names batch mode: the set has none',
        _kind,
      ),
      async () => {
        // As the launchers: every set has a batch owner (the debugger batch's).
        const { client } = await served(
          registryOf(set, 'stdio', { dataTools: false }),
          {
            batch: new InstanceBatch({ keepRawParts: false }),
            backgroundRuns: true,
          },
        );
        const { tools } = await client.listTools();
        assert.ok(tools.length > 10);
        assert.deepStrictEqual(
          tools
            .filter(
              (t) =>
                (t.description ?? '').includes(RECORDABLE_TAIL) ||
                (t.description ?? '').includes(OUTSIDE_WORDS),
            )
            .map((t) => t.name),
          [],
        );
      },
    );
  }

  for (const [kind, set] of SETS.filter(([kind]) => isCompact(kind)).map(
    ([kind, set]) => [kind, set] as const,
  )) {
    it(
      format(
        "every tool's description in %s ends with its sentence (recordable, recordable for some arguments, outside batch mode)",
        kind,
      ),
      async () => {
        // As the launchers: every set keeps background runs.
        const { client } = await served(
          registryOf(set, 'stdio', { dataTools: false }),
          {
            batch: new InstanceBatch({ keepRawParts: false }),
            backgroundRuns: true,
          },
        );
        const { tools } = await client.listTools();
        assert.ok(tools.length > 10);
        for (const tool of tools) {
          const description = tool.description ?? '';
          if (isBatchTool(tool.name)) {
            assert.ok(!description.includes(RECORDABLE_TAIL));
            assert.ok(!description.includes(OUTSIDE_WORDS));
            continue;
          }
          assert.deepStrictEqual(
            {
              tool: tool.name,
              ends: description.endsWith(` ${batchSentence(tool.name)}`),
            },
            {
              tool: tool.name,
              ends: true,
            },
          );
        }
        const byName = new Map(tools.map((t) => [t.name, t.description ?? '']));
        if (kind === 'compact') {
          // Recordable for every call, for some arguments, and outside batch mode.
          assert.equal(
            byName.get('HandlerProfileList')?.endsWith(` ${ELIGIBLE_WORDS}`),
            true,
          );
          assert.ok(
            byName
              .get('HandlerLock')
              ?.includes(' When object_type is one of CLASS,'),
          );
          assert.ok(
            byName
              .get('HandlerLock')
              ?.includes(
                `; or object_type is PACKAGE and the connection is HTTP, ${RECORDABLE_TAIL}`,
              ),
          );
          assert.ok(
            byName
              .get('HandlerGet')
              ?.includes('part is source (absent reads as source)'),
          );
          for (const name of [
            'HandlerDebugStep',
            'HandlerBackgroundRunGet',
            'HandlerLeftoverSessionList',
          ]) {
            assert.deepStrictEqual(
              {
                name,
                ends: byName.get(name)?.endsWith(` ${OUTSIDE_WORDS}`),
              },
              { name, ends: true },
            );
          }
        }
      },
    );
  }

  it("HandlerBatch's description carries each action's spec words", async () => {
    const { client } = await served(
      registryOf(
        compactToolSetOf({
          readOnly: compactReadOnlyEntries,
          data: compactDataEntries,
          modify: compactModifyEntries,
        }),
        'http',
        { dataTools: false },
      ),
      {
        batch: new InstanceBatch({ keepRawParts: false }),
      },
    );
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t.description]));
    assert.equal(
      byName.get('HandlerBatch'),
      `[read-only] ${PURPOSE_WORDS} action begin: ${BEGIN_WORDS} action end: ${END_WORDS} action answers: ${ANSWERS_WORDS} ${HANDLE_WORDS}`,
    );
  });

  it('without a batch owner no description gets a sentence', async () => {
    for (const [, set] of SETS) {
      const { client } = await served(
        registryOf(set, 'stdio', { dataTools: false }),
      );
      const { tools } = await client.listTools();
      assert.deepStrictEqual(
        tools
          .filter(
            (t) =>
              (t.description ?? '').includes(RECORDABLE_TAIL) ||
              (t.description ?? '').includes(OUTSIDE_WORDS),
          )
          .map((t) => t.name),
        [],
      );
    }
  });

  it("a registry's own tool gets no sentence where the instance serves no communication batch, batch owner or not", async () => {
    const own = (): IHandlersRegistry =>
      ({
        registerAllTools: (server: {
          registerTool: (...args: unknown[]) => unknown;
        }) => {
          server.registerTool(
            'OwnTool',
            { description: 'Does its own thing.', inputSchema: {} },
            async () => ({ content: [] }),
          );
        },
        registerTool: () => {},
        getRegisteredTools: () => ['OwnTool'],
      }) as unknown as IHandlersRegistry;
    const withOwner = await served(own(), {
      batch: new InstanceBatch({ keepRawParts: false }),
    });
    const listed = (await withOwner.client.listTools()).tools;
    assert.equal(
      listed.find((t) => t.name === 'OwnTool')?.description,
      'Does its own thing.',
    );
    const withoutOwner = await served(own());
    assert.equal(
      (await withoutOwner.client.listTools()).tools.find(
        (t) => t.name === 'OwnTool',
      )?.description,
      'Does its own thing.',
    );
  });
});

describe('the batch tools at work', () => {
  const compact = compactToolSetOf({
    readOnly: compactReadOnlyEntries,
    data: compactDataEntries,
    modify: compactModifyEntries,
  });

  /** A source whose every resolve is counted and refused: nothing may log on. */
  function countingSource() {
    const resolve = mock.fn(async () => {
      throw new Error('no logon may happen here');
    });
    return { source: { resolve } as unknown as ConnectionSource, resolve };
  }

  beforeEach(() => {
    connectionBuilt.mock.resetCalls();
  });

  it('HandlerBatch begin/answers build no connection; number with another action refused', async () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const { source, resolve } = countingSource();
    const { server, client } = await served(
      registryOf(compact, 'http', { dataTools: false }),
      {
        batch: owner,
        source,
      },
    );
    const begun = await client.callTool({
      name: 'HandlerBatch',
      arguments: { action: 'begin' },
    });
    assert.deepStrictEqual(JSON.parse(textOf(begun)), {
      batch: 'on',
      state_handle: server.handle,
    });
    assert.equal(owner.mode(), 'communication');
    const answers = await client.callTool({
      name: 'HandlerBatch',
      arguments: { action: 'answers', numbers: [1, 2] },
    });
    assert.ok(!answers.isError);
    assert.deepStrictEqual(JSON.parse(textOf(answers)), [
      { number: 1, error: 'no_answer', message: 'no answer with that number' },
      { number: 2, error: 'no_answer', message: 'no answer with that number' },
    ]);
    for (const [action, ask] of [
      ['begin', { number: 1 }],
      ['end', { numbers: [1] }],
      ['end', { number: 2 }],
    ] as const) {
      const refused = await client.callTool({
        name: 'HandlerBatch',
        arguments: { action, ...ask },
      });
      assert.equal(refused.isError, true);
      assert.ok(
        textOf(refused).includes(
          "number and numbers are given only with action 'answers'",
        ),
      );
    }
    // Still the batch begun above: nothing ended it.
    assert.equal(owner.mode(), 'communication');
    assert.equal(resolve.mock.callCount(), 0);
    assert.equal(connectionBuilt.mock.callCount(), 0);
  });

  it('HandlerBatch begin answers the instance handle; a second is refused batch_mode_on; nothing logs on', async () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const { source, resolve } = countingSource();
    const { server, client } = await served(
      registryOf(compact, 'http', { dataTools: false }),
      {
        batch: owner,
        source,
      },
    );
    const begin = { name: 'HandlerBatch', arguments: { action: 'begin' } };
    const begun = await client.callTool(begin);
    assert.deepStrictEqual(JSON.parse(textOf(begun)), {
      batch: 'on',
      state_handle: server.handle,
    });
    assert.notEqual(owner.opened()?.connection, undefined);
    const again = await client.callTool(begin);
    assert.equal(again.isError, true);
    assert.ok(textOf(again).includes('batch_mode_on'));
    assert.equal(resolve.mock.callCount(), 0);
  });

  it('HandlerBatch end with no batch open is refused batch_mode_off before any connection', async () => {
    for (const [set, name, args] of [
      [compact, 'HandlerBatch', { action: 'end' }],
    ] as const) {
      const { source, resolve } = countingSource();
      const { client } = await served(
        registryOf(set, 'http', { dataTools: false }),
        {
          batch: new InstanceBatch({ keepRawParts: false }),
          source,
        },
      );
      const ended = await client.callTool({ name, arguments: args });
      assert.equal(ended.isError, true);
      assert.ok(textOf(ended).includes('batch_mode_off'));
      assert.equal(resolve.mock.callCount(), 0);
    }
  });

  it('without an owner every HandlerBatch action answers batch_mode_unavailable, before any connection', async () => {
    const { source, resolve } = countingSource();
    const { client } = await served(
      registryOf(compact, 'http', { dataTools: false }),
      {
        source,
      },
    );
    for (const [name, args] of [
      ['HandlerBatch', { action: 'begin' }],
      ['HandlerBatch', { action: 'end' }],
      ['HandlerBatch', { action: 'answers', number: 1 }],
    ] as const) {
      const answer = await client.callTool({ name, arguments: args });
      assert.deepStrictEqual(
        { name, isError: answer.isError },
        {
          name,
          isError: true,
        },
      );
      assert.ok(textOf(answer).includes('batch_mode_unavailable'));
    }
    assert.equal(resolve.mock.callCount(), 0);
  });

  it('HandlerBatch answers refuses a number below 1 by its schema', async () => {
    const { client } = await served(
      registryOf(
        compactReadOnlyToolSetOf({
          readOnly: compactReadOnlyEntries,
          data: compactDataEntries,
        }),
        'sse',
        { dataTools: false },
      ),
      {
        batch: new InstanceBatch({ keepRawParts: false }),
      },
    );
    const refused = await client.callTool({
      name: 'HandlerBatch',
      arguments: { action: 'answers', number: 0 },
    });
    assert.equal(refused.isError, true);
    assert.notEqual(textOf(refused), '');
  });
});
