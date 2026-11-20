/**
 * GetEnhancementImpl (on premise, the one variant serving it) and
 * GetEnhancementSpot (on each variant), pinned through the server's dispatch
 * (`pinServer`: the tool answers a JSON item, which the server's
 * registration serialises): the connection's logon and its one read of the
 * spot or the plugin's source, each answered by what it is (`matched`).
 * SAP's answers are a minimal BAdI spot document and a minimal plugin source.
 */
import { after, before, describe } from 'node:test';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

/** A BAdI enhancement spot, as SAP answers its read. */
const SPOT_ANSWER = {
  status: 200,
  headers: { 'content-type': 'application/xml' },
  text: '<?xml version="1.0" encoding="utf-8"?><enhs:enhancementSpot xmlns:enhs="http://www.sap.com/adt/enhancements/enhs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZMCP_PIN_SPOT" adtcore:type="ENHS/XSB" adtcore:description="pin"/>',
};

/** A source code plugin's source, as SAP answers its read (on premise only). */
const PLUGIN_SOURCE = {
  status: 200,
  headers: { 'content-type': 'text/plain' },
  text: 'ENHANCEMENT 1  ZMCP_PIN_PLUGIN.    "active version\nENDENHANCEMENT.',
};

/** The requests of a plugin read on premise, answered by what each is. */
const PLUGIN_MATCHED = [
  { method: 'GET', path: '/sap/bc/adt/core/discovery' },
  { method: 'GET', path: '/sap/bc/adt/core/http/systeminformation' },
  { method: 'GET', path: '/sap/public/bc/icf/logoff' },
  {
    method: 'GET',
    path: '/sap/bc/adt/enhancements/enhoxhh/zmcp_pin_plugin/source/main',
    answer: PLUGIN_SOURCE,
  },
];

/** The requests of a spot read, answered by what each is. */
const MATCHED = {
  onprem: [
    { method: 'GET', path: '/sap/bc/adt/core/discovery' },
    { method: 'GET', path: '/sap/bc/adt/core/http/systeminformation' },
    { method: 'GET', path: '/sap/public/bc/icf/logoff' },
    {
      method: 'GET',
      path: '/sap/bc/adt/enhancements/enhsxsb/zmcp_pin_spot',
      answer: SPOT_ANSWER,
    },
  ],
  cloud: [
    { method: 'GET', path: '/sap/bc/adt/core/http/sessions' },
    { method: 'GET', path: '/sap/bc/adt/core/discovery' },
    { method: 'GET', path: '/sap/bc/adt/core/http/systeminformation' },
    { method: 'GET', path: '/sap/public/bc/icf/logoff' },
    {
      method: 'GET',
      path: '/sap/bc/adt/enhancements/enhsxsb/zmcp_pin_spot',
      answer: SPOT_ANSWER,
    },
  ],
};

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
      tool: 'GetEnhancementSpot',
      variant: 'onprem',
      stand: 'server',
      matched: MATCHED.onprem,
      args: { enhancement_spot: 'ZMCP_PIN_SPOT' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': 'aae0cb02-018a-4026-a9ca-3bc9c758b509',
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
            'sap-adt-connection-id': 'aae0cb02-018a-4026-a9ca-3bc9c758b509',
            'sap-adt-request-id': 'c195096826964868a9bb42cd1c43d805',
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
          url: '/sap/bc/adt/enhancements/enhsxsb/zmcp_pin_spot?version=active',
          headers: {
            accept: 'application/vnd.sap.adt.enh.enhs.v2+xml',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'aae0cb02-018a-4026-a9ca-3bc9c758b509',
            'sap-adt-request-id': '533be76b27244216a0b25a5139919bf9',
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
      tool: 'GetEnhancementImpl',
      variant: 'onprem',
      stand: 'server',
      matched: PLUGIN_MATCHED,
      args: {
        enhancement_spot: 'enhoxhh',
        enhancement_name: 'ZMCP_PIN_PLUGIN',
      },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': 'f63b72f0-6a7a-4e71-ad03-15eaec48d08f',
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
            'sap-adt-connection-id': 'f63b72f0-6a7a-4e71-ad03-15eaec48d08f',
            'sap-adt-request-id': '471b6e57e1a3465ea6c1e43d7733aeb6',
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
          url: '/sap/bc/adt/enhancements/enhoxhh/zmcp_pin_plugin/source/main?version=active',
          headers: {
            accept: 'text/plain',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'f63b72f0-6a7a-4e71-ad03-15eaec48d08f',
            'sap-adt-request-id': 'bf75034c89874a19a0119f6024c74d1d',
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
      tool: 'GetEnhancementSpot',
      variant: 'cloud',
      stand: 'server',
      matched: MATCHED.cloud,
      args: { enhancement_spot: 'ZMCP_PIN_SPOT' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/discovery',
          headers: {
            accept: 'application/atomsvc+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '9ef42dd7-ed12-474f-add2-e8219d370c93',
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
          url: '/sap/bc/adt/core/http/sessions?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.session.v3+xml, application/vnd.sap.adt.core.http.session.v2+xml, application/vnd.sap.adt.core.http.session.v1+xml',
            'sap-adt-saplb': 'fetch',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-adt-connection-id': '9ef42dd7-ed12-474f-add2-e8219d370c93',
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
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '9ef42dd7-ed12-474f-add2-e8219d370c93',
            'sap-adt-request-id': '1c4bb6b18dcd4808a5f4b76fe7b30b5e',
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
          url: '/sap/bc/adt/enhancements/enhsxsb/zmcp_pin_spot?version=active',
          headers: {
            accept: 'application/vnd.sap.adt.enh.enhs.v2+xml',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '9ef42dd7-ed12-474f-add2-e8219d370c93',
            'sap-adt-request-id': '6a770aa1b3eb449ea8c336ebe15f2ddb',
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
