/**
 * The long reads in the background, pinned (plan D24, Step 7): the SQL
 * reads that run on an ABAP session of their own, and the run tools that
 * read, list and discard their background runs, on each variant, through
 * the server's dispatch (`pinServer`: the store, the run's own connection).
 *
 * - `GetSqlQuery` / `HandlerGetData` with `background: false`: the read in
 *   the call, on a session of its own — its logon, the read, its logoff
 *   (`settle: 'own-session'`, so the logoff is in the window). A first
 *   `ListBackgroundRuns` logs the instance's connection on before the case,
 *   so the window holds the read's session alone. SAP's answer to the read
 *   is the document the corpus captured.
 * - `GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`,
 *   `HandlerBackgroundRunGet`: the run a `before` step started has ended
 *   and its session is logged off before the case (`settle:
 *   'background-runs'`); the run tool sends nothing, and the case asserts
 *   what it answered.
 *
 * The built connection's kind is what `SAP_SYSTEM_TYPE` states (the
 * server builds it from settings), so each variant's cases run with it
 * stated as that variant.
 */

import { corpusBody } from '../../helpers/adtCorpus';
import type { McpResult } from '../../helpers/pinCases';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

/** SAP's answer to the read: the rows the corpus captured. */
const ROWS = {
  status: 200,
  data: corpusBody('read-sql-query-with-blank-cells--01-datapreview-freestyle'),
};

/** The query every case reads. */
const QUERY = 'SELECT * FROM I_Country';

/** The JSON of an answer's `at`-th item. */
function itemOf(answer: McpResult, at: number): unknown {
  return JSON.parse(answer.content[at]?.text ?? 'null');
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** A finished read run, as Get answers it: its header, then the rows. */
function expectFinished(answer: McpResult, tool: string): void {
  expect(member(itemOf(answer, 0), 'state')).toBe('finished');
  expect(member(itemOf(answer, 0), 'tool')).toBe(tool);
  expect(member(itemOf(answer, 1), 'sql_query')).toBe(QUERY);
}

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
      tool: 'GetSqlQuery',
      variant: 'onprem',
      stand: 'server',
      settle: 'own-session',
      before: [{ tool: 'ListBackgroundRuns', args: {} }],
      args: { sql_query: QUERY, row_number: 5, background: false },
      answers: [undefined, undefined, undefined, ROWS],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '5d0ea854-69bb-4a68-a188-8f29a74c109d',
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
          method: 'POST',
          url: '/sap/bc/adt/datapreview/freestyle?rowNumber=5',
          headers: {
            accept:
              'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
            'content-type': 'text/plain; charset=utf-8',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': '5d0ea854-69bb-4a68-a188-8f29a74c109d',
            'sap-adt-request-id': 'b473da64af1d4e5cac4b66b098dba18f',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '23',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: 'SELECT * FROM I_Country',
        },
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': '5d0ea854-69bb-4a68-a188-8f29a74c109d',
            'sap-adt-request-id': '65e05c1250b84e30a5a149529aed2148',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'close',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGetData',
      variant: 'onprem',
      stand: 'server',
      settle: 'own-session',
      before: [{ tool: 'ListBackgroundRuns', args: {} }],
      args: { sql_query: QUERY, max_rows: 5, background: false },
      answers: [undefined, undefined, undefined, ROWS],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '6fee3a01-6e48-40c9-a8ea-eb5b7e518d50',
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
          method: 'POST',
          url: '/sap/bc/adt/datapreview/freestyle?rowNumber=5',
          headers: {
            accept:
              'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
            'content-type': 'text/plain; charset=utf-8',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': '6fee3a01-6e48-40c9-a8ea-eb5b7e518d50',
            'sap-adt-request-id': 'ee63c682f07e4446a60dc88ada48abfa',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '23',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: 'SELECT * FROM I_Country',
        },
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': '6fee3a01-6e48-40c9-a8ea-eb5b7e518d50',
            'sap-adt-request-id': '30b1caae1fbb4a72a14f0fd39d3aaceb',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'close',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBackgroundRun',
      variant: 'onprem',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'GetSqlQuery', args: { sql_query: QUERY, row_number: 5 } },
      ],
      bind: { run_handle: { from: 0, field: 'run_handle' } },
      args: {},
      expected: 'none',
      ran: (answer) => expectFinished(answer, 'GetSqlQuery'),
    },
    {
      tool: 'ListBackgroundRuns',
      variant: 'onprem',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'GetSqlQuery', args: { sql_query: QUERY, row_number: 5 } },
      ],
      args: {},
      expected: 'none',
      ran: (answer) => {
        const runs = member(itemOf(answer, 0), 'runs');
        expect(
          Array.isArray(runs) ? runs.map((run) => member(run, 'state')) : runs,
        ).toEqual(['finished']);
      },
    },
    {
      tool: 'DiscardBackgroundRun',
      variant: 'onprem',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'GetSqlQuery', args: { sql_query: QUERY, row_number: 5 } },
      ],
      bind: { run_handle: { from: 0, field: 'run_handle' } },
      args: {},
      expected: 'none',
      ran: (answer) =>
        expect(member(itemOf(answer, 0), 'state')).toBe('discarded'),
    },
    {
      tool: 'HandlerBackgroundRunGet',
      variant: 'onprem',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'HandlerGetData', args: { sql_query: QUERY, max_rows: 5 } },
      ],
      bind: { run_handle: { from: 0, field: 'run_handle' } },
      args: {},
      expected: 'none',
      ran: (answer) => expectFinished(answer, 'HandlerGetData'),
    },
  ]);
});

describe('cloud', () => {
  statedAs('cloud');
  pinCases([
    {
      tool: 'GetSqlQuery',
      variant: 'cloud',
      stand: 'server',
      settle: 'own-session',
      before: [{ tool: 'ListBackgroundRuns', args: {} }],
      args: { sql_query: QUERY, row_number: 5, background: false },
      answers: [undefined, undefined, undefined, undefined, undefined, ROWS],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/sessions?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.session.v3+xml, application/vnd.sap.adt.core.http.session.v2+xml, application/vnd.sap.adt.core.http.session.v1+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '099a8c8e-0c84-4e58-a8fc-5509b4a8b944',
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
            'sap-adt-connection-id': '099a8c8e-0c84-4e58-a8fc-5509b4a8b944',
            'x-csrf-token': 'fetch',
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
          url: '/sap/bc/adt/datapreview/freestyle?rowNumber=5',
          headers: {
            accept:
              'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
            'content-type': 'text/plain; charset=utf-8',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '099a8c8e-0c84-4e58-a8fc-5509b4a8b944',
            'sap-adt-request-id': '03a42cc476844fc7a8c7ae3ca2698086',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '23',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: 'SELECT * FROM I_Country',
        },
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': '099a8c8e-0c84-4e58-a8fc-5509b4a8b944',
            'sap-adt-request-id': 'fdd90e0ad08f4dd3acbe8b443584b60b',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'close',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGetData',
      variant: 'cloud',
      stand: 'server',
      settle: 'own-session',
      before: [{ tool: 'ListBackgroundRuns', args: {} }],
      args: { sql_query: QUERY, max_rows: 5, background: false },
      answers: [undefined, undefined, undefined, undefined, undefined, ROWS],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/sessions?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.session.v3+xml, application/vnd.sap.adt.core.http.session.v2+xml, application/vnd.sap.adt.core.http.session.v1+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '54663b95-d9b1-469a-a1cd-de096a214bae',
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
            'sap-adt-connection-id': '54663b95-d9b1-469a-a1cd-de096a214bae',
            'x-csrf-token': 'fetch',
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
          url: '/sap/bc/adt/datapreview/freestyle?rowNumber=5',
          headers: {
            accept:
              'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
            'content-type': 'text/plain; charset=utf-8',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '54663b95-d9b1-469a-a1cd-de096a214bae',
            'sap-adt-request-id': 'c452b09631ed49d1a39daf35649fad61',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '23',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: 'SELECT * FROM I_Country',
        },
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': '54663b95-d9b1-469a-a1cd-de096a214bae',
            'sap-adt-request-id': '430d1bc54cee4090adad06ff196cfd64',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-2; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'close',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBackgroundRun',
      variant: 'cloud',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'GetSqlQuery', args: { sql_query: QUERY, row_number: 5 } },
      ],
      bind: { run_handle: { from: 0, field: 'run_handle' } },
      args: {},
      expected: 'none',
      ran: (answer) => expectFinished(answer, 'GetSqlQuery'),
    },
    {
      tool: 'ListBackgroundRuns',
      variant: 'cloud',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'GetSqlQuery', args: { sql_query: QUERY, row_number: 5 } },
      ],
      args: {},
      expected: 'none',
      ran: (answer) => {
        const runs = member(itemOf(answer, 0), 'runs');
        expect(
          Array.isArray(runs) ? runs.map((run) => member(run, 'state')) : runs,
        ).toEqual(['finished']);
      },
    },
    {
      tool: 'DiscardBackgroundRun',
      variant: 'cloud',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'GetSqlQuery', args: { sql_query: QUERY, row_number: 5 } },
      ],
      bind: { run_handle: { from: 0, field: 'run_handle' } },
      args: {},
      expected: 'none',
      ran: (answer) =>
        expect(member(itemOf(answer, 0), 'state')).toBe('discarded'),
    },
    {
      tool: 'HandlerBackgroundRunGet',
      variant: 'cloud',
      stand: 'server',
      settle: 'background-runs',
      before: [
        { tool: 'HandlerGetData', args: { sql_query: QUERY, max_rows: 5 } },
      ],
      bind: { run_handle: { from: 0, field: 'run_handle' } },
      args: {},
      expected: 'none',
      ran: (answer) => expectFinished(answer, 'HandlerGetData'),
    },
  ]);
});
