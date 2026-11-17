/**
 * Leftover sessions, pinned on each variant through the server's dispatch
 * (`pinServer` with `setup: 'leftover-session'`: the runtime file of a
 * session a killed process left on the stand-in, under the pin
 * destination).
 *
 * - `ListLeftoverSessions` / `HandlerLeftoverSessionList` send nothing: they
 *   read the runtime files and answer the session left behind.
 * - `LogoffLeftoverSession` / `HandlerLeftoverSessionLogoff` send the
 *   session's logoff alone, credential-free, by its handle — the handle the
 *   seeded random source gives the left session's file.
 *
 * The built connection's kind is what `SAP_SYSTEM_TYPE` states (the server
 * builds it from settings), so each variant's cases run with it stated as
 * that variant.
 */

import type { McpResult } from '../../helpers/pinCases';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

/** The sessions a list answered. */
function sessionsOf(answer: McpResult): unknown[] {
  const parsed: unknown = JSON.parse(answer.content[0]?.text ?? 'null');
  const sessions =
    typeof parsed === 'object' && parsed !== null
      ? Reflect.get(parsed, 'sessions')
      : undefined;
  return Array.isArray(sessions) ? sessions : [];
}

/** A list answered the one session left behind. */
function expectOneLeft(answer: McpResult): void {
  expect(sessionsOf(answer)).toHaveLength(1);
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
      tool: 'ListLeftoverSessions',
      variant: 'onprem',
      stand: 'server',
      setup: 'leftover-session',
      args: {},
      expected: 'none',
      ran: expectOneLeft,
    },
    {
      tool: 'HandlerLeftoverSessionList',
      variant: 'onprem',
      stand: 'server',
      setup: 'leftover-session',
      args: {},
      expected: 'none',
      ran: expectOneLeft,
    },
    {
      tool: 'LogoffLeftoverSession',
      variant: 'onprem',
      stand: 'server',
      setup: 'leftover-session',
      args: { handle: 'ca95a3da75f3bd34841687cebcbb2f7f' },
      expected: [
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': 'f3ebe15e-f12a-4af4-a34c-8eefb076fb15',
            'sap-adt-request-id': '8eced77bf823472ba7c6218d560ab6bb',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
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
      tool: 'HandlerLeftoverSessionLogoff',
      variant: 'onprem',
      stand: 'server',
      setup: 'leftover-session',
      args: { handle: 'd5ee4305ea2920971966f0845ac414e9' },
      expected: [
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': 'e23f7c2e-7e00-442c-a808-fd8eff3d79aa',
            'sap-adt-request-id': '9d3b62729933473aa10706bf705b111d',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'close',
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
      tool: 'ListLeftoverSessions',
      variant: 'cloud',
      stand: 'server',
      setup: 'leftover-session',
      args: {},
      expected: 'none',
      ran: expectOneLeft,
    },
    {
      tool: 'HandlerLeftoverSessionList',
      variant: 'cloud',
      stand: 'server',
      setup: 'leftover-session',
      args: {},
      expected: 'none',
      ran: expectOneLeft,
    },
    {
      tool: 'LogoffLeftoverSession',
      variant: 'cloud',
      stand: 'server',
      setup: 'leftover-session',
      args: { handle: '9e45761b08e6b6e193e1c2004d3cabfa' },
      expected: [
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': 'e841e5a5-9c41-447a-a585-ec28312e165f',
            'sap-adt-request-id': 'fc707d85eb84448ca3444b095ac25261',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
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
      tool: 'HandlerLeftoverSessionLogoff',
      variant: 'cloud',
      stand: 'server',
      setup: 'leftover-session',
      args: { handle: '659db82c05f7117a045607be021cde5c' },
      expected: [
        {
          method: 'GET',
          url: '/sap/public/bc/icf/logoff',
          headers: {
            accept: '*/*',
            'sap-adt-saplb': 'fetch',
            'sap-client': '100',
            'sap-adt-connection-id': 'dc672343-14e2-4bea-a50c-09d909581730',
            'sap-adt-request-id': '95efbc88ccd04beea96659ec318294ba',
            'sap-cancel-on-close': 'true',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'close',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
