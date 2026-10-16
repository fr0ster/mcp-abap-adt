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
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import {
  batchSentence,
  eligibleSentence,
  ineligibleSentence,
} from '../../../lib/batch/sentence';
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
  "Switches this server into batch mode: from now on each call of a tool none of whose requests depends on another's answer is recorded instead of sent, and returns nothing. Every recorded call is numbered, in the order made, from 1. A tool that builds a request from an earlier answer is refused in batch mode; use the low-level tools (compact: HandlerCreate with create_only, HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock, HandlerGet) and run each phase as its own batch. BatchEnd sends the recorded calls; read their answers by number with BatchAnswers. Over HTTP, send the state_handle this answers in the request header on every call of the batch.";
const END_WORDS =
  'Sends every call recorded since BatchBegin, in parallel envelopes, with the credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers how many calls were recorded and which numbers failed; read each answer with BatchAnswers.';
const ANSWERS_WORDS =
  "The answers of the last batch, by number: each is the answer the tool gives for that call, built when BatchEnd sent it — SAP's answer or why it was not sent. A number the last batch does not have answers: no answer with that number.";
const ELIGIBLE_WORDS =
  'In batch mode (BatchBegin) a call is recorded and returns nothing; calls are numbered in the order made, and their answers are read by number with BatchAnswers once BatchEnd has run.';
const INELIGIBLE_WORDS =
  "In batch mode (BatchBegin) this tool is refused: a request of it depends on another's answer.";

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
          if (!FULL_BATCH.includes(name) && name !== 'HandlerBatch') continue;
          expect(
            Object.keys(entry.toolDefinition.inputSchema.properties ?? {}),
          ).not.toContain('state_handle');
        }
      }
    }
  });

  it.each(SETS.map(([kind, set]) => [kind, set] as const))(
    "every tool's description in %s ends with its sentence (eligible, eligible-by-arguments, ineligible; compact names HandlerBatch)",
    async (kind, set) => {
      const { client } = await served(registryOf(set, 'stdio'), {
        batch: new InstanceBatch({ keepRawParts: false }),
      });
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(10);
      for (const tool of tools) {
        const description = tool.description ?? '';
        if (FULL_BATCH.includes(tool.name) || tool.name === 'HandlerBatch') {
          expect(description).not.toContain('In batch mode (');
          continue;
        }
        const sentence = batchSentence(tool.name, kind);
        expect({
          tool: tool.name,
          ends: description.endsWith(` ${sentence}`),
        }).toEqual({
          tool: tool.name,
          ends: true,
        });
        if (isCompact(kind)) {
          expect(description).toContain("(HandlerBatch action 'begin')");
          expect(description).not.toContain('BatchBegin');
        } else {
          expect(description).toContain('(BatchBegin)');
        }
      }
      const byName = new Map(tools.map((t) => [t.name, t.description ?? '']));
      if (kind === 'core') {
        // Eligible for every call, for some arguments, and refused.
        expect(byName.get('GetClass')?.endsWith(`. ${ELIGIBLE_WORDS}`)).toBe(
          true,
        );
        expect(byName.get('CreatePackage')).toContain(
          `${ELIGIBLE_WORDS} Only these calls are recorded, any other is refused: the connection is HTTP.`,
        );
        expect(
          byName.get('UpdateClass')?.endsWith(` ${INELIGIBLE_WORDS}`),
        ).toBe(true);
      }
      if (kind === 'compact') {
        expect(byName.get('HandlerLock')).toContain(
          `${eligibleSentence('compact')} Only these calls are recorded, any other is refused: object_type is one of CLASS,`,
        );
        expect(byName.get('HandlerLock')).toContain(
          '; or object_type is PACKAGE and the connection is HTTP.',
        );
        expect(byName.get('HandlerGet')).toContain(
          'part is source (absent reads as source)',
        );
      }
    },
  );

  it("BatchBegin's and BatchEnd's descriptions are the spec's words", async () => {
    const { client } = await served(registryOf(fullToolSet, 'http'), {
      batch: new InstanceBatch({ keepRawParts: false }),
    });
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t.description]));
    expect(byName.get('BatchBegin')).toBe(BEGIN_WORDS);
    expect(byName.get('BatchEnd')).toBe(END_WORDS);
    expect(byName.get('BatchAnswers')).toBe(ANSWERS_WORDS);
  });

  it("a registry's own tool gets the ineligible sentence where the instance has a batch owner", async () => {
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
      `Does its own thing. ${ineligibleSentence('core')}`,
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
