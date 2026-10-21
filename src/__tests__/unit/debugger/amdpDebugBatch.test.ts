/**
 * The AMDP debugger batch (spec §7, plan Task 29a): at an AMDP break, step
 * over, continue and the data preview of a table variable are recorded — one
 * request each — and `DebugBatchEnd` / `HandlerDebugBatch` `end` sends them
 * in one debugger envelope on the AMDP session's command connection.
 *
 * A real server instance (the SDK client over an in-memory transport) with a
 * batch owner, the shipped debugger and batch tools of the full and the
 * compact set, and an AMDP session whose own connections are fakes: the
 * session's own requests (start, the event read, the breakpoint sync, a
 * direct step or preview) go to a scripted AMDP debugger that counts them;
 * a recorded call's request goes through a real adt-clients `AmdpDebugger`
 * over the batch's recorder. Every envelope and every direct request is
 * counted. Nothing reaches a system.
 */
import { AbapDebugger, AmdpDebugger } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { HandlerContext } from '../../../handlers/interfaces';
import { corpusBody } from '../../../lib/adtCorpus';
import type { FailureCode } from '../../../lib/auth/failures';
import * as refusals from '../../../lib/auth/serverRefusal';
import {
  batchNotServedWords,
  type ServerRefusalCode,
} from '../../../lib/auth/serverRefusal';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { CompactBatchHandlersGroup } from '../../../lib/compact/batch/group';
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
  type EnvelopeAnswer,
  envelopeConnection,
  envelopeResponse,
  type InnerRequest,
  type PartAnswer,
  partByPart,
} from '../../helpers/batchEnvelope';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  AMDP_BREAK,
  AMDP_START,
  AMDP_STOPPED,
  AMDP_SYNCED,
  amdpEnd,
} from './fakes';

const silent = { info() {}, debug() {}, warn() {}, error() {} };
const IDS = { terminalId: 'T'.repeat(32), ideId: 'I'.repeat(32) };
const XML = { 'content-type': 'application/xml' };
const PREVIEW = corpusBody('amdp-debugger--08-data-preview-table');

type Fake = ReturnType<typeof envelopeConnection>;

interface Answer {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

const textOf = (a: Answer) => a.content?.[0]?.text ?? '';
const jsonOf = (a: Answer) => JSON.parse(textOf(a) || 'null');

/** What SAP answers to one part of an AMDP debugger envelope, by its request. */
function amdpPart(inner: InnerRequest): PartAnswer {
  if (inner.url.includes('/datapreview/amdpdebugger'))
    return { status: 200, headers: XML, body: PREVIEW };
  return { status: 200, headers: { ...XML, location: 'Q9' }, body: '' };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * The AMDP session's own debugger: start, the event read, the breakpoint
 * sync, the stop answered as the system does; a direct step or preview
 * counted, so a recorded call that went around the batch shows.
 */
function scriptedAmdp() {
  const reads: Array<ReturnType<typeof deferred<unknown>>> = [];
  const direct: string[] = [];
  let syncN = 0;
  const dbg = {
    start: async () => okResponse(AMDP_START),
    getEvents: () => {
      const d = deferred<unknown>();
      reads.push(d);
      return d.promise;
    },
    syncBreakpoints: async () =>
      okResponse({ headers: { location: `Q${++syncN}` } }),
    step: async (_m: string, d: string, s: string) => {
      direct.push(`step:${d}:${s}`);
      return okResponse({ headers: { location: 'Q8' } });
    },
    getDataPreview: async (o: { variableName: string }) => {
      direct.push(`preview:${o.variableName}`);
      return okResponse(PREVIEW);
    },
    deleteDebuggee: async () => okResponse({}),
    stop: async () => {
      for (const r of reads) r.resolve(okResponse(AMDP_STOPPED));
      return okResponse({});
    },
  };
  return { dbg, reads, direct };
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
  main: Fake;
  opened: Fake[];
  scripted: ReturnType<typeof scriptedAmdp>;
  part: { answer: (inner: InnerRequest) => PartAnswer };
  /** How a debuggee's envelope is answered as a whole, when set; else part by part. */
  envelope: { answer?: EnvelopeAnswer };
  handle(): string;
  /** Whether the instance still holds state (its handle valid). */
  holds(): boolean;
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  /** The AMDP session stopped at a break: the full set's session, or the compact set's one-request session. */
  breakAt(): Promise<void>;
  /** The AMDP session's command connection. */
  commands(): Fake;
  close(): Promise<void>;
}

async function stand(set: SetKind): Promise<Stand> {
  const envelope: { answer?: EnvelopeAnswer } = {};
  const part = { answer: amdpPart };
  const opened: Fake[] = [];
  const scripted = scriptedAmdp();
  const open = async () => {
    const fake = envelopeConnection((parts, seen) =>
      (envelope.answer ?? partByPart((p) => part.answer(p)))(parts, seen),
    );
    opened.push(fake);
    return fake.connection as unknown as IAbapConnection;
  };
  const own = (c: IAbapConnection) =>
    opened.some((fake) => (fake.connection as unknown) === c);
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
      // The session's own connections answer through the script; a
      // recorder (a recorded call's connection) through a real debugger.
      amdpDebugger: (c) =>
        own(c) ? (scripted.dbg as never) : new AmdpDebugger(c),
      requestUser: async () => 'TESTUSER',
      run: async () => ({ ok: true, output: '' }),
    }),
  });
  const owner = new InstanceBatch({ keepRawParts: false });
  const main = envelopeConnection(partByPart(amdpPart));
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
  const client = new Client({ name: 'amdp-debug-batch', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const mainContext = () =>
    ({ connection: main.connection }) as unknown as HandlerContext;
  let commands: Fake | undefined;
  return {
    owner,
    instance,
    main,
    opened,
    scripted,
    part,
    envelope,
    handle: () => server.stateHandle,
    holds: () => server.state.holdsState(),
    call: (name, args = {}) =>
      client.callTool({ name, arguments: args }).then((a) => a as Answer),
    breakAt: async () => {
      const amdp = (debuggerOf(server) as DebuggerInstance).amdp.bind(
        mainContext(),
      );
      if (set === 'compact') {
        await amdp.startOnce(false);
      } else {
        const started = amdp.start({
          stopExisting: false,
          breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
        });
        await until(() => scripted.reads.length === 1);
        scripted.reads[0]?.resolve(okResponse(AMDP_SYNCED('Q1')));
        await started;
        await until(() => scripted.reads.length === 2);
        scripted.reads[1]?.resolve(okResponse(AMDP_BREAK));
        await until(() => scripted.reads.length === 3);
      }
      // The events connection opens first, the commands connection second.
      commands = opened[1];
    },
    commands: () => {
      if (commands === undefined) throw new Error('no AMDP session');
      return commands;
    },
    close: async () => {
      await within(client.close().catch(() => undefined));
    },
  };
}

const debuggerOf = (server: DebugBatchServer) =>
  (server as unknown as { debuggerFor(): DebuggerInstance }).debuggerFor();

/** Lets every pending turn run: a call that waits for nothing has settled after it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
}

async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !cond(); i += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
  if (!cond()) throw new Error('condition never held');
}

async function within<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([promise, settle().then(() => 'pending' as const)]);
}

async function settled<T>(promise: Promise<T>): Promise<T> {
  const value = await within(promise);
  if (value === 'pending') throw new Error('the call is still pending');
  return value;
}

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

/** The data preview, step over and continue, as each set calls them. */
function previewStepContinue(set: SetKind, handle: string) {
  return set === 'full'
    ? ([
        ['AmdpDebugGetTable', { state_handle: handle, variable: 'lt_rows' }],
        ['AmdpDebugStep', { state_handle: handle, action: 'over' }],
        ['AmdpDebugStep', { state_handle: handle, action: 'continue' }],
      ] as const)
    : ([
        [
          'HandlerDebugMaintain',
          {
            state_handle: handle,
            kind: 'amdp',
            operation: 'getDataPreview',
            debuggee_id: 'D1',
            variable_name: 'lt_rows',
          },
        ],
        [
          'HandlerDebugStep',
          {
            state_handle: handle,
            kind: 'amdp',
            operation: 'stepOver',
            debuggee_id: 'D1',
          },
        ],
        [
          'HandlerDebugStep',
          {
            state_handle: handle,
            kind: 'amdp',
            operation: 'stepContinue',
            debuggee_id: 'D1',
          },
        ],
      ] as const);
}

const SETS: SetKind[] = ['full', 'compact'];

describe.each(SETS)('the AMDP debugger batch, %s set', (set) => {
  let s: Stand;
  beforeEach(async () => {
    s = await stand(set);
  });
  afterEach(async () => {
    await s.close();
  });

  it('begin at an AMDP break opens the debugger batch', async () => {
    await s.breakAt();
    const begun = await s.call(NAMES.begin[set], beginArgs(set));
    expect(begun.isError).not.toBe(true);
    expect(jsonOf(begun)).toEqual({
      debug_batch: 'on',
      state_handle: s.handle(),
    });
    expect(s.owner.mode()).toBe('debugger');
  });

  it('begin with no stop is refused as before', async () => {
    const answer = await s.call(NAMES.begin[set], beginArgs(set));
    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toContain('no debuggee is stopped');
    expect(s.owner.mode()).toBe('off');
  });

  it('data preview, step over and continue recorded, one number each, into one envelope on the AMDP command connection; answers by number', async () => {
    await s.breakAt();
    await s.call(NAMES.begin[set], beginArgs(set));
    const directsBefore = s.opened.map((fake) => fake.directs.length);
    for (const [tool, args] of previewStepContinue(set, s.handle())) {
      expect(await within(s.call(tool, args))).toEqual({ content: [] });
    }
    // Recorded, never sent: nothing left any connection, nothing reached
    // the session's own debugger.
    expect(s.opened.map((fake) => fake.directs.length)).toEqual(directsBefore);
    expect(s.opened.flatMap((fake) => fake.envelopes)).toHaveLength(0);
    expect(s.scripted.direct).toEqual([]);

    const summary = jsonOf(await settled(s.call(NAMES.end[set], endArgs(set))));
    expect(summary).toEqual({ recorded: 3, sent: 3, received: 3 });
    expect(s.owner.mode()).toBe('off');

    const commands = s.commands();
    expect(commands.envelopes).toHaveLength(1);
    const [envelope] = commands.envelopes;
    expect(envelope?.url).toBe('/sap/bc/adt/debugger/batch');
    const parts = (envelope?.parts ?? []).map((p) => `${p.method} ${p.url}`);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(
      /^POST \/sap\/bc\/adt\/datapreview\/amdpdebugger\?.*variableName=LT_ROWS/,
    );
    expect(parts[0]).toContain('D1');
    expect(parts[1]).toMatch(/^POST .*D1.*over/);
    expect(parts[2]).toMatch(/^POST .*D1.*continue/);
    // The command connection alone: no other connection got an envelope.
    for (const fake of s.opened)
      if (fake !== commands) expect(fake.envelopes).toHaveLength(0);
    expect(s.main.envelopes).toHaveLength(0);
    expect(s.scripted.direct).toEqual([]);

    const answers = await answersOf(s, set, [1, 2, 3]);
    expect(answers.map((a) => a.number)).toEqual([1, 2, 3]);
    expect(answers.every((a) => a.isError !== true)).toBe(true);
    const preview = JSON.parse(answers[0]?.content[0].text);
    // The full set answers the rows; the compact set its value beside the handle.
    const rows = set === 'full' ? preview : preview.value;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    if (set === 'full') {
      expect(JSON.parse(answers[1]?.content[0].text)).toMatchObject({
        state: 'moving',
      });
    } else {
      expect(JSON.parse(answers[1]?.content[0].text)).toMatchObject({
        requestId: 'Q9',
      });
    }
  });

  it('the end answered with fewer parts than requests: batch_parts_mismatch, no map, every number answers it', async () => {
    await s.breakAt();
    await s.call(NAMES.begin[set], beginArgs(set));
    for (const [tool, args] of previewStepContinue(set, s.handle())) {
      expect(await within(s.call(tool, args))).toEqual({ content: [] });
    }
    s.envelope.answer = (parts) =>
      envelopeResponse(parts.slice(0, 1).map(amdpPart));
    const ended = await settled(s.call(NAMES.end[set], endArgs(set)));
    expect(ended.isError).toBe(true);
    expect(jsonOf(ended)).toEqual({
      error: 'batch_parts_mismatch',
      message: refusals.batchPartsMismatchWords(1, 3),
    });
    for (const entry of await answersOf(s, set, [1, 2, 3])) {
      expect(entry.content).toEqual(ended.content);
    }
  });

  it('the second recorded call is recorded while the first waits', async () => {
    await s.breakAt();
    await s.call(NAMES.begin[set], beginArgs(set));
    const [first, second] = previewStepContinue(set, s.handle());
    expect(await within(s.call(first[0], first[1]))).toEqual({ content: [] });
    expect(await within(s.call(second[0], second[1]))).toEqual({
      content: [],
    });
    const summary = jsonOf(await settled(s.call(NAMES.end[set], endArgs(set))));
    expect(summary).toEqual({ recorded: 2, sent: 2, received: 2 });
    expect(s.commands().envelopes[0]?.parts).toHaveLength(2);
  });

  it('every record path records exactly its one request', async () => {
    await s.breakAt();
    for (const [tool, args] of previewStepContinue(set, s.handle())) {
      await s.call(NAMES.begin[set], beginArgs(set));
      expect(await within(s.call(tool, args))).toEqual({ content: [] });
      const summary = jsonOf(
        await settled(s.call(NAMES.end[set], endArgs(set))),
      );
      expect(summary).toEqual({ recorded: 1, sent: 1, received: 1 });
      expect(s.commands().envelopes.at(-1)?.parts).toHaveLength(1);
    }
    expect(s.commands().envelopes).toHaveLength(3);
    expect(s.scripted.direct).toEqual([]);
  });

  it('an ABAP debugger call is refused in the AMDP debugger batch and takes no number', async () => {
    await s.breakAt();
    await s.call(NAMES.begin[set], beginArgs(set));
    const [tool, args]: [string, Record<string, unknown>] =
      set === 'full'
        ? ['DebugGetStack', { state_handle: s.handle() }]
        : [
            'HandlerDebugMaintain',
            { state_handle: s.handle(), kind: 'abap', operation: 'getStack' },
          ];
    const answer = await s.call(tool, args);
    expect(answer.isError).toBe(true);
    expect(jsonOf(answer)).toEqual({
      error: 'batch_not_recordable',
      message: batchNotServedWords(tool),
    });
    expect(jsonOf(await settled(s.call(NAMES.end[set], endArgs(set))))).toEqual(
      { recorded: 0, sent: 0, received: 0 },
    );
  });

  it('the AMDP session tools outside the table are refused while it is open', async () => {
    await s.breakAt();
    await s.call(NAMES.begin[set], beginArgs(set));
    const [tool, args]: [string, Record<string, unknown>] =
      set === 'full'
        ? ['AmdpDebugCancel', { state_handle: s.handle() }]
        : [
            'HandlerDebugSession',
            { state_handle: s.handle(), kind: 'amdp', operation: 'getEvents' },
          ];
    const answer = await s.call(tool, args);
    expect(answer.isError).toBe(true);
    expect(jsonOf(answer)).toEqual({
      error: 'batch_not_recordable',
      message: batchNotServedWords(tool),
    });
    await settled(s.call(NAMES.end[set], endArgs(set)));
  });
});

describe('a complete stop ends the debugger batch answers with the debug state (full set)', () => {
  let s: Stand;
  beforeEach(async () => {
    s = await stand('full');
  });
  afterEach(async () => {
    await s.close();
  });

  async function batchAtBreak(): Promise<string> {
    await s.breakAt();
    const handle = s.handle();
    await s.call('DebugBatchBegin', {});
    await within(
      s.call('AmdpDebugStep', { state_handle: handle, action: 'over' }),
    );
    await settled(s.call('DebugBatchEnd', {}));
    expect(s.owner.holdsState()).toBe(true); // the answers are kept
    return handle;
  }

  it('AmdpDebugStop ending the debug state drops the kept answers: nothing held, the handle answers not available', async () => {
    const handle = await batchAtBreak();
    // The cancelled debuggee ends as SAP ends it: the open read answers its end.
    const stopping = s.call('AmdpDebugStop', { state_handle: handle });
    await until(() => s.scripted.reads.length >= 3);
    s.scripted.reads[2]?.resolve(okResponse(amdpEnd('D1')));
    const stopped = await stopping;
    expect(stopped.isError).not.toBe(true);
    expect(s.owner.holdsState()).toBe(false);
    expect(s.holds()).toBe(false);
    const after = await s.call('AmdpDebugWait', {
      state_handle: handle,
      hold_seconds: 0,
    });
    expect(after.isError).toBe(true);
    expect(textOf(after)).toContain('state is not available');
  });

  it('a stop that is refused keeps the answers: the state stays', async () => {
    const handle = await batchAtBreak();
    s.scripted.dbg.deleteDebuggee = async () => refusedResponse('busy');
    const stopped = await s.call('AmdpDebugStop', { state_handle: handle });
    expect(stopped.isError).toBe(true);
    expect(s.owner.holdsState()).toBe(true);
    expect(s.holds()).toBe(true);
    const answers = jsonOf(await s.call('BatchAnswers', { numbers: [1] }));
    expect(answers[0]?.number).toBe(1);
  });
});

describe('InstanceBatch: the kept map by the kind of its batch', () => {
  const answer = { number: 1, content: [] };
  /** A batch whose one recorded call answers `answer` when read. */
  const recordedOne = () => ({
    connection: {} as never,
    recorded: [
      {
        number: 1,
        parts: () => [],
        resume: async () => answer,
        settled: Promise.resolve(),
      },
    ],
  });
  it("dropDebuggerAnswers drops a debugger batch's map and keeps a communication batch's", async () => {
    const debug = new InstanceBatch({ keepRawParts: false });
    const debugged = recordedOne();
    debug.begin('debugger', debugged);
    debug.end(debugged);
    debug.dropDebuggerAnswers();
    expect(debug.holdsState()).toBe(false);
    expect(debug.answer(1)).toBeUndefined();

    const communication = new InstanceBatch({ keepRawParts: false });
    const communicated = recordedOne();
    communication.begin('communication', communicated);
    communication.end(communicated);
    communication.dropDebuggerAnswers();
    expect(communication.holdsState()).toBe(true);
    await expect(communication.answer(1)).resolves.toBe(answer);
  });
});

describe('the AMDP refusal of the debugger batch', () => {
  it('debug_batch_amdp_unmeasured is gone: no code, no words', () => {
    // @ts-expect-error the code is out of the closed list of refusals
    const refusal: ServerRefusalCode = 'debug_batch_amdp_unmeasured';
    // @ts-expect-error the code is out of the closed list of failures
    const failure: FailureCode = 'debug_batch_amdp_unmeasured';
    expect([refusal, failure]).toHaveLength(2);
    expect(
      Object.keys(refusals).filter((name) => name.includes('AMDP_UNMEASURED')),
    ).toEqual([]);
    expect(
      new refusals.ServerRefusal('debug_batch_amdp_unmeasured' as never)
        .message,
    ).toBe('');
  });
});
