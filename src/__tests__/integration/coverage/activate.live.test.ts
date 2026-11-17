/**
 * Activate family, live (plan C3; `HandlerGet` `activation_status` added in
 * C2d).
 *
 * `activation_status` reads a run the test starts itself: classes it
 * creates (each name read free first, recorded for cleanup before its
 * create), their sources written inactive, then activated together as one
 * run. Read right after the start, without `with_long_polling`, the status
 * answers at once with the run still going; with it, SAP holds the read
 * until the run ends and answers the final status, which a plain read then
 * confirms. The run is half of C2b's measured one — five classes of its 200
 * methods, not ten — which still lasts long enough for the plain read, sent
 * right after the start, to see it running (C2b: a plain read answers in
 * 0.13–0.21 s, a run of ten classes took 36 s and more).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
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

/** How many classes the run activates, and how many methods each has. */
const CLASSES = 5;
const METHODS = 200;

/** A status that ends a run. */
const TERMINAL = new Set(['finished', 'error', 'failed']);

const SUFFIX = randomBytes(3).toString('hex').toUpperCase();
const names = Array.from(
  { length: CLASSES },
  (_, at) => `ZMCP_LP_${SUFFIX}_${String(at + 1).padStart(2, '0')}`,
);

/** A class of `METHODS` methods, each returning its number. */
function sourceOf(name: string): string {
  const methods = Array.from(
    { length: METHODS },
    (_, at) => `m${String(at + 1).padStart(3, '0')}`,
  );
  return [
    `CLASS ${name.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    ...methods.map((m) => `    METHODS ${m} RETURNING VALUE(r) TYPE i.`),
    'ENDCLASS.',
    `CLASS ${name.toLowerCase()} IMPLEMENTATION.`,
    ...methods.map(
      (m, at) => `  METHOD ${m}.\n    r = ${at + 1}.\n  ENDMETHOD.`,
    ),
    'ENDCLASS.',
  ].join('\n');
}

/** A field of an answer's JSON payload; `undefined` where it has none. */
function fieldOf(answer: LiveAnswer, field: string): unknown {
  const parsed: unknown = JSON.parse(answer.text);
  return typeof parsed === 'object' && parsed !== null
    ? Reflect.get(parsed, field)
    : undefined;
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

liveSuite(['onprem', 'cloud'], 'activation_status reads a run', () => {
  // `$TMP` on premise; the configured package on the cloud, which has none.
  const packageName = () =>
    configuredSystemKind() === 'onprem' ? '$TMP' : resolvePackageName();
  const transport = () =>
    configuredSystemKind() === 'onprem' ? undefined : resolveTransportRequest();

  /** The names this run recorded for cleanup: only these are deleted. */
  const recorded: string[] = [];
  /** The run the case started, once its id came back. */
  const run: { id?: string } = {};

  after(async () => {
    // A run still going holds its objects: wait for it to end (one long
    // poll SAP holds until then) before the classes are deleted.
    if (run.id !== undefined) {
      await livePrepare('HandlerGet', {
        part: 'activation_status',
        run_id: run.id,
        with_long_polling: true,
      });
    }
    await deleteRecorded();
    for (const name of recorded) {
      await expectAbsent({ tool: 'GetClass', args: { class_name: name } });
    }
  });

  it('answers at once without with_long_polling, and the final status with it', async () => {
    const request = transport();
    const onRequest =
      request === undefined || request === ''
        ? {}
        : { transport_request: request };
    for (const name of names) {
      await expectNameFree({ tool: 'GetClass', args: { class_name: name } });
      recordCreated('DeleteClass', { class_name: name, ...onRequest });
      recorded.push(name);
      succeeded(
        `CreateClass ${name}`,
        await livePrepare('CreateClass', {
          class_name: name,
          package_name: packageName(),
          description: 'MCP activation run long polling',
          ...onRequest,
        }),
      );
      succeeded(
        `UpdateClass ${name}`,
        await livePrepare('UpdateClass', {
          class_name: name,
          source_code: sourceOf(name),
          activate: false,
          ...onRequest,
        }),
      );
    }
    const started = succeeded(
      'HandlerActivate (group)',
      await livePrepare('HandlerActivate', {
        objects: names.map((name) => ({ name, type: 'CLAS/OC' })),
      }),
    );
    const runId = fieldOf(started, 'run_id');
    if (typeof runId !== 'string' || runId === '') {
      throw new Error(`the run start answered no run id: ${started.text}`);
    }
    run.id = runId;

    // Without long polling: answered at once, the run still going.
    const plain = await liveCall('HandlerGet', {
      part: 'activation_status',
      run_id: runId,
    });
    succeeded('activation_status', plain);
    const going = fieldOf(plain, 'status');
    assert.equal(typeof going, 'string');
    assert.equal(TERMINAL.has(String(going)), false);

    // With it: held until the run ends, answered with the final status.
    const held = await liveCall('HandlerGet', {
      part: 'activation_status',
      run_id: runId,
      with_long_polling: true,
    });
    succeeded('activation_status with_long_polling', held);
    const ended = fieldOf(held, 'status');
    assert.equal(TERMINAL.has(String(ended)), true);

    // Read back: a plain read now answers the same final status.
    const after = await liveCall('HandlerGet', {
      part: 'activation_status',
      run_id: runId,
    });
    succeeded('activation_status after the run', after);
    assert.equal(fieldOf(after, 'status'), ended);
  });
});
