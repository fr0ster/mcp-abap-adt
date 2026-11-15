/**
 * The compact ABAP Unit tools, pinned on each variant on
 * `recordingConnection` with real adt-clients code: HandlerUnitTestRun
 * starts a run of a class (its one start, answered with the run's location),
 * HandlerUnitTestStatus and HandlerCdsUnitTestStatus read a run's status
 * without long polling, and HandlerCdsUnitTestResult reads a finished run's
 * result. SAP's answers are the run documents the corpus captured.
 */
import { corpusBody } from '../../helpers/adtCorpus';
import { pinCases } from '../../helpers/pinCases';

const RUN = 'FA53C505DD7B1FD1ABB8599833A05D44';

/** The start, answered with the run's location. */
const STARTED = {
  status: 201,
  headers: { location: `/sap/bc/adt/abapunit/runs/${RUN}` },
};
/** A run in progress, as SAP answered it without long polling. */
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING"/></aunit:run>',
};
/** A finished run's result. */
const RESULT = {
  data: corpusBody(`unittest-run-passing--03-results-${RUN.toLowerCase()}`),
};

describe('onprem', () => {
  pinCases([
    {
      tool: 'HandlerUnitTestRun',
      variant: 'onprem',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: {
            'Content-Type': 'application/vnd.sap.adt.api.abapunit.run.v2+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:osl="http://www.sap.com/api/osl" title="ZCL_X" context="MCP ABAP ADT Client">\n  <aunit:options>\n    <aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>\n    <aunit:riskLevel harmless="true" dangerous="true" critical="true"/>\n    <aunit:duration short="true" medium="true" long="true"/>\n  </aunit:options>\n  <osl:objectSet xsi:type="osl:flatObjectSet">\n    <osl:object name="ZCL_X" type="CLAS/OC"/>\n  </osl:objectSet>\n</aunit:run>',
        },
      ],
    },
    {
      tool: 'HandlerUnitTestStatus',
      variant: 'onprem',
      stand: 'recording',
      args: {
        run_id: 'FA53C505DD7B1FD1ABB8599833A05D44',
        with_long_polling: false,
      },
      answers: [RUNNING],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: {
            Accept: 'application/vnd.sap.adt.api.abapunit.run-status.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerCdsUnitTestStatus',
      variant: 'onprem',
      stand: 'recording',
      args: {
        run_id: 'FA53C505DD7B1FD1ABB8599833A05D44',
        with_long_polling: false,
      },
      answers: [RUNNING],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: {
            Accept: 'application/vnd.sap.adt.api.abapunit.run-status.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerCdsUnitTestResult',
      variant: 'onprem',
      stand: 'recording',
      args: { run_id: 'FA53C505DD7B1FD1ABB8599833A05D44' },
      answers: [RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44?withNavigationUris=false',
          headers: {
            Accept: 'application/vnd.sap.adt.api.abapunit.run-result.v1+xml',
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
      tool: 'HandlerUnitTestRun',
      variant: 'cloud',
      stand: 'recording',
      args: { target: { kind: 'object', name: 'ZCL_X', type: 'CLAS/OC' } },
      answers: [STARTED],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/abapunit/runs',
          headers: {
            'Content-Type': 'application/vnd.sap.adt.api.abapunit.run.v2+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:osl="http://www.sap.com/api/osl" title="ZCL_X" context="MCP ABAP ADT Client">\n  <aunit:options>\n    <aunit:scope ownTests="true" foreignTests="false" addForeignTestsAsPreview="true"/>\n    <aunit:riskLevel harmless="true" dangerous="true" critical="true"/>\n    <aunit:duration short="true" medium="true" long="true"/>\n  </aunit:options>\n  <osl:objectSet xsi:type="osl:flatObjectSet">\n    <osl:object name="ZCL_X" type="CLAS/OC"/>\n  </osl:objectSet>\n</aunit:run>',
        },
      ],
    },
    {
      tool: 'HandlerUnitTestStatus',
      variant: 'cloud',
      stand: 'recording',
      args: {
        run_id: 'FA53C505DD7B1FD1ABB8599833A05D44',
        with_long_polling: false,
      },
      answers: [RUNNING],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: {
            Accept: 'application/vnd.sap.adt.api.abapunit.run-status.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerCdsUnitTestStatus',
      variant: 'cloud',
      stand: 'recording',
      args: {
        run_id: 'FA53C505DD7B1FD1ABB8599833A05D44',
        with_long_polling: false,
      },
      answers: [RUNNING],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/runs/FA53C505DD7B1FD1ABB8599833A05D44',
          headers: {
            Accept: 'application/vnd.sap.adt.api.abapunit.run-status.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerCdsUnitTestResult',
      variant: 'cloud',
      stand: 'recording',
      args: { run_id: 'FA53C505DD7B1FD1ABB8599833A05D44' },
      answers: [RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/abapunit/results/FA53C505DD7B1FD1ABB8599833A05D44?withNavigationUris=false',
          headers: {
            Accept: 'application/vnd.sap.adt.api.abapunit.run-result.v1+xml',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
