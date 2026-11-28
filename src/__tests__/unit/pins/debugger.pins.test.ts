/**
 * The ABAP debugger at a stop, and the AMDP debugger at a break, pinned on
 * each variant through the server's dispatch (`pinServer`: the debugger, its
 * listener and control connections to the stand-in).
 *
 * **The stop.** Each debugger case's `before` starts a listener
 * (`DebugStartListener`); the stand-in answers, by the index the request
 * arrives at, the breakpoints set, the listen (a debuggee waiting), the
 * attach and the stack with the documents the corpus captured
 * (`debugger-conversation`), so the start answers `stopped` and the case's
 * own call runs at the stop. Its window holds what it sends and nothing else.
 *
 * **The memory snapshots.** `MemorySnapshotGet` and `MemorySnapshotDelta`
 * need no stop: their one read each.
 *
 * The built connection's kind is what `SAP_SYSTEM_TYPE` states (the server
 * builds it from settings), so each variant's cases run with it stated as
 * that variant.
 */

import assert from 'node:assert/strict';
import { after, before, describe } from 'node:test';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody } from '../../helpers/adtCorpus';
import { envelopeResponse } from '../../helpers/batchEnvelope';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

type Answer = Partial<IAdtWireResponse> | undefined;

const XML = { 'content-type': 'application/xml' };

/** A corpus document, answered `200`. */
const corpus = (name: string, contentType = 'application/xml'): Answer => ({
  status: 200,
  headers: { 'content-type': contentType },
  data: corpusBody(name),
});

/** The stop: SAP's answers to the start's breakpoints, listen, attach and stack. */
const STOP = {
  breakpoints: corpus('debugger-conversation--01-breakpoints-set'),
  listen: corpus(
    'debugger-conversation--04-listen',
    'application/vnd.sap.as+xml; charset=utf-8; dataname=com.sap.adt.debugger.DebuggeesList',
  ),
  attach: corpus('debugger-conversation--05-attach'),
  stack: corpus('debugger-conversation--06-stack'),
};

/**
 * Where each of the stop's answers goes, per variant: the index its request
 * arrives at the stand-in, counted from the pin server's logon; and where
 * the case's own requests begin.
 */
const AT = {
  onprem: { breakpoints: 4, listen: 6, attach: 8, stack: 9, own: 10 },
  cloud: { breakpoints: 6, listen: 9, attach: 12, stack: 13, own: 14 },
} as const;

/** The answers of a case at the stop: the stop's, then the case's own, in order. */
function atStop(
  variant: 'onprem' | 'cloud',
  own: readonly Answer[] = [],
): Answer[] {
  const at = AT[variant];
  const answers: Answer[] = Array.from({ length: at.own }, () => undefined);
  answers[at.breakpoints] = STOP.breakpoints;
  answers[at.listen] = STOP.listen;
  answers[at.attach] = STOP.attach;
  answers[at.stack] = STOP.stack;
  return [...answers, ...own];
}

/** The start every debugger case runs first: one line breakpoint, no run. */
const START = {
  tool: 'DebugStartListener',
  args: {
    breakpoints: [
      { object_type: 'CLAS', object_name: 'ZCL_MCP_PIN_DBG', line: 9 },
    ],
  },
};

/** The breakpoint the corpus's stop placed, as the list names it. */
const PLACED =
  'KIND=0.SOURCETYPE=ABAP.MAIN_PROGRAM=ZCL_CV_DBG_MEASURE============CP.INCLUDE=ZCL_CV_DBG_MEASURE============CM002.LINE_NR=9';

/**
 * DebugListBreakpoints sends nothing: it answers the breakpoints the session
 * armed, the one the stop placed among them.
 */
function expectPlaced(answer: { content: Array<{ text: string }> }): void {
  const listed: unknown = JSON.parse(answer.content[0]?.text ?? 'null');
  assert.deepStrictEqual(
    Array.isArray(listed)
      ? listed.map((row: unknown) =>
          typeof row === 'object' && row !== null
            ? Reflect.get(row, 'id')
            : row,
        )
      : listed,
    [PLACED],
  );
}

/**
 * The debugger batch at the stop: begun, one stack read recorded (it sends
 * nothing), and its end — one envelope on the stop's connection, answered
 * with the stack as one part.
 */
const BATCH_BEGUN = {
  full: [START, { tool: 'DebugBatchBegin', args: {} }],
  compact: [START, { tool: 'HandlerDebugBatch', args: { action: 'begin' } }],
};

/** The stack read the batch records, as each set calls it. */
const STACK_READ = {
  full: {
    tool: 'DebugGetStack',
    args: {},
    bind: { state_handle: { from: 0, field: 'state_handle' } },
  },
  compact: {
    tool: 'HandlerDebugMaintain',
    args: { kind: 'abap', operation: 'getStack' },
    bind: { state_handle: { from: 0, field: 'state_handle' } },
  },
};

/** The batch's steps before its end. */
const BATCH_RECORDED = {
  full: [...BATCH_BEGUN.full, STACK_READ.full],
  compact: [...BATCH_BEGUN.compact, STACK_READ.compact],
};

/** The batch's steps through its end, before its answers are read. */
const BATCH_ENDED = {
  full: [...BATCH_RECORDED.full, { tool: 'DebugBatchEnd', args: {} }],
  compact: [
    ...BATCH_RECORDED.compact,
    { tool: 'HandlerDebugBatch', args: { action: 'end' } },
  ],
};

/** SAP's answer to the envelope: the stack, its one part. */
const ENVELOPE: Answer = envelopeResponse([
  {
    status: 200,
    statusText: 'OK',
    headers: XML,
    body: corpusBody('debugger-conversation--06-stack'),
  },
]);

/** DebugBatchBegin / `begin` sends nothing: the batch is on. */
function expectBatchOn(answer: { content: Array<{ text: string }> }): void {
  const begun: unknown = JSON.parse(answer.content[0]?.text ?? 'null');
  assert.equal(
    typeof begun === 'object' && begun !== null
      ? Reflect.get(begun, 'debug_batch')
      : begun,
    'on',
  );
}

/** The batch end's summary: one call recorded, sent and answered. */
function expectOneSent(answer: { content: Array<{ text: string }> }): void {
  assert.deepStrictEqual(JSON.parse(answer.content[0]?.text ?? 'null'), {
    recorded: 1,
    sent: 1,
    received: 1,
  });
}

/** The answers read send nothing: the stack read, number 1, answered. */
function expectStackAnswered(answer: {
  content: Array<{ text: string }>;
}): void {
  const entries: unknown = JSON.parse(answer.content[0]?.text ?? 'null');
  assert.deepStrictEqual(
    Array.isArray(entries)
      ? entries.map((entry: unknown) =>
          typeof entry === 'object' && entry !== null
            ? [
                Reflect.get(entry, 'number'),
                Reflect.get(entry, 'isError') === true,
              ]
            : entry,
        )
      : entries,
    [[1, false]],
  );
}

/** A watchpoint document, as SAP answers its create and its list. */
const WATCHPOINTS: Answer = {
  status: 200,
  headers: XML,
  data: '<?xml version="1.0" encoding="utf-8"?><dbg:watchpoints xmlns:dbg="http://www.sap.com/adt/debugger"><dbg:watchpoint id="1" variableName="LV_COUNTER" kind="local" active="true" expired="false" procedure="IF_OO_ADT_CLASSRUN~MAIN" condition="" oldValue="1" currentValue="1"/></dbg:watchpoints>',
};

/** SAP's empty `200`. */
const DONE: Answer = { status: 200, data: '' };

/** SAP's answer to a variable set: the variables it read after it. */
const VARIABLES = corpus(
  'debugger-conversation--10-variables-by-name',
  'application/vnd.sap.as+xml; charset=utf-8; dataname=com.sap.adt.debugger.Variables',
);

/** A memory snapshot overview. */
const OVERVIEW: Answer = {
  status: 200,
  headers: XML,
  data: '<?xml version="1.0" encoding="utf-8"?><memoryanalysis:overview xmlns:memoryanalysis="http://www.sap.com/adt/memoryanalysis"><memoryanalysis:rollMemory><memoryanalysis:internalTotalUsed value="4052256"/></memoryanalysis:rollMemory></memoryanalysis:overview>',
};

/** A memory read's answers: the logon in its window, then the overview. */
const LOGON = {
  onprem: [undefined, undefined, OVERVIEW],
  cloud: [undefined, undefined, undefined, OVERVIEW],
};

/** The snapshots the memory cases name. */
const SNAPSHOT_FROM = '0CC47A1E68C11FE1B2CA5067B3BB0001';
const SNAPSHOT_TO = '0CC47A1E68C11FE1B2CA5067B3BB0002';

/**
 * `SAP_SYSTEM_TYPE` stated as `variant` for the enclosing describe's
 * cases, and restored after them.
 */
function statedAs(variant: 'onprem' | 'cloud'): void {
  let previous: string | undefined;
  before(() => {
    previous = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = variant;
  });
  after(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });
}

describe('onprem', () => {
  statedAs('onprem');
  pinCases([
    {
      tool: 'DebugBatchBegin',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      answers: atStop('onprem'),
      args: {},
      expected: 'none',
      ran: expectBatchOn,
    },
    {
      tool: 'DebugBatchEnd',
      variant: 'onprem',
      stand: 'server',
      before: BATCH_RECORDED.full,
      answers: atStop('onprem', [ENVELOPE]),
      args: {},
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_ee05eec6-c315-4480-ad6f-0eb5aec810ce',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '053b871d-b4ad-4b9e-a029-19aaa40c82a1',
            'sap-adt-request-id': '78487ce2db89420caaf1e42fab652118',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '294',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '--batch_ee05eec6-c315-4480-ad6f-0eb5aec810ce\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/debugger/stack?emode=_&semanticURIs=true HTTP/1.1\r\nAccept: application/xml\r\nX-sap-adt-sessiontype: stateful\r\n\r\n\r\n\r\n--batch_ee05eec6-c315-4480-ad6f-0eb5aec810ce--\r\n',
        },
      ],
      ran: expectOneSent,
    },
    {
      tool: 'DebugBatchAnswers',
      variant: 'onprem',
      stand: 'server',
      before: BATCH_ENDED.full,
      answers: atStop('onprem', [ENVELOPE]),
      args: { numbers: [1] },
      expected: 'none',
      ran: expectStackAnswered,
    },
    {
      tool: 'HandlerDebugBatch',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      answers: atStop('onprem'),
      args: { action: 'begin' },
      expected: 'none',
      ran: expectBatchOn,
    },
    {
      tool: 'HandlerDebugBatch',
      variant: 'onprem',
      stand: 'server',
      before: BATCH_RECORDED.compact,
      answers: atStop('onprem', [ENVELOPE]),
      args: { action: 'end' },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_478a5b2b-7f10-4df1-ad61-2b321d77cb88',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '998c55b5-dbe3-4189-a7ed-25254a0a2dd6',
            'sap-adt-request-id': 'ab83b764c4c04511a36d8aeb9da8020a',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '294',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '--batch_478a5b2b-7f10-4df1-ad61-2b321d77cb88\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/debugger/stack?emode=_&semanticURIs=true HTTP/1.1\r\nAccept: application/xml\r\nX-sap-adt-sessiontype: stateful\r\n\r\n\r\n\r\n--batch_478a5b2b-7f10-4df1-ad61-2b321d77cb88--\r\n',
        },
      ],
      ran: expectOneSent,
    },
    {
      tool: 'HandlerDebugBatch',
      variant: 'onprem',
      stand: 'server',
      before: BATCH_ENDED.compact,
      answers: atStop('onprem', [ENVELOPE]),
      args: { action: 'answers', number: 1 },
      expected: 'none',
      ran: expectStackAnswered,
    },
    {
      tool: 'DebugListBreakpoints',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem'),
      args: {},
      expected: 'none',
      ran: expectPlaced,
    },
    {
      tool: 'DebugSetStackPosition',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem', [DONE, STOP.stack]),
      args: { position: 11 },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger?method=setStackPosition&position=11',
          headers: {
            accept: 'application/xml',
            'content-type': 'application/x-www-form-urlencoded',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '47790dca-6fc0-4344-a71e-18aeeefa655f',
            'sap-adt-request-id': 'b1ba326d1d0f435eaa454003b8b6071b',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
            'content-length': '0',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/debugger/stack?emode=_&semanticURIs=true',
          headers: {
            accept: 'application/xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '47790dca-6fc0-4344-a71e-18aeeefa655f',
            'sap-adt-request-id': '2e8ea34b59c14f8ca0653dde54dad884',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugSetVariable',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem', [VARIABLES]),
      args: { name: 'LV_COUNTER', value: '41' },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger?method=setVariableValue&variableName=LV_COUNTER',
          headers: {
            accept: 'application/xml',
            'content-type': 'text/plain; charset=utf-8',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '9f67fa55-6a96-4420-a148-9760bab456e4',
            'sap-adt-request-id': '4714dfc3b8f140b0aca6d946a2d04e82',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '2',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '41',
        },
      ],
    },
    {
      tool: 'DebugCreateWatchpoint',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem', [WATCHPOINTS]),
      args: { name: 'LV_COUNTER' },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger/watchpoints?variableName=LV_COUNTER',
          headers: {
            accept: 'application/xml',
            'content-type': 'application/x-www-form-urlencoded',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': 'cf8ce2f2-eee8-4f47-afa5-72b63e4c4859',
            'sap-adt-request-id': 'd797228033a24045a74b3603f5f1745b',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
            'content-length': '0',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugListWatchpoints',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem', [WATCHPOINTS]),
      args: {},
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/debugger/watchpoints',
          headers: {
            accept: 'application/xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '17d9d3be-098e-42b7-ad15-78dae6915f4e',
            'sap-adt-request-id': '4973da6a54b647ddac440025a1c4fa2a',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugDeleteWatchpoint',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem', [DONE]),
      args: { watchpoint_id: '1' },
      expected: [
        {
          method: 'DELETE',
          url: '/sap/bc/adt/debugger/watchpoints/1',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '65128aa6-02bc-4054-aa0c-a76689391199',
            'sap-adt-request-id': '9d506fd1f0e34a02a12c5c319b14715f',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugDeleteBreakpoint',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem', [STOP.breakpoints]),
      args: { breakpoint_id: PLACED },
      expected: [
        {
          method: 'DELETE',
          url: '/sap/bc/adt/debugger/breakpoints/KIND%3D0.SOURCETYPE%3DABAP.MAIN_PROGRAM%3DZCL_CV_DBG_MEASURE%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3DCP.INCLUDE%3DZCL_CV_DBG_MEASURE%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3DCM002.LINE_NR%3D9?scope=external&debuggingMode=user&requestUser=STAND_IN_USER&terminalId=26B132E54280D9E026112D7CEFB1E2BD&ideId=5B65F6EE522670522659F14C0F1E5A42',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': 'f4b1eccc-3be9-4df6-aaea-a984303348db',
            'sap-adt-request-id': '25972b93d3e34e14ad3da05ed64febc5',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugTerminate',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('onprem', [DONE]),
      args: {},
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger?method=terminateDebuggee',
          headers: {
            accept: 'application/xml',
            'content-type': 'application/x-www-form-urlencoded',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': 'd62aeaf1-fcca-4519-a7fe-1a1e1f65df6e',
            'sap-adt-request-id': '848f8e64704141ecaf4155d98db135c6',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
            'content-length': '0',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'MemorySnapshotGet',
      variant: 'onprem',
      stand: 'server',
      answers: LOGON.onprem,
      args: { snapshot_id: SNAPSHOT_FROM, max_objects: 50 },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '1f58b245-a366-45eb-a932-ee561bc6fd85',
            'x-csrf-token': 'fetch',
            'sap-client': '100',
            cookie: 'sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': '1f58b245-a366-45eb-a932-ee561bc6fd85',
            'sap-adt-request-id': '27818ab873044796ac46637ea3282aa3',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/memory/snapshots/0CC47A1E68C11FE1B2CA5067B3BB0001/overview',
          headers: {
            accept: 'application/vnd.sap.adt.runtime.memory.overview.v1+xml',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': '1f58b245-a366-45eb-a932-ee561bc6fd85',
            'sap-adt-request-id': 'ffa0566b575544e2aa0ce09799281abc',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'MemorySnapshotDelta',
      variant: 'onprem',
      stand: 'server',
      answers: LOGON.onprem,
      args: { from_id: SNAPSHOT_FROM, to_id: SNAPSHOT_TO, max_objects: 50 },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': 'ab5155aa-b9cd-47a9-afbc-17d3826a57c3',
            'x-csrf-token': 'fetch',
            'sap-client': '100',
            cookie: 'sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'ab5155aa-b9cd-47a9-afbc-17d3826a57c3',
            'sap-adt-request-id': '2c4660f72e91444ca5be10666398e1f4',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/memory/snapdelta/overview?uri1=%2Fsap%2Fbc%2Fadt%2Fruntime%2Fmemory%2Fsnapshots%2F0CC47A1E68C11FE1B2CA5067B3BB0001&uri2=%2Fsap%2Fbc%2Fadt%2Fruntime%2Fmemory%2Fsnapshots%2F0CC47A1E68C11FE1B2CA5067B3BB0002',
          headers: {
            accept: 'application/vnd.sap.adt.runtime.memory.overview.v1+xml',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'ab5155aa-b9cd-47a9-afbc-17d3826a57c3',
            'sap-adt-request-id': '4ae341cb513144b6ae046c545518fc85',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  statedAs('cloud');
  pinCases([
    {
      tool: 'DebugBatchBegin',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      answers: atStop('cloud'),
      args: {},
      expected: 'none',
      ran: expectBatchOn,
    },
    {
      tool: 'DebugBatchEnd',
      variant: 'cloud',
      stand: 'server',
      before: BATCH_RECORDED.full,
      answers: atStop('cloud', [ENVELOPE]),
      args: {},
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_e7ae4fd7-3116-45db-a35c-75b98d43835f',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '6d9e89bc-58e7-4714-a5d7-3ec7da51ecf6',
            'sap-adt-request-id': 'b59a8dfd5396417caeedf1abaf566640',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '294',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '--batch_e7ae4fd7-3116-45db-a35c-75b98d43835f\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/debugger/stack?emode=_&semanticURIs=true HTTP/1.1\r\nAccept: application/xml\r\nX-sap-adt-sessiontype: stateful\r\n\r\n\r\n\r\n--batch_e7ae4fd7-3116-45db-a35c-75b98d43835f--\r\n',
        },
      ],
      ran: expectOneSent,
    },
    {
      tool: 'DebugBatchAnswers',
      variant: 'cloud',
      stand: 'server',
      before: BATCH_ENDED.full,
      answers: atStop('cloud', [ENVELOPE]),
      args: { numbers: [1] },
      expected: 'none',
      ran: expectStackAnswered,
    },
    {
      tool: 'HandlerDebugBatch',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      answers: atStop('cloud'),
      args: { action: 'begin' },
      expected: 'none',
      ran: expectBatchOn,
    },
    {
      tool: 'HandlerDebugBatch',
      variant: 'cloud',
      stand: 'server',
      before: BATCH_RECORDED.compact,
      answers: atStop('cloud', [ENVELOPE]),
      args: { action: 'end' },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_0a054732-2427-46cf-a9a9-60880b3af1f5',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '20f32ff5-56f9-4fe5-a698-e8244c84368d',
            'sap-adt-request-id': '4e2433754c454dd0af594fb054c18ba5',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '294',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '--batch_0a054732-2427-46cf-a9a9-60880b3af1f5\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/debugger/stack?emode=_&semanticURIs=true HTTP/1.1\r\nAccept: application/xml\r\nX-sap-adt-sessiontype: stateful\r\n\r\n\r\n\r\n--batch_0a054732-2427-46cf-a9a9-60880b3af1f5--\r\n',
        },
      ],
      ran: expectOneSent,
    },
    {
      tool: 'HandlerDebugBatch',
      variant: 'cloud',
      stand: 'server',
      before: BATCH_ENDED.compact,
      answers: atStop('cloud', [ENVELOPE]),
      args: { action: 'answers', number: 1 },
      expected: 'none',
      ran: expectStackAnswered,
    },
    {
      tool: 'DebugListBreakpoints',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud'),
      args: {},
      expected: 'none',
      ran: expectPlaced,
    },
    {
      tool: 'DebugSetStackPosition',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud', [DONE, STOP.stack]),
      args: { position: 11 },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger?method=setStackPosition&position=11',
          headers: {
            accept: 'application/xml',
            'content-type': 'application/x-www-form-urlencoded',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '148d15d6-25f5-4750-a913-60b5eeba4caa',
            'sap-adt-request-id': 'b3007b500b0b4a80a9a85eb73b034118',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
            'content-length': '0',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/debugger/stack?emode=_&semanticURIs=true',
          headers: {
            accept: 'application/xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '148d15d6-25f5-4750-a913-60b5eeba4caa',
            'sap-adt-request-id': 'aa75fa2ac5934004a63a8cc4a44a1768',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugSetVariable',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud', [VARIABLES]),
      args: { name: 'LV_COUNTER', value: '41' },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger?method=setVariableValue&variableName=LV_COUNTER',
          headers: {
            accept: 'application/xml',
            'content-type': 'text/plain; charset=utf-8',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '29b48e51-c994-450d-afb8-31bab763b1cb',
            'sap-adt-request-id': 'd64338deef404988ae277ede0f072dd4',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '2',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '41',
        },
      ],
    },
    {
      tool: 'DebugCreateWatchpoint',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud', [WATCHPOINTS]),
      args: { name: 'LV_COUNTER' },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger/watchpoints?variableName=LV_COUNTER',
          headers: {
            accept: 'application/xml',
            'content-type': 'application/x-www-form-urlencoded',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': 'ee849f68-8e51-4412-a87e-c82588a4540f',
            'sap-adt-request-id': 'a9531dbc9ab042f8acffa528d03b184f',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
            'content-length': '0',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugListWatchpoints',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud', [WATCHPOINTS]),
      args: {},
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/debugger/watchpoints',
          headers: {
            accept: 'application/xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': 'd0915828-5861-44a8-a51b-a67caa1b45df',
            'sap-adt-request-id': '84cd5b9ffb3c4bd1af5e443b9edc17e1',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugDeleteWatchpoint',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud', [DONE]),
      args: { watchpoint_id: '1' },
      expected: [
        {
          method: 'DELETE',
          url: '/sap/bc/adt/debugger/watchpoints/1',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '4f26ca27-73ae-4fe4-a433-437a4743c324',
            'sap-adt-request-id': '0e82815cd4004917a03052e99edd3624',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugDeleteBreakpoint',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud', [STOP.breakpoints]),
      args: { breakpoint_id: PLACED },
      expected: [
        {
          method: 'DELETE',
          url: '/sap/bc/adt/debugger/breakpoints/KIND%3D0.SOURCETYPE%3DABAP.MAIN_PROGRAM%3DZCL_CV_DBG_MEASURE%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3DCP.INCLUDE%3DZCL_CV_DBG_MEASURE%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3DCM002.LINE_NR%3D9?scope=external&debuggingMode=user&requestUser=STAND_IN_USER&terminalId=B8B585BBB07AB1DEE0747FCC6FEFED5C&ideId=668981A71B43D6E19032C39449469E42',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '38e2b47f-2c99-4989-a01b-60bb6508248b',
            'sap-adt-request-id': '3b9c3ae2eaf74ab8a6b20302cb9db54f',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'DebugTerminate',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      answers: atStop('cloud', [DONE]),
      args: {},
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/debugger?method=terminateDebuggee',
          headers: {
            accept: 'application/xml',
            'content-type': 'application/x-www-form-urlencoded',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '957cb583-739c-41a5-a20b-c3310d78a3d0',
            'sap-adt-request-id': 'b887f04f41764eaead2bba78af6e50f0',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-4; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
            'content-length': '0',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'MemorySnapshotGet',
      variant: 'cloud',
      stand: 'server',
      answers: LOGON.cloud,
      args: { snapshot_id: SNAPSHOT_FROM, max_objects: 50 },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/sessions?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.session.v3+xml, application/vnd.sap.adt.core.http.session.v2+xml, application/vnd.sap.adt.core.http.session.v1+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '382a98d6-3d95-425a-a4aa-2b7deb62afd9',
            'sap-adt-purpose': 'preflight_logon',
            'x-sap-security-session': 'create',
            'sap-client': '100',
            cookie: 'sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '382a98d6-3d95-425a-a4aa-2b7deb62afd9',
            'x-csrf-token': 'fetch',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '382a98d6-3d95-425a-a4aa-2b7deb62afd9',
            'sap-adt-request-id': '8f33272da29b441aac7d25f93dd3f626',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/memory/snapshots/0CC47A1E68C11FE1B2CA5067B3BB0001/overview',
          headers: {
            accept: 'application/vnd.sap.adt.runtime.memory.overview.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '382a98d6-3d95-425a-a4aa-2b7deb62afd9',
            'sap-adt-request-id': 'abd2c2d9a7f5471fa757243c6073cfaa',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'MemorySnapshotDelta',
      variant: 'cloud',
      stand: 'server',
      answers: LOGON.cloud,
      args: { from_id: SNAPSHOT_FROM, to_id: SNAPSHOT_TO, max_objects: 50 },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/sessions?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.session.v3+xml, application/vnd.sap.adt.core.http.session.v2+xml, application/vnd.sap.adt.core.http.session.v1+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '22de1890-87e1-4f22-a96d-41087d2eb1eb',
            'sap-adt-purpose': 'preflight_logon',
            'x-sap-security-session': 'create',
            'sap-client': '100',
            cookie: 'sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '22de1890-87e1-4f22-a96d-41087d2eb1eb',
            'x-csrf-token': 'fetch',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '22de1890-87e1-4f22-a96d-41087d2eb1eb',
            'sap-adt-request-id': 'd28090808aa6499fae8b182528bbfbfa',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/memory/snapdelta/overview?uri1=%2Fsap%2Fbc%2Fadt%2Fruntime%2Fmemory%2Fsnapshots%2F0CC47A1E68C11FE1B2CA5067B3BB0001&uri2=%2Fsap%2Fbc%2Fadt%2Fruntime%2Fmemory%2Fsnapshots%2F0CC47A1E68C11FE1B2CA5067B3BB0002',
          headers: {
            accept: 'application/vnd.sap.adt.runtime.memory.overview.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '22de1890-87e1-4f22-a96d-41087d2eb1eb',
            'sap-adt-request-id': 'e460fa1f2e924ed1a8fd15c6dfe8facb',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
