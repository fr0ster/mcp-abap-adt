/**
 * The batch tools on the surface (spec §3): which sets serve them, their
 * schemas and descriptions, the sentence every other tool's description ends
 * with, and `HandlerBatch` working on no connection for `begin` / `answers`.
 */
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(() => {
    throw new Error('no connection may be built here');
  }),
  systemKindOf: jest.fn(() => 'onprem'),
}));

import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ConnectionSource } from '../../../embeddable/ConnectionContext';
import { isBatchTool } from '../../../lib/batch/batchTools';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { batchSentence } from '../../../lib/batch/sentence';
import type { ToolSetKind } from '../../../lib/config/binaries';
import { createAbapConnection } from '../../../lib/connectionFactory';
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

const silent = { info() {}, debug() {}, warn() {}, error() {} };

const SETS: ReadonlyArray<readonly [ToolSetKind, ToolSet]> = [
  ['core', fullToolSet],
  ['core-ro', fullReadOnlyToolSet],
  [
    'compact',
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      modify: compactModifyEntries,
    }),
  ],
  ['compact-ro', compactReadOnlyToolSetOf(compactReadOnlyEntries)],
];
const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];
const FULL_BATCH = ['BatchBegin', 'BatchEnd', 'BatchAnswers'];
const isCompact = (kind: ToolSetKind) =>
  kind === 'compact' || kind === 'compact-ro';

// The spec's words (§3), copied here, never imported: the test is the copy.
const BEGIN_WORDS =
  'Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle, which HTTP clients send in the x-mcp-state-handle header with every call of the batch.';
const END_WORDS =
  "Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Answers the number of recorded calls, the numbers whose answer is an error, and SAP's answer to the envelope when the envelope failed.";
const ANSWERS_WORDS =
  "Answers the calls of the last executed batch by number: for each number asked, the tool's answer built from SAP's response at the end of the batch. Takes one number or a list of numbers; an unknown number answers as unknown.";
const RECORDABLE_TAIL =
  'recordable: in batch mode a call is recorded under the next number and answers with empty content; its answer is read by number after the batch ends.';
const ELIGIBLE_WORDS = `Recordable: ${RECORDABLE_TAIL.slice('recordable: '.length)}`;
const OUTSIDE_WORDS = 'Runs outside batch mode.';

class SurfaceServer extends BaseMcpServer {
  constructor(
    registry: IHandlersRegistry,
    options: { batch?: InstanceBatch; source?: ConnectionSource } = {},
  ) {
    super({
      name: 'batch-surface',
      version: '1.0.0',
      logger: silent as never,
      systemType: 'onprem',
      ...(options.batch !== undefined ? { batch: options.batch } : {}),
    });
    this.registerHandlers(registry);
    if (options.source !== undefined) {
      this.setConnectionContext({
        kind: 'built',
        source: options.source,
        sessionId: 'dest-a',
      });
    }
  }

  get handle(): string {
    return this.state.handle;
  }
}

async function served(
  registry: IHandlersRegistry,
  options: { batch?: InstanceBatch; source?: ConnectionSource } = {},
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
  it('full and read-only sets serve BatchBegin, BatchEnd, BatchAnswers; the compact sets HandlerBatch alone', () => {
    for (const [kind, set] of SETS) {
      for (const transport of TRANSPORTS) {
        const names = set
          .groups({ connection: undefined as never }, transport)
          .flatMap((group) =>
            group.getHandlers().map((entry) => entry.toolDefinition.name),
          );
        const batchNames = names.filter(
          (name) => name.startsWith('Batch') || name === 'HandlerBatch',
        );
        expect({ kind, transport, batchNames }).toEqual({
          kind,
          transport,
          batchNames: isCompact(kind) ? ['HandlerBatch'] : FULL_BATCH,
        });
      }
    }
  });

  it('no batch tool has a state_handle property', () => {
    for (const [, set] of SETS) {
      for (const group of set.groups(
        { connection: undefined as never },
        'http',
      )) {
        for (const entry of group.getHandlers()) {
          const name = entry.toolDefinition.name;
          if (!isBatchTool(name)) continue;
          expect(
            Object.keys(entry.toolDefinition.inputSchema.properties ?? {}),
          ).not.toContain('state_handle');
        }
      }
    }
  });

  it.each(SETS.map(([kind, set]) => [kind, set] as const))(
    "every tool's description in %s ends with its sentence (recordable, recordable for some arguments, outside batch mode)",
    async (kind, set) => {
      const { client } = await served(registryOf(set, 'stdio'), {
        batch: new InstanceBatch({ keepRawParts: false }),
      });
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(10);
      for (const tool of tools) {
        const description = tool.description ?? '';
        if (isBatchTool(tool.name)) {
          expect(description).not.toContain(RECORDABLE_TAIL);
          expect(description).not.toContain(OUTSIDE_WORDS);
          continue;
        }
        expect({
          tool: tool.name,
          ends: description.endsWith(` ${batchSentence(tool.name)}`),
        }).toEqual({
          tool: tool.name,
          ends: true,
        });
      }
      const byName = new Map(tools.map((t) => [t.name, t.description ?? '']));
      if (kind === 'core') {
        // Recordable for every call, for some arguments, and outside batch mode.
        expect(byName.get('GetClass')?.endsWith(`. ${ELIGIBLE_WORDS}`)).toBe(
          true,
        );
        expect(
          byName
            .get('CreatePackage')
            ?.endsWith(` With the connection is HTTP, ${RECORDABLE_TAIL}`),
        ).toBe(true);
        // A request that depends on another's answer, no request, the
        // debugger's own connection, a background run, a leftover session.
        for (const name of [
          'UpdateClass',
          'GetAbapAST',
          'DebugStep',
          'GetBackgroundRun',
          'ListLeftoverSessions',
        ]) {
          expect({
            name,
            ends: byName.get(name)?.endsWith(` ${OUTSIDE_WORDS}`),
          }).toEqual({ name, ends: true });
        }
      }
      if (kind === 'compact') {
        expect(byName.get('HandlerLock')).toContain(
          ' With object_type is one of CLASS,',
        );
        expect(byName.get('HandlerLock')).toContain(
          `; or object_type is PACKAGE and the connection is HTTP, ${RECORDABLE_TAIL}`,
        );
        expect(byName.get('HandlerGet')).toContain(
          'part is source (absent reads as source)',
        );
        for (const name of [
          'HandlerDebugStep',
          'HandlerBackgroundRunGet',
          'HandlerLeftoverSessionList',
        ]) {
          expect({
            name,
            ends: byName.get(name)?.endsWith(` ${OUTSIDE_WORDS}`),
          }).toEqual({ name, ends: true });
        }
      }
    },
  );

  it("BatchBegin's, BatchEnd's and BatchAnswers' descriptions are the spec's words", async () => {
    const { client } = await served(registryOf(fullToolSet, 'http'), {
      batch: new InstanceBatch({ keepRawParts: false }),
    });
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t.description]));
    expect(byName.get('BatchBegin')).toBe(BEGIN_WORDS);
    expect(byName.get('BatchEnd')).toBe(END_WORDS);
    expect(byName.get('BatchAnswers')).toBe(ANSWERS_WORDS);
  });

  it('without a batch owner no description gets a sentence', async () => {
    for (const [, set] of SETS) {
      const { client } = await served(registryOf(set, 'stdio'));
      const { tools } = await client.listTools();
      expect(
        tools
          .filter(
            (t) =>
              (t.description ?? '').includes(RECORDABLE_TAIL) ||
              (t.description ?? '').includes(OUTSIDE_WORDS),
          )
          .map((t) => t.name),
      ).toEqual([]);
    }
  });

  it("a registry's own tool gets the outside-batch sentence where the instance has a batch owner", async () => {
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
    expect(listed.find((t) => t.name === 'OwnTool')?.description).toBe(
      `Does its own thing. ${OUTSIDE_WORDS}`,
    );
    const withoutOwner = await served(own());
    expect(
      (await withoutOwner.client.listTools()).tools.find(
        (t) => t.name === 'OwnTool',
      )?.description,
    ).toBe('Does its own thing.');
  });
});

describe('the batch tools at work', () => {
  const compact = compactToolSetOf({
    readOnly: compactReadOnlyEntries,
    modify: compactModifyEntries,
  });

  /** A source whose every resolve is counted and refused: nothing may log on. */
  function countingSource() {
    const resolve = jest.fn(async () => {
      throw new Error('no logon may happen here');
    });
    return { source: { resolve } as unknown as ConnectionSource, resolve };
  }

  beforeEach(() => {
    (createAbapConnection as unknown as jest.Mock).mockClear();
  });

  it('HandlerBatch begin/answers build no connection; number with another action refused', async () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const { source, resolve } = countingSource();
    const { server, client } = await served(registryOf(compact, 'http'), {
      batch: owner,
      source,
    });
    const begun = await client.callTool({
      name: 'HandlerBatch',
      arguments: { action: 'begin' },
    });
    expect(JSON.parse(textOf(begun))).toEqual({
      batch: 'on',
      state_handle: server.handle,
    });
    expect(owner.mode()).toBe('communication');
    const answers = await client.callTool({
      name: 'HandlerBatch',
      arguments: { action: 'answers', numbers: [1, 2] },
    });
    expect(answers.isError).toBeFalsy();
    expect(JSON.parse(textOf(answers))).toEqual([
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
      expect(refused.isError).toBe(true);
      expect(textOf(refused)).toContain(
        "number and numbers are given only with action 'answers'",
      );
    }
    // Still the batch begun above: nothing ended it.
    expect(owner.mode()).toBe('communication');
    expect(resolve).not.toHaveBeenCalled();
    expect(createAbapConnection).not.toHaveBeenCalled();
  });

  it('BatchBegin answers the instance handle; a second is refused batch_mode_on; nothing logs on', async () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const { source, resolve } = countingSource();
    const { server, client } = await served(registryOf(fullToolSet, 'http'), {
      batch: owner,
      source,
    });
    const begun = await client.callTool({ name: 'BatchBegin', arguments: {} });
    expect(JSON.parse(textOf(begun))).toEqual({
      batch: 'on',
      state_handle: server.handle,
    });
    expect(owner.opened()?.connection).toBeDefined();
    const again = await client.callTool({ name: 'BatchBegin', arguments: {} });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain('batch_mode_on');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('BatchEnd and HandlerBatch end with no batch open are refused batch_mode_off before any connection', async () => {
    for (const [set, name, args] of [
      [fullToolSet, 'BatchEnd', {}],
      [compact, 'HandlerBatch', { action: 'end' }],
    ] as const) {
      const { source, resolve } = countingSource();
      const { client } = await served(registryOf(set, 'http'), {
        batch: new InstanceBatch({ keepRawParts: false }),
        source,
      });
      const ended = await client.callTool({ name, arguments: args });
      expect(ended.isError).toBe(true);
      expect(textOf(ended)).toContain('batch_mode_off');
      expect(resolve).not.toHaveBeenCalled();
    }
  });

  it('without an owner every batch tool answers batch_mode_unavailable, before any connection', async () => {
    const { source, resolve } = countingSource();
    const { client } = await served(registryOf(fullToolSet, 'http'), {
      source,
    });
    for (const [name, args] of [
      ['BatchBegin', {}],
      ['BatchEnd', {}],
      ['BatchAnswers', { number: 1 }],
    ] as const) {
      const answer = await client.callTool({ name, arguments: args });
      expect({ name, isError: answer.isError }).toEqual({
        name,
        isError: true,
      });
      expect(textOf(answer)).toContain('batch_mode_unavailable');
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('BatchAnswers refuses a number below 1 by its schema', async () => {
    const { client } = await served(registryOf(fullReadOnlyToolSet, 'sse'), {
      batch: new InstanceBatch({ keepRawParts: false }),
    });
    const refused = await client.callTool({
      name: 'BatchAnswers',
      arguments: { number: 0 },
    });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).not.toBe('');
  });
});
