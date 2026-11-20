/**
 * A run the tool itself started, answered `NOT_STARTED` by its first status
 * read, is read once more by long polling; a run id the caller passes in
 * keeps SAP's `NOT_STARTED` as SAP named it.
 *
 * Code (cloud, 2026-11-20): the start (`CL_AUL_TEST_RUN->start_in_background`)
 * dispatches the run as a new task, waits 0.2 s and answers `201`, so the
 * first status read can find no start time recorded yet;
 * `CL_AUL_RUN_RESULT->get_status` answers that `NOT_STARTED`, as it answers
 * an unknown run id (measured on the cloud, 2026-11-20: an all-zero id
 * answers `200` `NOT_STARTED`). A long-polled read
 * (`CL_AUL_REST_RUN_STATUS`, `withLongPolling=true`) re-reads on SAP's side
 * until the run is `FINISHED`, for up to 5 minutes.
 *
 * Against the real adt-clients over a recording connection; each recording
 * queues answers after the ones under test, so a further read would be
 * answered and seen.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetCdsUnitTest } from '../../../handlers/unit_test/high/handleGetCdsUnitTest';
import { handleGetUnitTest } from '../../../handlers/unit_test/high/handleGetUnitTest';
import { handleRunCdsUnitTest } from '../../../handlers/unit_test/high/handleRunCdsUnitTest';
import { handleRunUnitTest } from '../../../handlers/unit_test/high/handleRunUnitTest';
import { corpusBody } from '../../helpers/adtCorpus';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'cloud';

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
/** No start time recorded, as SAP answered it (measured, its result links left out). */
/** A run in progress, as SAP answered it (measured, its run details left out). */
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING"/></aunit:run>',
};
const NOT_STARTED = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="NOT_STARTED"/><aunit:time/></aunit:run>',
};

const STATUS_URL = `/sap/bc/adt/abapunit/runs/${RUN}`;
const LONG_POLL_URL = `${STATUS_URL}?withLongPolling=true`;
const RESULT_URL = `/sap/bc/adt/abapunit/results/${RUN}`;

interface Answer {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<{ readonly text: string }>;
}

/** The answer's JSON members, read by shape. */
function answerOf(result: Answer): Record<string, unknown> {
  const parsed: unknown = JSON.parse(result.content[0]?.text ?? '');
  assert.ok(typeof parsed === 'object' && parsed !== null);
  return { ...parsed };
}

const urls = (connection: RecordingConnection): string[] =>
  connection.requests.map((request) => request.url);

const statusReads = (connection: RecordingConnection): string[] =>
  urls(connection).filter((url) => url.startsWith(STATUS_URL));

const RUN_TOOLS: ReadonlyArray<{
  readonly name: string;
  readonly call: (connection: RecordingConnection) => Promise<Answer>;
}> = [
  {
    name: 'RunUnitTest',
    call: (connection) =>
      handleRunUnitTest({ connection }, { class_name: 'zcl_x' }),
  },
  {
    name: 'RunCdsUnitTest',
    call: (connection) =>
      handleRunCdsUnitTest({ connection }, { class_name: 'zcl_x' }),
  },
];

const READERS: ReadonlyArray<{
  readonly name: string;
  readonly call: (connection: RecordingConnection) => Promise<Answer>;
}> = [
  {
    name: 'GetUnitTest',
    call: (connection) => handleGetUnitTest({ connection }, { run_id: RUN }),
  },
  {
    name: 'GetCdsUnitTest',
    call: (connection) => handleGetCdsUnitTest({ connection }, { run_id: RUN }),
  },
];

for (const tool of RUN_TOOLS) {
  describe(`${tool.name}: a first NOT_STARTED after the start`, () => {
    it('is read again by long polling, and a FINISHED there answers finished with run_result', async () => {
      const connection = recordingConnection([
        STARTED,
        NOT_STARTED,
        FINISHED,
        RESULT,
      ]);
      const result = await tool.call(connection);
      assert.equal(result.isError, false);
      const answer = answerOf(result);
      assert.equal(answer.success, true);
      assert.equal(answer.run_id, RUN);
      assert.equal(answer.finished, true);
      assert.ok('run_result' in answer);
      assert.match(JSON.stringify(answer.run_result), /TEST_METHOD/);
    });

    it('the second status read sends withLongPolling=true, then the result is read', async () => {
      const connection = recordingConnection([
        STARTED,
        NOT_STARTED,
        FINISHED,
        RESULT,
      ]);
      await tool.call(connection);
      assert.deepEqual(statusReads(connection), [STATUS_URL, LONG_POLL_URL]);
      assert.equal(connection.requests.length, 4);
      assert.ok(connection.requests[3]?.url.startsWith(RESULT_URL));
    });

    it('a NOT_STARTED from the long-polled read is answered as SAP named it', async () => {
      const connection = recordingConnection([
        STARTED,
        NOT_STARTED,
        NOT_STARTED,
        FINISHED,
        RESULT,
      ]);
      const result = await tool.call(connection);
      assert.equal(result.isError, false);
      assert.deepEqual(statusReads(connection), [STATUS_URL, LONG_POLL_URL]);
      assert.equal(connection.requests.length, 3);
      assert.deepEqual(answerOf(result), {
        success: true,
        run_id: RUN,
        status: 'NOT_STARTED',
      });
    });

    it('a NOT_STARTED after a RUNNING first read follows a long-polled read: answered as SAP named it', async () => {
      const connection = recordingConnection([
        STARTED,
        RUNNING,
        NOT_STARTED,
        FINISHED,
        RESULT,
      ]);
      const result = await tool.call(connection);
      assert.equal(result.isError, false);
      assert.deepEqual(statusReads(connection), [STATUS_URL, LONG_POLL_URL]);
      assert.equal(connection.requests.length, 3);
      assert.deepEqual(answerOf(result), {
        success: true,
        run_id: RUN,
        status: 'NOT_STARTED',
      });
    });
  });
}

for (const reader of READERS) {
  describe(`${reader.name}: a caller-given run id`, () => {
    it('answers NOT_STARTED as SAP named it, after one status read without long polling', async () => {
      const connection = recordingConnection([NOT_STARTED, FINISHED, RESULT]);
      const result = await reader.call(connection);
      assert.equal(result.isError, false);
      assert.deepEqual(urls(connection), [STATUS_URL]);
      assert.deepEqual(answerOf(result), {
        success: true,
        run_id: RUN,
        status: 'NOT_STARTED',
      });
    });
  });
}
