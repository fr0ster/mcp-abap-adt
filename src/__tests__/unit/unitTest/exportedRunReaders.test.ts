/**
 * The exported run readers that no tool serves — `handleGetCdsUnitTestResult`,
 * `handleGetUnitTest`, `handleGetCdsUnitTest` — read a run as the served
 * `GetUnitTestResult` does (plan D8, #3): the status first without long
 * polling, and a long poll only for a run SAP answers `RUNNING`, read again
 * after each answer. The compact readers beside them read the result alone.
 *
 * Against the real adt-clients over a recording connection; each recording
 * queues answers after the ones under test, so a further read would be
 * answered and seen.
 */

import { handleGetCdsUnitTest } from '../../../handlers/unit_test/high/handleGetCdsUnitTest';
import {
  handleGetCdsUnitTestResult,
  handleGetCdsUnitTestResultOnce,
} from '../../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { handleGetUnitTest } from '../../../handlers/unit_test/high/handleGetUnitTest';
import { handleGetUnitTestResultOnce } from '../../../handlers/unit_test/high/handleGetUnitTestResult';
import { corpusBody } from '../../../lib/adtCorpus';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const RUN = 'FA53C505DD7B1FD1ABB8599833A05D44';
const FINISHED = {
  data: corpusBody(`unittest-run-passing--02-runs-${RUN.toLowerCase()}`),
};
const RESULT = {
  data: corpusBody(`unittest-run-passing--03-results-${RUN.toLowerCase()}`),
};
/** A run in progress, as SAP answered it (measured, its run details left out). */
const RUNNING = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING"/></aunit:run>',
};
/** An unknown run, as SAP answered it (measured). */
const NOT_STARTED = {
  data: '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="NOT_STARTED"/><aunit:time/></aunit:run>',
};
/** Synthetic: a status no measurement has shown. */
const UNKNOWN_STATUS_DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="PAUSED"/></aunit:run>';
const UNKNOWN_STATUS = { data: UNKNOWN_STATUS_DOCUMENT };

const PLAIN = `/sap/bc/adt/abapunit/runs/${RUN}`;
const LONG_POLLED = `${PLAIN}?withLongPolling=true`;
const RESULT_PATH = `/sap/bc/adt/abapunit/results/${RUN}`;

interface Answer {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<{ readonly text: string }>;
}

const READERS: ReadonlyArray<{
  readonly name: string;
  readonly call: (connection: RecordingConnection) => Promise<Answer>;
}> = [
  {
    name: 'handleGetCdsUnitTestResult',
    call: (connection) =>
      handleGetCdsUnitTestResult({ connection }, { run_id: RUN }),
  },
  {
    name: 'handleGetUnitTest',
    call: (connection) => handleGetUnitTest({ connection }, { run_id: RUN }),
  },
  {
    name: 'handleGetCdsUnitTest',
    call: (connection) => handleGetCdsUnitTest({ connection }, { run_id: RUN }),
  },
];

const answerOf = (result: Answer): unknown =>
  JSON.parse(result.content[0]?.text ?? '');
/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}
const urls = (connection: RecordingConnection): string[] =>
  connection.requests.map((request) => request.url);

describe.each(READERS)('$name', (reader) => {
  it('an unknown run answers NOT_STARTED at once', async () => {
    const connection = recordingConnection([NOT_STARTED, FINISHED, RESULT]);
    const result = await reader.call(connection);
    expect(urls(connection)).toEqual([PLAIN]);
    expect(result.isError).toBe(false);
    expect(answerOf(result)).toEqual({
      success: true,
      run_id: RUN,
      status: 'NOT_STARTED',
    });
  });

  it('a running run is long-polled', async () => {
    const connection = recordingConnection([RUNNING, FINISHED, RESULT]);
    const result = await reader.call(connection);
    expect(urls(connection)).toEqual([
      PLAIN,
      LONG_POLLED,
      expect.stringContaining(RESULT_PATH),
    ]);
    expect(result.isError).toBe(false);
  });

  it('a long poll that answers RUNNING is followed by another', async () => {
    const connection = recordingConnection([
      RUNNING,
      RUNNING,
      RUNNING,
      FINISHED,
      RESULT,
    ]);
    const result = await reader.call(connection);
    expect(urls(connection)).toEqual([
      PLAIN,
      LONG_POLLED,
      LONG_POLLED,
      LONG_POLLED,
      expect.stringContaining(RESULT_PATH),
    ]);
    expect(result.isError).toBe(false);
  });

  it('a finished run is read without waiting', async () => {
    const connection = recordingConnection([FINISHED, RESULT, FINISHED]);
    const result = await reader.call(connection);
    expect(urls(connection)).toEqual([
      PLAIN,
      expect.stringContaining(RESULT_PATH),
    ]);
    expect(result.isError).toBe(false);
  });

  it('a status no measurement has shown ends the read as a failure stating what SAP sent', async () => {
    const connection = recordingConnection([UNKNOWN_STATUS, FINISHED, RESULT]);
    const result = await reader.call(connection);
    expect(urls(connection)).toEqual([PLAIN]);
    expect(result.isError).toBe(true);
    const failure = answerOf(result);
    expect(member(failure, 'step')).toBe('read status');
    const message = String(member(failure, 'message'));
    expect(message).toContain('the status "PAUSED"');
    expect(message).toContain(UNKNOWN_STATUS_DOCUMENT);
  });
});

describe('the compact result tools still read only the result', () => {
  it.each([
    [
      'handleGetUnitTestResultOnce',
      (connection: RecordingConnection) =>
        handleGetUnitTestResultOnce({ connection }, { run_id: RUN }),
    ],
    [
      'handleGetCdsUnitTestResultOnce',
      (connection: RecordingConnection) =>
        handleGetCdsUnitTestResultOnce({ connection }, { run_id: RUN }),
    ],
  ])('%s: one result GET, no status read', async (_name, call) => {
    const connection = recordingConnection([RESULT, FINISHED]);
    const result = await call(connection);
    expect(result.isError).toBe(false);
    expect(urls(connection)).toEqual([expect.stringContaining(RESULT_PATH)]);
    expect(connection.requests[0]?.method).toBe('GET');
  });
});
