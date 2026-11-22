/**
 * `GetTransport` and compact `HandlerGet` `TRANSPORT` part `metadata`,
 * pinned on each variant on `recordingConnection` with real adt-clients
 * code: one `GET /sap/bc/adt/cts/transportrequests/{number}` with the
 * organizer's `Accept`, for a task's number and for a request's alike — SAP's
 * one handler answers both, and the document says which was read. The
 * answers are the recorded task and request documents, sanitised
 * (`helpers/transportTaskDocuments.ts`: task SIDK900012 of request
 * SIDK900011).
 */
import { describe } from 'node:test';
import { pinCases } from '../../helpers/pinCases';
import {
  REQUEST,
  TASK_WITH_OBJECTS,
} from '../../helpers/transportTaskDocuments';

/** SAP's answer: the document given, as the organizer type. */
const answered = (data: string) => [
  {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.sap.adt.transportorganizer.v1+xml; charset=utf-8',
    },
    data,
  },
];

describe('onprem', () => {
  pinCases([
    {
      tool: 'GetTransport',
      variant: 'onprem',
      stand: 'recording',
      args: { transport_number: 'SIDK900012' },
      answers: answered(TASK_WITH_OBJECTS),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900012',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTransport',
      variant: 'onprem',
      stand: 'recording',
      args: { transport_number: 'SIDK900011' },
      answers: answered(REQUEST),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900011',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: 'SIDK900012',
      },
      answers: answered(TASK_WITH_OBJECTS),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900012',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: 'SIDK900011',
      },
      answers: answered(REQUEST),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900011',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
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
      tool: 'GetTransport',
      variant: 'cloud',
      stand: 'recording',
      args: { transport_number: 'SIDK900012' },
      answers: answered(TASK_WITH_OBJECTS),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900012',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTransport',
      variant: 'cloud',
      stand: 'recording',
      args: { transport_number: 'SIDK900011' },
      answers: answered(REQUEST),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900011',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: 'SIDK900012',
      },
      answers: answered(TASK_WITH_OBJECTS),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900012',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: 'SIDK900011',
      },
      answers: answered(REQUEST),
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/SIDK900011',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
