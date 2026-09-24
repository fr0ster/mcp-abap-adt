/**
 * `RuntimeRunClass` and `RuntimeRunClassWithProfiling` — task 24.
 *
 * The corpus holds no profiling exchange (no captured wire fixture for
 * `scheduleTrace`/`runWithProfiler`/the profiler feed), so every case here
 * runs on fakes, not on a recording connection. Nothing in this file is
 * measured against a real SAP response; it pins the handlers' own composition
 * and their honesty about what they could and couldn't find.
 *
 * Step 1's answer: the repository owner ruled for "find the trace on this
 * side" (option 1) — see `.superpowers/sdd/2026-09-12-consumer-side-migration/
 * task-24-report.md`. `trace_lookup_uris` is accepted and ignored (adt-clients
 * 19's `IProfilerListOptions` is `{ user?: string }` — no URI to put it in).
 * `run_status`/`trace_requests_status` are gone in every option: `run` and
 * `runWithProfiler` answer `IAdtResponse<string>` and `ClassExecutor` takes no
 * result strategy, so there is no transport envelope to read a status from.
 */
import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { handleRuntimeRunClass } from '../../handlers/system/readonly/handleRuntimeRunClass';
import { handleRuntimeRunClassWithProfiling } from '../../handlers/system/readonly/handleRuntimeRunClassWithProfiling';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

// A new file, so nothing is in scope from anywhere else — unlike the tasks that
// extend an existing test.
const context = { connection: {} as any, logger: undefined };

// The answer Step 1 recorded. Written once, here, so the assertions below
// follow the decision instead of being edited into agreement with whatever
// was built.
const OPTION: 'find-the-trace' | 'accepted-no-ops' | 'removed' =
  'find-the-trace';

let classExecutor: Record<string, unknown>;
let profiler: Record<string, unknown>;
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtExecutor: jest.fn(() => ({ getClassExecutor: () => classExecutor })),
  // `AdtRuntimeClient`, which is what the package exports and what
  // `handleRuntimeAnalyzeProfilerTrace` and `handleRuntimeListSystemMessages`
  // already construct. There is no `AdtRuntime`; mocking that name intercepts
  // nothing and the handler reaches the real dependency.
  AdtRuntimeClient: jest.fn(() => ({ getProfiler: () => profiler })),
}));

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
  [
    'RuntimeRunClassWithProfiling',
    handleRuntimeRunClassWithProfiling,
    { class_name: 'ZCL_X' },
  ],
] as const;

// `RuntimeRunClass` has TWO branches and only one of them profiles. Without
// this, a migration that routes every run through the profiler workflow passes
// every other test in this file — they all pass `profile: true`.
it('RuntimeRunClass without profile runs the class and touches no profiler', async () => {
  const run = jest.fn(async () => okResponse('output'));
  const schedule = jest.fn();
  const withProfiler = jest.fn();
  const list = jest.fn();
  classExecutor = {
    run,
    scheduleTrace: schedule,
    runWithProfiler: withProfiler,
  };
  profiler = { list };
  // The mocked constructor itself, so "does not construct AdtRuntimeClient" is
  // asserted rather than approximated by "did not call list()". A handler that
  // builds the client and asks it nothing passes the weaker check.
  (AdtRuntimeClient as unknown as jest.Mock).mockClear();

  const result: any = await handleRuntimeRunClass(context as any, {
    class_name: 'ZCL_X',
    profile: false,
  });

  expect(run).toHaveBeenCalledTimes(1);
  expect(schedule).not.toHaveBeenCalled();
  expect(withProfiler).not.toHaveBeenCalled();
  // Not even the snapshot: a plain run must not read the profiler feed, and
  // must not construct AdtRuntimeClient at all.
  expect(list).not.toHaveBeenCalled();
  expect(AdtRuntimeClient as unknown as jest.Mock).not.toHaveBeenCalled();
  const payload = JSON.parse(result.content[0].text);
  expect(payload.output).toBe('output');
  expect(payload.profile).toBeUndefined();
});

it.each(handlers)(
  '%s passes the scheduled id to the profiler run',
  async (_n, handler, args) => {
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
    // parametrised case, against Jest's five-second timeout. This test is about
    // the id travelling, not about the search.
    await (handler as any)(context as any, {
      ...args,
      max_trace_attempts: 1,
      trace_retry_delay_ms: 0,
    });
    expect(order).toEqual(['schedule', 'run']);
    // The order alone proves nothing about the join: a handler calling
    // `runWithProfiler` with no id, the wrong id or a constant passes an order
    // check and fails in production.
    expect(passed).toBe(PROFILER_REQUEST);
  },
);

it.each(handlers)(
  '%s stops at a refused schedule and never runs',
  async (_n, handler, args) => {
    const run = jest.fn();
    classExecutor = {
      scheduleTrace: async () => refusedResponse('Trace scheduling refused'),
      runWithProfiler: run,
    };
    profiler = { list: async () => okResponse([]) };
    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Trace scheduling refused',
    );
    expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
    expect(run).not.toHaveBeenCalled();
  },
);

it.each(handlers)(
  '%s finds the trace by difference, not by position',
  async (_n, handler, args) => {
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
    expect(payload.profile?.trace_id ?? payload.trace_id).toBe(COMPLETED_TRACE);
    // Snapshot, then at least one more read. One call means no snapshot.
    expect(listed).toBeGreaterThan(1);
  },
);

it.each(handlers)(
  '%s does not answer an id the snapshot already had, even when it is newest by time',
  async (_n, handler, args) => {
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
    expect(payload.profile?.trace_id ?? payload.trace_id).toBe(COMPLETED_TRACE);
  },
);

it.each(handlers)(
  '%s waits trace_retry_delay_ms, not a value of its own choosing, between polling attempts',
  async (_n, handler, args) => {
    if (OPTION !== 'find-the-trace') return;
    // A handler that hardcodes the wait (to 0, say) passes every other test
    // in this file, because every other case that cares about the delay also
    // sets `trace_retry_delay_ms: 0` in its own arguments — the parameter and
    // the hardcoded value agree by construction. Fake timers are the only way
    // to see the delay actually asked for travel from the argument to the
    // wait: `newTraceAfter`'s default `sleep` is a real `setTimeout`, and
    // nothing observes it unless time itself is under the test's control.
    jest.useFakeTimers();
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
      await jest.advanceTimersByTimeAsync(0);
      expect(listed).toBe(2);

      // A hardcoded (or merely wrong, smaller) delay would already have made
      // the second attempt by here. The real 5000 ms has not elapsed.
      await jest.advanceTimersByTimeAsync(4999);
      expect(listed).toBe(2);

      // The remaining millisecond fires the wait; the second attempt runs.
      await jest.advanceTimersByTimeAsync(1);
      expect(listed).toBe(3);

      const result: any = await pending;
      expect(result.isError).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  },
);

it.each(handlers)(
  '%s reports a refused feed read rather than an empty feed',
  async (_n, handler, args) => {
    if (OPTION !== 'find-the-trace') return;
    // Spies, not plain functions: the claim is that nothing runs, and only a
    // call count can say so. A handler that schedules and runs before the
    // snapshot, or carries on after its refusal, returns the same error and
    // would pass a test that only reads the message.
    const schedule = jest.fn(async () => okResponse(PROFILER_REQUEST));
    const run = jest.fn(async () => okResponse('done'));
    classExecutor = { scheduleTrace: schedule, runWithProfiler: run };
    profiler = {
      list: async () => refusedResponse('Profiler feed not authorised'),
    };

    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Profiler feed not authorised',
    );
    expect(JSON.parse(result.content[0].text).origin).toBe('refusal');
    expect(schedule).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  },
);

it.each(handlers)(
  '%s reports a refusal during the search, not a missing trace',
  async (_n, handler, args) => {
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
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe('Session expired');
  },
);

it.each(handlers)(
  '%s stops after max_trace_attempts and still reports the run',
  async (_n, handler, args) => {
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
    expect(listed).toBe(3);
    // A run that worked with no trace written yet is a SUCCESS with no trace id.
    // SAP writes it asynchronously and it may arrive a week later.
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.profile?.trace_id ?? payload.trace_id).toBeUndefined();
  },
);

// No `reading(...)` anywhere in this file, unlike every other handler test in
// the plan. The executors and the profiler take no injected result strategy, so
// their `IAdtResponse` carries the plain value — a string, an array of entries —
// and wrapping it in an `AdtReading` would hand `sequence` an object where the
// implementation expects an id, and `newTraceAfter` an object where it expects
// an array.

// The two answer the id in DIFFERENT PLACES, so this cannot be parametrised
// on the field: `RuntimeRunClass` nests it under `profile`, and the deprecated
// `RuntimeRunClassWithProfiling` puts it at the top level. A shared assertion
// on the top-level field passes for the first handler without touching it.
it.each([
  [
    'RuntimeRunClass',
    handleRuntimeRunClass,
    { class_name: 'ZCL_X', profile: true },
    (p: any) => p.profile?.trace_id,
  ],
  [
    'RuntimeRunClassWithProfiling',
    handleRuntimeRunClassWithProfiling,
    { class_name: 'ZCL_X' },
    (p: any) => p.trace_id,
  ],
] as const)(
  '%s answers its trace id where its own schema puts it',
  async (_n, handler, args, at) => {
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
    expect(payload.success).toBe(true);
    expect(payload.class_name).toBe('ZCL_X');
    expect('output' in payload).toBe(_n === 'RuntimeRunClass');
    // `run_status` and `trace_requests_status` are gone on both — the status is
    // not in the 19 contract. Absent, not null, and looked for WHERE EACH TOOL
    // PUTS IT: `RuntimeRunClass` nests `trace_requests_status` inside `profile`,
    // so checking the top level would have been false before the migration too
    // and proved nothing.
    expect('run_status' in payload).toBe(false);
    if (_n === 'RuntimeRunClass') {
      expect('trace_requests_status' in (payload.profile ?? {})).toBe(false);
    } else {
      expect('trace_requests_status' in payload).toBe(false);
    }

    // Under option one, the id the feed search produced. Under the other two it
    // is absent, and the assertion flips with the decision Step 1 recorded —
    // which is why that decision is a step and not a remark.
    expect(found).toBe(
      OPTION === 'find-the-trace' ? COMPLETED_TRACE : undefined,
    );
  },
);
