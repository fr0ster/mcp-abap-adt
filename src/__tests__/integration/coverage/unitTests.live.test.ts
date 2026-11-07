/**
 * ABAP Unit run reads, live (plan D8, #3): a run's status is read first
 * without long polling, and only a run SAP answers `RUNNING` is long-polled.
 *
 * Measured before the fix (on premise, 2026-11-04): `GetUnitTestResult` for
 * an unknown run id answered `NOT_STARTED` only after about 307 s, because
 * its one status read was a long poll SAP holds that long for a run it does
 * not know; read without long polling SAP answers it at once. Measured on
 * both systems (2026-11-05): a run reads `RUNNING` from right after its
 * start until it ends, then `FINISHED`.
 *
 * The test creates a class whose one test runs for `TEST_SECONDS`, so a run
 * of it is in progress when it is read. The class's name is read free before
 * its create and recorded for cleanup before it; it is deleted after and read
 * absent.
 */
import { randomBytes } from 'node:crypto';
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const CLASS = `ZMCP_UW${SUFFIX}`;
/** A run id no run has: SAP answers it `NOT_STARTED`. */
const UNKNOWN_RUN = `ZZNORUN${SUFFIX}`;
/** How long the class's one test runs, in seconds. */
const TEST_SECONDS = 15;
/**
 * The bound on a read SAP answers at once: about 0.1–0.6 s was measured
 * without long polling, about 300 s with it.
 */
const AT_ONCE_MS = 60_000;

const classSource = (): string => {
  const lower = CLASS.toLowerCase();
  return `CLASS ${lower} DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\nENDCLASS.\nCLASS ${lower} IMPLEMENTATION.\nENDCLASS.`;
};

/** One test method that runs for `TEST_SECONDS`. */
const TEST_SOURCE = [
  'CLASS ltc_wait DEFINITION FINAL',
  '  FOR TESTING RISK LEVEL HARMLESS DURATION MEDIUM.',
  '  PRIVATE SECTION.',
  '    METHODS waits FOR TESTING.',
  'ENDCLASS.',
  'CLASS ltc_wait IMPLEMENTATION.',
  '  METHOD waits.',
  '    DATA(started) = utclong_current( ).',
  `    WHILE utclong_diff( high = utclong_current( ) low = started ) < ${TEST_SECONDS}.`,
  '    ENDWHILE.',
  '    cl_abap_unit_assert=>assert_true( abap_true ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

/** `$TMP` on premise; the configured package on the cloud, which has none. */
const packageName = (): string =>
  configuredSystemKind() === 'onprem' ? '$TMP' : resolvePackageName();

/** The configured request on the cloud; none on premise (`$TMP`). */
function onRequest(): { transport_request?: string } {
  if (configuredSystemKind() === 'onprem') return {};
  const request = resolveTransportRequest();
  return request === undefined || request === ''
    ? {}
    : { transport_request: request };
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The JSON an answer carries. */
const payloadOf = (answer: LiveAnswer): unknown => JSON.parse(answer.text);

/** Starts a run of the class's tests without waiting, and answers its id. */
async function startedRun(): Promise<string> {
  const started = succeeded(
    'RunUnitTest wait false',
    await livePrepare('RunUnitTest', { class_name: CLASS, wait: false }),
  );
  const runId = member(payloadOf(started), 'run_id');
  if (typeof runId !== 'string' || runId === '') {
    throw new Error(`RunUnitTest answered no run_id: ${started.text}`);
  }
  return runId;
}

/** The run's status read without long polling, as SAP names it. */
async function plainStatus(runId: string): Promise<string> {
  const answer = succeeded(
    'HandlerUnitTestStatus',
    await livePrepare('HandlerUnitTestStatus', {
      run_id: runId,
      with_long_polling: false,
    }),
  );
  return answer.text;
}

/** A finished run's answer: finished, with a result naming the test method. */
function expectFinished(step: string, answer: LiveAnswer): void {
  const payload = payloadOf(succeeded(step, answer));
  expect({ step, finished: member(payload, 'finished') }).toEqual({
    step,
    finished: true,
  });
  expect(JSON.stringify(member(payload, 'run_result'))).toContain('WAITS');
}

liveSuite(['onprem', 'cloud'], 'ABAP Unit run reads', () => {
  beforeAll(async () => {
    await expectNameFree({ tool: 'GetClass', args: { class_name: CLASS } });
    recordCreated('DeleteClass', { class_name: CLASS, ...onRequest() });
    succeeded(
      'CreateClass',
      await livePrepare('CreateClass', {
        class_name: CLASS,
        package_name: packageName(),
        description: 'MCP unit run read live case',
        ...onRequest(),
      }),
    );
    succeeded(
      'UpdateClass',
      await livePrepare('UpdateClass', {
        class_name: CLASS,
        source_code: classSource(),
        activate: true,
        ...onRequest(),
      }),
    );
    succeeded(
      'CreateUnitTest',
      await livePrepare('CreateUnitTest', {
        class_name: CLASS,
        test_class_source: TEST_SOURCE,
        ...onRequest(),
      }),
    );
  });

  afterAll(async () => {
    await deleteRecorded();
    await expectAbsent({ tool: 'GetClass', args: { class_name: CLASS } });
  });

  it('GetUnitTestResult answers an unknown run NOT_STARTED at once', async () => {
    const begun = Date.now();
    const answer = await liveCall('GetUnitTestResult', {
      run_id: UNKNOWN_RUN,
    });
    const took = Date.now() - begun;
    expect(payloadOf(succeeded('GetUnitTestResult', answer))).toEqual({
      success: true,
      run_id: UNKNOWN_RUN,
      status: 'NOT_STARTED',
    });
    expect(took).toBeLessThan(AT_ONCE_MS);
  });

  it('GetUnitTestResult waits for a running run and answers its result', async () => {
    const runId = await startedRun();
    expect(await plainStatus(runId)).toContain('RUNNING');
    const answer = await liveCall('GetUnitTestResult', { run_id: runId });
    expectFinished('GetUnitTestResult', answer);
    expect(await plainStatus(runId)).toContain('FINISHED');
  });

  it('RunUnitTest waits for its run and answers the result', async () => {
    const answer = await liveCall('RunUnitTest', { class_name: CLASS });
    expectFinished('RunUnitTest', answer);
  });

  it('RunAbapUnit waits for its run and answers the result', async () => {
    const answer = await liveCall('RunAbapUnit', {
      target: { kind: 'object', name: CLASS, type: 'CLAS/OC' },
    });
    expectFinished('RunAbapUnit', answer);
  });

  it('HandlerUnitTestResult reads the result of a finished run alone', async () => {
    const runId = await startedRun();
    // The full reader waits for the run; the compact one reads after it.
    succeeded(
      'GetUnitTestResult',
      await livePrepare('GetUnitTestResult', { run_id: runId }),
    );
    const answer = await liveCall('HandlerUnitTestResult', { run_id: runId });
    const payload = payloadOf(succeeded('HandlerUnitTestResult', answer));
    expect(member(payload, 'run_id')).toBe(runId);
    expect(JSON.stringify(member(payload, 'run_result'))).toContain('WAITS');
  });
});
