/**
 * `ListTransports`, pinned on each variant on `recordingConnection` with
 * real adt-clients code: one `GET /sap/bc/adt/cts/transportrequests` with
 * the query by user — the user upper case, `requestStatus` `D` (`DR` with
 * `modifiable_only: false`), `requestType` `KWT` — and no saved search
 * configuration. SAP's answer is the corpus listing.
 */
import { describe } from 'node:test';
import { corpusBody } from '../../helpers/adtCorpus';
import { pinCases } from '../../helpers/pinCases';

/** The listing SAP answered. */
const LISTING = [
  {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.sap.adt.transportorganizertree.v1+xml; charset=utf-8',
    },
    data: corpusBody('read-transport-list-structure--01-cts-transportrequests'),
  },
];

describe('onprem', () => {
  pinCases([
    {
      tool: 'ListTransports',
      variant: 'onprem',
      stand: 'recording',
      args: { user: 'PIN_USER', modifiable_only: true },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_USER&requestStatus=D&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'ListTransports',
      variant: 'onprem',
      stand: 'recording',
      args: { user: 'pin_other' },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_OTHER&requestStatus=D&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'ListTransports',
      variant: 'onprem',
      stand: 'recording',
      args: { user: 'PIN_USER', modifiable_only: false },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_USER&requestStatus=DR&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'ListTransports',
      variant: 'cloud',
      stand: 'recording',
      args: { user: 'PIN_USER', modifiable_only: true },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_USER&requestStatus=D&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'ListTransports',
      variant: 'cloud',
      stand: 'recording',
      args: { user: 'pin_other' },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_OTHER&requestStatus=D&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'ListTransports',
      variant: 'cloud',
      stand: 'recording',
      args: { user: 'PIN_USER', modifiable_only: false },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_USER&requestStatus=DR&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
