/**
 * `RuntimeRunClass` with and without `profile` — task 24. (The deprecated
 * `RuntimeRunClassWithProfiling` is gone in 19.0.0.)
 *
 * The corpus holds no profiling exchange (no captured wire fixture for
 * `scheduleTrace`/`runWithProfiler`/the profiler feed), so every case here
 * runs on fakes, not on a recording connection. Nothing in this file is
 * measured against a real SAP response; it pins the handlers' own composition
 * and their honesty about what they could and couldn't find.
 *
 * Step 1's answer: the repository owner ruled for "find the trace on this
 * side" (option 1). `trace_lookup_uris` is accepted and ignored (adt-clients
 * 19's `IProfilerListOptions` is `{ user?: string }` — no URI to put it in).
 * `run_status`/`trace_requests_status` are gone in every option: `run` and
 * `runWithProfiler` answer `IAdtResponse<string>` and `ClassExecutor` takes no
 * result strategy, so there is no transport envelope to read a status from.
 */

// A new file, so nothing is in scope from anywhere else — unlike the tasks that
// extend an existing test.
import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import { format } from 'node:util';
import {
  advanceTimersByTimeAsync,
  useFakeTimers,
  useRealTimers,
} from '../helpers/fakeTime';
import { mockModuleExports } from '../helpers/moduleMock';

// adt-clients replaced for this file before any module under test loads: the
// handlers and src/lib/clients bind it when they load (node:test mock.module,
// helpers/moduleMock.ts; its other exports stay the real ones).
const AdtExecutorMock = mock.fn<(...args: any[]) => any>(
  function AdtExecutor() {
    return {
      getClassExecutor: () => classExecutor,
    };
  },
);
const AdtRuntimeClientMock = mock.fn<(...args: any[]) => any>(
  function AdtRuntimeClient() {
    return {
      getProfiler: () => profiler,
    };
  },
);
mockModuleExports(require.resolve('@mcp-abap-adt/adt-clients'), {
  AdtExecutor: AdtExecutorMock,
  AdtRuntimeClient: AdtRuntimeClientMock,
});

import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { handleRuntimeRunClass } from '../../handlers/system/high/handleRuntimeRunClass';
import { assertNoProperty } from '../helpers/assertions';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

const context = { connection: {} as any, logger: undefined };

// The answer Step 1 recorded. Written once, here, so the assertions below
// follow the decision instead of being edited into agreement with whatever
// was built.
const OPTION: 'find-the-trace' | 'accepted-no-ops' | 'removed' =
  'find-the-trace';

let classExecutor: Record<string, unknown>;
let profiler: Record<string, unknown>;

// Two different ids, deliberately. `scheduleTrace` answers a PROFILER REQUEST
// id, which `runWithProfiler` consumes; the completed trace gets a different id
// and appears in the feed later. A test that names both 'trace-1' passes for an
// implementation that confuses them, which is the easiest mistake here.
const PROFILER_REQUEST = 'profiler-request-1';
const COMPLETED_TRACE = 'completed-trace-7';

const handlers = [
  [
    'RuntimeRunClass',
    handleRuntimeRunClass,
    { class_name: 'ZCL_X', profile: true },
  ],
] as const;

// `RuntimeRunClass` has TWO branches and only one of them profiles. Without
// this, a migration that routes every run through the profiler workflow passes
// every other test in this file — they all pass `profile: true`.
it('RuntimeRunClass without profile runs the class and touches no profiler', async () => {
  const run = mock.fn(async () => okResponse('output'));
  const schedule = mock.fn();
  const withProfiler = mock.fn();
  const list = mock.fn();
  classExecutor = {
    run,
    scheduleTrace: schedule,
    runWithProfiler: withProfiler,
  };
  profiler = { list };
  // The mocked constructor itself, so "does not construct AdtRuntimeClient" is
  // asserted rather than approximated by "did not call list()". A handler that
  // builds the client and asks it nothing passes the weaker check.
  AdtRuntimeClientMock.mock.resetCalls();

  const result: any = await handleRuntimeRunClass(context as any, {
    class_name: 'ZCL_X',
    profile: false,
  });

  assert.equal(run.mock.callCount(), 1);
  assert.equal(schedule.mock.callCount(), 0);
  assert.equal(withProfiler.mock.callCount(), 0);
  // Not even the snapshot: a plain run must not read the profiler feed, and
  // must not construct AdtRuntimeClient at all.
  assert.equal(list.mock.callCount(), 0);
  assert.equal(AdtRuntimeClientMock.mock.callCount(), 0);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.output, 'output');
  assert.equal(payload.profile, undefined);
});

for (const [_n, handler, args] of handlers) {
  it(format('%s passes the scheduled id to the profiler run', _n), async () => {
    const order: string[] = [];
    let passed: unknown;
    classExecutor = {
      scheduleTrace: async () => {
        order.push('schedule');
        return okResponse(PROFILER_REQUEST);
      },
      runWithProfiler: async (_target: unknown, options: any) => {
        order.push('run');
        passed = options?.profilerId;
        return okResponse('done');
      },
    };
    profiler = { list: async () => okResponse([]) };
    // One attempt and no delay. Under the recommended option this handler polls,
    // and the defaults are five attempts two seconds apart — eight seconds per
    // parametrised case, in a unit run. This test is about
    // the id travelling, not about the search.
    await (handler as any)(context as any, {
      ...args,
      max_trace_attempts: 1,
      trace_retry_delay_ms: 0,
    });
    assert.deepStrictEqual(order, ['schedule', 'run']);
    // The order alone proves nothing about the join: a handler calling
    // `runWithProfiler` with no id, the wrong id or a constant passes an order
    // check and fails in production.
    assert.equal(passed, PROFILER_REQUEST);
  });
}

for (const [_n, handler, args] of handlers) {
  it(format('%s stops at a refused schedule and never runs', _n), async () => {
    const run = mock.fn();
    classExecutor = {
      scheduleTrace: async () => refusedResponse('Trace scheduling refused'),
      runWithProfiler: run,
    };
    profiler = { list: async () => okResponse([]) };
    const result: any = await (handler as any)(context as any, args);
    assert.equal(result.isError, true);
    assert.equal(
      JSON.parse(result.content[0].text).message,
      'Trace scheduling refused',
    );
    assert.equal(JSON.parse(result.content[0].text).origin, 'refusal');
    assert.equal(run.mock.callCount(), 0);
  });
}

for (const [_n, handler, args] of handlers) {
  it(
    format('%s finds the trace by difference, not by position', _n),
    async () => {
      if (OPTION !== 'find-the-trace') return;
      // The feed is built to fail FOUR wrong implementations at once, not three:
      // taking a raw document position ignores `before` entirely, and picking the
      // first entry OF THE FRESH SET (correct differencing, no sort) is a distinct
      // mistake from either — `decoy` sits before `produced` in document order
      // among the fresh entries, so "the difference, unsorted" fails exactly where
      // "the difference, sorted" succeeds.
      //
      //  · no snapshot, take the first entry            → picks `older`, which was there
      //  · no snapshot, take the last entry              → picks `stale`, which was there
      //  · difference, but take the first FRESH entry    → picks `decoy`, not the newest
      //  · difference, but sort recordedAt as text        → picks `decoy`, see below
      //
      // `COMPLETED_TRACE` sits AFTER `decoy` among the fresh entries, and its
      // timestamp is 09:00 UTC against the decoy's 10:30+02:00, which is 08:30
      // UTC. So it is the newer of the two fresh entries by time while sorting
      // LOWER as a string and LATER in document position — the exact traps
      // `compareRecordedAt` and the sort (not a raw take-first) exist for.
      const older = {
        id: 'completed-trace-1',
        recordedAt: '2026-09-13T10:00:00+02:00',
      };
      const stale = {
        id: 'completed-trace-2',
        recordedAt: '2026-09-13T11:00:00+02:00',
      };
      const produced = {
        id: COMPLETED_TRACE,
        recordedAt: '2026-09-14T09:00:00Z',
      };
      const decoy = {
        id: 'completed-trace-9',
        recordedAt: '2026-09-14T10:30:00+02:00',
      };

      // The FIRST call is the snapshot and must not contain either fresh id — an
      // id already in `before` can never be the new one, and a mock that returns
      // it from the start asks the implementation to be wrong.
      let listed = 0;
      classExecutor = {
        scheduleTrace: async () => okResponse(PROFILER_REQUEST),
        runWithProfiler: async () => okResponse('done'),
      };
      profiler = {
        list: async () =>
          okResponse(
            ++listed === 1 ? [older, stale] : [older, decoy, produced, stale],
          ),
      };

      const result: any = await (handler as any)(context as any, {
        ...args,
        max_trace_attempts: 3,
        trace_retry_delay_ms: 0,
      });
      const payload = JSON.parse(result.content[0].text);
      assert.equal(
        payload.profile?.trace_id ?? payload.trace_id,
        COMPLETED_TRACE,
      );
      // Snapshot, then at least one more read. One call means no snapshot.
      assert.ok(listed > 1);
    },
  );
}

for (const [_n, handler, args] of handlers) {
  it(
    format(
      '%s does not answer an id the snapshot already had, even when it is newest by time',
      _n,
    ),
    async () => {
      if (OPTION !== 'find-the-trace') return;
      // A mutant that still REQUESTS the snapshot but throws its CONTENTS away
      // — answers with an empty `before` set — passes every other test in this
      // file: their fixtures happen to make the correct answer the newest entry
      // in the whole feed too, so ignoring the snapshot lands on it by
      // coincidence. This one does not: `ALREADY_THERE` sits in the snapshot
      // AND is newer by `recordedAt` than what this run actually produced, so
      // only a `before` set built from the snapshot's real contents filters it
      // out and leaves the genuinely new entry.
      const ALREADY_THERE = {
        id: 'already-there',
        recordedAt: '2026-09-15T12:00:00Z',
      };
      const ourTrace = {
        id: COMPLETED_TRACE,
        recordedAt: '2026-09-15T08:00:00Z',
      };
      let listed = 0;
      classExecutor = {
        scheduleTrace: async () => okResponse(PROFILER_REQUEST),
        runWithProfiler: async () => okResponse('done'),
      };
      profiler = {
        list: async () =>
          okResponse(
            ++listed === 1 ? [ALREADY_THERE] : [ALREADY_THERE, ourTrace],
          ),
      };

      const result: any = await (handler as any)(context as any, {
        ...args,
        max_trace_attempts: 3,
        trace_retry_delay_ms: 0,
      });
      const payload = JSON.parse(result.content[0].text);
      assert.equal(
        payload.profile?.trace_id ?? payload.trace_id,
        COMPLETED_TRACE,
      );
    },
  );
}

for (const [_n, handler, args] of handlers) {
  it(
    format(
      '%s waits trace_retry_delay_ms, not a value of its own choosing, between polling attempts',
      _n,
    ),
    async () => {
      if (OPTION !== 'find-the-trace') return;
      // A handler that hardcodes the wait (to 0, say) passes every other test
      // in this file, because every other case that cares about the delay also
      // sets `trace_retry_delay_ms: 0` in its own arguments — the parameter and
      // the hardcoded value agree by construction. Fake timers are the only way
      // to see the delay actually asked for travel from the argument to the
      // wait: `newTraceAfter`'s default `sleep` is a real `setTimeout`, and
      // nothing observes it unless time itself is under the test's control.
      // setTimeout, setInterval, setImmediate and Date faked.
      useFakeTimers({
        apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
      });
      try {
        let listed = 0;
        classExecutor = {
          scheduleTrace: async () => okResponse(PROFILER_REQUEST),
          runWithProfiler: async () => okResponse('done'),
        };
        profiler = {
          list: async () => {
            listed += 1;
            return okResponse([]);
          },
        };

        const pending = (handler as any)(context as any, {
          ...args,
          max_trace_attempts: 2,
          trace_retry_delay_ms: 5000,
        });

        // The snapshot and the first search attempt are both immediate; no
        // timer is pending yet.
        await advanceTimersByTimeAsync(0);
        assert.equal(listed, 2);

        // A hardcoded (or merely wrong, smaller) delay would already have made
        // the second attempt by here. The real 5000 ms has not elapsed.
        await advanceTimersByTimeAsync(4999);
        assert.equal(listed, 2);

        // The remaining millisecond fires the wait; the second attempt runs.
        await advanceTimersByTimeAsync(1);
        assert.equal(listed, 3);

        const result: any = await pending;
        assert.equal(result.isError, false);
      } finally {
        useRealTimers();
      }
    },
  );
}

for (const [_n, handler, args] of handlers) {
  it(
    format('%s reports a refused feed read rather than an empty feed', _n),
    async () => {
      if (OPTION !== 'find-the-trace') return;
      // Spies, not plain functions: the claim is that nothing runs, and only a
      // call count can say so. A handler that schedules and runs before the
      // snapshot, or carries on after its refusal, returns the same error and
      // would pass a test that only reads the message.
      const schedule = mock.fn(async () => okResponse(PROFILER_REQUEST));
      const run = mock.fn(async () => okResponse('done'));
      classExecutor = { scheduleTrace: schedule, runWithProfiler: run };
      profiler = {
        list: async () => refusedResponse('Profiler feed not authorised'),
      };

      const result: any = await (handler as any)(context as any, args);
      assert.equal(result.isError, true);
      assert.equal(
        JSON.parse(result.content[0].text).message,
        'Profiler feed not authorised',
      );
      assert.equal(JSON.parse(result.content[0].text).origin, 'refusal');
      assert.equal(schedule.mock.callCount(), 0);
      assert.equal(run.mock.callCount(), 0);
    },
  );
}

for (const [_n, handler, args] of handlers) {
  it(
    format('%s reports a refusal during the search, not a missing trace', _n),
    async () => {
      if (OPTION !== 'find-the-trace') return;
      let call = 0;
      classExecutor = {
        scheduleTrace: async () => okResponse(PROFILER_REQUEST),
        runWithProfiler: async () => okResponse('done'),
      };
      // The snapshot succeeds; the poll is refused. Reporting "no trace yet" here
      // would be the masking defect: SAP answered, and it said no.
      profiler = {
        list: async () =>
          ++call === 1 ? okResponse([]) : refusedResponse('Session expired'),
      };
      const result: any = await (handler as any)(context as any, {
        ...args,
        max_trace_attempts: 3,
        trace_retry_delay_ms: 0,
      });
      assert.equal(result.isError, true);
      assert.equal(
        JSON.parse(result.content[0].text).message,
        'Session expired',
      );
    },
  );
}

for (const [_n, handler, args] of handlers) {
  it(
    format('%s stops after max_trace_attempts and still reports the run', _n),
    async () => {
      if (OPTION !== 'find-the-trace') return;
      let listed = 0;
      classExecutor = {
        scheduleTrace: async () => okResponse(PROFILER_REQUEST),
        runWithProfiler: async () => okResponse('done'),
      };
      profiler = {
        list: async () => {
          listed += 1;
          return okResponse([]);
        },
      };

      const result: any = await (handler as any)(context as any, {
        ...args,
        max_trace_attempts: 2,
        trace_retry_delay_ms: 0,
      });
      // The snapshot plus two attempts.
      assert.equal(listed, 3);
      // A run that worked with no trace written yet is a SUCCESS with no trace id.
      // SAP writes it asynchronously and it may arrive a week later.
      assert.equal(result.isError, false);
      const payload = JSON.parse(result.content[0].text);
      assert.equal(payload.profile?.trace_id ?? payload.trace_id, undefined);
    },
  );
}

// No `reading(...)` anywhere in this file, unlike every other handler test in
// the plan. The executors and the profiler take no injected result strategy, so
// their `IAdtResponse` carries the plain value — a string, an array of entries —
// and wrapping it in an `AdtReading` would hand `sequence` an object where the
// implementation expects an id, and `newTraceAfter` an object where it expects
// an array.

// `RuntimeRunClass` nests the id under `profile`: an assertion on a top-level
// field would pass without touching it.
for (const [_n, handler, args, at] of [
  [
    'RuntimeRunClass',
    handleRuntimeRunClass,
    { class_name: 'ZCL_X', profile: true },
    (p: any) => p.profile?.trace_id,
  ],
] as const) {
  it(
    format('%s answers its trace id where its own schema puts it', _n),
    async () => {
      classExecutor = {
        scheduleTrace: async () => okResponse(PROFILER_REQUEST),
        runWithProfiler: async () => okResponse('done'),
      };
      // Empty snapshot, then the produced trace — the same order as a real run.
      let seen = 0;
      profiler = {
        list: async () =>
          okResponse(
            ++seen === 1
              ? []
              : [{ id: COMPLETED_TRACE, recordedAt: '2026-09-14T09:00:00Z' }],
          ),
      };
      const result: any = await (handler as any)(context as any, args);
      const payload = JSON.parse(result.content[0].text);
      const found = (at as any)(payload);
      // Each tool's own shape, not a shared one: `RuntimeRunClass` answers
      // `output`, and the deprecated handler does not and must not start to.
      assert.equal(payload.success, true);
      assert.equal(payload.class_name, 'ZCL_X');
      assert.equal('output' in payload, _n === 'RuntimeRunClass');
      // `run_status` and `trace_requests_status` are gone on both — the status is
      // not in the 19 contract. Absent, not null, and looked for WHERE EACH TOOL
      // PUTS IT: `RuntimeRunClass` nests `trace_requests_status` inside `profile`,
      // so checking the top level would have been false before the migration too
      // and proved nothing.
      assert.equal('run_status' in payload, false);
      if (_n === 'RuntimeRunClass') {
        assert.equal('trace_requests_status' in (payload.profile ?? {}), false);
      } else {
        assert.equal('trace_requests_status' in payload, false);
      }

      // Under option one, the id the feed search produced. Under the other two it
      // is absent, and the assertion flips with the decision Step 1 recorded —
      // which is why that decision is a step and not a remark.
      assert.equal(
        found,
        OPTION === 'find-the-trace' ? COMPLETED_TRACE : undefined,
      );
    },
  );
}

// A profiler option the caller did not give must not reach adt-clients as a
// key holding `undefined`: the client merges `{ ...DEFAULTS, ...options }`,
// and an undefined key there REPLACES the default. maxSizeForTraceFile lost
// its 30720 that way and left the parameters document altogether; an on-premise system
// (2026-09-25) then recorded every trace in state "Size violation". With the
// size given, the same run finished.
for (const [_n, handler, args] of handlers) {
  it(
    format('%s sends only the profiler options it was given', _n),
    async () => {
      let options: Record<string, unknown> | undefined;
      classExecutor = {
        scheduleTrace: async (given: Record<string, unknown>) => {
          options = given;
          return okResponse(PROFILER_REQUEST);
        },
        runWithProfiler: async () => okResponse('done'),
      };
      profiler = { list: async () => okResponse([]) };
      await (handler as any)(context as any, {
        ...args,
        max_trace_attempts: 1,
        trace_retry_delay_ms: 0,
      });
      assert.notEqual(options, undefined);
      const undefinedKeys = Object.entries(options ?? {})
        .filter(([, value]) => value === undefined)
        .map(([key]) => key);
      assert.deepStrictEqual(undefinedKeys, []);
      assertNoProperty(options, 'maxSizeForTraceFile');
    },
  );
}
