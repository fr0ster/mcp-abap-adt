/**
 * `GetObjectOutline`, pinned by literal (plan D5): one key per value of its
 * `object_type` on each variant — class, interface and function group on
 * both, the program on premise only (the cloud has none). Each request is
 * D1's measured one: `GET <object uri>/objectstructure` with Accept
 * `application/vnd.sap.adt.objectstructure.v2+xml`, the version stated.
 * SAP's answers are the documents D1 captured.
 */

import { corpusBody } from '../../../lib/adtCorpus';
import { pinCases } from '../../helpers/pinCases';

const CLASS = [
  { status: 200, data: corpusBody('read-outline-class--01-objectstructure') },
];
const INTERFACE = [
  {
    status: 200,
    data: corpusBody('read-outline-interface--01-objectstructure'),
  },
];
const PROGRAM = [
  { status: 200, data: corpusBody('read-outline-program--01-objectstructure') },
];
const FUNCTION_GROUP = [
  {
    status: 200,
    data: corpusBody('read-outline-function-group--01-objectstructure'),
  },
];

pinCases([
  {
    tool: 'GetObjectOutline',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'CLAS/OC', object_name: 'ZMCP_D1_9E25_CL' },
    answers: CLASS,
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/zmcp_d1_9e25_cl/objectstructure?version=active',
        headers: { Accept: 'application/vnd.sap.adt.objectstructure.v2+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectOutline',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'CLAS/OC', object_name: 'ZMCP_D1_9E25_CL' },
    answers: CLASS,
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/classes/zmcp_d1_9e25_cl/objectstructure?version=active',
        headers: { Accept: 'application/vnd.sap.adt.objectstructure.v2+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectOutline',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'INTF/OI', object_name: 'ZMCP_D1_9E25_IF' },
    answers: INTERFACE,
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/zmcp_d1_9e25_if/objectstructure?version=active',
        headers: { Accept: 'application/vnd.sap.adt.objectstructure.v2+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectOutline',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'INTF/OI', object_name: 'ZMCP_D1_9E25_IF' },
    answers: INTERFACE,
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/oo/interfaces/zmcp_d1_9e25_if/objectstructure?version=active',
        headers: { Accept: 'application/vnd.sap.adt.objectstructure.v2+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectOutline',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'PROG/P', object_name: 'ZMCP_D1_9E25_PR' },
    answers: PROGRAM,
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/programs/programs/zmcp_d1_9e25_pr/objectstructure?version=active',
        headers: { Accept: 'application/vnd.sap.adt.objectstructure.v2+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectOutline',
    variant: 'onprem',
    stand: 'recording',
    args: { object_type: 'FUGR/F', object_name: 'ZMCP_D19E25' },
    answers: FUNCTION_GROUP,
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zmcp_d19e25/objectstructure?version=active',
        headers: { Accept: 'application/vnd.sap.adt.objectstructure.v2+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'GetObjectOutline',
    variant: 'cloud',
    stand: 'recording',
    args: { object_type: 'FUGR/F', object_name: 'ZMCP_D19E25' },
    answers: FUNCTION_GROUP,
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/functions/groups/zmcp_d19e25/objectstructure?version=active',
        headers: { Accept: 'application/vnd.sap.adt.objectstructure.v2+xml' },
        body: undefined,
      },
    ],
  },
]);
