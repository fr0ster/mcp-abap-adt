/**
 * `wait` on the ABAP Unit run tools, and the readers that wait for a run.
 * Against the real adt-clients over a recording connection:
 *
 * - `wait: false` sends the start alone and answers the run id;
 * - `wait: true`, and the default, read the status by long polling
 *   (`?withLongPolling=true`) until SAP answers `FINISHED`, then the result;
 * - `wait` with `runner: 'sync'` is refused with nothing sent, and a value
 *   that is not a boolean is refused with nothing sent;
 * - the readers (`GetUnitTestResult`, the library's `GetUnitTest`,
 *   `GetCdsUnitTest`, `GetCdsUnitTestResult`) read the status by long polling
 *   until finished, then the result.
 *
 * A status long poll is held by ADT until the run has finished (measured on
 * premise, 2026-10-31), so a `RUNNING` answer is rare on the wire; the
 * recordings here answer `RUNNING` several times to prove the loop reads
 * on until `FINISHED`, however many answers that takes.
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
// Synthetic (no fixture): a status read while the run is in progress.
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING" percentage="40"/></aunit:run>',
};

interface Answer {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<{ readonly text: string }>;
}

/** Each run tool, with the `wait` it is given (none when `undefined`). */
interface RunTool {
  readonly name: string;
  readonly call: (
    connection: RecordingConnection,
    wait: { wait?: boolean },
  ) => Promise<Answer>;
}

const RUN_TOOLS: readonly RunTool[] = [
  {
    name: 'RunUnitTest',
    call: (connection, wait) =>
      handleRunUnitTest({ connection }, { class_name: 'zcl_x', ...wait }),
  },
  {
    name: 'RunCdsUnitTest',
    call: (connection, wait) =>
      handleRunCdsUnitTest({ connection }, { class_name: 'zcl_x', ...wait }),
  },
  {
    name: 'RunProgramUnitTest',
    call: (connection, wait) =>
      handleRunProgramUnitTest(
        { connection },
        { program_name: 'zr_x', ...wait },
      ),
  },
  {
    name: 'RunFunctionGroupUnitTest',
    call: (connection, wait) =>
      handleRunFunctionGroupUnitTest(
        { connection },
        { function_group_name: 'zfg_x', ...wait },
      ),
  },
  {
    name: 'RunFunctionModuleUnitTest',
    call: (connection, wait) =>
      handleRunFunctionModuleUnitTest(
        { connection },
        { function_module_name: 'z_fm_x', ...wait },
      ),
  },
  {
    name: 'RunAbapUnit',
    call: (connection, wait) =>
      handleRunAbapUnit(
        { connection },
        {
          target: { kind: 'object', name: 'zcl_x', type: 'CLAS/OC' },
          ...wait,
        },
      ),
  },
];

/** Each reader that waits for a run by its id. */
interface Reader {
  readonly name: string;
  readonly call: (connection: RecordingConnection) => Promise<Answer>;
}

const READERS: readonly Reader[] = [
  {
    name: 'GetUnitTestResult',
    call: (connection) =>
      handleGetUnitTestResult({ connection }, { run_id: RUN }),
  },
  {
    name: 'GetUnitTest',
    call: (connection) => handleGetUnitTest({ connection }, { run_id: RUN }),
  },
  {
    name: 'GetCdsUnitTest',
    call: (connection) => handleGetCdsUnitTest({ connection }, { run_id: RUN }),
  },
  {
    name: 'GetCdsUnitTestResult',
    call: (connection) =>
      handleGetCdsUnitTestResult({ connection }, { run_id: RUN }),
  },
];

const starts = (requests: readonly RecordedRequest[]) =>
  requests.filter(
    (r) => r.method === 'POST' && r.url.endsWith('/abapunit/runs'),
  );
const statusReads = (requests: readonly RecordedRequest[]) =>
  requests.filter(
    (r) => r.method === 'GET' && r.url.includes('/abapunit/runs/'),
  );
const resultReads = (requests: readonly RecordedRequest[]) =>
  requests.filter((r) => r.url.includes('/abapunit/results/'));
const answerOf = (result: Answer) => JSON.parse(result.content[0]?.text ?? '');

describe.each(RUN_TOOLS)('$name: wait', (tool) => {
  it('wait false sends the start alone and answers the run id', async () => {
    const connection = recordingConnection([STARTED, FINISHED, RESULT]);
    const result = await tool.call(connection, { wait: false });
    expect(result.isError).toBe(false);
    expect(connection.requests).toHaveLength(1);
    expect(starts(connection.requests)).toHaveLength(1);
    expect(answerOf(result)).toEqual({ success: true, run_id: RUN });
  });

  it.each([
    ['wait true', { wait: true }],
    ['no wait (the default)', {}],
  ])(
    '%s long-polls the status until finished, then reads the result',
    async (_label, wait) => {
      const connection = recordingConnection([
        STARTED,
        RUNNING,
        RUNNING,
        RUNNING,
        RUNNING,
        RUNNING,
        RUNNING,
        FINISHED,
        RESULT,
      ]);
      const result = await tool.call(connection, wait);
      expect(result.isError).toBe(false);
      expect(starts(connection.requests)).toHaveLength(1);
      const polls = statusReads(connection.requests);
      expect(polls).toHaveLength(7);
      for (const poll of polls) {
        expect(poll.url).toBe(
          `/sap/bc/adt/abapunit/runs/${RUN}?withLongPolling=true`,
        );
      }
      expect(resultReads(connection.requests)).toHaveLength(1);
      expect(connection.requests.at(-1)?.url).toContain('/abapunit/results/');
      const answer = answerOf(result);
      expect(answer.success).toBe(true);
      expect(answer.run_id).toBe(RUN);
      expect(answer.finished).toBe(true);
      expect(JSON.stringify(answer.run_result)).toContain('TEST_METHOD');
    },
  );
});

describe('wait with runner sync', () => {
  const SYNC_TOOLS: ReadonlyArray<
    readonly [
      string,
      (c: RecordingConnection, wait: boolean) => Promise<Answer>,
    ]
  > = [
    [
      'RunUnitTest',
      (connection, wait) =>
        handleRunUnitTest(
          { connection },
          { class_name: 'zcl_x', runner: 'sync', wait },
        ),
    ],
    [
      'RunProgramUnitTest',
      (connection, wait) =>
        handleRunProgramUnitTest(
          { connection },
          { program_name: 'zr_x', runner: 'sync', wait },
        ),
    ],
    [
      'RunFunctionGroupUnitTest',
      (connection, wait) =>
        handleRunFunctionGroupUnitTest(
          { connection },
          { function_group_name: 'zfg_x', runner: 'sync', wait },
        ),
    ],
    [
      'RunFunctionModuleUnitTest',
      (connection, wait) =>
        handleRunFunctionModuleUnitTest(
          { connection },
          {
            function_module_name: 'z_fm_x',
            function_group_name: 'zfg_x',
            runner: 'sync',
            wait,
          },
        ),
    ],
  ];

  describe.each(SYNC_TOOLS)('%s', (_name, call) => {
    it.each([true, false])(
      'refuses wait %s before anything is sent',
      async (wait) => {
        const connection = recordingConnection([RESULT]);
        const result = await call(connection, wait);
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain(
          'wait goes with runner async',
        );
        expect(result.content[0]?.text).toContain('nothing was sent');
        expect(connection.requests).toEqual([]);
      },
    );
  });
});

/**
 * The arguments of a call as they arrive from a client: parsed JSON, outside
 * the type system — the only way a `wait` that is not a boolean reaches a
 * handler typed `wait?: boolean`.
 */
function fromClient(json: string) {
  return JSON.parse(json);
}

describe('a wait that is not a boolean, on each run tool', () => {
  const NOT_BOOLEAN: readonly string[] = [
    '"false"',
    '1',
    '0',
    'null',
    '{"on":true}',
  ];
  const calls: ReadonlyArray<
    readonly [string, (c: RecordingConnection, wait: string) => Promise<Answer>]
  > = [
    [
      'RunUnitTest',
      (connection, wait) =>
        handleRunUnitTest(
          { connection },
          fromClient(`{"class_name":"zcl_x","wait":${wait}}`),
        ),
    ],
    [
      'RunCdsUnitTest',
      (connection, wait) =>
        handleRunCdsUnitTest(
          { connection },
          fromClient(`{"class_name":"zcl_x","wait":${wait}}`),
        ),
    ],
    [
      'RunProgramUnitTest',
      (connection, wait) =>
        handleRunProgramUnitTest(
          { connection },
          fromClient(`{"program_name":"zr_x","wait":${wait}}`),
        ),
    ],
    [
      'RunFunctionGroupUnitTest',
      (connection, wait) =>
        handleRunFunctionGroupUnitTest(
          { connection },
          fromClient(`{"function_group_name":"zfg_x","wait":${wait}}`),
        ),
    ],
    [
      'RunFunctionModuleUnitTest',
      (connection, wait) =>
        handleRunFunctionModuleUnitTest(
          { connection },
          fromClient(`{"function_module_name":"z_fm_x","wait":${wait}}`),
        ),
    ],
    [
      'RunAbapUnit',
      (connection, wait) =>
        handleRunAbapUnit(
          { connection },
          fromClient(
            `{"target":{"kind":"object","name":"zcl_x","type":"CLAS/OC"},"wait":${wait}}`,
          ),
        ),
    ],
  ];
  describe.each(calls)('%s', (_name, call) => {
    it.each(NOT_BOOLEAN)('refuses %s before anything is sent', async (wait) => {
      const connection = recordingConnection([STARTED, FINISHED, RESULT]);
      const result = await call(connection, wait);
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('wait must be true or false');
      expect(result.content[0]?.text).toContain('nothing was sent');
      expect(connection.requests).toEqual([]);
    });
  });
});

describe.each(READERS)('$name reads until the run finished', (reader) => {
  it('long-polls the status until finished, then reads the result once', async () => {
    const connection = recordingConnection([
      RUNNING,
      RUNNING,
      RUNNING,
      RUNNING,
      RUNNING,
      RUNNING,
      FINISHED,
      RESULT,
    ]);
    const result = await reader.call(connection);
    expect(result.isError).toBe(false);
    const polls = statusReads(connection.requests);
    expect(polls).toHaveLength(7);
    for (const poll of polls) {
      expect(poll.url).toBe(
        `/sap/bc/adt/abapunit/runs/${RUN}?withLongPolling=true`,
      );
    }
    expect(resultReads(connection.requests)).toHaveLength(1);
    expect(connection.requests).toHaveLength(8);
    const answer = answerOf(result);
    expect(answer.finished).toBe(true);
    expect(answer.run_id).toBe(RUN);
  });

  it('reads the result only after the status says finished', async () => {
    const connection = recordingConnection([FINISHED, RESULT]);
    await reader.call(connection);
    expect(connection.requests.map((r) => r.url)).toEqual([
      `/sap/bc/adt/abapunit/runs/${RUN}?withLongPolling=true`,
      expect.stringContaining('/abapunit/results/'),
    ]);
  });
});

describe('the schema', () => {
  it.each([
    RunUnitTest_Tool,
    RunCdsUnitTest_Tool,
    RunProgramUnitTest_Tool,
    RunFunctionGroupUnitTest_Tool,
    RunFunctionModuleUnitTest_Tool,
    RunAbapUnit_Tool,
  ])(
    '$name declares wait: an optional boolean, default true, and says what each value does',
    (tool) => {
      const properties: Record<string, unknown> = tool.inputSchema.properties;
      expect(properties.wait).toEqual({
        type: 'boolean',
        default: true,
        description: expect.stringContaining(
          'A long run under a client with a request time limit is started with false.',
        ),
      });
      expect(properties).not.toHaveProperty('max_status_polls');
      expect(tool.inputSchema.required).not.toContain('wait');
      expect(tool.description).toContain('with wait true (default)');
      expect(tool.description).toContain(
        'with wait false the call answers the run_id right after the start',
      );
      expect(tool.description).toContain(
        'A long run under a client with a request time limit is started with wait false.',
      );
    },
  );

  it('GetUnitTestResult declares no wait and no max_status_polls', () => {
    const properties: Record<string, unknown> =
      GetUnitTestResult_Tool.inputSchema.properties;
    expect(properties).not.toHaveProperty('wait');
    expect(properties).not.toHaveProperty('max_status_polls');
  });
});
