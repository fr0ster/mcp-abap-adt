/**
 * `max_status_polls`: how many status long polls a tool that waits for an
 * ABAP Unit run reads before it answers the run_id (or, for a reader, the
 * last status). Against the real adt-clients over a recording connection:
 * the limit is honoured, a run that finished before it answers the result,
 * the default is 5, and a value that is not an integer of 1 or more is
 * refused with nothing sent.
 */

import { handleGetCdsUnitTest } from '../../handlers/unit_test/high/handleGetCdsUnitTest';
import { handleGetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { handleGetUnitTest } from '../../handlers/unit_test/high/handleGetUnitTest';
import {
  TOOL_DEFINITION as GetUnitTestResult_Tool,
  handleGetUnitTestResult,
} from '../../handlers/unit_test/high/handleGetUnitTestResult';
import {
  handleRunAbapUnit,
  TOOL_DEFINITION as RunAbapUnit_Tool,
} from '../../handlers/unit_test/high/handleRunAbapUnit';
import {
  handleRunCdsUnitTest,
  TOOL_DEFINITION as RunCdsUnitTest_Tool,
} from '../../handlers/unit_test/high/handleRunCdsUnitTest';
import {
  handleRunFunctionGroupUnitTest,
  TOOL_DEFINITION as RunFunctionGroupUnitTest_Tool,
} from '../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import {
  handleRunFunctionModuleUnitTest,
  TOOL_DEFINITION as RunFunctionModuleUnitTest_Tool,
} from '../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import {
  handleRunProgramUnitTest,
  TOOL_DEFINITION as RunProgramUnitTest_Tool,
} from '../../handlers/unit_test/high/handleRunProgramUnitTest';
import {
  handleRunUnitTest,
  TOOL_DEFINITION as RunUnitTest_Tool,
} from '../../handlers/unit_test/high/handleRunUnitTest';
import { corpusBody } from '../../lib/adtCorpus';
import {
  type RecordedRequest,
  type RecordingConnection,
  recordingConnection,
} from '../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const RUN = 'FA53C505DD7B1FD1ABB8599833A05D44';
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
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING" percentage="40"/></aunit:run>',
};

interface Answer {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<{ readonly text: string }>;
}

/** A tool under test: whether it starts the run, and one call of it. */
interface WaitingTool {
  readonly name: string;
  readonly starts: boolean;
  readonly call: (
    connection: RecordingConnection,
    polls: { max_status_polls?: number },
  ) => Promise<Answer>;
}

const TOOLS: readonly WaitingTool[] = [
  {
    name: 'RunUnitTest',
    starts: true,
    call: (connection, polls) =>
      handleRunUnitTest({ connection }, { class_name: 'zcl_x', ...polls }),
  },
  {
    name: 'RunCdsUnitTest',
    starts: true,
    call: (connection, polls) =>
      handleRunCdsUnitTest({ connection }, { class_name: 'zcl_x', ...polls }),
  },
  {
    name: 'RunProgramUnitTest',
    starts: true,
    call: (connection, polls) =>
      handleRunProgramUnitTest(
        { connection },
        { program_name: 'zr_x', ...polls },
      ),
  },
  {
    name: 'RunFunctionGroupUnitTest',
    starts: true,
    call: (connection, polls) =>
      handleRunFunctionGroupUnitTest(
        { connection },
        { function_group_name: 'zfg_x', ...polls },
      ),
  },
  {
    name: 'RunFunctionModuleUnitTest',
    starts: true,
    call: (connection, polls) =>
      handleRunFunctionModuleUnitTest(
        { connection },
        { function_module_name: 'z_fm_x', ...polls },
      ),
  },
  {
    name: 'RunAbapUnit',
    starts: true,
    call: (connection, polls) =>
      handleRunAbapUnit(
        { connection },
        {
          target: { kind: 'object', name: 'zcl_x', type: 'CLAS/OC' },
          ...polls,
        },
      ),
  },
  {
    name: 'GetUnitTestResult',
    starts: false,
    call: (connection, polls) =>
      handleGetUnitTestResult({ connection }, { run_id: RUN, ...polls }),
  },
  {
    name: 'GetUnitTest',
    starts: false,
    call: (connection, polls) =>
      handleGetUnitTest({ connection }, { run_id: RUN, ...polls }),
  },
  {
    name: 'GetCdsUnitTest',
    starts: false,
    call: (connection, polls) =>
      handleGetCdsUnitTest({ connection }, { run_id: RUN, ...polls }),
  },
  {
    name: 'GetCdsUnitTestResult',
    starts: false,
    call: (connection, polls) =>
      handleGetCdsUnitTestResult({ connection }, { run_id: RUN, ...polls }),
  },
];

const statusReads = (requests: readonly RecordedRequest[]) =>
  requests.filter(
    (r) => r.method === 'GET' && r.url.includes('/abapunit/runs/'),
  ).length;
const resultReads = (requests: readonly RecordedRequest[]) =>
  requests.filter((r) => r.url.includes('/abapunit/results/')).length;
const answerOf = (result: Answer) => JSON.parse(result.content[0]?.text ?? '');

/** The answers a tool's run gives: the start (if it starts one), then `statuses`. */
const answers = (tool: WaitingTool, statuses: object[]) => [
  ...(tool.starts ? [STARTED] : []),
  ...statuses,
];

describe.each(TOOLS.map((tool): [string, WaitingTool] => [tool.name, tool]))(
  '%s: max_status_polls',
  (_name, tool) => {
    it('reads the status max_status_polls times, then answers the run_id unfinished', async () => {
      const connection = recordingConnection(
        answers(tool, Array(8).fill(RUNNING)),
      );
      const result = await tool.call(connection, { max_status_polls: 2 });
      expect(result.isError).toBe(false);
      expect(statusReads(connection.requests)).toBe(2);
      expect(resultReads(connection.requests)).toBe(0);
      const answer = answerOf(result);
      expect(answer.finished).toBe(false);
      expect(answer.run_id).toBe(RUN);
      expect(answer.message).toContain('after 2 status checks');
    });

    it('answers the result of a run that finished before the limit', async () => {
      const connection = recordingConnection(
        answers(tool, [RUNNING, FINISHED, RESULT]),
      );
      const result = await tool.call(connection, { max_status_polls: 4 });
      expect(result.isError).toBe(false);
      expect(statusReads(connection.requests)).toBe(2);
      expect(resultReads(connection.requests)).toBe(1);
      expect(answerOf(result).finished).toBe(true);
    });

    it('reads the status 5 times when the call names no limit', async () => {
      const connection = recordingConnection(
        answers(tool, Array(8).fill(RUNNING)),
      );
      const result = await tool.call(connection, {});
      expect(statusReads(connection.requests)).toBe(5);
      expect(answerOf(result).message).toContain('after 5 status checks');
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses max_status_polls %s before anything is sent',
      async (value) => {
        const connection = recordingConnection(
          answers(tool, Array(8).fill(RUNNING)),
        );
        const result = await tool.call(connection, {
          max_status_polls: value,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain(
          'max_status_polls must be an integer of 1 or more',
        );
        expect(result.content[0]?.text).toContain('nothing was sent');
        expect(connection.requests).toEqual([]);
      },
    );
  },
);

describe('max_status_polls of another type than a number', () => {
  it.each(['3', null, true, { n: 3 }])(
    'refuses %j before anything is sent',
    async (value) => {
      const connection = recordingConnection([STARTED, FINISHED, RESULT]);
      const result = await handleRunAbapUnit(
        { connection },
        {
          target: { kind: 'object', name: 'zcl_x', type: 'CLAS/OC' },
          max_status_polls: value,
        },
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(
        'max_status_polls must be an integer of 1 or more',
      );
      expect(connection.requests).toEqual([]);
    },
  );
});

describe('max_status_polls with runner sync', () => {
  it.each([
    [
      'RunUnitTest',
      (connection: RecordingConnection) =>
        handleRunUnitTest(
          { connection },
          { class_name: 'zcl_x', runner: 'sync', max_status_polls: 2 },
        ),
    ],
    [
      'RunProgramUnitTest',
      (connection: RecordingConnection) =>
        handleRunProgramUnitTest(
          { connection },
          { program_name: 'zr_x', runner: 'sync', max_status_polls: 2 },
        ),
    ],
    [
      'RunFunctionGroupUnitTest',
      (connection: RecordingConnection) =>
        handleRunFunctionGroupUnitTest(
          { connection },
          { function_group_name: 'zfg_x', runner: 'sync', max_status_polls: 2 },
        ),
    ],
    [
      'RunFunctionModuleUnitTest',
      (connection: RecordingConnection) =>
        handleRunFunctionModuleUnitTest(
          { connection },
          {
            function_module_name: 'z_fm_x',
            function_group_name: 'zfg_x',
            runner: 'sync',
            max_status_polls: 2,
          },
        ),
    ],
  ])(
    '%s refuses it before anything is sent',
    async (_name, call: (c: RecordingConnection) => Promise<Answer>) => {
      const connection = recordingConnection([RESULT]);
      const result = await call(connection);
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(
        'max_status_polls goes with runner async',
      );
      expect(connection.requests).toEqual([]);
    },
  );
});

describe('the schema of max_status_polls', () => {
  it.each([
    RunUnitTest_Tool,
    RunCdsUnitTest_Tool,
    RunProgramUnitTest_Tool,
    RunFunctionGroupUnitTest_Tool,
    RunFunctionModuleUnitTest_Tool,
    RunAbapUnit_Tool,
    GetUnitTestResult_Tool,
  ])(
    '$name declares it optional: an integer of 1 or more, default 5',
    (tool) => {
      expect(tool.inputSchema.properties.max_status_polls).toEqual({
        type: 'integer',
        minimum: 1,
        default: 5,
        description: expect.stringContaining('default 5'),
      });
      expect(tool.inputSchema.required).not.toContain('max_status_polls');
      expect(tool.description).toContain('max_status_polls long polls');
    },
  );
});
