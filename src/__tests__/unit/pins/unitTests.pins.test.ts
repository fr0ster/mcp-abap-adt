/**
 * ABAP Unit run reads, pinned (plan D8, #3): each case's whole recorded
 * request list as a literal, on `recordingConnection` with real adt-clients
 * code.
 *
 * A run's status is read first without long polling, and only a run SAP
 * answers `RUNNING` is long-polled (`?withLongPolling=true`), read again
 * after each answer. Measured on both systems (2026-11-05): an unknown run
 * id reads `NOT_STARTED` at once without long polling and only after about
 * 300 s with it; a run in progress reads `RUNNING` from right after its
 * start; a finished one `FINISHED`.
 *
 * - `GetUnitTestResult`: the served full result reader;
 * - `RunUnitTest`: the run tools' wait through `runAndWait`;
 * - `RunAbapUnit`: the run tools' wait through `waitForRun` alone;
 * - `HandlerUnitTestResult`: the compact result tool, which reads only the
 *   result.
 */
import { corpusBody } from '../../helpers/adtCorpus';
import { type McpResult, pinCases } from '../../helpers/pinCases';

const RUN = 'FA53C505DD7B1FD1ABB8599833A05D44';
/** A run id holding the characters a path segment must encode. */
const ODD_RUN = 'a/b?c#d%';

const STARTED = {
  status: 201,
  headers: { location: `/sap/bc/adt/abapunit/runs/${RUN}` },
};
const FINISHED = {
  data: corpusBody(`unittest-run-passing--02-runs-${RUN.toLowerCase()}`),
};
const RESULT = {
  data: corpusBody(`unittest-run-passing--03-results-${RUN.toLowerCase()}`),
};
/** A run in progress, as SAP answered it without long polling (measured, its run details left out). */
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING"/></aunit:run>',
};
/** An unknown run, as SAP answered it (measured): `NOT_STARTED`, its result links naming the all-zero run. */
const NOT_STARTED = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="NOT_STARTED"/><aunit:time/><atom:link href="/sap/bc/adt/abapunit/results/00000000000000000000000000000000" rel="http://www.sap.com/adt/relations/api/abapunit/run-result" type="application/vnd.sap.adt.api.abapunit.run-result.v1+xml" title="Run Result (ABAP Unit Format)" xmlns:atom="http://www.w3.org/2005/Atom"/></aunit:run>',
};

const STATUS_ACCEPT = {
  Accept: 'application/vnd.sap.adt.api.abapunit.run-status.v1+xml',
};
const RESULT_ACCEPT = {
  Accept: 'application/vnd.sap.adt.api.abapunit.run-result.v1+xml',
};

/** The run start's body for the object `type` names. */
const startBody = (type: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:osl="http://www.sap.com/api/osl" title="ZCL_X" context="MCP ABAP ADT Client">\n  <aunit:options>\n    <aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>\n    <aunit:riskLevel harmless="true" dangerous="true" critical="true"/>\n    <aunit:duration short="true" medium="true" long="true"/>\n  </aunit:options>\n  <osl:objectSet xsi:type="osl:flatObjectSet">\n    <osl:object name="ZCL_X" type="${type}"/>\n  </osl:objectSet>\n</aunit:run>`;
const START_HEADERS = {
  'Content-Type': 'application/vnd.sap.adt.api.abapunit.run.v2+xml',
};

/** The JSON a tool answered. */
function answered(answer: McpResult): unknown {
  return JSON.parse(answer.content[0]?.text ?? '');
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The answer of a run SAP answered finished: its id and a result. */
function expectFinished(runId: string) {
  return (answer: McpResult) => {
    expect(answer.isError).toBe(false);
    const value = answered(answer);
    expect(member(value, 'run_id')).toBe(runId);
    expect(member(value, 'finished')).toBe(true);
    expect(member(value, 'run_result')).toBeDefined();
  };
}

/** The answer of a run SAP answered `NOT_STARTED`: its id and that status. */
function expectNotStarted(answer: McpResult) {
  expect(answer.isError).toBe(false);
  expect(answered(answer)).toEqual({
    success: true,
    run_id: RUN,
    status: 'NOT_STARTED',
  });
}

describe('unit test run pins', () => {
  pinCases([
    // an unknown run: one status read without long polling, answered NOT_STARTED
    {
      tool: 'GetUnitTestResult',
      variant: 'onprem',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [NOT_STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectNotStarted,
    },
    // an unknown run: one status read without long polling, answered NOT_STARTED
    {
      tool: 'GetUnitTestResult',
      variant: 'cloud',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [NOT_STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectNotStarted,
    },
    // a running run: read, then long-polled, then its result
    {
      tool: 'GetUnitTestResult',
      variant: 'onprem',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [RUNNING, FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44?withLongPolling=true',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a running run: read, then long-polled, then its result
    {
      tool: 'GetUnitTestResult',
      variant: 'cloud',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [RUNNING, FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44?withLongPolling=true',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a finished run: read without waiting, then its result
    {
      tool: 'GetUnitTestResult',
      variant: 'onprem',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a finished run: read without waiting, then its result
    {
      tool: 'GetUnitTestResult',
      variant: 'cloud',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // the run id percent-encoded in the status and the result URL
    {
      tool: 'GetUnitTestResult',
      variant: 'onprem',
      stand: 'recording',
      args: { run_id: ODD_RUN },
      answers: [FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/a%2Fb%3Fc%23d%25',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/a%2Fb%3Fc%23d%25',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(ODD_RUN),
    },
    // the run id percent-encoded in the status and the result URL
    {
      tool: 'GetUnitTestResult',
      variant: 'cloud',
      stand: 'recording',
      args: { run_id: ODD_RUN },
      answers: [FINISHED, RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/a%2Fb%3Fc%23d%25',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/a%2Fb%3Fc%23d%25',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(ODD_RUN),
    },
    // a run SAP answers NOT_STARTED: answered at once
    {
      tool: 'RunUnitTest',
      variant: 'onprem',
      stand: 'recording',
      args: { class_name: 'ZCL_X' },
      answers: [STARTED, NOT_STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectNotStarted,
    },
    // a run SAP answers NOT_STARTED: answered at once
    {
      tool: 'RunUnitTest',
      variant: 'cloud',
      stand: 'recording',
      args: { class_name: 'ZCL_X' },
      answers: [STARTED, NOT_STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectNotStarted,
    },
    // a running run: read, then long-polled, then its result
    {
      tool: 'RunUnitTest',
      variant: 'onprem',
      stand: 'recording',
      args: { class_name: 'ZCL_X' },
      answers: [STARTED, RUNNING, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44?withLongPolling=true',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a running run: read, then long-polled, then its result
    {
      tool: 'RunUnitTest',
      variant: 'cloud',
      stand: 'recording',
      args: { class_name: 'ZCL_X' },
      answers: [STARTED, RUNNING, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44?withLongPolling=true',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a finished run: read without waiting, then its result
    {
      tool: 'RunUnitTest',
      variant: 'onprem',
      stand: 'recording',
      args: { class_name: 'ZCL_X' },
      answers: [STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a finished run: read without waiting, then its result
    {
      tool: 'RunUnitTest',
      variant: 'cloud',
      stand: 'recording',
      args: { class_name: 'ZCL_X' },
      answers: [STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a run SAP answers NOT_STARTED: answered at once
    {
      tool: 'RunAbapUnit',
      variant: 'onprem',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED, NOT_STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS/OC'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectNotStarted,
    },
    // a run SAP answers NOT_STARTED: answered at once
    {
      tool: 'RunAbapUnit',
      variant: 'cloud',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED, NOT_STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS/OC'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectNotStarted,
    },
    // a running run: read, then long-polled, then its result
    {
      tool: 'RunAbapUnit',
      variant: 'onprem',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED, RUNNING, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS/OC'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44?withLongPolling=true',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a running run: read, then long-polled, then its result
    {
      tool: 'RunAbapUnit',
      variant: 'cloud',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED, RUNNING, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS/OC'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44?withLongPolling=true',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a finished run: read without waiting, then its result
    {
      tool: 'RunAbapUnit',
      variant: 'onprem',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS/OC'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // a finished run: read without waiting, then its result
    {
      tool: 'RunAbapUnit',
      variant: 'cloud',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED, FINISHED, RESULT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: START_HEADERS,
          body: startBody('CLAS/OC'),
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: STATUS_ACCEPT,
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
      ran: expectFinished(RUN),
    },
    // the compact result tool still reads only the result
    {
      tool: 'HandlerUnitTestResult',
      variant: 'onprem',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [RESULT, FINISHED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44?withNavigationUris=false',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
    },
    // the compact result tool still reads only the result
    {
      tool: 'HandlerUnitTestResult',
      variant: 'cloud',
      stand: 'recording',
      args: { run_id: RUN },
      answers: [RESULT, FINISHED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44?withNavigationUris=false',
          headers: RESULT_ACCEPT,
          body: undefined,
        },
      ],
    },
  ]);
});
