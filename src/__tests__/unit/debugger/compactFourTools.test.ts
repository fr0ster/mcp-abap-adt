/**
 * The compact debugger: four tools, each covering ABAP and AMDP (spec §4.6).
 * Every call is exactly one `AbapDebugger` / `AmdpDebugger` request, chosen by
 * its `operation`; nothing runs between the calls — no listen loop, no attach
 * on a catch, no stack read after a step.
 *
 * Real adt-clients debuggers run over fake connections that count what they
 * are asked to send: held open, answered with a document and answered `404`
 * alike (the batch proof's three modes). The state a call works on is set up
 * first, on answering connections, and the count starts after it.
 */
import { AbapDebugger, AmdpDebugger } from '@mcp-abap-adt/adt-clients';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody } from '../../../lib/adtCorpus';
import { compactDebugEntries } from '../../../lib/compact/debug/group';
import {
  AmdpSession,
  DebuggerInstance,
  DebugSession,
} from '../../../lib/debugger/index';
import { DEBUGGER_OWN_CONNECTION_TOOLS } from '../../../lib/debugger/ownConnectionTools';
import { InstanceState } from '../../../lib/state/InstanceState';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
} from '../../../lib/toolSet';

type Mode = 'pending' | 'document' | 'not-found';
const MODES: Mode[] = ['pending', 'document', 'not-found'];
const IDS = { terminalId: 'T'.repeat(32), ideId: 'I'.repeat(32) };
const MAIN = '/sap/bc/adt/amdp/debugger/main';
const LISTEN_CATCH = corpusBody('debugger-run-to-line--02-listen');

interface Wire {
  /** `setup` answers every request; a measured call answers per its mode. */
  mode: Mode | 'setup';
  sent: string[];
  /** What a request is answered with while answering. */
  bodyOf: (method: string, url: string) => string;
  headersOf: (method: string, url: string) => Record<string, string>;
  opened: number;
  closed: number;
  /** An answering request SAP refuses: its status and body. */
  refusalOf?: (
    method: string,
    url: string,
  ) => { status: number; data: string } | undefined;
}

function fakeConnection(wire: Wire): IAbapConnection {
  let session: 'stateful' | 'stateless' = 'stateless';
  return {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType(type: 'stateful' | 'stateless') {
      session = type;
    },
    getSessionType() {
      return session;
    },
    async makeAdtRequest(options: IAbapRequestOptions) {
      const method = options.method;
      const url = String(options.url);
      if (wire.mode !== 'setup') wire.sent.push(`${method} ${url}`);
      if (wire.mode === 'pending') return new Promise<never>(() => {});
      if (wire.mode === 'not-found') {
        const error = new Error(
          'Request failed with status code 404',
        ) as Error & {
          response?: unknown;
        };
        error.response = {
          status: 404,
          statusText: 'Not Found',
          data: '',
          headers: {},
        };
        throw error;
      }
      const refusal = wire.refusalOf?.(method, url);
      if (refusal) {
        const error = new Error(
          `Request failed with status code ${refusal.status}`,
        ) as Error & { response?: unknown };
        error.response = {
          status: refusal.status,
          statusText: 'Internal Server Error',
          data: refusal.data,
          headers: { 'content-type': 'application/xml' },
        };
        throw error;
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: wire.headersOf(method, url),
        data: wire.bodyOf(method, url),
      };
    },
  } as unknown as IAbapConnection;
}

/** A compact debugger on fake connections: the instance state, the four tools. */
function install(
  bodyOf: Wire['bodyOf'] = () => '',
  headersOf: Wire['headersOf'] = (_m, url): Record<string, string> =>
    url.startsWith(`${MAIN}?`) ? { location: `${MAIN}/MAIN1` } : {},
) {
  const wire: Wire = {
    mode: 'setup',
    sent: [],
    bodyOf,
    headersOf,
    opened: 0,
    closed: 0,
  };
  const open = async () => {
    wire.opened += 1;
    return fakeConnection(wire);
  };
  const close = async () => {
    wire.closed += 1;
  };
  const instance = new DebuggerInstance({
    abap: new DebugSession(
      {
        openConnection: open,
        closeConnection: close,
        dropConnection: () => {
          wire.closed += 1;
        },
        abapDebugger: (c, onConflict) =>
          new AbapDebugger(c, undefined, undefined, { onConflict }),
        requestUser: async () => 'TESTUSER',
        run: async () => ({ ok: true, output: '' }),
      },
      { ...IDS, stated: false },
    ),
    amdp: new AmdpSession({
      openConnection: open,
      closeConnection: close,
      amdpDebugger: (c) => new AmdpDebugger(c),
      requestUser: async () => 'TESTUSER',
      run: async () => ({ ok: true, output: '' }),
    }),
  });
  const state = new InstanceState();
  state.attach(instance);
  const context = {
    state,
    debugger: () => instance,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  } as never;
  const call = (name: string, args: Record<string, unknown>) =>
    (
      compactDebugEntries().find((e) => e.toolDefinition.name === name)!
        .handler as unknown as (c: unknown, a: unknown) => Promise<Answer>
    )(context, structuredClone(args));
  return { wire, state, instance, call };
}

type Answer = { isError?: boolean; content: Array<{ text: string }> };
const jsonOf = (a?: Answer) =>
  JSON.parse(a?.content[0]?.text ?? '{}') as Record<string, any>;

/** The call's answer once the queue has run, or a held marker when it is still open. */
async function answeredOrHeld(call: Promise<Answer>): Promise<Answer> {
  call.catch(() => undefined);
  const held: Answer = { isError: false, content: [{ text: 'held open' }] };
  return Promise.race([call, settle().then(() => held)]);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
}

/** What a call needs set up before it: nothing, an ABAP attachment, an armed set, an AMDP session. */
type Setup = 'none' | 'attached' | 'armed' | 'amdp';

async function prepare(t: ReturnType<typeof install>, setup: Setup) {
  if (setup === 'none') return {};
  const answer =
    setup === 'amdp'
      ? await t.call('HandlerDebugSession', {
          kind: 'amdp',
          operation: 'start',
        })
      : setup === 'armed'
        ? await t.call('HandlerDebugBreakpoints', {
            kind: 'abap',
            operation: 'setBreakpoints',
            breakpoints: [{ statement: 'WRITE' }],
          })
        : await t.call('HandlerDebugSession', {
            kind: 'abap',
            operation: 'attach',
            debuggee_id: 'DEBUGGEE1',
          });
  expect(answer.isError).not.toBe(true);
  return { state_handle: jsonOf(answer).state_handle as string };
}

interface Run {
  sent: string[];
  answer?: Answer;
}

async function runIn(
  mode: Mode,
  tool: string,
  args: Record<string, unknown>,
  setup: Setup,
): Promise<Run> {
  const t = install();
  const handle = await prepare(t, setup);
  t.wire.mode = mode;
  const pending = t.call(tool, { ...handle, ...args });
  if (mode === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...t.wire.sent] };
  }
  const answer = await pending;
  await settle();
  return { sent: [...t.wire.sent], answer };
}

const Q = (o: Record<string, string>) => new URLSearchParams(o).toString();
const USER_KEY = {
  debuggingMode: 'user',
  requestUser: 'TESTUSER',
  terminalId: IDS.terminalId,
  ideId: IDS.ideId,
};

/**
 * Per tool and operation: its arguments, what it needs set up, the one request
 * it sends and the step a failure names.
 */
const CASES: Array<{
  tool: string;
  args: Record<string, unknown>;
  setup: Setup;
  request: string | RegExp;
  step: string;
}> = [
  // HandlerDebugBreakpoints
  {
    tool: 'HandlerDebugBreakpoints',
    args: {
      kind: 'abap',
      operation: 'setBreakpoints',
      breakpoints: [{ statement: 'WRITE' }],
    },
    setup: 'none',
    request: 'POST /sap/bc/adt/debugger/breakpoints',
    step: 'set breakpoints',
  },
  {
    tool: 'HandlerDebugBreakpoints',
    args: {
      kind: 'abap',
      operation: 'syncBreakpoints',
      sync_scope: 'full',
      breakpoints: [{ statement: 'WRITE' }],
    },
    setup: 'none',
    request: 'POST /sap/bc/adt/debugger/breakpoints',
    step: 'sync breakpoints',
  },
  {
    tool: 'HandlerDebugBreakpoints',
    args: { kind: 'abap', operation: 'deleteBreakpoint', breakpoint_id: 'BP1' },
    setup: 'armed',
    request: /^DELETE \/sap\/bc\/adt\/debugger\/breakpoints\/BP1\?/,
    step: 'delete breakpoint',
  },
  {
    tool: 'HandlerDebugBreakpoints',
    args: { kind: 'abap', operation: 'createWatchpoint', variable_name: 'x' },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger/watchpoints?variableName=X',
    step: 'create watchpoint',
  },
  {
    tool: 'HandlerDebugBreakpoints',
    args: { kind: 'abap', operation: 'listWatchpoints' },
    setup: 'attached',
    request: 'GET /sap/bc/adt/debugger/watchpoints',
    step: 'list watchpoints',
  },
  {
    tool: 'HandlerDebugBreakpoints',
    args: { kind: 'abap', operation: 'deleteWatchpoint', watchpoint_id: 'W1' },
    setup: 'attached',
    request: 'DELETE /sap/bc/adt/debugger/watchpoints/W1',
    step: 'delete watchpoint',
  },
  {
    tool: 'HandlerDebugBreakpoints',
    args: {
      kind: 'amdp',
      operation: 'syncBreakpoints',
      breakpoints: [{ object_name: 'class_a', line: 14 }],
    },
    setup: 'amdp',
    request: `POST ${MAIN}/MAIN1/breakpoints`,
    step: 'sync breakpoints',
  },
  // HandlerDebugSession
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'abap', operation: 'checkListener' },
    setup: 'none',
    request: `GET /sap/bc/adt/debugger/listeners?${Q({ ...USER_KEY, checkConflict: 'true' })}`,
    step: 'check listener',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'abap', operation: 'listen', hold_seconds: 7 },
    setup: 'none',
    request: `POST /sap/bc/adt/debugger/listeners?${Q({ ...USER_KEY, timeout: '7', checkConflict: 'true', isNotifiedOnConflict: 'true' })}`,
    step: 'listen',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'abap', operation: 'stopListener' },
    setup: 'none',
    request: `DELETE /sap/bc/adt/debugger/listeners?${Q(USER_KEY)}`,
    step: 'stop listener',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'abap', operation: 'attach', debuggee_id: 'DEBUGGEE1' },
    setup: 'none',
    request:
      /^POST \/sap\/bc\/adt\/debugger\?method=attach&debuggeeId=DEBUGGEE1/,
    step: 'attach',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'abap', operation: 'detachDebugger' },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=detachDebugger',
    step: 'detach',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'abap', operation: 'terminateDebuggee' },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=terminateDebuggee',
    step: 'terminate debuggee',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'abap', operation: 'terminateDebugger' },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=terminateDebugger',
    step: 'terminate debugger',
  },
  {
    tool: 'HandlerDebugSession',
    args: {
      kind: 'abap',
      operation: 'setDebuggerSettings',
      settings: { system_debugging: false },
    },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=setDebuggerSettings',
    step: 'set settings',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'amdp', operation: 'start' },
    setup: 'none',
    request: /^POST \/sap\/bc\/adt\/amdp\/debugger\/main\?/,
    step: 'start',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'amdp', operation: 'getEvents' },
    setup: 'amdp',
    request: `GET ${MAIN}/MAIN1`,
    step: 'read events',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'amdp', operation: 'stop' },
    setup: 'amdp',
    request: `DELETE ${MAIN}/MAIN1?hardStop=false`,
    step: 'stop',
  },
  {
    tool: 'HandlerDebugSession',
    args: { kind: 'amdp', operation: 'deleteDebuggee', debuggee_id: 'D1' },
    setup: 'amdp',
    request: `DELETE ${MAIN}/MAIN1/debuggees/D1`,
    step: 'delete debuggee',
  },
  // HandlerDebugStep
  ...(['stepInto', 'stepOver', 'stepReturn', 'stepContinue'] as const).map(
    (operation) => ({
      tool: 'HandlerDebugStep',
      args: { kind: 'abap', operation },
      setup: 'attached' as Setup,
      request: `POST /sap/bc/adt/debugger?method=${operation}`,
      step: 'step',
    }),
  ),
  ...(['stepRunToLine', 'stepJumpToLine'] as const).map((operation) => ({
    tool: 'HandlerDebugStep',
    args: {
      kind: 'abap',
      operation,
      object_type: 'CLAS',
      object_name: 'class_a',
      line: 9,
    },
    setup: 'attached' as Setup,
    request: `POST /sap/bc/adt/debugger?${Q({ method: operation, uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=9' })}`,
    step: 'step to line',
  })),
  {
    tool: 'HandlerDebugStep',
    args: { kind: 'abap', operation: 'setStackPosition', position: 2 },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=setStackPosition&position=2',
    step: 'set stack position',
  },
  {
    tool: 'HandlerDebugStep',
    args: { kind: 'amdp', operation: 'stepOver', debuggee_id: 'D1' },
    setup: 'amdp',
    request: `POST ${MAIN}/MAIN1/debuggees/D1?step=over`,
    step: 'step',
  },
  {
    tool: 'HandlerDebugStep',
    args: { kind: 'amdp', operation: 'stepContinue', debuggee_id: 'D1' },
    setup: 'amdp',
    request: `POST ${MAIN}/MAIN1/debuggees/D1?step=continue`,
    step: 'step',
  },
  // HandlerDebugMaintain
  {
    tool: 'HandlerDebugMaintain',
    args: { kind: 'abap', operation: 'getStack' },
    setup: 'attached',
    request: 'GET /sap/bc/adt/debugger/stack?emode=_&semanticURIs=true',
    step: 'read stack',
  },
  {
    tool: 'HandlerDebugMaintain',
    args: { kind: 'abap', operation: 'getVariables', names: ['x'] },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=getVariables',
    step: 'read variables',
  },
  {
    tool: 'HandlerDebugMaintain',
    args: { kind: 'abap', operation: 'getChildVariables' },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=getChildVariables',
    step: 'read child variables',
  },
  {
    tool: 'HandlerDebugMaintain',
    args: { kind: 'abap', operation: 'getMemorySizes' },
    setup: 'attached',
    request: /^GET \/sap\/bc\/adt\/debugger\/memorysizes/,
    step: 'read memory sizes',
  },
  {
    tool: 'HandlerDebugMaintain',
    args: { kind: 'abap', operation: 'createMemorySnapshot' },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger/actions?action=memorySnapshot',
    step: 'create memory snapshot',
  },
  {
    tool: 'HandlerDebugMaintain',
    args: {
      kind: 'abap',
      operation: 'setVariableValue',
      variable_name: 'x',
      value: '2',
    },
    setup: 'attached',
    request: 'POST /sap/bc/adt/debugger?method=setVariableValue&variableName=X',
    step: 'set variable',
  },
  {
    tool: 'HandlerDebugMaintain',
    args: {
      kind: 'amdp',
      operation: 'getDataPreview',
      debuggee_id: 'D1',
      variable_name: 'lt_rows',
    },
    setup: 'amdp',
    request:
      'POST /sap/bc/adt/datapreview/amdpdebugger?sessionId=&debuggerId=MAIN1&debuggeeId=D1&variableName=LT_ROWS',
    step: 'read table',
  },
];

describe('the compact debugger is four tools', () => {
  const entries = compactDebugEntries();
  it('HandlerDebugBreakpoints, HandlerDebugSession, HandlerDebugStep, HandlerDebugMaintain', () => {
    expect(entries.map((e) => e.toolDefinition.name)).toEqual([
      'HandlerDebugBreakpoints',
      'HandlerDebugSession',
      'HandlerDebugStep',
      'HandlerDebugMaintain',
    ]);
  });

  it('HandlerDebugStart, HandlerDebugView and HandlerDebugWait are not served', () => {
    const compact = compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      modify: compactModifyEntries,
    });
    const served = compact
      .groups({ connection: undefined } as never, 'stdio')
      .flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));
    for (const name of [
      'HandlerDebugStart',
      'HandlerDebugView',
      'HandlerDebugWait',
    ]) {
      expect({ name, served: served.includes(name) }).toEqual({
        name,
        served: false,
      });
      expect(DEBUGGER_OWN_CONNECTION_TOOLS).not.toContain(name);
    }
    for (const e of entries) {
      expect(served).toContain(e.toolDefinition.name);
      expect(DEBUGGER_OWN_CONNECTION_TOOLS).toContain(e.toolDefinition.name);
    }
    const ro = compactReadOnlyToolSetOf(compactReadOnlyEntries)
      .groups({ connection: undefined } as never, 'stdio')
      .flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));
    expect(ro.filter((n) => n.startsWith('HandlerDebug'))).toEqual([]);
  });

  it('every operation of the cases is in its tool, and every tool operation has a case', () => {
    for (const e of entries) {
      const ops = (e.toolDefinition.inputSchema as any).properties.operation
        .enum as string[];
      const covered = new Set(
        CASES.filter((c) => c.tool === e.toolDefinition.name).map(
          (c) => c.args.operation as string,
        ),
      );
      expect({ tool: e.toolDefinition.name, ops: [...ops].sort() }).toEqual({
        tool: e.toolDefinition.name,
        ops: [...covered].sort(),
      });
    }
  });

  it('every parameter is described and every tool takes kind, operation and detail', () => {
    for (const e of entries) {
      const schema = e.toolDefinition.inputSchema as any;
      expect(schema.required).toEqual(
        expect.arrayContaining(['kind', 'operation']),
      );
      expect(schema.properties.detail).toBeDefined();
      for (const [name, p] of Object.entries<any>(schema.properties))
        if (name !== 'detail')
          expect({ name, described: !!p.description }).toEqual({
            name,
            described: true,
          });
    }
  });
});

describe('descriptions, positive', () => {
  const byName = new Map(
    compactDebugEntries().map((e) => [e.toolDefinition.name, e.toolDefinition]),
  );
  const description = (name: string) => byName.get(name)!.description as string;

  it("a step answers SAP's step result and the stopped position is read from the stack", () => {
    expect(description('HandlerDebugStep')).toContain(
      "a step answers SAP's step result, or ended when SAP reports the program's end, and the stopped position is read from the stack.",
    );
  });

  it('terminate answers 500 when it succeeds', () => {
    expect(description('HandlerDebugSession')).toContain(
      "terminateDebuggee ends the debuggee where it stands and terminateDebugger frees the debugger; each answers SAP's answer as it came, which is a 500 when it succeeded, and the next answer shows the success (noSessionAttached, or the program's end);",
    );
  });

  it('detach releases the debuggee on the attaching session', () => {
    expect(description('HandlerDebugSession')).toContain(
      'detachDebugger sends detachDebugger on the attaching session, which releases the debuggee, and the program runs on;',
    );
  });

  it("listen holds for the caller's hold_seconds", () => {
    expect(description('HandlerDebugSession')).toContain(
      "listen waits for a debuggee for exactly hold_seconds, SAP's hold,",
    );
  });

  it('no description and no parameter description names another tool or states a negation', () => {
    const NEGATION =
      /\b(not|no|none|never|nothing|without|instead|but|cannot|in place of)\b/i;
    for (const [name, tool] of byName) {
      const texts = [
        tool.description as string,
        ...Object.values<any>((tool.inputSchema as any).properties).map(
          (p) => p.description as string,
        ),
      ];
      for (const text of texts) {
        expect({ name, text, negation: NEGATION.test(text) }).toEqual({
          name,
          text,
          negation: false,
        });
        for (const other of [
          ...byName.keys(),
          'HandlerDebugStart',
          'HandlerDebugView',
          'HandlerDebugWait',
        ])
          if (other !== name)
            expect({ name, text, names: text.includes(other) }).toEqual({
              name,
              text,
              names: false,
            });
      }
    }
  });
});

describe('each call is exactly one request (held / document / 404)', () => {
  it.each(
    CASES.map((c) => [`${c.tool} ${c.args.kind} ${c.args.operation}`, c]),
  )('%s: exactly one request, the named method', async (_label, c) => {
    const [held, documented, refused] = await Promise.all(
      MODES.map((mode) => runIn(mode, c.tool, c.args, c.setup)),
    );
    expect(held.sent).toHaveLength(1);
    if (typeof c.request === 'string') expect(held.sent[0]).toBe(c.request);
    else expect(held.sent[0]).toMatch(c.request);
    expect(documented.sent).toEqual(held.sent);
    expect(refused.sent).toEqual(held.sent);

    expect(documented.answer?.isError).not.toBe(true);
    expect(jsonOf(documented.answer).state_handle).toMatch(/^[0-9A-F]{32}$/);

    expect(refused.answer?.isError).toBe(true);
    const failed = jsonOf(refused.answer);
    expect(failed.status).toBe(404);
    expect(failed.step).toBe(c.step);
    // The failure answers the handle beside the error: the state holds what the call fixed.
    const handleBlock = refused.answer?.content
      .map((block) => JSON.parse(block.text) as Record<string, unknown>)
      .find((block) => 'state_handle' in block);
    expect(handleBlock?.state_handle).toMatch(/^[0-9A-F]{32}$/);
  });
});

describe("the chain is the consumer's", () => {
  it('no background listen loop: nothing is sent between calls', async () => {
    jest.useFakeTimers({
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    try {
      const t = install((_m, url) =>
        url.includes('/listeners?') ? LISTEN_CATCH : '',
      );
      t.wire.mode = 'document';
      const armed = await t.call('HandlerDebugBreakpoints', {
        kind: 'abap',
        operation: 'setBreakpoints',
        breakpoints: [{ statement: 'WRITE' }],
      });
      const handle = jsonOf(armed).state_handle;
      const caught = await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'abap',
        operation: 'listen',
        hold_seconds: 5,
      });
      expect(jsonOf(caught)).toMatchObject({
        caught: true,
        debuggee_id: expect.any(String),
      });
      expect(t.wire.sent).toHaveLength(2);
      // A catch is the consumer's to attach; nothing listens again, nothing attaches.
      await jest.advanceTimersByTimeAsync(120_000);
      await settle();
      expect(t.wire.sent).toHaveLength(2);
      const stepped = await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'abap',
        operation: 'attach',
        debuggee_id: jsonOf(caught).debuggee_id,
        server: jsonOf(caught).server,
      });
      expect(stepped.isError).not.toBe(true);
      await t.call('HandlerDebugStep', {
        state_handle: handle,
        kind: 'abap',
        operation: 'stepOver',
      });
      await jest.advanceTimersByTimeAsync(120_000);
      await settle();
      expect(t.wire.sent).toHaveLength(4);
      expect(t.wire.sent[3]).toBe('POST /sap/bc/adt/debugger?method=stepOver');
    } finally {
      jest.useRealTimers();
    }
  });

  it("listen holds exactly the caller's hold_seconds", async () => {
    for (const hold of [0, 5, 240]) {
      const { sent } = await runIn(
        'document',
        'HandlerDebugSession',
        { kind: 'abap', operation: 'listen', hold_seconds: hold },
        'none',
      );
      expect(sent).toHaveLength(1);
      const query = new URLSearchParams(sent[0].split('?')[1]);
      expect(query.get('timeout')).toBe(String(hold));
    }
  });

  it('listen without hold_seconds is refused before any request', async () => {
    const { sent, answer } = await runIn(
      'document',
      'HandlerDebugSession',
      { kind: 'abap', operation: 'listen' },
      'none',
    );
    expect(sent).toEqual([]);
    expect(answer?.isError).toBe(true);
    expect(answer?.content[0].text).toContain(
      'hold_seconds: needed for listen',
    );
  });

  it.each(['stepRunToLine', 'stepJumpToLine'])(
    '%s: stepToLine without an address refused before any request',
    async (operation) => {
      for (const missing of ['object_type', 'object_name', 'line']) {
        const args: Record<string, unknown> = {
          kind: 'abap',
          operation,
          object_type: 'CLAS',
          object_name: 'class_a',
          line: 9,
        };
        delete args[missing];
        const { sent, answer } = await runIn(
          'document',
          'HandlerDebugStep',
          args,
          'attached',
        );
        expect({ missing, sent }).toEqual({ missing, sent: [] });
        expect(answer?.isError).toBe(true);
        expect(answer?.content[0].text).toContain(
          `object_type, object_name and line: needed for ${operation}`,
        );
      }
    },
  );

  it('detach sends detachDebugger without an id on the attaching session', async () => {
    const t = install();
    const attached = await t.call('HandlerDebugSession', {
      kind: 'abap',
      operation: 'attach',
      debuggee_id: 'DEBUGGEE1',
    });
    const handle = jsonOf(attached).state_handle;
    const attaching = t.instance.abap as unknown as {
      current?: { connection: IAbapConnection };
    };
    const on = attaching.current!.connection;
    const seen: IAbapConnection[] = [];
    const send = on.makeAdtRequest.bind(on);
    (on as { makeAdtRequest: unknown }).makeAdtRequest = (
      o: IAbapRequestOptions,
    ) => {
      seen.push(on);
      return send(o);
    };
    t.wire.mode = 'document';
    const detached = await t.call('HandlerDebugSession', {
      state_handle: handle,
      kind: 'abap',
      operation: 'detachDebugger',
    });
    expect(detached.isError).not.toBe(true);
    expect(t.wire.sent).toEqual([
      'POST /sap/bc/adt/debugger?method=detachDebugger',
    ]);
    expect(seen).toEqual([on]);
    expect(t.wire.closed).toBe(0);
  });

  it('a call of one kind is refused while the instance holds the other, before any request', async () => {
    const t = install();
    const started = await prepare(t, 'amdp');
    t.wire.mode = 'document';
    const answer = await t.call('HandlerDebugStep', {
      ...started,
      kind: 'abap',
      operation: 'stepOver',
    });
    expect(t.wire.sent).toEqual([]);
    expect(answer.isError).toBe(true);
    expect(answer.content[0].text).toContain(
      'a amdp debug session is already open on this server',
    );
  });

  it('an operation of the other kind is refused before any request', async () => {
    const t = install();
    const started = await prepare(t, 'amdp');
    t.wire.mode = 'document';
    const answer = await t.call('HandlerDebugMaintain', {
      ...started,
      kind: 'amdp',
      operation: 'getStack',
    });
    expect(t.wire.sent).toEqual([]);
    expect(answer.isError).toBe(true);
    expect(answer.content[0].text).toContain(
      'operation: kind amdp takes getDataPreview; getStack is outside them',
    );
  });

  it('a call without a handle while the instance holds a debug state is refused before any request', async () => {
    const t = install();
    await prepare(t, 'attached');
    t.wire.mode = 'document';
    const answer = await t.call('HandlerDebugBreakpoints', {
      kind: 'abap',
      operation: 'setBreakpoints',
      breakpoints: [{ statement: 'WRITE' }],
    });
    expect(t.wire.sent).toEqual([]);
    expect(answer.isError).toBe(true);
  });

  it('the first abap call fixes the identity; a call stating another is refused before any request', async () => {
    const t = install();
    const armed = await t.call('HandlerDebugBreakpoints', {
      kind: 'abap',
      operation: 'setBreakpoints',
      breakpoints: [{ statement: 'WRITE' }],
      request_user: 'other_user',
    });
    expect(jsonOf(armed)).toMatchObject({
      request_user: 'OTHER_USER',
      debugging_mode: 'user',
      terminal_id: IDS.terminalId,
      ide_id: IDS.ideId,
    });
    const handle = jsonOf(armed).state_handle;
    t.wire.mode = 'document';
    for (const stated of [
      { request_user: 'third_user' },
      { debugging_mode: 'terminal' },
    ]) {
      const answer = await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'abap',
        operation: 'listen',
        hold_seconds: 5,
        ...stated,
      });
      expect(answer.isError).toBe(true);
    }
    expect(t.wire.sent).toEqual([]);
    const same = await t.call('HandlerDebugSession', {
      state_handle: handle,
      kind: 'abap',
      operation: 'stopListener',
      request_user: 'Other_User',
    });
    expect(same.isError).not.toBe(true);
    expect(t.wire.sent).toHaveLength(1);
    expect(t.wire.sent[0]).toContain('requestUser=OTHER_USER');
  });

  // The two shapes a success has been answered in: an ADT exception with the
  // subtype terminateDebuggee, and a plain ICF 500 with an empty body. Each
  // reaches the caller as SAP sent it, a 500 failure with its step.
  const TERMINATE_500 = (subType: string) =>
    `<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="AdiFailed"/><message lang="EN">Debuggee terminated</message><localizedMessage lang="EN">Debuggee terminated</localizedMessage><properties><entry key="com.sap.adt.communicationFramework.subType">${subType}</entry></properties></exc:exception>`;
  it.each([
    [
      'terminateDebuggee',
      'terminate debuggee',
      TERMINATE_500('terminateDebuggee'),
    ],
    ['terminateDebugger', 'terminate debugger', ''],
  ])(
    '%s: the 500 SAP answers when it succeeded reaches the caller as SAP sent it',
    async (operation, step, data) => {
      const t = install();
      const handle = (await prepare(t, 'attached')).state_handle;
      t.wire.mode = 'document';
      t.wire.refusalOf = (_m, url) =>
        url.includes(`method=${operation}`) ? { status: 500, data } : undefined;
      const answer = await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'abap',
        operation,
      });
      expect(t.wire.sent).toEqual([
        `POST /sap/bc/adt/debugger?method=${operation}`,
      ]);
      expect(answer.isError).toBe(true);
      const failed = jsonOf(answer);
      expect(failed.status).toBe(500);
      expect(failed.step).toBe(step);
    },
  );

  it('a second attach becomes the one the calls work on; the first attaching session closes at the cleanup', async () => {
    const t = install();
    const handle = (await prepare(t, 'attached')).state_handle;
    const abap = t.instance.abap as unknown as {
      current?: { connection: IAbapConnection };
    };
    const first = abap.current!.connection;
    const second = await t.call('HandlerDebugSession', {
      state_handle: handle,
      kind: 'abap',
      operation: 'attach',
      debuggee_id: 'DEBUGGEE2',
    });
    expect(second.isError).not.toBe(true);
    const now = abap.current!.connection;
    expect(now).not.toBe(first);
    t.wire.mode = 'document';
    await t.instance.stop();
    expect(t.wire.sent).toEqual([]);
    expect(t.wire.closed).toBe(t.wire.opened);
  });

  it('one listen at a time: a second listen while one holds is refused before any request', async () => {
    const t = install();
    t.wire.mode = 'pending';
    const first = t.call('HandlerDebugSession', {
      kind: 'abap',
      operation: 'listen',
      hold_seconds: 60,
    });
    first.catch(() => undefined);
    await settle();
    expect(t.wire.sent).toHaveLength(1);
    // Held open by a wrong rule, the second call would never answer: it is raced, never awaited alone.
    const second = await answeredOrHeld(
      t.call('HandlerDebugSession', {
        state_handle: t.state.handle,
        kind: 'abap',
        operation: 'listen',
        hold_seconds: 60,
      }),
    );
    await settle();
    expect(t.wire.sent).toHaveLength(1);
    expect(second.isError).toBe(true);
    expect(second.content[0].text).toContain(
      'a listen is open for this debug session',
    );
  });

  it('one AMDP event read at a time: a second getEvents while one holds is refused before any request', async () => {
    const t = install();
    const started = await prepare(t, 'amdp');
    t.wire.mode = 'pending';
    const first = t.call('HandlerDebugSession', {
      ...started,
      kind: 'amdp',
      operation: 'getEvents',
    });
    first.catch(() => undefined);
    await settle();
    expect(t.wire.sent).toHaveLength(1);
    // Held open by a wrong rule, the second call would never answer: it is raced, never awaited alone.
    const second = await answeredOrHeld(
      t.call('HandlerDebugSession', {
        ...started,
        kind: 'amdp',
        operation: 'getEvents',
      }),
    );
    await settle();
    expect(t.wire.sent).toHaveLength(1);
    expect(second.isError).toBe(true);
    expect(second.content[0].text).toContain(
      'an event read is open for this AMDP session',
    );
  });

  it('AMDP: no background event read, nothing is sent between calls', async () => {
    jest.useFakeTimers({
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    try {
      const onBreak = corpusBody('amdp-debugger--05-events-on-break');
      const t = install((method, url) =>
        method === 'GET' && url === `${MAIN}/MAIN1` ? onBreak : '',
      );
      t.wire.mode = 'document';
      const started = await t.call('HandlerDebugSession', {
        kind: 'amdp',
        operation: 'start',
      });
      const handle = jsonOf(started).state_handle;
      await t.call('HandlerDebugBreakpoints', {
        state_handle: handle,
        kind: 'amdp',
        operation: 'syncBreakpoints',
        breakpoints: [{ object_name: 'class_a', line: 14 }],
      });
      await jest.advanceTimersByTimeAsync(120_000);
      await settle();
      expect(t.wire.sent).toHaveLength(2);
      const events = await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'amdp',
        operation: 'getEvents',
      });
      expect(jsonOf(events).events.length).toBeGreaterThan(0);
      await jest.advanceTimersByTimeAsync(120_000);
      await settle();
      expect(t.wire.sent).toHaveLength(3);
      expect(t.wire.sent[2]).toBe(`GET ${MAIN}/MAIN1`);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the cleanup closes the connections the calls opened, and the handle ends', async () => {
    const t = install();
    const handle = (await prepare(t, 'attached')).state_handle;
    expect(t.state.holdsState()).toBe(true);
    t.wire.mode = 'document';
    await t.instance.stop();
    // The attachment ends with its connection's logoff: no release step is sent.
    expect(t.wire.sent).toEqual([]);
    expect(t.wire.closed).toBe(t.wire.opened);
    expect(t.state.holdsState()).toBe(false);
    expect(() => t.state.check(handle)).toThrow('state is not available');
  });
});
