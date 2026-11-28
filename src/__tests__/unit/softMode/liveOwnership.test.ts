/**
 * The live suites' locks and deletes on the run connection (#394, review):
 * in soft mode a coverage suite's locks are the run connection's registry's,
 * so the file's close sees them; a success answer whose own unlock failed on
 * the network ends the step and its lock counts as held; a lost session
 * clears the connection's locks; a recorded delete is sent once, and a lock
 * its answer left behind is taken in.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  succeeded as coverageSucceeded,
  holdLock,
} from '../../integration/coverage/ownObjects';
import { heldLocksOf } from '../../integration/helpers/heldLiveLocks';
import {
  deleteRecorded,
  type LiveAnswer,
  type LiveRunner,
  livePrepare,
  recordCreated,
  useLiveRunner,
} from '../../integration/helpers/live';
import { succeeded as restrictedSucceeded } from '../../integration/helpers/restrictedCalls';
import { StepFailure } from '../../integration/helpers/stepOutcome';

const text = (payload: unknown): string => JSON.stringify(payload);
const live = (payload: unknown, isError: boolean): LiveAnswer => ({
  isError,
  content: [{ type: 'text', text: text(payload) }],
  text: text(payload),
});

/** A success whose own unlock failed on the network, as withLock answers it. */
const unlockCut = live(
  {
    result: 'SUCCESS',
    cleanup: {
      left_locked: true,
      lock_handle: 'LEFT',
      object: { type: 'CLASS', name: 'ZCL_LEFT' },
      failures: [{ connection_cause: 'ECONNRESET', step: 'unlock' }],
    },
  },
  false,
);
const sessionLost = live(
  { error: 'client_threw', message: 'x', session_error: 'ADT_NOT_CONNECTED' },
  true,
);

let connection: IAbapConnection;
let answers: LiveAnswer[];
let calls: string[];
let runDir: string;
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-ownership-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
  connection = {} as IAbapConnection;
  answers = [];
  calls = [];
  const runner: LiveRunner = {
    system: 'onprem',
    user: 'U',
    connection: () => connection,
    call: async (tool) => {
      calls.push(tool);
      return answers.shift() ?? live({ result: 'ok' }, false);
    },
    close: async () => {},
  };
  useLiveRunner(runner);
});

afterEach(() => {
  useLiveRunner(undefined);
  if (saved === undefined) delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  else process.env.MCP_ABAP_ADT_COVERAGE_RUN = saved;
  fs.rmSync(runDir, { recursive: true, force: true });
});

describe('the live suites own their locks on the run connection', () => {
  it("a coverage suite's lock is the run connection's", () => {
    holdLock({ object_type: 'CLASS', object_name: 'ZCL_A', lock_handle: 'A' });
    assert.deepEqual(
      heldLocksOf(connection).stillHeld.map((lock) => lock.lock_handle),
      ['A'],
    );
  });

  for (const [name, succeeded] of [
    ['coverage', coverageSucceeded],
    ['restricted', restrictedSucceeded],
  ] as const) {
    it(`${name} succeeded: a success whose unlock failed on the network ends the step; its lock is held`, () => {
      assert.throws(
        () => succeeded('HandlerUpdate CLASS', unlockCut),
        (error: unknown) =>
          error instanceof StepFailure && error.outcome === 'network',
      );
      assert.deepEqual(heldLocksOf(connection).stillOwned, [
        {
          lock: {
            object_type: 'CLASS',
            object_name: 'ZCL_LEFT',
            lock_handle: 'LEFT',
          },
          state: 'unlock-sent',
        },
      ]);
    });

    it(`${name} succeeded: a lost session ends the step; the wire, not the answer, clears the locks`, () => {
      holdLock({
        object_type: 'CLASS',
        object_name: 'ZCL_B',
        lock_handle: 'B',
      });
      assert.throws(() => succeeded('HandlerUpdate CLASS', sessionLost));
      assert.equal(
        heldLocksOf(connection).stillHeld.some((l) => l.lock_handle === 'B'),
        true,
      );
    });
  }
});

describe('deleteRecorded sends each delete once', () => {
  it('a delete that failed on the network is not sent again', async () => {
    recordCreated('DeleteClass', { class_name: 'ZCL_D' });
    answers.push(
      live(
        {
          message: 'x',
          origin: 'connection',
          connection_cause: 'ECONNREFUSED',
        },
        true,
      ),
    );
    await assert.rejects(deleteRecorded());
    // A second cleanup sends nothing: the delete was sent once.
    await deleteRecorded();
    assert.deepEqual(calls, ['DeleteClass']);
  });

  it("a lock the delete's answer left behind is taken in", async () => {
    recordCreated('DeleteClass', { class_name: 'ZCL_E' });
    answers.push(
      live(
        {
          deleted: true,
          cleanup: {
            left_locked: true,
            lock_handle: 'DEL',
            object: { type: 'CLASS', name: 'ZCL_E' },
          },
        },
        false,
      ),
    );
    await deleteRecorded().catch(() => {});
    assert.deepEqual(
      heldLocksOf(connection).stillOwned.map((owned) => [
        owned.lock.lock_handle,
        owned.state,
      ]),
      [['DEL', 'unlock-sent']],
    );
  });
});

describe('every live step is read by its outcome (second review)', () => {
  it('livePrepare: a success whose own unlock failed on the network ends the step', async () => {
    answers.push(unlockCut);
    await assert.rejects(
      livePrepare('UpdateClass', { class_name: 'ZCL_LEFT' }),
      (error: unknown) =>
        error instanceof StepFailure && error.outcome === 'network',
    );
    assert.equal(heldLocksOf(connection).stillOwned[0]?.state, 'unlock-sent');
  });

  it('a recorded delete whose success carries a failed unlock is not counted as done', async () => {
    recordCreated('DeleteClass', { class_name: 'ZCL_F' });
    answers.push(unlockCut);
    await assert.rejects(deleteRecorded(), /DeleteClass/);
    assert.deepEqual(calls, ['DeleteClass']);
  });
});
