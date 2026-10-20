/**
 * The debugger batch (spec §7): at an ABAP stop, step, step to line, stack,
 * variables, child variables, stack position and setting a variable are
 * recorded — one request each — and `DebugBatchEnd` / `HandlerDebugBatch`
 * `end` sends them in one debugger envelope on the stop's connection.
 *
 * A real server instance (the SDK client over an in-memory transport) with a
 * batch owner, the shipped debugger and batch tools of the full and the
 * compact set, and a debugger whose connections are fakes: real adt-clients
 * `AbapDebugger`s over them, every envelope and every direct request counted.
 * Nothing reaches a system. The AMDP debugger batch: `amdpDebugBatch.test.ts`.
 */
import { AbapDebugger, AmdpDebugger } from '@mcp-abap-adt/adt-clients';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { HandlerContext } from '../../../handlers/interfaces';
import { corpusBody } from '../../../lib/adtCorpus';
import {
  BATCH_MODE_ON_WORDS,
  BATCH_MODE_OTHER_WORDS,
  batchNotServedWords,
  batchPartsMismatchWords,
} from '../../../lib/auth/serverRefusal';
import { endsBatch } from '../../../lib/batch/batchTools';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { CompactBatchHandlersGroup } from '../../../lib/compact/batch/group';
import { NUMBER_WITHOUT_ANSWERS_WORDS } from '../../../lib/compact/batch/handleHandlerBatch';
import {
  CompactDebugBatchHandlersGroup,
  CompactDebugHandlersGroup,
} from '../../../lib/compact/debug/group';
import {
  AmdpSession,
  DebuggerInstance,
  DebugSession,
} from '../../../lib/debugger/index';
import { BatchHandlersGroup } from '../../../lib/handlers/groups/BatchHandlersGroup';
import { DebugBatchHandlersGroup } from '../../../lib/handlers/groups/DebugBatchHandlersGroup';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import type { IHandlerGroup } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
} from '../../../lib/toolSet';
import {
  type EnvelopeAnswer,
  envelopeConnection,
  envelopeResponse,
  type InnerRequest,
  type PartAnswer,
  partByPart,
} from '../../helpers/batchEnvelope';

const silent = { info() {}, debug() {}, warn() {}, error() {} };
/** What the fake port answers to an open from another connection than the instance's. */
const OPENED_FROM_ELSEWHERE =
  'opened from another connection than the instance';
const IDS = { terminalId: 'T'.repeat(32), ideId: 'I'.repeat(32) };
const MAIN = '/sap/bc/adt/amdp/debugger/main';
const XML = { 'content-type': 'application/xml' };

const ATTACH = corpusBody('debugger-run-to-line--03-attach');
const STACK = corpusBody('debugger-run-to-line--04-stack');
const STEP = corpusBody('debugger-run-to-line--05-stepruntoline');
const VARIABLES = corpusBody('debugger-run-to-line--07-variables-at-write');
const CHILDREN = corpusBody('debugger-conversation--07-children-root');
/** A step whose debuggee ended: SAP's 500 with the `debuggeeEnded` subtype. */
const ENDED = corpusBody('debugger-terminate--01-terminate-debuggee').replace(
  'terminateDebuggee',
  'debuggeeEnded',
);

type Fake = ReturnType<typeof envelopeConnection>;

interface Answer {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

const textOf = (a: Answer) => a.content?.[0]?.text ?? '';
const jsonOf = (a: Answer) => JSON.parse(textOf(a) || 'null');

/** What SAP answers to one part of a debugger envelope, by its request. */
function debuggerPart(inner: InnerRequest): PartAnswer {
  if (inner.url.includes('/stack?'))
    return { status: 200, headers: XML, body: STACK };
  if (inner.url.includes('method=getVariables'))
    return { status: 200, headers: XML, body: VARIABLES };
  if (inner.url.includes('method=getChildVariables'))
    return { status: 200, headers: XML, body: CHILDREN };
  if (inner.url.includes('method=setVariableValue'))
    return { status: 200, headers: XML, body: VARIABLES };
  return { status: 200, headers: XML, body: STEP };
}

/** A request outside an envelope: an attach, an AMDP start; answered at once. */
async function direct(request: IAbapRequestOptions): Promise<IAdtWireResponse> {
  const url = String(request.url);
  const headers: Record<string, string> = url.startsWith(`${MAIN}?`)
    ? { location: `${MAIN}/MAIN1` }
    : {};
  return {
    status: 200,
    statusText: 'OK',
    headers,
    data: url.includes('method=attach') ? ATTACH : '',
  } as IAdtWireResponse;
}

class DebugBatchServer extends EmbeddableMcpServer {
  private made?: DebuggerInstance;
  private attached = false;
  constructor(
    options: ConstructorParameters<typeof EmbeddableMcpServer>[0],
    made: DebuggerInstance,
  ) {
    super(options);
    this.made = made;
  }
  protected override debuggerFor(): DebuggerInstance {
    const made = this.made as DebuggerInstance;
    if (!this.attached) {
      this.state.attach(made);
      this.attached = true;
    }
    return made;
  }
}

type SetKind = 'full' | 'compact';

interface Stand {
  owner: InstanceBatch;
  instance: DebuggerInstance;
  /** The instance's own connection: no envelope reaches it. */
  main: Fake;
  /** Every connection the debugger opened, in order. */
  opened: Fake[];
  /** How the debuggee's envelope is answered, part by part. */
  part: { answer: (inner: InnerRequest) => PartAnswer };
  /** How a debuggee's envelope is answered as a whole, when set; else part by part. */
  envelope: { answer?: EnvelopeAnswer };
  handle(): string;
  /** Whether the instance still holds state (its handle valid). */
  holds(): boolean;
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  /** Attaches the debuggee: the stop the batch works on. */
  attach(): Promise<void>;
  /** The stop's connection: the debuggee's. */
  stopConnection(): Fake;
  close(): Promise<void>;
}

async function stand(set: SetKind): Promise<Stand> {
  const envelope: { answer?: EnvelopeAnswer } = {};
  const part = { answer: debuggerPart };
  const opened: Fake[] = [];
  // As `openFreshConnection` does: a connection opens from the origin's own
  // connection — the instance's — and a recorder's is refused.
  const open = async (origin: HandlerContext) => {
    if (origin?.connection !== (main.connection as unknown)) {
      throw new Error(OPENED_FROM_ELSEWHERE);
    }
    const fake = envelopeConnection(
      (parts, seen) =>
        (envelope.answer ?? partByPart((p) => part.answer(p)))(parts, seen),
      direct,
    );
    opened.push(fake);
    return fake.connection as unknown as IAbapConnection;
  };
  const instance = new DebuggerInstance({
    abap: new DebugSession(
      {
        openConnection: open,
        closeConnection: async () => undefined,
        dropConnection: () => undefined,
        abapDebugger: (c, onConflict) =>
          new AbapDebugger(c, undefined, undefined, { onConflict }),
        requestUser: async () => 'TESTUSER',
        run: async () => ({ ok: true, output: '' }),
      },
      { ...IDS, stated: false },
    ),
    amdp: new AmdpSession({
      openConnection: open,
      closeConnection: async () => undefined,
      amdpDebugger: (c) => new AmdpDebugger(c),
      requestUser: async () => 'TESTUSER',
      run: async () => ({ ok: true, output: '' }),
    }),
  });
  const owner = new InstanceBatch({ keepRawParts: false });
  const main = envelopeConnection(partByPart(debuggerPart));
  const placeholder = { connection: undefined as never };
  const groups: IHandlerGroup[] =
    set === 'full'
      ? [
          new DebugHandlersGroup(placeholder),
          new DebugBatchHandlersGroup(placeholder),
          new BatchHandlersGroup(placeholder),
        ]
      : [
          new CompactDebugHandlersGroup(placeholder),
          new CompactDebugBatchHandlersGroup(placeholder),
          new CompactBatchHandlersGroup(placeholder),
        ];
  const server = new DebugBatchServer(
    {
      connection: main.connection as never,
      handlersRegistry: new CompositeHandlersRegistry(groups),
      systemType: 'onprem',
      logger: silent as never,
      batch: owner,
    },
    instance,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'debug-batch', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  let stop: Fake | undefined;
  const mainContext = () =>
    ({ connection: main.connection }) as unknown as HandlerContext;
  return {
    owner,
    instance,
    main,
    opened,
    part,
    envelope,
    handle: () => server.stateHandle,
    holds: () => server.state.holdsState(),
    call: (name, args = {}) =>
      client.callTool({ name, arguments: args }).then((a) => a as Answer),
    attach: async () => {
      // As a compact attach does: the attaching session holds the stop.
      (debuggerOf(server) as DebuggerInstance).abap.bind(mainContext());
      await instance.abap.attachOnce({}, 'DEBUGGEE1');
      stop = opened[opened.length - 1];
    },
    stopConnection: () => {
      if (stop === undefined) throw new Error('no stop attached');
      return stop;
    },
    close: async () => {
      await within(client.close().catch(() => undefined));
    },
  };
}

/** The server's debugger, attached to its state as a call would attach it. */
const debuggerOf = (server: DebugBatchServer) =>
  (server as unknown as { debuggerFor(): DebuggerInstance }).debuggerFor();

/** The tool names of each set, by kind. */
const NAMES = {
  begin: { full: 'DebugBatchBegin', compact: 'HandlerDebugBatch' },
  end: { full: 'DebugBatchEnd', compact: 'HandlerDebugBatch' },
} as const;

const beginArgs = (set: SetKind) =>
  set === 'compact' ? { action: 'begin' } : {};
const endArgs = (set: SetKind) => (set === 'compact' ? { action: 'end' } : {});
const answersOf = async (s: Stand, set: SetKind, numbers: number[]) =>
  jsonOf(
    set === 'compact'
      ? await s.call('HandlerDebugBatch', { action: 'answers', numbers })
      : await s.call('BatchAnswers', { numbers }),
  ) as Array<Record<string, any>>;

/** step, stack and variables, as each set calls them. */
function stepStackVariables(set: SetKind, handle: string) {
  return set === 'full'
    ? ([
        ['DebugStep', { state_handle: handle, action: 'over' }],
        ['DebugGetStack', { state_handle: handle }],
        ['DebugGetVariables', { state_handle: handle, names: ['lv_a'] }],
      ] as const)
    : ([
        [
          'HandlerDebugStep',
          { state_handle: handle, kind: 'abap', operation: 'stepOver' },
        ],
        [
          'HandlerDebugMaintain',
          { state_handle: handle, kind: 'abap', operation: 'getStack' },
        ],
        [
          'HandlerDebugMaintain',
          {
            state_handle: handle,
            kind: 'abap',
            operation: 'getVariables',
            names: ['lv_a'],
          },
        ],
      ] as const);
}

/** Lets every pending turn run: a call that waits for nothing has settled after it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
}

/** `promise`'s value once settled within `settle()`, else `'pending'`. */
async function within<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([promise, settle().then(() => 'pending' as const)]);
}

/** `promise`'s value; a call still pending after `settle()` fails the test. */
async function settled<T>(promise: Promise<T>): Promise<T> {
  const value = await within(promise);
  if (value === 'pending') throw new Error('the call is still pending');
  return value;
}

const SETS: SetKind[] = ['full', 'compact'];

describe.each(SETS)('the debugger batch, %s set', (set) => {
  let s: Stand;
  beforeEach(async () => {
    s = await stand(set);
  });
  afterEach(async () => {
    await s.close();
  });

  it(`${set === 'full' ? 'DebugBatchEnd' : 'HandlerDebugBatch end'} sends exactly one envelope`, async () => {
    await s.attach();
    expect((await s.call(NAMES.begin[set], beginArgs(set))).isError).not.toBe(
      true,
    );
    for (const [tool, args] of stepStackVariables(set, s.handle())) {
      expect(await within(s.call(tool, args))).toEqual({ content: [] });
    }
    const ended = await settled(s.call(NAMES.end[set], endArgs(set)));
    expect(ended.isError).not.toBe(true);
    const envelopes = s.opened.flatMap((fake) => fake.envelopes);
    expect(envelopes).toHaveLength(1);
    expect(s.main.envelopes).toHaveLength(0);
  });

  it('begin needs an ABAP stop', async () => {
    const answer = await s.call(NAMES.begin[set], beginArgs(set));
    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toContain('no debuggee is stopped');
    expect(s.owner.mode()).toBe('off');
  });

  it("step + stack + variables recorded into one debugger envelope on the stop's connection", async () => {
    await s.attach();
    const begun = await s.call(NAMES.begin[set], beginArgs(set));
    expect(jsonOf(begun)).toEqual({
      debug_batch: 'on',
      state_handle: s.handle(),
    });
    const sentBefore = s.opened.map((fake) => fake.directs.length);
    for (const [tool, args] of stepStackVariables(set, s.handle())) {
      expect(await within(s.call(tool, args))).toEqual({ content: [] });
    }
    // Recorded, never sent: no request left any connection.
    expect(s.opened.map((fake) => fake.directs.length)).toEqual(sentBefore);
    expect(s.opened.flatMap((fake) => fake.envelopes)).toHaveLength(0);
    await settled(s.call(NAMES.end[set], endArgs(set)));
    const stop = s.stopConnection();
    expect(stop.envelopes).toHaveLength(1);
    const [envelope] = stop.envelopes;
    expect(envelope?.url).toBe('/sap/bc/adt/debugger/batch');
    expect(envelope?.session).toBe('stateful');
    expect(envelope?.parts.map((p) => `${p.method} ${p.url}`)).toEqual([
      'POST /sap/bc/adt/debugger?method=stepOver',
      'GET /sap/bc/adt/debugger/stack?emode=_&semanticURIs=true',
      'POST /sap/bc/adt/debugger?method=getVariables',
    ]);
    // The stop's connection, nothing on any other.
    for (const fake of s.opened)
      if (fake !== stop) expect(fake.envelopes).toHaveLength(0);
    expect(s.main.envelopes).toHaveLength(0);
  });

  it(`${NAMES.end[set]} answered with fewer parts than requests: batch_parts_mismatch, no map, every number answers it`, async () => {
    await s.attach();
    await s.call(NAMES.begin[set], beginArgs(set));
    for (const [tool, args] of stepStackVariables(set, s.handle())) {
      expect(await within(s.call(tool, args))).toEqual({ content: [] });
    }
    s.envelope.answer = (parts) =>
      envelopeResponse(parts.slice(0, 2).map(debuggerPart));
    const ended = await settled(s.call(NAMES.end[set], endArgs(set)));
    expect(ended.isError).toBe(true);
    expect(jsonOf(ended)).toEqual({
      error: 'batch_parts_mismatch',
      message: batchPartsMismatchWords(2, 3),
    });
    expect(s.owner.mode()).toBe('off');
    const read = await s.call(
      set === 'compact' ? 'HandlerDebugBatch' : 'BatchAnswers',
      set === 'compact'
        ? { action: 'answers', numbers: [1, 2, 3] }
        : { numbers: [1, 2, 3] },
    );
    for (const entry of jsonOf(read) as Array<{ content: unknown }>) {
      expect(entry.content).toEqual(ended.content);
    }
  });

  it('the second recorded call is recorded while the first waits', async () => {
    await s.attach();
    await s.call(NAMES.begin[set], beginArgs(set));
    const [first, second] = stepStackVariables(set, s.handle());
    expect(await within(s.call(first[0], first[1]))).toEqual({ content: [] });
    // The first call's answer waits for the envelope; the second records now.
    expect(await within(s.call(second[0], second[1]))).toEqual({
      content: [],
    });
    const summary = jsonOf(await settled(s.call(NAMES.end[set], endArgs(set))));
    expect(summary).toEqual({ recorded: 2, sent: 2, received: 2 });
    expect(s.stopConnection().envelopes[0]?.parts).toHaveLength(2);
  });

  it(`${NAMES.end[set]} keeps the answers by number, switches the mode off and leaves the stop as it was, also when a step's answer says the program ended`, async () => {
    await s.attach();
    const session = s.instance.abap as unknown as {
      current?: { connection: unknown; view: unknown };
    };
    const stopBefore = session.current;
    const viewBefore = structuredClone(stopBefore?.view);
    s.part.answer = (inner) =>
      inner.url.includes('method=stepOver')
        ? { status: 500, headers: XML, body: ENDED }
        : debuggerPart(inner);
    await s.call(NAMES.begin[set], beginArgs(set));
    for (const [tool, args] of stepStackVariables(set, s.handle())) {
      expect(await within(s.call(tool, args))).toEqual({ content: [] });
    }
    const summary = jsonOf(await settled(s.call(NAMES.end[set], endArgs(set))));
    expect(summary).toEqual({ recorded: 3, sent: 3, received: 3 });
    expect(s.owner.mode()).toBe('off');
    const answers = await answersOf(s, set, [1, 2, 3]);
    expect(answers.map((a) => a.number)).toEqual([1, 2, 3]);
    expect(answers.every((a) => a.isError !== true)).toBe(true);
    expect(JSON.parse(answers[0]?.content[0].text)).toMatchObject({
      state: 'ended',
      reason: 'debuggee_ended',
    });
    expect(answers[1]?.content[0].text).toContain('frames');
    expect(answers[2]?.content[0].text).toContain('LV_COUNTER');
    // The stop as it was: the same stop, the same view, its connection open.
    expect(session.current).toBe(stopBefore);
    expect(session.current?.view).toEqual(viewBefore);
    expect(s.stopConnection().connection.disconnect).not.toHaveBeenCalled();
  });

  it("after the end the debug session opens from the call's own connection, and an ordinary debugger call that opens a connection succeeds", async () => {
    await s.attach();
    await s.call(NAMES.begin[set], beginArgs(set));
    const [step] = stepStackVariables(set, s.handle());
    expect(await within(s.call(step[0], step[1]))).toEqual({ content: [] });
    await settled(s.call(NAMES.end[set], endArgs(set)));
    // The sessions' origin is the recorded call's own context: an open
    // before any other call binds them goes from the instance's connection.
    const session = s.instance.abap as unknown as {
      open(): Promise<unknown>;
    };
    await expect(session.open()).resolves.toBeDefined();
    const openedBefore = s.opened.length;
    const answer = await settled(
      set === 'full'
        ? s.call('DebugSetBreakpoints', {
            state_handle: s.handle(),
            breakpoints: [{ kind: 'statement', statement: 'WRITE' }],
          })
        : s.call('HandlerDebugSession', {
            state_handle: s.handle(),
            kind: 'abap',
            operation: 'checkListener',
          }),
    );
    expect(textOf(answer)).not.toContain(OPENED_FROM_ELSEWHERE);
    expect(answer.isError).not.toBe(true);
    expect(s.opened.length).toBe(openedBefore + 1);
  });

  it('begin while the debugger batch is open is refused batch_mode_on', async () => {
    await s.attach();
    await s.call(NAMES.begin[set], beginArgs(set));
    const again = await s.call(NAMES.begin[set], beginArgs(set));
    expect(again.isError).toBe(true);
    expect(jsonOf(again)).toEqual({
      error: 'batch_mode_on',
      message: BATCH_MODE_ON_WORDS,
    });
    expect(s.owner.mode()).toBe('debugger');
  });

  it('begin of either batch refused while the other is open', async () => {
    await s.attach();
    const communication =
      set === 'full'
        ? { begin: ['BatchBegin', {}], end: ['BatchEnd', {}] }
        : {
            begin: ['HandlerBatch', { action: 'begin' }],
            end: ['HandlerBatch', { action: 'end' }],
          };
    await s.call(NAMES.begin[set], beginArgs(set));
    const other = await s.call(
      communication.begin[0] as string,
      communication.begin[1] as Record<string, unknown>,
    );
    expect(other.isError).toBe(true);
    expect(jsonOf(other)).toEqual({
      error: 'batch_mode_other',
      message: BATCH_MODE_OTHER_WORDS,
    });
    expect(s.owner.mode()).toBe('debugger');
    await settled(s.call(NAMES.end[set], endArgs(set)));
    await s.call(
      communication.begin[0] as string,
      communication.begin[1] as Record<string, unknown>,
    );
    expect(s.owner.mode()).toBe('communication');
    const debug = await s.call(NAMES.begin[set], beginArgs(set));
    expect(debug.isError).toBe(true);
    expect(jsonOf(debug)).toEqual({
      error: 'batch_mode_other',
      message: BATCH_MODE_OTHER_WORDS,
    });
    expect(s.owner.mode()).toBe('communication');
  });

  it('begin while the communication batch is open is refused batch_mode_other, with no stop too', async () => {
    await s.call(
      set === 'full' ? 'BatchBegin' : 'HandlerBatch',
      set === 'full' ? {} : { action: 'begin' },
    );
    const debug = await s.call(NAMES.begin[set], beginArgs(set));
    expect(jsonOf(debug)).toEqual({
      error: 'batch_mode_other',
      message: BATCH_MODE_OTHER_WORDS,
    });
    expect(s.owner.mode()).toBe('communication');
  });

  it('breakpoint and listener tools refused while open', async () => {
    await s.attach();
    await s.call(NAMES.begin[set], beginArgs(set));
    const handle = s.handle();
    const refused: Array<[string, Record<string, unknown>]> =
      set === 'full'
        ? [
            [
              'DebugSetBreakpoints',
              {
                state_handle: handle,
                breakpoints: [{ kind: 'statement', statement: 'WRITE' }],
              },
            ],
            ['DebugListBreakpoints', { state_handle: handle }],
            ['DebugWait', { state_handle: handle }],
            ['DebugStep', { state_handle: handle, action: 'detach' }],
          ]
        : [
            [
              'HandlerDebugBreakpoints',
              {
                state_handle: handle,
                kind: 'abap',
                operation: 'setBreakpoints',
                breakpoints: [{ statement: 'WRITE' }],
              },
            ],
            [
              'HandlerDebugSession',
              {
                state_handle: handle,
                kind: 'abap',
                operation: 'listen',
                hold_seconds: 1,
              },
            ],
            [
              'HandlerDebugMaintain',
              {
                state_handle: handle,
                kind: 'abap',
                operation: 'getMemorySizes',
              },
            ],
          ];
    const sentBefore = s.opened.map((fake) => fake.directs.length);
    for (const [tool, args] of refused) {
      const answer = await s.call(tool, args);
      expect(answer.isError).toBe(true);
      expect(jsonOf(answer)).toEqual({
        error: 'batch_not_recordable',
        message: batchNotServedWords(tool),
      });
    }
    expect(s.opened.map((fake) => fake.directs.length)).toEqual(sentBefore);
    expect(jsonOf(await settled(s.call(NAMES.end[set], endArgs(set))))).toEqual(
      {
        recorded: 0,
        sent: 0,
        received: 0,
      },
    );
    expect(s.opened.flatMap((fake) => fake.envelopes)).toHaveLength(0);
  });
});

describe('a complete DebugStop ends the debugger batch answers with the debug state', () => {
  it('after the end the answers are kept; DebugStop drops them: nothing held, the handle answers not available', async () => {
    const s = await stand('full');
    try {
      await s.attach();
      const handle = s.handle();
      await s.call('DebugBatchBegin', {});
      await within(s.call('DebugGetStack', { state_handle: handle }));
      await settled(s.call('DebugBatchEnd', {}));
      expect(s.owner.holdsState()).toBe(true);
      const stopped = await settled(
        s.call('DebugStop', { state_handle: handle }),
      );
      expect(stopped.isError).not.toBe(true);
      expect(s.owner.holdsState()).toBe(false);
      expect(s.holds()).toBe(false);
      const after = await s.call('DebugGetStack', { state_handle: handle });
      expect(after.isError).toBe(true);
      expect(textOf(after)).toContain('state is not available');
    } finally {
      await s.close();
    }
  });
});

/**
 * The seven record paths, through each set's handler: the call's arguments
 * and the one request it records.
 */
const LINE = { object_type: 'PROG', object_name: 'ZTEST', line: 3 };
const RECORD_PATHS: Array<{
  path: string;
  full: [string, Record<string, unknown>];
  compact: [string, Record<string, unknown>];
  request: string | RegExp;
}> = [
  {
    path: 'step',
    full: ['DebugStep', { action: 'into' }],
    compact: ['HandlerDebugStep', { kind: 'abap', operation: 'stepInto' }],
    request: 'POST /sap/bc/adt/debugger?method=stepInto',
  },
  {
    path: 'step to line',
    full: ['DebugStepToLine', { mode: 'run', ...LINE }],
    compact: [
      'HandlerDebugStep',
      { kind: 'abap', operation: 'stepRunToLine', ...LINE },
    ],
    request:
      /^POST \/sap\/bc\/adt\/debugger\?method=stepRunToLine&uri=.*ztest.*start%3D3$/,
  },
  {
    path: 'stack',
    full: ['DebugGetStack', {}],
    compact: ['HandlerDebugMaintain', { kind: 'abap', operation: 'getStack' }],
    request: 'GET /sap/bc/adt/debugger/stack?emode=_&semanticURIs=true',
  },
  {
    path: 'variables',
    full: ['DebugGetVariables', { names: ['lv_a'] }],
    compact: [
      'HandlerDebugMaintain',
      { kind: 'abap', operation: 'getVariables', names: ['lv_a'] },
    ],
    request: 'POST /sap/bc/adt/debugger?method=getVariables',
  },
  {
    path: 'child variables',
    full: ['DebugGetVariables', { parents: ['@ROOT'] }],
    compact: [
      'HandlerDebugMaintain',
      { kind: 'abap', operation: 'getChildVariables', parents: ['@ROOT'] },
    ],
    request: 'POST /sap/bc/adt/debugger?method=getChildVariables',
  },
  {
    path: 'stack position',
    full: ['DebugSetStackPosition', { position: 2 }],
    compact: [
      'HandlerDebugStep',
      { kind: 'abap', operation: 'setStackPosition', position: 2 },
    ],
    request: 'POST /sap/bc/adt/debugger?method=setStackPosition&position=2',
  },
  {
    path: 'set a variable',
    full: ['DebugSetVariable', { name: 'lv_a', value: '7' }],
    compact: [
      'HandlerDebugMaintain',
      {
        kind: 'abap',
        operation: 'setVariableValue',
        variable_name: 'lv_a',
        value: '7',
      },
    ],
    request:
      'POST /sap/bc/adt/debugger?method=setVariableValue&variableName=LV_A',
  },
];

describe.each(SETS)('every record path, %s set', (set) => {
  it.each(RECORD_PATHS.map((p) => [p.path, p] as const))(
    '%s records exactly its one request into the envelope',
    async (_path, p) => {
      const s = await stand(set);
      try {
        await s.attach();
        await s.call(NAMES.begin[set], beginArgs(set));
        const sentBefore = s.opened.map((fake) => fake.directs.length);
        const [tool, args] = p[set];
        expect(
          await within(s.call(tool, { state_handle: s.handle(), ...args })),
        ).toEqual({ content: [] });
        // Recorded, never sent on its own.
        expect(s.opened.map((fake) => fake.directs.length)).toEqual(sentBefore);
        const summary = jsonOf(
          await settled(s.call(NAMES.end[set], endArgs(set))),
        );
        expect(summary).toEqual({ recorded: 1, sent: 1, received: 1 });
        const envelopes = s.opened.flatMap((fake) => fake.envelopes);
        expect(envelopes).toHaveLength(1);
        const parts = (envelopes[0]?.parts ?? []).map(
          (part) => `${part.method} ${part.url}`,
        );
        expect(parts).toHaveLength(1);
        if (typeof p.request === 'string') expect(parts[0]).toBe(p.request);
        else expect(parts[0]).toMatch(p.request);
        expect(s.opened.map((fake) => fake.directs.length)).toEqual(sentBefore);
      } finally {
        await s.close();
      }
    },
  );
});

describe('the debugger batch, compact step to line', () => {
  it('step to line without object_type/object_name refused', async () => {
    const s = await stand('compact');
    try {
      await s.attach();
      await s.call('HandlerDebugBatch', { action: 'begin' });
      for (const missing of ['object_type', 'object_name'] as const) {
        const args: Record<string, unknown> = {
          state_handle: s.handle(),
          kind: 'abap',
          operation: 'stepRunToLine',
          object_type: 'PROG',
          object_name: 'ZTEST',
          line: 3,
        };
        delete args[missing];
        const answer = await s.call('HandlerDebugStep', args);
        expect(answer.isError).toBe(true);
        expect(textOf(answer)).toContain(
          'object_type, object_name and line: needed for stepRunToLine',
        );
      }
      // Refused before anything was recorded: no number, nothing sent.
      expect(
        jsonOf(await s.call('HandlerDebugBatch', { action: 'end' })),
      ).toEqual({ recorded: 0, sent: 0, received: 0 });
      expect(s.opened.flatMap((fake) => fake.envelopes)).toHaveLength(0);
    } finally {
      await s.close();
    }
  });
});

describe('which sets serve the debugger batch tools', () => {
  const halves = {
    readOnly: compactReadOnlyEntries,
    modify: compactModifyEntries,
  };
  const namesOf = (groups: IHandlerGroup[]) =>
    new Set(
      groups.flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name)),
    );
  const context = { connection: undefined as never };
  it('DebugBatch* only in full, HandlerDebugBatch only in compact', () => {
    for (const transport of ['stdio', 'http', 'sse'] as const) {
      const full = namesOf(fullToolSet.groups(context, transport));
      const fullRo = namesOf(fullReadOnlyToolSet.groups(context, transport));
      const compact = namesOf(
        compactToolSetOf(halves).groups(context, transport),
      );
      const compactRo = namesOf(
        compactReadOnlyToolSetOf(halves.readOnly).groups(context, transport),
      );
      expect(full.has('DebugBatchBegin')).toBe(true);
      expect(full.has('DebugBatchEnd')).toBe(true);
      expect(full.has('HandlerDebugBatch')).toBe(false);
      expect(compact.has('HandlerDebugBatch')).toBe(true);
      expect(compact.has('DebugBatchBegin')).toBe(false);
      expect(compact.has('DebugBatchEnd')).toBe(false);
      for (const ro of [fullRo, compactRo]) {
        expect(ro.has('DebugBatchBegin')).toBe(false);
        expect(ro.has('DebugBatchEnd')).toBe(false);
        expect(ro.has('HandlerDebugBatch')).toBe(false);
      }
    }
  });
});

describe('the end of the debugger batch', () => {
  it("DebugBatchEnd and HandlerDebugBatch with action 'end' end the debugger batch; with numbers it ends none", () => {
    expect(endsBatch('DebugBatchEnd', {})).toBe('debugger');
    expect(endsBatch('HandlerDebugBatch', { action: 'end' })).toBe('debugger');
    expect(endsBatch('HandlerDebugBatch', { action: 'end', number: 1 })).toBe(
      undefined,
    );
    for (const action of ['begin', 'answers', undefined]) {
      expect(endsBatch('HandlerDebugBatch', { action })).toBe(undefined);
    }
    expect(endsBatch('BatchEnd', {})).toBe('communication');
  });

  it("HandlerDebugBatch action 'end' with a number is refused and the batch stays open", async () => {
    const s = await stand('compact');
    try {
      await s.attach();
      await s.call('HandlerDebugBatch', { action: 'begin' });
      const answer = await settled(
        s.call('HandlerDebugBatch', { action: 'end', number: 1 }),
      );
      expect(answer.isError).toBe(true);
      expect(textOf(answer)).toContain(NUMBER_WITHOUT_ANSWERS_WORDS);
      expect(s.owner.mode()).toBe('debugger');
    } finally {
      await s.close();
    }
  });
});
