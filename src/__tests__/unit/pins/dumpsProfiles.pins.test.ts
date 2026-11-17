/**
 * The compact dump and profiler tools, pinned on each variant on
 * `recordingConnection` with real adt-clients code: HandlerDumpList reads
 * one page of the dumps feed, HandlerDumpView one dump (its default view,
 * and the formatted one), HandlerProfileList the trace list,
 * HandlerProfileView one view of a trace, HandlerProfileSchedule schedules a
 * trace (SAP answers its parameters' location), and HandlerProfileRun runs a
 * class under the profiler id it is given. SAP's answers are minimal
 * documents of each kind; only the requests are asserted.
 */
import { pinCases } from '../../helpers/pinCases';

const FEED = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"/>',
};

const SCHEDULE_BODY =
  '<?xml version="1.0" encoding="UTF-8"?>\n<trc:parameters xmlns:trc="http://www.sap.com/adt/runtime/traces/abaptraces">\n  <trc:allMiscAbapStatements value="false"/>\n  <trc:allProceduralUnits value="true"/>\n  <trc:allInternalTableEvents value="false"/>\n  <trc:allDynproEvents value="false"/>\n  <trc:description value="Pin trace"/>\n  <trc:aggregate value="false"/>\n  <trc:explicitOnOff value="false"/>\n  <trc:withRfcTracing value="true"/>\n  <trc:allSystemKernelEvents value="false"/>\n  <trc:sqlTrace value="true"/>\n  <trc:allDbEvents value="true"/>\n  <trc:maxSizeForTraceFile value="30720"/>\n  <trc:amdpTrace value="true"/>\n  <trc:maxTimeForTracing value="1800"/>\n</trc:parameters>';

describe('onprem', () => {
  pinCases([
    {
      tool: 'HandlerDumpList',
      variant: 'onprem',
      stand: 'recording',
      args: { top: 5 },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/dumps?%24top=5',
          headers: { Accept: 'application/atom+xml;type=feed' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerDumpView',
      variant: 'onprem',
      stand: 'recording',
      args: { dump_id: 'PINDUMP' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/dump/PINDUMP',
          headers: { Accept: 'application/vnd.sap.adt.runtime.dump.v1+xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerDumpView',
      variant: 'onprem',
      stand: 'recording',
      args: { dump_id: 'PINDUMP', view: 'formatted' },
      answers: [{ status: 200, data: 'text' }],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/dump/PINDUMP/formatted',
          headers: { Accept: 'text/plain' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerProfileList',
      variant: 'onprem',
      stand: 'recording',
      args: {},
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/traces/abaptraces',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerProfileView',
      variant: 'onprem',
      stand: 'recording',
      args: { trace_id_or_uri: 'PINTRACE', view: 'hitlist' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/traces/abaptraces/PINTRACE/hitlist',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerProfileSchedule',
      variant: 'onprem',
      stand: 'recording',
      args: { description: 'Pin trace' },
      answers: [
        {
          status: 201,
          headers: {
            location:
              '/sap/bc/adt/runtime/traces/abaptraces/parameters/PINPROFILER',
          },
        },
      ],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/runtime/traces/abaptraces/parameters',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: SCHEDULE_BODY,
        },
      ],
    },
    {
      tool: 'HandlerProfileRun',
      variant: 'onprem',
      stand: 'recording',
      args: {
        target_type: 'CLASS',
        class_name: 'ZCL_MCP_PIN',
        profiler_id: 'PINPROFILER',
      },
      answers: [{ status: 200, data: 'ran' }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/oo/classrun/ZCL_MCP_PIN?profilerId=PINPROFILER',
          headers: {
            Accept: 'text/plain',
            'X-sap-adt-profiling': 'server-time',
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
      tool: 'HandlerDumpList',
      variant: 'cloud',
      stand: 'recording',
      args: { top: 5 },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/dumps?%24top=5',
          headers: { Accept: 'application/atom+xml;type=feed' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerDumpView',
      variant: 'cloud',
      stand: 'recording',
      args: { dump_id: 'PINDUMP' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/dump/PINDUMP',
          headers: { Accept: 'application/vnd.sap.adt.runtime.dump.v1+xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerDumpView',
      variant: 'cloud',
      stand: 'recording',
      args: { dump_id: 'PINDUMP', view: 'formatted' },
      answers: [{ status: 200, data: 'text' }],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/dump/PINDUMP/formatted',
          headers: { Accept: 'text/plain' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerProfileList',
      variant: 'cloud',
      stand: 'recording',
      args: {},
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/traces/abaptraces',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerProfileView',
      variant: 'cloud',
      stand: 'recording',
      args: { trace_id_or_uri: 'PINTRACE', view: 'hitlist' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/runtime/traces/abaptraces/PINTRACE/hitlist',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerProfileSchedule',
      variant: 'cloud',
      stand: 'recording',
      args: { description: 'Pin trace' },
      answers: [
        {
          status: 201,
          headers: {
            location:
              '/sap/bc/adt/runtime/traces/abaptraces/parameters/PINPROFILER',
          },
        },
      ],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/runtime/traces/abaptraces/parameters',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: SCHEDULE_BODY,
        },
      ],
    },
    {
      tool: 'HandlerProfileRun',
      variant: 'cloud',
      stand: 'recording',
      args: {
        target_type: 'CLASS',
        class_name: 'ZCL_MCP_PIN',
        profiler_id: 'PINPROFILER',
      },
      answers: [{ status: 200, data: 'ran' }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/oo/classrun/ZCL_MCP_PIN?profilerId=PINPROFILER',
          headers: {
            Accept: 'text/plain',
            'X-sap-adt-profiling': 'server-time',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
