/**
 * `wait` on the ABAP Unit run tools, and the readers that wait for a run.
 * Against the real adt-clients over a recording connection:
 *
 * - `wait: false` sends the start alone and answers the run id;
 * - `wait: true`, and the default, read the status at once (no long
 *   polling), and long-poll (`?withLongPolling=true`) only while SAP answers
 *   `RUNNING` or answers the first read `NOT_STARTED`: `FINISHED` reads the
 *   result, a long-polled `NOT_STARTED` is answered with the run id, and a
 *   status with no `aunit:progress` is a failure carrying SAP's document;
 * - `wait` with `runner: 'sync'` is refused with nothing sent, and a value
 *   that is not a boolean is refused with nothing sent;
 * - the readers (`GetUnitTestResult`, the library's `GetUnitTest`,
 *   `GetCdsUnitTest`, `GetCdsUnitTestResult`) read the status the same way.
 *
 * A status long poll is held by ADT until the run has finished (measured on
 * premise, 2026-10-31); a plain read answers at once (measured on both
 * systems, 2026-11-05). Each recording queues a `FINISHED` answer after the
 * one under test, so a further status read would be answered and seen.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
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
import { defineTool } from '../../lib/handlers/interfaces';
import { corpusBody } from '../helpers/adtCorpus';
import { assertNoProperty, assertRejects } from '../helpers/assertions';
import { declaredRequired, listedJson } from '../helpers/listedJson';
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
// A status read while the run is in progress (measured, its run details left out).
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING"/></aunit:run>',
};
// A run SAP does not know (measured, its result links left out).
const NOT_STARTED = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="NOT_STARTED"/><aunit:time/></aunit:run>',
};
// Synthetic (no fixture): a status document that names no progress.
const NO_PROGRESS_DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit" title="no progress here"/>';
const NO_PROGRESS = { data: NO_PROGRESS_DOCUMENT };
const STATUS_URL = `/sap/bc/adt/abapunit/runs/${RUN}`;
const LONG_POLL_URL = `${STATUS_URL}?withLongPolling=true`;

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

for (const tool of RUN_TOOLS) {
  describe(`${tool.name}: wait`, () => {
    it('wait false sends the start alone and answers the run id', async () => {
      const connection = recordingConnection([STARTED, FINISHED, RESULT]);
      const result = await tool.call(connection, { wait: false });
      assert.equal(result.isError, false);
      assert.equal(connection.requests.length, 1);
      assert.equal(starts(connection.requests).length, 1);
      assert.deepStrictEqual(answerOf(result), { success: true, run_id: RUN });
    });

    for (const [_label, wait] of [
      ['wait true', { wait: true }],
      ['no wait (the default)', {}],
    ] satisfies Array<[string, { wait?: boolean }]>) {
      describe(format('%s', _label), () => {
        it('a FINISHED status: one status read, then the result', async () => {
          const connection = recordingConnection([STARTED, FINISHED, RESULT]);
          const result = await tool.call(connection, wait);
          assert.equal(result.isError, false);
          assert.equal(starts(connection.requests).length, 1);
          assert.deepStrictEqual(
            statusReads(connection.requests).map((r) => r.url),
            [STATUS_URL],
          );
          assert.equal(resultReads(connection.requests).length, 1);
          assert.equal(connection.requests.length, 3);
          const answer = answerOf(result);
          assert.equal(answer.success, true);
          assert.equal(answer.run_id, RUN);
          assert.equal(answer.finished, true);
          assert.ok(JSON.stringify(answer.run_result).includes('TEST_METHOD'));
        });

        it('a NOT_STARTED status, long-polled NOT_STARTED again: the run id and the status, no result read', async () => {
          const connection = recordingConnection([
            STARTED,
            NOT_STARTED,
            NOT_STARTED,
            FINISHED,
            RESULT,
          ]);
          const result = await tool.call(connection, wait);
          assert.equal(result.isError, false);
          assert.deepStrictEqual(
            statusReads(connection.requests).map((r) => r.url),
            [STATUS_URL, LONG_POLL_URL],
          );
          assert.deepStrictEqual(resultReads(connection.requests), []);
          assert.equal(connection.requests.length, 3);
          assert.deepStrictEqual(answerOf(result), {
            success: true,
            run_id: RUN,
            status: 'NOT_STARTED',
          });
        });

        it('a RUNNING status: long-polled until FINISHED, then the result', async () => {
          const connection = recordingConnection([
            STARTED,
            RUNNING,
            FINISHED,
            RESULT,
          ]);
          const result = await tool.call(connection, wait);
          assert.equal(result.isError, false);
          assert.deepStrictEqual(
            statusReads(connection.requests).map((r) => r.url),
            [STATUS_URL, LONG_POLL_URL],
          );
          assert.equal(resultReads(connection.requests).length, 1);
          assert.equal(answerOf(result).finished, true);
        });

        it('a status with no progress: a failure carrying the document, one status read', async () => {
          const connection = recordingConnection([
            STARTED,
            NO_PROGRESS,
            FINISHED,
            RESULT,
          ]);
          const result = await tool.call(connection, wait);
          assert.equal(result.isError, true);
          assert.deepStrictEqual(
            statusReads(connection.requests).map((r) => r.url),
            [STATUS_URL],
          );
          assert.deepStrictEqual(resultReads(connection.requests), []);
          assert.equal(connection.requests.length, 2);
          const failure = answerOf(result);
          assert.equal(failure.step, 'read status');
          assert.ok(failure.message.includes(NO_PROGRESS_DOCUMENT));
        });
      });
    }
  });
}

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

  for (const [_name, call] of SYNC_TOOLS) {
    describe(format('%s', _name), () => {
      for (const wait of [true, false]) {
        it(
          format('refuses wait %s before anything is sent', wait),
          async () => {
            const connection = recordingConnection([RESULT]);
            const result = await call(connection, wait);
            assert.equal(result.isError, true);
            assert.ok(
              result.content[0]?.text.includes('wait goes with runner async'),
            );
            assert.ok(result.content[0]?.text.includes('nothing was sent'));
            assert.deepStrictEqual(connection.requests, []);
          },
        );
      }
    });
  }
});

/**
 * The arguments of a call as they arrive from a client: parsed JSON, outside
 * the type system, handed to the tool's entry, whose schema reads them first.
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
    readonly [
      string,
      (c: RecordingConnection, wait: string) => Promise<unknown>,
    ]
  > = [
    [
      'RunUnitTest',
      (connection, wait) =>
        defineTool(RunUnitTest_Tool, handleRunUnitTest).call(
          { connection },
          fromClient(`{"class_name":"zcl_x","wait":${wait}}`),
        ),
    ],
    [
      'RunCdsUnitTest',
      (connection, wait) =>
        defineTool(RunCdsUnitTest_Tool, handleRunCdsUnitTest).call(
          { connection },
          fromClient(`{"class_name":"zcl_x","wait":${wait}}`),
        ),
    ],
    [
      'RunProgramUnitTest',
      (connection, wait) =>
        defineTool(RunProgramUnitTest_Tool, handleRunProgramUnitTest).call(
          { connection },
          fromClient(`{"program_name":"zr_x","wait":${wait}}`),
        ),
    ],
    [
      'RunFunctionGroupUnitTest',
      (connection, wait) =>
        defineTool(
          RunFunctionGroupUnitTest_Tool,
          handleRunFunctionGroupUnitTest,
        ).call(
          { connection },
          fromClient(`{"function_group_name":"zfg_x","wait":${wait}}`),
        ),
    ],
    [
      'RunFunctionModuleUnitTest',
      (connection, wait) =>
        defineTool(
          RunFunctionModuleUnitTest_Tool,
          handleRunFunctionModuleUnitTest,
        ).call(
          { connection },
          fromClient(`{"function_module_name":"z_fm_x","wait":${wait}}`),
        ),
    ],
    [
      'RunAbapUnit',
      (connection, wait) =>
        defineTool(RunAbapUnit_Tool, handleRunAbapUnit).call(
          { connection },
          fromClient(
            `{"target":{"kind":"object","name":"zcl_x","type":"CLAS/OC"},"wait":${wait}}`,
          ),
        ),
    ],
  ];
  for (const [_name, call] of calls) {
    describe(format('%s', _name), () => {
      for (const wait of NOT_BOOLEAN) {
        it(
          format("the tool's schema refuses %s before anything is sent", wait),
          async () => {
            const connection = recordingConnection([STARTED, FINISHED, RESULT]);
            const refused = assertRejects(call(connection, wait), 'wait');
            await refused;
            assert.deepStrictEqual(connection.requests, []);
          },
        );
      }
    });
  }
});

for (const reader of READERS) {
  describe(`${reader.name} reads the status first`, () => {
    it('a FINISHED status: one status read, then the result', async () => {
      const connection = recordingConnection([FINISHED, RESULT]);
      const result = await reader.call(connection);
      assert.equal(result.isError, false);
      const urls = connection.requests.map((r) => r.url);
      assert.equal(urls.length, 2);
      assert.equal(urls[0], STATUS_URL);
      assert.ok(urls[1]?.includes('/abapunit/results/'));
      const answer = answerOf(result);
      assert.equal(answer.finished, true);
      assert.equal(answer.run_id, RUN);
      assert.ok('run_result' in Object(answer));
    });

    it('a NOT_STARTED status: the run id and the status, one status read, no result read', async () => {
      const connection = recordingConnection([NOT_STARTED, FINISHED, RESULT]);
      const result = await reader.call(connection);
      assert.equal(result.isError, false);
      assert.deepStrictEqual(
        connection.requests.map((r) => r.url),
        [STATUS_URL],
      );
      assert.deepStrictEqual(answerOf(result), {
        success: true,
        run_id: RUN,
        status: 'NOT_STARTED',
      });
    });

    it('a RUNNING status: long-polled until FINISHED, then the result', async () => {
      const connection = recordingConnection([RUNNING, FINISHED, RESULT]);
      const result = await reader.call(connection);
      assert.equal(result.isError, false);
      const urls = connection.requests.map((r) => r.url);
      assert.equal(urls.length, 3);
      assert.deepStrictEqual(urls.slice(0, 2), [STATUS_URL, LONG_POLL_URL]);
      assert.ok(urls[2]?.includes('/abapunit/results/'));
      assert.equal(answerOf(result).finished, true);
    });

    it('a status with no progress: a failure carrying the document, one status read', async () => {
      const connection = recordingConnection([NO_PROGRESS, FINISHED, RESULT]);
      const result = await reader.call(connection);
      assert.equal(result.isError, true);
      assert.deepStrictEqual(
        connection.requests.map((r) => r.url),
        [STATUS_URL],
      );
      const failure = answerOf(result);
      assert.equal(failure.step, 'read status');
      assert.ok(failure.message.includes(NO_PROGRESS_DOCUMENT));
    });
  });
}

describe('the schema', () => {
  for (const tool of [
    RunUnitTest_Tool,
    RunCdsUnitTest_Tool,
    RunProgramUnitTest_Tool,
    RunFunctionGroupUnitTest_Tool,
    RunFunctionModuleUnitTest_Tool,
    RunAbapUnit_Tool,
  ]) {
    it(`${tool.name} declares wait: an optional boolean with no schema default (true when absent), and says what each value does`, () => {
      const properties = listedJson(tool.inputSchema).properties ?? {};
      const wait = properties.wait;
      assert.ok(wait !== undefined && typeof wait === 'object');
      const { description, ...rest } = wait;
      assert.deepStrictEqual(rest, { type: 'boolean' });
      assert.ok(
        typeof description === 'string' &&
          description.includes(
            'A long run under a client with a request time limit is started with false.',
          ),
      );
      assertNoProperty(properties, 'max_status_polls');
      assert.ok(!declaredRequired(tool.inputSchema).includes('wait'));
      assert.ok(
        tool.description.includes(
          "waiting for the result or giving the run's id at once",
        ),
      );
    });
  }

  it('GetUnitTestResult declares no wait and no max_status_polls', () => {
    const properties =
      listedJson(GetUnitTestResult_Tool.inputSchema).properties ?? {};
    assertNoProperty(properties, 'wait');
    assertNoProperty(properties, 'max_status_polls');
  });

  it('GetUnitTestResult says what it answers for a run SAP answers unfinished', () => {
    assert.ok(
      GetUnitTestResult_Tool.description.includes(
        'waiting while the run goes on',
      ),
    );
    assert.ok(
      GetUnitTestResult_Tool.description.includes(
        "SAP's status of a run yet to start",
      ),
    );
  });
});
