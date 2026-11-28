/**
 * Background runs of the listed long reads: a long tool runs in the
 * background by default, on one connection of its own; its run is read
 * once (a finished or cancelled read is removed when Get answers it), and
 * `DiscardBackgroundRun` cancels it while it runs — the caller checked
 * first, then the run's session logged off, then the cancelled answer kept,
 * once. A code run keeps today's rules: its default is unchanged, a running
 * one is not discarded, its answer is kept until Discard.
 *
 * Everything runs against the ADT stand-in, which holds a read's request
 * until the case lets it go — the "long read".
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { pending, resetProcessLatchForTests } from '../../../lib/activeTools';
import {
  BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
  BACKGROUND_RUN_RUNNING_WORDS,
} from '../../../lib/auth/serverRefusal';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  BackgroundRunDiscarded,
  BackgroundRunListing,
  BackgroundRunRecord,
  BackgroundRunStart,
  BackgroundRunStarted,
  IBackgroundRuns,
} from '../../../lib/backgroundRuns/contract';
import { BackgroundRunOwner } from '../../../lib/backgroundRuns/owner';
import { BACKGROUND_READ_CANCELLED_WORDS } from '../../../lib/backgroundRuns/run';
import * as longCall from '../../../lib/longCall';
import * as packageSessions from '../../../lib/packageSessions';
import type { StandInRequest } from '../../helpers/adtStandIn';
import { assertMatchObject } from '../../helpers/assertions';
import {
  type Answer,
  type BackgroundStand,
  backgroundStand,
  type Caller,
  callerOn,
  isClassRun,
  logoffIndex,
  until,
} from './harness';

const SQL = { sql_query: 'SELECT * FROM placeholder_table', row_number: 5 };
const RUN = { class_name: 'PLACEHOLDER_CLASS' };

/** Whether a request is the SQL read (`POST …/datapreview/freestyle`). */
const isSqlRead = (r: StandInRequest): boolean =>
  r.method === 'POST' && r.url.includes('/datapreview/freestyle');

/**
 * A strategy of an embedder's own — not the shipped store: it keeps what
 * `finish` is given and answers `cancelled` for a kept answer carrying
 * `cancelled: true`, as the contract says; it records every `finish`.
 */
class RecordingRuns implements IBackgroundRuns {
  readonly finished: Array<{ handle: string; answer: BackgroundRunAnswer }> =
    [];
  private readonly runs = new Map<
    string,
    {
      owner: string;
      run: BackgroundRunStart;
      ended?: { at: string; answer: BackgroundRunAnswer };
    }
  >();
  private next = 0;

  start(
    caller: BackgroundRunCaller,
    run: BackgroundRunStart,
  ): BackgroundRunStarted {
    this.next += 1;
    const handle = `recorded-${this.next}`;
    this.runs.set(handle, { owner: caller.user, run });
    return { handle };
  }

  finish(handle: string, answer: BackgroundRunAnswer, at: string): void {
    this.finished.push({ handle, answer });
    const kept = this.runs.get(handle);
    if (kept !== undefined && kept.ended === undefined) {
      kept.ended = { at, answer };
    }
  }

  get(
    handle: string,
    caller: BackgroundRunCaller,
  ): BackgroundRunRecord | undefined {
    const kept = this.runs.get(handle);
    if (kept === undefined || kept.owner !== caller.user) return undefined;
    if (kept.ended === undefined) {
      return { ...kept.run, run_handle: handle, state: 'running' };
    }
    return {
      ...kept.run,
      run_handle: handle,
      state: kept.ended.answer.cancelled === true ? 'cancelled' : 'finished',
      finished_at: kept.ended.at,
      answer: kept.ended.answer,
    };
  }

  list(caller: BackgroundRunCaller): BackgroundRunListing[] {
    const listed: BackgroundRunListing[] = [];
    for (const handle of this.runs.keys()) {
      const record = this.get(handle, caller);
      if (record === undefined) continue;
      const { tool, object, started_at, run_handle } = record;
      listed.push(
        record.state === 'running'
          ? { tool, object, started_at, run_handle, state: 'running' }
          : {
              tool,
              object,
              started_at,
              run_handle,
              state: record.state,
              finished_at: record.finished_at,
            },
      );
    }
    return listed;
  }

  discard(handle: string, caller: BackgroundRunCaller): BackgroundRunDiscarded {
    const record = this.get(handle, caller);
    if (record === undefined) return 'not-available';
    if (record.state === 'running') return 'running';
    this.runs.delete(handle);
    return 'discarded';
  }
}

let stand: BackgroundStand;

afterEach(async () => {
  await stand.close();
  resetProcessLatchForTests();
  mock.restoreAll();
});

const handleOf = (answer: Answer): string => {
  const handle = answer.payload.run_handle;
  return typeof handle === 'string' ? handle : '';
};

/** The run `handle`'s state as `caller` lists it; `undefined` when not listed. */
async function listed(
  caller: Caller,
  handle: string,
  list = 'ListBackgroundRuns',
): Promise<string | undefined> {
  const runs = (await caller.call(list)).payload.runs;
  if (!Array.isArray(runs)) return undefined;
  for (const run of runs) {
    if (
      typeof run === 'object' &&
      run !== null &&
      'run_handle' in run &&
      run.run_handle === handle &&
      'state' in run &&
      typeof run.state === 'string'
    ) {
      return run.state;
    }
  }
  return undefined;
}

/** The session the held SQL read runs in. */
const readSession = () => stand.standIn.requests.find(isSqlRead)?.session ?? '';

/** Every read's work has settled: no background read is registered any more. */
const readsSettled = () =>
  pending().every((name) => !name.startsWith('GetSqlQuery'));

describe('a long read in the background', () => {
  beforeEach(async () => {
    stand = await backgroundStand();
  });

  it('a long tool called without background answers a run_handle; Get answers its result once, as background: false answers it', async () => {
    const foreground = await stand.a.call('GetSqlQuery', {
      ...SQL,
      background: false,
    });
    assert.equal(foreground.payload.run_handle, undefined);

    const held = stand.standIn.hold(isSqlRead);
    const started = await stand.a.call('GetSqlQuery', SQL);
    await held.arrived;
    assert.equal(started.isError, false);
    assertMatchObject(started.payload, {
      state: 'running',
      tool: 'GetSqlQuery',
    });
    const handle = handleOf(started);
    const instanceSession = stand.standIn.requests[0]?.session;
    assert.notEqual(readSession(), instanceSession);
    assert.equal(await listed(stand.a, handle), 'running');

    held.release();
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    assertMatchObject(read.payload, {
      run_handle: handle,
      state: 'finished',
      tool: 'GetSqlQuery',
    });
    assert.equal(read.isError, foreground.isError);
    assert.deepStrictEqual(read.content.slice(1), foreground.content);
  });

  it('a second Get after a finished read answers not available', async () => {
    const started = await stand.a.call('GetSqlQuery', SQL);
    const handle = handleOf(started);
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const first = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    assert.equal(first.payload.state, 'finished');
    const second = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    assert.equal(second.isError, true);
    assertMatchObject(second.payload, {
      error: 'background_run_not_available',
      message: BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
    });
    assert.equal(await listed(stand.a, handle), undefined);
  });

  it('seventeen sequential default-background reads, each read once, never hit the limit', async () => {
    for (let i = 0; i < 17; i += 1) {
      const started = await stand.a.call('GetSqlQuery', SQL);
      assert.equal(started.isError, false);
      const handle = handleOf(started);
      assert.notEqual(handle, '');
      await until(async () => (await listed(stand.a, handle)) === 'finished');
      const read = await stand.a.call('GetBackgroundRun', {
        run_handle: handle,
      });
      assert.equal(read.payload.state, 'finished');
    }
    assert.deepStrictEqual((await stand.a.call('ListBackgroundRuns')).payload, {
      runs: [],
    });
  });

  it('a background long run uses one connection: one fresh connection per run, no second from runLongCall', async (t) => {
    const fresh = t.mock.method(packageSessions, 'openFreshConnection');
    const inCall = t.mock.method(longCall, 'runLongCall');
    const started = await stand.a.call('GetSqlQuery', SQL);
    const handle = handleOf(started);
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    assert.equal(fresh.mock.callCount(), 1);
    assert.equal(inCall.mock.callCount(), 0);
    const sessions = new Set(
      stand.standIn.requests.filter(isSqlRead).map((r) => r.session),
    );
    assert.equal(sessions.size, 1);
  });

  it('Discard of a running read run cancels it: its session logged off, listed and read cancelled, then consumed', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const started = await stand.a.call('GetSqlQuery', SQL);
    const handle = handleOf(started);
    await held.arrived;
    const session = readSession();
    const before = stand.standIn.requests.length;

    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    assert.equal(discarded.isError, false);
    assert.deepStrictEqual(discarded.payload, {
      run_handle: handle,
      state: 'cancelled',
    });
    // The discard sent that session's logoff, the read still held.
    await until(() => logoffIndex(stand.standIn, session) >= before);

    assert.equal(await listed(stand.a, handle), 'cancelled');
    const read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    assert.equal(read.isError, false);
    assertMatchObject(read.payload, {
      run_handle: handle,
      state: 'cancelled',
      tool: 'GetSqlQuery',
    });
    assert.equal(read.content[1]?.text, BACKGROUND_READ_CANCELLED_WORDS);
    // Consumed: no longer listed, and a second Get answers not available.
    assert.equal(await listed(stand.a, handle), undefined);
    const again = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    assertMatchObject(again.payload, {
      error: 'background_run_not_available',
    });
    held.release();
    await until(readsSettled);
  });

  it('Discard of a finished run removes its answer', async () => {
    const started = await stand.a.call('GetSqlQuery', SQL);
    const handle = handleOf(started);
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    assert.deepStrictEqual(discarded.payload, {
      run_handle: handle,
      state: 'discarded',
    });
    const gone = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    assertMatchObject(gone.payload, {
      error: 'background_run_not_available',
    });
  });

  it('Discard of a running code run is refused, and nothing is sent', async () => {
    const held = stand.standIn.hold(isClassRun);
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const handle = handleOf(started);
    await held.arrived;
    const session =
      stand.standIn.requests.find(isClassRun)?.session ?? 'unknown';
    const before = stand.standIn.requests.length;
    const refused = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    assert.equal(refused.isError, true);
    assertMatchObject(refused.payload, {
      error: 'background_run_running',
      message: BACKGROUND_RUN_RUNNING_WORDS,
    });
    assert.equal(stand.standIn.requests.length, before);
    assert.equal(logoffIndex(stand.standIn, session), -1);
    assert.equal(await listed(stand.a, handle), 'running');
    held.release();
    await until(async () => (await listed(stand.a, handle)) === 'finished');
  });

  it("a code run's background default is unchanged: without it RuntimeRunClass waits for the run", async () => {
    const answer = await stand.a.call('RuntimeRunClass', RUN);
    assert.equal(answer.payload.run_handle, undefined);
    assert.deepStrictEqual((await stand.a.call('ListBackgroundRuns')).payload, {
      runs: [],
    });
  });

  it('a code run is still kept after Get, until Discard', async () => {
    const started = await stand.a.call('RuntimeRunClass', {
      ...RUN,
      background: true,
    });
    const handle = handleOf(started);
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const first = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    const second = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    assert.deepStrictEqual(second, first);
    assert.equal(await listed(stand.a, handle), 'finished');
    await stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    assert.equal(await listed(stand.a, handle), undefined);
  });

  it('an unknown and a foreign handle answer alike: Get, List and Discard', async () => {
    const b = await callerOn(stand.standIn, stand.strategy, {
      user: 'OTHER_USER',
    });
    try {
      const held = stand.standIn.hold(isSqlRead);
      const started = await stand.a.call('GetSqlQuery', SQL);
      const handle = handleOf(started);
      await held.arrived;
      const session = readSession();
      const unknown = 'f'.repeat(32);
      const answers = [
        await b.call('GetBackgroundRun', { run_handle: handle }),
        await b.call('GetBackgroundRun', { run_handle: unknown }),
        await b.call('DiscardBackgroundRun', { run_handle: handle }),
        await b.call('DiscardBackgroundRun', { run_handle: unknown }),
      ];
      for (const answer of answers) {
        assert.equal(answer.isError, true);
        assertMatchObject(answer.payload, {
          error: 'background_run_not_available',
          message: BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
        });
        assert.deepStrictEqual(answer.content, answers[1]?.content);
      }
      assert.deepStrictEqual((await b.call('ListBackgroundRuns')).payload, {
        runs: [],
      });
      // The foreign discard cancelled nothing: still running, not logged off.
      assert.equal(logoffIndex(stand.standIn, session), -1);
      assert.equal(await listed(stand.a, handle), 'running');
      held.release();
      await until(async () => (await listed(stand.a, handle)) === 'finished');
    } finally {
      await b.close();
    }
  });
});

/**
 * An embedder's asynchronous strategy whose `get` reads the store at once
 * and answers when the case lets it go: a read it answers may be stale.
 */
class LateGetRuns extends RecordingRuns {
  private gate: Promise<void> | undefined;
  /** The next `get` answers only once `release()` is called. */
  holdNextGet(): () => void {
    let release: () => void = () => {};
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }
  /** Whether the held `get` has not been called yet. */
  holding(): boolean {
    return this.gate !== undefined;
  }
  lateGet(
    handle: string,
    caller: BackgroundRunCaller,
  ):
    | Promise<BackgroundRunRecord | undefined>
    | BackgroundRunRecord
    | undefined {
    const read = super.get(handle, caller);
    const gate = this.gate;
    if (gate === undefined) return read;
    this.gate = undefined;
    return gate.then(() => read);
  }
}

/** `LateGetRuns` as the server sees it: its `get` is the late one. */
function lateStrategy(runs: LateGetRuns): IBackgroundRuns {
  return {
    start: (caller, run) => runs.start(caller, run),
    finish: (handle, answer, at) => runs.finish(handle, answer, at),
    get: (handle, caller) => runs.lateGet(handle, caller),
    list: (caller) => runs.list(caller),
    discard: (handle, caller) => runs.discard(handle, caller),
  };
}

describe('a strategy whose get answers late', () => {
  let runs: LateGetRuns;

  beforeEach(async () => {
    runs = new LateGetRuns();
    stand = await backgroundStand(lateStrategy(runs));
  });

  it('a discard whose get answered running after the cancel kept cancelled reads the store again and acts on the fresh state', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    // The second discard's read of the store answers late: it read running.
    const release = runs.holdNextGet();
    const late = stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    await until(() => !runs.holding());
    const first = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    assert.deepStrictEqual(first.payload, {
      run_handle: handle,
      state: 'cancelled',
    });
    release();
    const second = await late;
    assert.equal(second.isError, false);
    assert.deepStrictEqual(second.payload, {
      run_handle: handle,
      state: 'discarded',
    });
    assert.deepStrictEqual(
      runs.finished.map((f) => f.handle),
      [handle],
    );
    held.release();
    await until(readsSettled);
  });

  it('a discard whose get answered running after the run finished reads the store again and removes its answer', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    const release = runs.holdNextGet();
    const late = stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    await until(() => !runs.holding());
    held.release();
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    release();
    const answer = await late;
    assert.equal(answer.isError, false);
    assert.deepStrictEqual(answer.payload, {
      run_handle: handle,
      state: 'discarded',
    });
  });
});

describe('the owner of the running runs', () => {
  beforeEach(async () => {
    stand = await backgroundStand();
  });

  it('a discard reaching another instance of the same caller cancels the read when the host hands both one owner (Streamable HTTP, SSE), and is refused when it does not', async () => {
    const owner = new BackgroundRunOwner();
    const first = await callerOn(
      stand.standIn,
      stand.strategy,
      { user: 'SHARED_USER' },
      owner,
    );
    const shared = await callerOn(
      stand.standIn,
      stand.strategy,
      { user: 'SHARED_USER' },
      owner,
    );
    const alone = await callerOn(stand.standIn, stand.strategy, {
      user: 'SHARED_USER',
    });
    try {
      const held = stand.standIn.hold(isSqlRead);
      const handle = handleOf(await first.call('GetSqlQuery', SQL));
      await held.arrived;
      const refused = await alone.call('DiscardBackgroundRun', {
        run_handle: handle,
      });
      assertMatchObject(refused.payload, {
        error: 'background_run_running',
      });
      assert.equal(await listed(first, handle), 'running');
      const cancelled = await shared.call('DiscardBackgroundRun', {
        run_handle: handle,
      });
      assert.deepStrictEqual(cancelled.payload, {
        run_handle: handle,
        state: 'cancelled',
      });
      assert.equal(await listed(first, handle), 'cancelled');
      held.release();
      await until(readsSettled);
    } finally {
      await first.close();
      await shared.close();
      await alone.close();
    }
  });
});

describe('which end wins', () => {
  let runs: RecordingRuns;

  beforeEach(async () => {
    runs = new RecordingRuns();
    stand = await backgroundStand(runs);
  });

  it('the logoff makes the in-flight request reject, and the kept state stays cancelled', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    // SAP ended the read with its session: the request answers an error.
    stand.standIn.answer(isSqlRead, 500);
    await stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    held.release();
    await until(readsSettled);
    assert.equal(await listed(stand.a, handle), 'cancelled');
    assert.equal(runs.finished.length, 1);
    assert.equal(runs.finished[0]?.answer.cancelled, true);
  });

  it('an answer arriving after the cancel does not overwrite it', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    await stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    held.release();
    await until(readsSettled);
    const read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    assert.equal(read.payload.state, 'cancelled');
    assert.equal(read.content[1]?.text, BACKGROUND_READ_CANCELLED_WORDS);
    assert.deepStrictEqual(
      runs.finished.map((f) => f.handle),
      [handle],
    );
  });

  it("Discard racing the run's completion ends in one state: completion first answers finished and the discard removes it", async () => {
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    assert.deepStrictEqual(discarded.payload, {
      run_handle: handle,
      state: 'discarded',
    });
    assert.equal(runs.finished.length, 1);
    assert.equal(runs.finished[0]?.answer.cancelled, undefined);
  });

  it("Discard racing the run's completion ends in one state: released and discarded at once, finish is called once", async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    held.release();
    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    await until(readsSettled);
    assert.equal(runs.finished.length, 1);
    const state = discarded.payload.state;
    if (state === 'cancelled') {
      assert.equal(runs.finished[0]?.answer.cancelled, true);
      assert.equal(await listed(stand.a, handle), 'cancelled');
    } else {
      assert.equal(state, 'discarded');
      assert.equal(runs.finished[0]?.answer.cancelled, undefined);
      assert.equal(await listed(stand.a, handle), undefined);
    }
  });

  it('two concurrent Gets of one finished read: exactly one answers it, the other answers not available', async () => {
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const both = await Promise.all([
      stand.a.call('GetBackgroundRun', { run_handle: handle }),
      stand.a.call('GetBackgroundRun', { run_handle: handle }),
    ]);
    const states = both.map((answer) =>
      answer.isError ? answer.payload.error : answer.payload.state,
    );
    assert.deepStrictEqual([...states].sort(), [
      'background_run_not_available',
      'finished',
    ]);
    const refused = both.find((answer) => answer.isError);
    assert.equal(refused?.payload.message, BACKGROUND_RUN_NOT_AVAILABLE_WORDS);
  });

  it('two overlapping Discards of one running read: both answer cancelled, the session is logged off once, finish is called once', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    const session = readSession();
    const both = await Promise.all([
      stand.a.call('DiscardBackgroundRun', { run_handle: handle }),
      stand.a.call('DiscardBackgroundRun', { run_handle: handle }),
    ]);
    for (const answer of both) {
      assert.equal(answer.isError, false);
      assert.deepStrictEqual(answer.payload, {
        run_handle: handle,
        state: 'cancelled',
      });
    }
    await until(() => logoffIndex(stand.standIn, session) > -1);
    held.release();
    await until(readsSettled);
    assert.equal(
      stand.standIn.requests.filter(
        (r) => r.session === session && r.url.includes('logoff'),
      ).length,
      1,
    );
    assert.deepStrictEqual(
      runs.finished.map((f) => f.handle),
      [handle],
    );
    assert.equal(runs.finished[0]?.answer.cancelled, true);
  });

  it('the contract: with a custom strategy the cancel arrives as finish with cancelled: true and its listing answers cancelled', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    await stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    assert.deepStrictEqual(runs.finished, [
      {
        handle,
        answer: {
          cancelled: true,
          content: [{ type: 'text', text: BACKGROUND_READ_CANCELLED_WORDS }],
        },
      },
    ]);
    assert.equal(await listed(stand.a, handle), 'cancelled');
    held.release();
    await until(readsSettled);
  });
});

describe('compact', () => {
  beforeEach(async () => {
    stand = await backgroundStand(new InMemoryBackgroundRuns());
  });

  const TABLE = { object_name: 'PLACEHOLDER_TABLE', max_rows: 5 };

  it("the compact long tools' background default: HandlerGetData answers a run_handle read by HandlerBackgroundRunGet, once", async () => {
    const started = await stand.a.call('HandlerGetData', TABLE);
    assert.equal(started.isError, false);
    assert.ok(
      String(started.payload.message).includes('HandlerBackgroundRunGet'),
    );
    const handle = handleOf(started);
    await until(
      async () =>
        (await listed(stand.a, handle, 'HandlerBackgroundRunList')) ===
        'finished',
    );
    const first = await stand.a.call('HandlerBackgroundRunGet', {
      run_handle: handle,
    });
    assert.equal(first.payload.state, 'finished');
    const second = await stand.a.call('HandlerBackgroundRunGet', {
      run_handle: handle,
    });
    assertMatchObject(second.payload, {
      error: 'background_run_not_available',
    });
  });

  it('HandlerBackgroundRunDiscard cancels a running compact read; HandlerBackgroundRunList and HandlerBackgroundRunGet answer cancelled', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('HandlerGetData', TABLE));
    await held.arrived;
    const session = readSession();
    const discarded = await stand.a.call('HandlerBackgroundRunDiscard', {
      run_handle: handle,
    });
    assert.deepStrictEqual(discarded.payload, {
      run_handle: handle,
      state: 'cancelled',
    });
    await until(() => logoffIndex(stand.standIn, session) > -1);
    assert.equal(
      await listed(stand.a, handle, 'HandlerBackgroundRunList'),
      'cancelled',
    );
    const read = await stand.a.call('HandlerBackgroundRunGet', {
      run_handle: handle,
    });
    assert.equal(read.payload.state, 'cancelled');
    const again = await stand.a.call('HandlerBackgroundRunGet', {
      run_handle: handle,
    });
    assertMatchObject(again.payload, {
      error: 'background_run_not_available',
    });
    held.release();
    await until(() =>
      pending().every((name) => !name.startsWith('HandlerGetData')),
    );
  });
});

describe('with no strategy', () => {
  beforeEach(async () => {
    stand = await backgroundStand();
  });

  it('a long tool answers its result in the call, on a session of its own', async () => {
    const bare = await callerOn(stand.standIn, undefined, {
      user: 'RUN_USER',
    });
    try {
      const answer = await bare.call('GetSqlQuery', SQL);
      assert.equal(answer.payload.run_handle, undefined);
      const session = stand.standIn.requests.find(isSqlRead)?.session ?? '';
      assert.notEqual(session, '');
      await until(() => logoffIndex(stand.standIn, session) > -1);
    } finally {
      await bare.close();
    }
  });
});
