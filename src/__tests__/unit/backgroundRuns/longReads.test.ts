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

const SQL = { sql_query: 'SELECT * FROM placeholder_table' };
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
  jest.restoreAllMocks();
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
    expect(foreground.payload.run_handle).toBeUndefined();

    const held = stand.standIn.hold(isSqlRead);
    const started = await stand.a.call('GetSqlQuery', SQL);
    await held.arrived;
    expect(started.isError).toBe(false);
    expect(started.payload).toMatchObject({
      state: 'running',
      tool: 'GetSqlQuery',
    });
    const handle = handleOf(started);
    const instanceSession = stand.standIn.requests[0]?.session;
    expect(readSession()).not.toBe(instanceSession);
    expect(await listed(stand.a, handle)).toBe('running');

    held.release();
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    expect(read.payload).toMatchObject({
      run_handle: handle,
      state: 'finished',
      tool: 'GetSqlQuery',
    });
    expect(read.isError).toBe(foreground.isError);
    expect(read.content.slice(1)).toEqual(foreground.content);
  });

  it('a second Get after a finished read answers not available', async () => {
    const started = await stand.a.call('GetSqlQuery', SQL);
    const handle = handleOf(started);
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const first = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    expect(first.payload.state).toBe('finished');
    const second = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    expect(second.isError).toBe(true);
    expect(second.payload).toMatchObject({
      error: 'background_run_not_available',
      message: BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
    });
    expect(await listed(stand.a, handle)).toBeUndefined();
  });

  it('seventeen sequential default-background reads, each read once, never hit the limit', async () => {
    for (let i = 0; i < 17; i += 1) {
      const started = await stand.a.call('GetSqlQuery', SQL);
      expect(started.isError).toBe(false);
      const handle = handleOf(started);
      expect(handle).not.toBe('');
      await until(async () => (await listed(stand.a, handle)) === 'finished');
      const read = await stand.a.call('GetBackgroundRun', {
        run_handle: handle,
      });
      expect(read.payload.state).toBe('finished');
    }
    expect((await stand.a.call('ListBackgroundRuns')).payload).toEqual({
      runs: [],
    });
  });

  it('a background long run uses one connection: one fresh connection per run, no second from runLongCall', async () => {
    const fresh = jest.spyOn(packageSessions, 'openFreshConnection');
    const inCall = jest.spyOn(longCall, 'runLongCall');
    const started = await stand.a.call('GetSqlQuery', SQL);
    const handle = handleOf(started);
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(inCall).not.toHaveBeenCalled();
    const sessions = new Set(
      stand.standIn.requests.filter(isSqlRead).map((r) => r.session),
    );
    expect(sessions.size).toBe(1);
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
    expect(discarded.isError).toBe(false);
    expect(discarded.payload).toEqual({
      run_handle: handle,
      state: 'cancelled',
    });
    // The discard sent that session's logoff, the read still held.
    await until(() => logoffIndex(stand.standIn, session) >= before);

    expect(await listed(stand.a, handle)).toBe('cancelled');
    const read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    expect(read.isError).toBe(false);
    expect(read.payload).toMatchObject({
      run_handle: handle,
      state: 'cancelled',
      tool: 'GetSqlQuery',
    });
    expect(read.content[1]?.text).toBe(BACKGROUND_READ_CANCELLED_WORDS);
    // Consumed: no longer listed, and a second Get answers not available.
    expect(await listed(stand.a, handle)).toBeUndefined();
    const again = await stand.a.call('GetBackgroundRun', {
      run_handle: handle,
    });
    expect(again.payload).toMatchObject({
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
    expect(discarded.payload).toEqual({
      run_handle: handle,
      state: 'discarded',
    });
    const gone = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    expect(gone.payload).toMatchObject({
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
    expect(refused.isError).toBe(true);
    expect(refused.payload).toMatchObject({
      error: 'background_run_running',
      message: BACKGROUND_RUN_RUNNING_WORDS,
    });
    expect(stand.standIn.requests).toHaveLength(before);
    expect(logoffIndex(stand.standIn, session)).toBe(-1);
    expect(await listed(stand.a, handle)).toBe('running');
    held.release();
    await until(async () => (await listed(stand.a, handle)) === 'finished');
  });

  it("a code run's background default is unchanged: without it RuntimeRunClass waits for the run", async () => {
    const answer = await stand.a.call('RuntimeRunClass', RUN);
    expect(answer.payload.run_handle).toBeUndefined();
    expect((await stand.a.call('ListBackgroundRuns')).payload).toEqual({
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
    expect(second).toEqual(first);
    expect(await listed(stand.a, handle)).toBe('finished');
    await stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    expect(await listed(stand.a, handle)).toBeUndefined();
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
        expect(answer.isError).toBe(true);
        expect(answer.payload).toMatchObject({
          error: 'background_run_not_available',
          message: BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
        });
        expect(answer.content).toEqual(answers[1]?.content);
      }
      expect((await b.call('ListBackgroundRuns')).payload).toEqual({
        runs: [],
      });
      // The foreign discard cancelled nothing: still running, not logged off.
      expect(logoffIndex(stand.standIn, session)).toBe(-1);
      expect(await listed(stand.a, handle)).toBe('running');
      held.release();
      await until(async () => (await listed(stand.a, handle)) === 'finished');
    } finally {
      await b.close();
    }
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
      expect(refused.payload).toMatchObject({
        error: 'background_run_running',
      });
      expect(await listed(first, handle)).toBe('running');
      const cancelled = await shared.call('DiscardBackgroundRun', {
        run_handle: handle,
      });
      expect(cancelled.payload).toEqual({
        run_handle: handle,
        state: 'cancelled',
      });
      expect(await listed(first, handle)).toBe('cancelled');
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
    expect(await listed(stand.a, handle)).toBe('cancelled');
    expect(runs.finished).toHaveLength(1);
    expect(runs.finished[0]?.answer.cancelled).toBe(true);
  });

  it('an answer arriving after the cancel does not overwrite it', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    await stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    held.release();
    await until(readsSettled);
    const read = await stand.a.call('GetBackgroundRun', { run_handle: handle });
    expect(read.payload.state).toBe('cancelled');
    expect(read.content[1]?.text).toBe(BACKGROUND_READ_CANCELLED_WORDS);
    expect(runs.finished.map((f) => f.handle)).toEqual([handle]);
  });

  it("Discard racing the run's completion ends in one state: completion first answers finished and the discard removes it", async () => {
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await until(async () => (await listed(stand.a, handle)) === 'finished');
    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    expect(discarded.payload).toEqual({
      run_handle: handle,
      state: 'discarded',
    });
    expect(runs.finished).toHaveLength(1);
    expect(runs.finished[0]?.answer.cancelled).toBeUndefined();
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
    expect(runs.finished).toHaveLength(1);
    const state = discarded.payload.state;
    if (state === 'cancelled') {
      expect(runs.finished[0]?.answer.cancelled).toBe(true);
      expect(await listed(stand.a, handle)).toBe('cancelled');
    } else {
      expect(state).toBe('discarded');
      expect(runs.finished[0]?.answer.cancelled).toBeUndefined();
      expect(await listed(stand.a, handle)).toBeUndefined();
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
    expect([...states].sort()).toEqual([
      'background_run_not_available',
      'finished',
    ]);
    const refused = both.find((answer) => answer.isError);
    expect(refused?.payload.message).toBe(BACKGROUND_RUN_NOT_AVAILABLE_WORDS);
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
      expect(answer.isError).toBe(false);
      expect(answer.payload).toEqual({
        run_handle: handle,
        state: 'cancelled',
      });
    }
    await until(() => logoffIndex(stand.standIn, session) > -1);
    held.release();
    await until(readsSettled);
    expect(
      stand.standIn.requests.filter(
        (r) => r.session === session && r.url.includes('logoff'),
      ),
    ).toHaveLength(1);
    expect(runs.finished.map((f) => f.handle)).toEqual([handle]);
    expect(runs.finished[0]?.answer.cancelled).toBe(true);
  });

  it('the contract: with a custom strategy the cancel arrives as finish with cancelled: true and its listing answers cancelled', async () => {
    const held = stand.standIn.hold(isSqlRead);
    const handle = handleOf(await stand.a.call('GetSqlQuery', SQL));
    await held.arrived;
    await stand.a.call('DiscardBackgroundRun', { run_handle: handle });
    expect(runs.finished).toEqual([
      {
        handle,
        answer: {
          cancelled: true,
          content: [{ type: 'text', text: BACKGROUND_READ_CANCELLED_WORDS }],
        },
      },
    ]);
    expect(await listed(stand.a, handle)).toBe('cancelled');
    held.release();
    await until(readsSettled);
  });
});

describe('compact', () => {
  beforeEach(async () => {
    stand = await backgroundStand(new InMemoryBackgroundRuns());
  });

  const TABLE = { object_name: 'PLACEHOLDER_TABLE' };

  it("the compact long tools' background default: HandlerGetData answers a run_handle read by HandlerBackgroundRunGet, once", async () => {
    const started = await stand.a.call('HandlerGetData', TABLE);
    expect(started.isError).toBe(false);
    expect(String(started.payload.message)).toContain(
      'HandlerBackgroundRunGet',
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
    expect(first.payload.state).toBe('finished');
    const second = await stand.a.call('HandlerBackgroundRunGet', {
      run_handle: handle,
    });
    expect(second.payload).toMatchObject({
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
    expect(discarded.payload).toEqual({
      run_handle: handle,
      state: 'cancelled',
    });
    await until(() => logoffIndex(stand.standIn, session) > -1);
    expect(await listed(stand.a, handle, 'HandlerBackgroundRunList')).toBe(
      'cancelled',
    );
    const read = await stand.a.call('HandlerBackgroundRunGet', {
      run_handle: handle,
    });
    expect(read.payload.state).toBe('cancelled');
    const again = await stand.a.call('HandlerBackgroundRunGet', {
      run_handle: handle,
    });
    expect(again.payload).toMatchObject({
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
      expect(answer.payload.run_handle).toBeUndefined();
      const session = stand.standIn.requests.find(isSqlRead)?.session ?? '';
      expect(session).not.toBe('');
      await until(() => logoffIndex(stand.standIn, session) > -1);
    } finally {
      await bare.close();
    }
  });
});
