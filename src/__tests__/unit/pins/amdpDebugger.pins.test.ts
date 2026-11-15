/**
 * The AMDP debugger, pinned on each variant through the server's dispatch
 * (`pinServer`): `AmdpDebugSetBreakpoints` and `AmdpDebugCancel`, each
 * after an `AmdpDebugStart` (and, for the cancel, an `AmdpDebugWait` that
 * reads the break).
 *
 * **Why these cases are matched, and their order not asserted.** An AMDP
 * session keeps one event read open beside its commands: the read and a
 * command go out concurrently, so the order they arrive in is not the
 * code's. The cases answer each request by what it is (`matched`), not by
 * its arrival index, and compare their window sorted; every request still
 * counts, exactly as often as its matcher states. The event reads are
 * answered in turn, as SAP answers them: each breakpoint sync is confirmed
 * by the next read once the sync has arrived (its request id the sync's
 * `location`, its breakpoints the sync's own), the break comes on the read
 * after, and the last read is held, as SAP holds it, until the case closes.
 *
 * The built connection's kind is what `SAP_SYSTEM_TYPE` states (the server
 * builds it from settings), so each variant's cases run with it stated as
 * that variant.
 */

import { corpusBody } from '../../helpers/adtCorpus';
import type { StandInRequest } from '../../helpers/adtStandIn';
import type { MatchedAnswer, MatchedRequest } from '../../helpers/pinCases';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

/** The session's main id, as the start's `location` names it. */
const MAIN = '0CC47A1E68C11FE1B19DE6B249E4B5CB';
const SESSION = `/sap/bc/adt/amdp/debugger/main/${MAIN}`;
const EVENTS = {
  'content-type': 'application/vnd.sap.adt.amdp.dbg.main.v4+xml',
};

/** The debuggee the corpus's break names, as its cancel addresses it. */
const DEBUGGEE = 'sap.example.local%3APORT%3A232940%3A225057%3A1';

/** The class the breakpoints name. */
const CLASS = 'ZMCP_DBG_AMDP';

/** An event list of one response. */
const eventList = (response: string): string =>
  `<?xml version="1.0" encoding="utf-8"?><amdpdbg:mainResponseList xmlns:amdpdbg="http://www.sap.com/adt/amdp/debugger">${response}</amdpdbg:mainResponseList>`;

/** Every value of `attribute="…"` in `text`, in order (plain search). */
function valuesOf(text: string, attribute: string): string[] {
  const values: string[] = [];
  const marker = `${attribute}="`;
  let from = text.indexOf(marker);
  while (from >= 0) {
    const start = from + marker.length;
    const end = text.indexOf('"', start);
    values.push(text.slice(start, end));
    from = text.indexOf(marker, end);
  }
  return values;
}

/**
 * One recording's AMDP stand-in: the syncs it received, and the reads that
 * confirm them. Reset by the start, the first AMDP request of a recording,
 * since a case is recorded twice.
 */
function amdpSession() {
  let syncs: Array<Promise<StandInRequest>> = [];
  let arrive: Array<(request: StandInRequest) => void> = [];
  let received = 0;
  const reset = () => {
    received = 0;
    arrive = [];
    syncs = [0, 1].map(
      (at) =>
        new Promise<StandInRequest>((resolve) => {
          arrive[at] = resolve;
        }),
    );
  };
  reset();
  const start: MatchedAnswer = () => {
    reset();
    return {
      status: 200,
      headers: {
        'content-type':
          'application/vnd.sap.adt.amdp.dbg.startmain.v1+xml; charset=utf-8',
        location: SESSION,
      },
      text: corpusBody('amdp-debugger--01-start'),
    };
  };
  const sync: MatchedAnswer = (request) => {
    received += 1;
    arrive[received - 1]?.(request);
    return { status: 200, headers: { location: `REQ${received}` }, text: '' };
  };
  /** The read that confirms the `at`-th sync, once it has arrived. */
  const confirms =
    (at: number): MatchedAnswer =>
    async () => {
      const body = (await syncs[at])?.body ?? '';
      const ids = valuesOf(body, 'amdpdbg:clientId');
      const uris = valuesOf(body, 'adtcore:uri');
      const breakpoints = ids
        .map(
          (id, index) =>
            `<amdpdbg:breakpoint amdpdbg:clientId="${id}" amdpdbg:state="VALID" amdpdbg:errorMessage="" amdpdbg:breakpointKind="line" adtcore:uri="${uris[index] ?? ''}" adtcore:type="CLAS/OC" adtcore:name="${CLASS}" xmlns:adtcore="http://www.sap.com/adt/core"/>`,
        )
        .join('');
      return {
        status: 200,
        headers: EVENTS,
        text: eventList(
          `<amdpdbg:mainResponse amdpdbg:kind="SYNC_BREAKPOINTS" amdpdbg:requestId="REQ${at + 1}" amdpdbg:mainId="${MAIN}" amdpdbg:debuggeeId=""><amdpdbg:value><amdpdbg:syncBreakpoints amdpdbg:syncMode="FULL"><amdpdbg:breakpoints>${breakpoints}</amdpdbg:breakpoints></amdpdbg:syncBreakpoints></amdpdbg:value></amdpdbg:mainResponse>`,
        ),
      };
    };
  /** The break, as the corpus captured it, in this session. */
  const onBreak: MatchedAnswer = {
    status: 200,
    headers: EVENTS,
    text: corpusBody('amdp-debugger--05-events-on-break')
      .split('0CC47A1E68C11FE1B19E90DB3E2EF5CB')
      .join(MAIN),
  };
  return { start, sync, confirms, onBreak };
}

/** What every variant's logon sends, by its count. */
function logon(variant: 'onprem' | 'cloud'): MatchedRequest[] {
  const counts =
    variant === 'onprem'
      ? { discovery: 3, sessions: 0 }
      : { discovery: 3, sessions: 3 };
  return [
    {
      method: 'GET',
      path: '/sap/bc/adt/core/discovery',
      times: counts.discovery,
    },
    ...(counts.sessions > 0
      ? [
          {
            method: 'GET',
            path: '/sap/bc/adt/core/http/sessions',
            times: counts.sessions,
          },
        ]
      : []),
    { method: 'GET', path: '/sap/bc/adt/core/http/systeminformation' },
    { method: 'GET', path: '/sap/public/bc/icf/logoff', times: 3 },
  ];
}

/** The set case's requests: one sync for the start, one for the set. */
function setBreakpoints(variant: 'onprem' | 'cloud'): MatchedRequest[] {
  const session = amdpSession();
  return [
    ...logon(variant),
    {
      method: 'POST',
      path: '/sap/bc/adt/amdp/debugger/main',
      answer: session.start,
    },
    {
      method: 'POST',
      path: `${SESSION}/breakpoints`,
      times: 2,
      answer: session.sync,
    },
    {
      method: 'GET',
      path: SESSION,
      answers: [session.confirms(0), session.confirms(1)],
      hold: true,
    },
  ];
}

/** The cancel case's requests: the start's sync, the break, the cancel. */
function cancel(variant: 'onprem' | 'cloud'): MatchedRequest[] {
  const session = amdpSession();
  return [
    ...logon(variant),
    {
      method: 'POST',
      path: '/sap/bc/adt/amdp/debugger/main',
      answer: session.start,
    },
    {
      method: 'POST',
      path: `${SESSION}/breakpoints`,
      answer: session.sync,
    },
    {
      method: 'GET',
      path: SESSION,
      answers: [session.confirms(0), session.onBreak],
      hold: true,
    },
    // The cancel: the `deleteDebuggee` link of the break's debuggee.
    { method: 'DELETE', path: `${SESSION}/debuggees/${DEBUGGEE}` },
  ];
}

/** The start both cases run first: one breakpoint, no run. */
const START = {
  tool: 'AmdpDebugStart',
  args: {
    stop_existing: false,
    breakpoints: [{ class_name: CLASS, line: 27 }],
  },
};

/** The cancel's wait: it reads the break. */
const WAIT = { tool: 'AmdpDebugWait', args: { hold_seconds: 1 } };

/**
 * `SAP_SYSTEM_TYPE` stated as `variant` for the enclosing describe's
 * cases, and restored after them.
 */
function statedAs(variant: 'onprem' | 'cloud'): void {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = variant;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });
}

describe('onprem', () => {
  statedAs('onprem');
  pinCases([
    {
      tool: 'AmdpDebugSetBreakpoints',
      variant: 'onprem',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      matched: setBreakpoints('onprem'),
      args: { breakpoints: [{ class_name: 'ZMCP_DBG_AMDP', line: 27 }] },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB',
          headers: {
            accept:
              'application/vnd.sap.adt.amdp.dbg.main.v4+xml, application/vnd.sap.adt.amdp.dbg.main.v3+xml, application/vnd.sap.adt.amdp.dbg.main.v2+xml, application/vnd.sap.adt.amdp.dbg.main.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': 'e4e25923-27e6-47da-aa94-ee318d44f13d',
            'sap-adt-request-id': '49a4eb3117c2447aa025f927f39e025c',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
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
        {
          method: 'POST',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB/breakpoints',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'content-type': 'application/vnd.sap.adt.amdp.dbg.bpsync.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '8fa337a9-869e-4f67-afa5-61cf75d3ac17',
            'sap-adt-request-id': 'cea204c1041e491ba16f6cb803c6ac7c',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-3; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '455',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><amdpdbg:breakpointsSyncRequest xmlns:amdpdbg="http://www.sap.com/adt/amdp/debugger" amdpdbg:syncMode="FULL" amdpdbg:clearCache="false">\n  <amdpdbg:breakpoints>\n    <amdpdbg:breakpoint xmlns:adtcore="http://www.sap.com/adt/core" amdpdbg:clientId="89c0654c-b8fd-4948-a2dd-c5257514fc17" adtcore:uri="/sap/bc/adt/oo/classes/zmcp_dbg_amdp/source/main#start=27"/>\n  </amdpdbg:breakpoints>\n</amdpdbg:breakpointsSyncRequest>',
        },
      ],
    },
    {
      tool: 'AmdpDebugCancel',
      variant: 'onprem',
      stand: 'server',
      before: [
        START,
        { ...WAIT, bind: { state_handle: { from: 0, field: 'state_handle' } } },
      ],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      matched: cancel('onprem'),
      args: {},
      expected: [
        {
          method: 'DELETE',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB/debuggees/sap.example.local%3APORT%3A232940%3A225057%3A1',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '2a598d9e-cdbc-4ca5-a35c-5e344070a1e9',
            'sap-adt-request-id': 'a3ed6f0b49d24133a482c4bd45e30371',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-3; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB',
          headers: {
            accept:
              'application/vnd.sap.adt.amdp.dbg.main.v4+xml, application/vnd.sap.adt.amdp.dbg.main.v3+xml, application/vnd.sap.adt.amdp.dbg.main.v2+xml, application/vnd.sap.adt.amdp.dbg.main.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '63b8cbf2-50fe-458b-a164-92c48f074dfb',
            'sap-adt-request-id': '7b23902510c448c3a0e4f115a5697fdb',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
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
  ]);
});

describe('cloud', () => {
  statedAs('cloud');
  pinCases([
    {
      tool: 'AmdpDebugSetBreakpoints',
      variant: 'cloud',
      stand: 'server',
      before: [START],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      matched: setBreakpoints('cloud'),
      args: { breakpoints: [{ class_name: 'ZMCP_DBG_AMDP', line: 27 }] },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB',
          headers: {
            accept:
              'application/vnd.sap.adt.amdp.dbg.main.v4+xml, application/vnd.sap.adt.amdp.dbg.main.v3+xml, application/vnd.sap.adt.amdp.dbg.main.v2+xml, application/vnd.sap.adt.amdp.dbg.main.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': 'dce87ef0-e184-45f8-ad67-9661805d1841',
            'sap-adt-request-id': '0c5853e1be42460cac4e9d3e62536ea7',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
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
        {
          method: 'POST',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB/breakpoints',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'content-type': 'application/vnd.sap.adt.amdp.dbg.bpsync.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '69f88dfb-d34e-443f-ab9a-f5303689fcef',
            'sap-adt-request-id': '16f1c8c61e194438a9ef0cc2971d8298',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-3; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '455',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><amdpdbg:breakpointsSyncRequest xmlns:amdpdbg="http://www.sap.com/adt/amdp/debugger" amdpdbg:syncMode="FULL" amdpdbg:clearCache="false">\n  <amdpdbg:breakpoints>\n    <amdpdbg:breakpoint xmlns:adtcore="http://www.sap.com/adt/core" amdpdbg:clientId="37e1243a-0792-4919-affb-5590523d2146" adtcore:uri="/sap/bc/adt/oo/classes/zmcp_dbg_amdp/source/main#start=27"/>\n  </amdpdbg:breakpoints>\n</amdpdbg:breakpointsSyncRequest>',
        },
      ],
    },
    {
      tool: 'AmdpDebugCancel',
      variant: 'cloud',
      stand: 'server',
      before: [
        START,
        { ...WAIT, bind: { state_handle: { from: 0, field: 'state_handle' } } },
      ],
      bind: { state_handle: { from: 0, field: 'state_handle' } },
      matched: cancel('cloud'),
      args: {},
      expected: [
        {
          method: 'DELETE',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB/debuggees/sap.example.local%3APORT%3A232940%3A225057%3A1',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '7c30ccfb-8000-4177-a634-2437130e070c',
            'sap-adt-request-id': '617e41548bf64780a8291e4c6473056f',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-3; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/amdp/debugger/main/0CC47A1E68C11FE1B19DE6B249E4B5CB',
          headers: {
            accept:
              'application/vnd.sap.adt.amdp.dbg.main.v4+xml, application/vnd.sap.adt.amdp.dbg.main.v3+xml, application/vnd.sap.adt.amdp.dbg.main.v2+xml, application/vnd.sap.adt.amdp.dbg.main.v1+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'x-sap-adt-sessiontype': 'stateful',
            'sap-adt-connection-id': '5b73995b-3f4b-4880-a4f5-c4dc3353a191',
            'sap-adt-request-id': '03ba3ff649564327a63d1779687180c5',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
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
  ]);
});
