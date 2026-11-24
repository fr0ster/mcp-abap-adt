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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { AbapDebugger, AmdpDebugger } from '@mcp-abap-adt/adt-clients';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
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
import { corpusBody } from '../../helpers/adtCorpus';
import {
  assertMatchObject,
  assertNoProperty,
  assertThrows,
} from '../../helpers/assertions';
import {
  advanceTimersByTimeAsync,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';
import { declaredRequired, jsonAt, listedJson } from '../../helpers/listedJson';
import { toolAnswer } from '../../helpers/toolAnswer';

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
        abapDebugger: (c, onConflict) => AbapDebugger.create(c, { onConflict }),
        requestUser: async () => 'TESTUSER',
        run: async () => ({ ok: true, output: '' }),
      },
      { ...IDS, stated: false },
    ),
    amdp: new AmdpSession({
      openConnection: open,
      closeConnection: close,
      dropConnection: () => {},
      amdpDebugger: (c) => AmdpDebugger.create(c),
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
  const call = (name: string, args: Record<string, unknown>): Promise<Answer> =>
    compactDebugEntries()
      .find((e) => e.toolDefinition.name === name)!
      .call(context, structuredClone(args))
      .then(toolAnswer);
  return { wire, state, instance, call };
}

type Answer = { isError?: boolean; content: Array<{ text: string }> };
const jsonOf = (a?: Answer) =>
  JSON.parse(a?.content[0]?.text ?? '{}') as Record<string, any>;

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
  assert.notEqual(answer.isError, true);
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
    assert.deepStrictEqual(
      entries.map((e) => e.toolDefinition.name),
      [
        'HandlerDebugBreakpoints',
        'HandlerDebugSession',
        'HandlerDebugStep',
        'HandlerDebugMaintain',
      ],
    );
  });

  it('HandlerDebugStart, HandlerDebugView and HandlerDebugWait are not served', () => {
    const compact = compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
      modify: compactModifyEntries,
    });
    const served = compact
      .groups({ connection: undefined } as never, 'stdio', { dataTools: false })
      .flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));
    for (const name of [
      'HandlerDebugStart',
      'HandlerDebugView',
      'HandlerDebugWait',
    ]) {
      assert.deepStrictEqual(
        { name, served: served.includes(name) },
        {
          name,
          served: false,
        },
      );
      assert.ok(!DEBUGGER_OWN_CONNECTION_TOOLS.includes(name));
    }
    for (const e of entries) {
      assert.ok(served.includes(e.toolDefinition.name));
      assert.ok(DEBUGGER_OWN_CONNECTION_TOOLS.includes(e.toolDefinition.name));
    }
    const ro = compactReadOnlyToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
    })
      .groups({ connection: undefined } as never, 'stdio', { dataTools: false })
      .flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));
    assert.deepStrictEqual(
      ro.filter((n) => n.startsWith('HandlerDebug')),
      [],
    );
  });

  it('every operation of the cases is in its tool, and every tool operation has a case', () => {
    for (const e of entries) {
      // end sends logoffs, no ADT request: its own tests below.
      const ops = (
        jsonAt(listedJson(e.toolDefinition.inputSchema), 'operation').enum ?? []
      ).filter((op) => op !== 'end');
      const covered = new Set(
        CASES.filter((c) => c.tool === e.toolDefinition.name).map(
          (c) => c.args.operation as string,
        ),
      );
      assert.deepStrictEqual(
        { tool: e.toolDefinition.name, ops: [...ops].sort() },
        {
          tool: e.toolDefinition.name,
          ops: [...covered].sort(),
        },
      );
    }
  });

  it('every parameter is described and every tool takes kind, operation and detail', () => {
    for (const e of entries) {
      const schema = listedJson(e.toolDefinition.inputSchema);
      {
        const actual = declaredRequired(e.toolDefinition.inputSchema);
        for (const expected of ['kind', 'operation']) {
          assert.ok(actual.some((e) => isDeepStrictEqual(e, expected)));
        }
      }
      assert.notEqual(schema.properties?.detail, undefined);
      for (const [name, p] of Object.entries(schema.properties ?? {}))
        if (name !== 'detail')
          assert.deepStrictEqual(
            {
              name,
              described: typeof p === 'object' && !!p.description,
            },
            {
              name,
              described: true,
            },
          );
    }
  });
});

describe('descriptions, positive', () => {
  const byName = new Map(
    compactDebugEntries().map((e) => [e.toolDefinition.name, e.toolDefinition]),
  );
  const description = (name: string) => byName.get(name)!.description as string;

  // Each operation by its function: what SAP does at it is the parameters'.
  for (const [tool, words] of [
    [
      'HandlerDebugStep',
      'operation stepRunToLine: runs the ABAP debuggee to the source position named.',
    ],
    [
      'HandlerDebugSession',
      'operation terminateDebuggee: ends the ABAP debuggee where it stands',
    ],
    [
      'HandlerDebugSession',
      'operation detachDebugger: detaches the debugger from the ABAP debuggee, which runs on',
    ],
    [
      'HandlerDebugSession',
      'operation listen: listens for an ABAP debuggee for the seconds asked',
    ],
    [
      'HandlerDebugSession',
      "operation end: logs off every connection of the debug state and ends it, the user's breakpoints staying set",
    ],
  ] as const) {
    it(`${tool} states ${words.split(':')[0]} by its function`, () => {
      assert.ok(description(tool).includes(words), description(tool));
    });
  }

  it('no description and no parameter description names another tool or states a negation', () => {
    const NEGATION =
      /\b(not|no|none|never|nothing|without|instead|but|cannot|in place of)\b/i;
    for (const [name, tool] of byName) {
      const texts = [
        tool.description as string,
        ...Object.values(listedJson(tool.inputSchema).properties ?? {}).map(
          (p) => (typeof p === 'object' ? (p.description ?? '') : ''),
        ),
      ];
      for (const text of texts) {
        assert.deepStrictEqual(
          { name, text, negation: NEGATION.test(text) },
          {
            name,
            text,
            negation: false,
          },
        );
        for (const other of [
          ...byName.keys(),
          'HandlerDebugStart',
          'HandlerDebugView',
          'HandlerDebugWait',
        ])
          if (other !== name)
            assert.deepStrictEqual(
              { name, text, names: text.includes(other) },
              {
                name,
                text,
                names: false,
              },
            );
      }
    }
  });
});

describe('each call is exactly one request (held / document / 404)', () => {
  for (const [_label, c] of CASES.map((c): [string, (typeof CASES)[number]] => [
    `${c.tool} ${c.args.kind} ${c.args.operation}`,
    c,
  ])) {
    it(
      format('%s: exactly one request, the named method', _label),
      async () => {
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => runIn(mode, c.tool, c.args, c.setup)),
        );
        assert.equal(held.sent.length, 1);
        if (typeof c.request === 'string')
          assert.equal(held.sent[0], c.request);
        else assert.match(held.sent[0] ?? '', c.request);
        assert.deepStrictEqual(documented.sent, held.sent);
        assert.deepStrictEqual(refused.sent, held.sent);

        assert.notEqual(documented.answer?.isError, true);
        assert.match(jsonOf(documented.answer).state_handle, /^[0-9A-F]{32}$/);

        assert.equal(refused.answer?.isError, true);
        const failed = jsonOf(refused.answer);
        assert.equal(failed.status, 404);
        assert.equal(failed.step, c.step);
        // The failure answers the handle beside the error: the state holds what the call fixed.
        const handleBlock = refused.answer?.content
          .map((block) => JSON.parse(block.text) as Record<string, unknown>)
          .find((block) => 'state_handle' in block);
        const shownHandle = handleBlock?.state_handle;
        assert.ok(typeof shownHandle === 'string');
        assert.match(shownHandle, /^[0-9A-F]{32}$/);
      },
    );
  }
});

describe("the chain is the consumer's", () => {
  it('no background listen loop: nothing is sent between calls', async () => {
    // setImmediate, nextTick and queueMicrotask real: setImmediate
    // left out of the faked APIs (the other two are never faked here).
    useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
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
      assertMatchObject(jsonOf(caught), { caught: true });
      assert.equal(typeof jsonOf(caught).debuggee_id, 'string');
      assert.equal(t.wire.sent.length, 2);
      // A catch is the consumer's to attach; nothing listens again, nothing attaches.
      await advanceTimersByTimeAsync(120_000);
      await settle();
      assert.equal(t.wire.sent.length, 2);
      const stepped = await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'abap',
        operation: 'attach',
        debuggee_id: jsonOf(caught).debuggee_id,
        server: jsonOf(caught).server,
      });
      assert.notEqual(stepped.isError, true);
      await t.call('HandlerDebugStep', {
        state_handle: handle,
        kind: 'abap',
        operation: 'stepOver',
      });
      await advanceTimersByTimeAsync(120_000);
      await settle();
      assert.equal(t.wire.sent.length, 4);
      assert.equal(t.wire.sent[3], 'POST /sap/bc/adt/debugger?method=stepOver');
    } finally {
      useRealTimers();
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
      assert.equal(sent.length, 1);
      const query = new URLSearchParams(sent[0].split('?')[1]);
      assert.equal(query.get('timeout'), String(hold));
    }
  });

  it('listen without hold_seconds is refused before any request', async () => {
    const { sent, answer } = await runIn(
      'document',
      'HandlerDebugSession',
      { kind: 'abap', operation: 'listen' },
      'none',
    );
    assert.deepStrictEqual(sent, []);
    assert.equal(answer?.isError, true);
    assert.ok(
      answer?.content[0].text.includes('hold_seconds: needed for listen'),
    );
  });

  for (const operation of ['stepRunToLine', 'stepJumpToLine']) {
    it(
      format(
        '%s: stepToLine without an address refused before any request',
        operation,
      ),
      async () => {
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
          assert.deepStrictEqual({ missing, sent }, { missing, sent: [] });
          assert.equal(answer?.isError, true);
          assert.ok(
            answer?.content[0].text.includes(
              `object_type, object_name and line: needed for ${operation}`,
            ),
          );
        }
      },
    );
  }

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
    assert.notEqual(detached.isError, true);
    assert.deepStrictEqual(t.wire.sent, [
      'POST /sap/bc/adt/debugger?method=detachDebugger',
    ]);
    assert.deepStrictEqual(seen, [on]);
    assert.equal(t.wire.closed, 0);
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
    assert.deepStrictEqual(t.wire.sent, []);
    assert.equal(answer.isError, true);
    assert.ok(
      answer.content[0].text.includes(
        'a amdp debug session is already open on this server',
      ),
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
    assert.deepStrictEqual(t.wire.sent, []);
    assert.equal(answer.isError, true);
    assert.ok(
      answer.content[0].text.includes(
        'operation: kind amdp takes getDataPreview; getStack is outside them',
      ),
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
    assert.deepStrictEqual(t.wire.sent, []);
    assert.equal(answer.isError, true);
  });

  it('the first abap call fixes the identity; a call stating another is refused before any request', async () => {
    const t = install();
    const armed = await t.call('HandlerDebugBreakpoints', {
      kind: 'abap',
      operation: 'setBreakpoints',
      breakpoints: [{ statement: 'WRITE' }],
      request_user: 'other_user',
    });
    assertMatchObject(jsonOf(armed), {
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
      assert.equal(answer.isError, true);
    }
    assert.deepStrictEqual([...t.wire.sent], []);
    const same = await t.call('HandlerDebugSession', {
      state_handle: handle,
      kind: 'abap',
      operation: 'stopListener',
      request_user: 'Other_User',
    });
    assert.notEqual(same.isError, true);
    assert.equal(t.wire.sent.length, 1);
    assert.ok(t.wire.sent[0].includes('requestUser=OTHER_USER'));
  });

  // The two shapes a success has been answered in: an ADT exception with the
  // subtype terminateDebuggee, and a plain ICF 500 with an empty body. Each
  // reaches the caller as SAP sent it, a 500 failure with its step.
  const TERMINATE_500 = (subType: string) =>
    `<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="AdiFailed"/><message lang="EN">Debuggee terminated</message><localizedMessage lang="EN">Debuggee terminated</localizedMessage><properties><entry key="com.sap.adt.communicationFramework.subType">${subType}</entry></properties></exc:exception>`;
  for (const [operation, step, data] of [
    [
      'terminateDebuggee',
      'terminate debuggee',
      TERMINATE_500('terminateDebuggee'),
    ],
    ['terminateDebugger', 'terminate debugger', ''],
  ]) {
    it(
      format(
        '%s: the 500 SAP answers when it succeeded reaches the caller as SAP sent it',
        operation,
      ),
      async () => {
        const t = install();
        const handle = (await prepare(t, 'attached')).state_handle;
        t.wire.mode = 'document';
        t.wire.refusalOf = (_m, url) =>
          url.includes(`method=${operation}`)
            ? { status: 500, data }
            : undefined;
        const answer = await t.call('HandlerDebugSession', {
          state_handle: handle,
          kind: 'abap',
          operation,
        });
        assert.deepStrictEqual(t.wire.sent, [
          `POST /sap/bc/adt/debugger?method=${operation}`,
        ]);
        assert.equal(answer.isError, true);
        const failed = jsonOf(answer);
        assert.equal(failed.status, 500);
        assert.equal(failed.step, step);
      },
    );
  }

  it('AMDP: no background event read, nothing is sent between calls', async () => {
    // setImmediate, nextTick and queueMicrotask real: setImmediate
    // left out of the faked APIs (the other two are never faked here).
    useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
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
      await advanceTimersByTimeAsync(120_000);
      await settle();
      assert.equal(t.wire.sent.length, 2);
      const events = await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'amdp',
        operation: 'getEvents',
      });
      assert.ok(jsonOf(events).events.length > 0);
      await advanceTimersByTimeAsync(120_000);
      await settle();
      assert.equal(t.wire.sent.length, 3);
      assert.equal(t.wire.sent[2], `GET ${MAIN}/MAIN1`);
    } finally {
      useRealTimers();
    }
  });

  it('every attach goes on the one attaching session', async () => {
    const t = install();
    const handle = (await prepare(t, 'attached')).state_handle;
    const opened = t.wire.opened;
    t.wire.mode = 'document';
    const second = await t.call('HandlerDebugSession', {
      state_handle: handle,
      kind: 'abap',
      operation: 'attach',
      debuggee_id: 'DEBUGGEE2',
    });
    assert.notEqual(second.isError, true);
    assert.equal(t.wire.sent.length, 1);
    assert.ok(t.wire.sent[0].includes('debuggeeId=DEBUGGEE2'));
    assert.equal(t.wire.opened, opened);
  });

  for (const [kind, operation, extra] of [
    ['abap', 'listen', { hold_seconds: 60 }],
    ['amdp', 'getEvents', {}],
  ] as const) {
    it(
      format('%s %s while one holds goes to SAP as it is', kind, operation),
      async () => {
        const t = install();
        const handle =
          kind === 'amdp' ? (await prepare(t, 'amdp')).state_handle : undefined;
        t.wire.mode = 'pending';
        const first = t.call('HandlerDebugSession', {
          ...(handle ? { state_handle: handle } : {}),
          kind,
          operation,
          ...extra,
        });
        first.catch(() => undefined);
        await settle();
        const second = t.call('HandlerDebugSession', {
          state_handle: handle ?? t.state.handle,
          kind,
          operation,
          ...extra,
        });
        second.catch(() => undefined);
        await settle();
        assert.equal(t.wire.sent.length, 2);
        assert.equal(t.wire.sent[1], t.wire.sent[0]);
      },
    );
  }

  describe('end logs off the debug state', () => {
    const end = (
      t: ReturnType<typeof install>,
      handle: string | undefined,
      kind = 'abap',
    ) =>
      t.call('HandlerDebugSession', {
        ...(handle !== undefined ? { state_handle: handle } : {}),
        kind,
        operation: 'end',
      });

    async function listening(t: ReturnType<typeof install>) {
      const armed = await t.call('HandlerDebugBreakpoints', {
        kind: 'abap',
        operation: 'setBreakpoints',
        breakpoints: [{ statement: 'WRITE' }],
      });
      const handle = jsonOf(armed).state_handle as string;
      await t.call('HandlerDebugSession', {
        state_handle: handle,
        kind: 'abap',
        operation: 'listen',
        hold_seconds: 5,
      });
      return handle;
    }

    for (const [_label, setup, logoffs] of [
      [
        'ABAP attached: the attaching session, the listener, the control connection',
        'attached',
        3,
      ],
      [
        'ABAP listening: the listener and the control connection',
        'listening',
        2,
      ],
      ['AMDP: the events and the commands connection', 'amdp', 2],
    ] as const) {
      it(
        format('%s — exactly the logoffs, nothing else is sent', _label),
        async () => {
          const t = install((_m, url) =>
            url.includes('/listeners?') ? LISTEN_CATCH : '',
          );
          let handle: string;
          if (setup === 'amdp')
            handle = (await prepare(t, 'amdp')).state_handle!;
          else {
            handle = await listening(t);
            if (setup === 'attached')
              await t.call('HandlerDebugSession', {
                state_handle: handle,
                kind: 'abap',
                operation: 'attach',
                debuggee_id: 'DEBUGGEE1',
              });
          }
          assert.equal(t.wire.opened, logoffs);
          assert.equal(t.wire.closed, 0);
          t.wire.mode = 'document';
          const answer = await end(
            t,
            handle,
            setup === 'amdp' ? 'amdp' : 'abap',
          );
          assert.notEqual(answer.isError, true);
          assertMatchObject(jsonOf(answer), { ended: true, logoffs });
          assertNoProperty(jsonOf(answer), 'state_handle');
          assert.deepStrictEqual(t.wire.sent, []);
          assert.equal(t.wire.closed, logoffs);
          assert.equal(t.state.holdsState(), false);
          // The handle is gone: every call on it is not available.
          const after = await t.call('HandlerDebugStep', {
            state_handle: handle,
            kind: setup === 'amdp' ? 'amdp' : 'abap',
            operation: 'stepOver',
            debuggee_id: 'D1',
          });
          assert.equal(after.isError, true);
          assert.ok(after.content[0].text.includes('state is not available'));
          assert.deepStrictEqual(t.wire.sent, []);
        },
      );
    }

    it('a new debug state of the other kind, and of another identity, opens after end', async () => {
      const t = install();
      const handle = await listening(t);
      t.wire.mode = 'document';
      await end(t, handle);
      const started = await t.call('HandlerDebugSession', {
        kind: 'amdp',
        operation: 'start',
      });
      assert.notEqual(started.isError, true);
      const amdpHandle = jsonOf(started).state_handle as string;
      assert.match(amdpHandle, /^[0-9A-F]{32}$/);
      assert.notEqual(amdpHandle, handle);
      await end(t, amdpHandle, 'amdp');
      const other = await t.call('HandlerDebugBreakpoints', {
        kind: 'abap',
        operation: 'setBreakpoints',
        breakpoints: [{ statement: 'WRITE' }],
        request_user: 'another_user',
      });
      assert.notEqual(other.isError, true);
      assert.equal(jsonOf(other).request_user, 'ANOTHER_USER');
    });

    it('end with the other kind than the state holds ends it all the same', async () => {
      const t = install();
      const handle = await listening(t);
      const answer = await end(t, handle, 'amdp');
      assert.notEqual(answer.isError, true);
      assert.equal(t.state.holdsState(), false);
    });

    it('end without a handle is refused before any request', async () => {
      const t = install();
      await listening(t);
      t.wire.mode = 'document';
      const answer = await end(t, undefined);
      assert.equal(answer.isError, true);
      assert.ok(answer.content[0].text.includes('state is not available'));
      assert.deepStrictEqual(t.wire.sent, []);
      assert.equal(t.wire.closed, 0);
      assert.equal(t.state.holdsState(), true);
    });

    it('the kind refusal names the end operation', async () => {
      const t = install();
      const started = await prepare(t, 'amdp');
      const answer = await t.call('HandlerDebugStep', {
        ...started,
        kind: 'abap',
        operation: 'stepOver',
      });
      assert.ok(
        answer.content[0].text.includes(
          'HandlerDebugSession operation end, with its state_handle, ends it',
        ),
      );
    });
  });

  it('the cleanup closes the connections the calls opened, and the handle ends', async () => {
    const t = install();
    const handle = (await prepare(t, 'attached')).state_handle;
    assert.equal(t.state.holdsState(), true);
    t.wire.mode = 'document';
    await t.instance.stop();
    // The attachment ends with its connection's logoff: no release step is sent.
    assert.deepStrictEqual(t.wire.sent, []);
    assert.equal(t.wire.closed, t.wire.opened);
    assert.equal(t.state.holdsState(), false);
    assertThrows(() => t.state.check(handle), 'state is not available');
  });
});
