/**
 * What a listed long tool's `timeout` does (spec §5.8, §14.9), one case per
 * tool on the approved list, against the ADT stand-in, by the tool's mode
 * (`tools/long-handlers.json`; measured on premise 2026-10-13):
 *
 * - **sync-write** — the request is held past the timeout: the tool answers
 *   at once, the stand-in RECEIVES no logoff until it answers, then exactly
 *   one (a logoff or a closed socket under a running request kills it and
 *   loses its write);
 * - **async** — the answer names the run the tool holds (`run_id` /
 *   `worklist_id`), the poll stops, and the call's own session is logged off
 *   at once (the run survives that);
 * - **sync-read** — the logoff of the call's own session is received right
 *   after the timeout, the request still held: the read is cut.
 *
 * In every mode the instance's next call works on the instance's own session,
 * which is never logged off; and without `timeout` the call waits until the
 * stand-in answers.
 */

import {
  LONG_TOOLS,
  type LongCallId,
  longToolMode,
  timedOutWords,
} from '../../../lib/longTools';
import { isLogoff } from '../../helpers/adtStandIn';
import {
  type CallAnswer,
  IDS_AT_FIRST_REQUEST,
  LONG_TOOL_ARGS,
  type LongStand,
  longStand,
  payloadOf,
  probeAnswered,
  until,
} from './harness';

jest.setTimeout(60_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

/** Nothing the call's own session sent came after its logoff. */
function loggedOffLast(stand: LongStand, session: string): boolean {
  const requests = stand.standIn.requests;
  const at = requests.findIndex(
    (r) => isLogoff(r.url) && r.session === session,
  );
  return at >= 0 && requests.slice(at + 1).every((r) => r.session !== session);
}

/** The timed-out answer a tool of `mode` gives, naming `ids`. */
function timedOut(
  mode: ReturnType<typeof longToolMode>,
  ids: Record<string, string> = {},
) {
  return {
    timed_out: true,
    timeout: 1,
    message: timedOutWords(
      1,
      mode,
      new Map(Object.entries(ids) as [LongCallId, string][]),
    ),
    ...ids,
  };
}

/** The instance's next call works, on its own session. */
async function instanceStillWorks(stand: LongStand, id: string) {
  const probe = await stand.call('ProbeAdt', { id });
  expect(probe.isError).toBeFalsy();
  expect(probeAnswered(stand, id)).toBe(true);
  expect(stand.standIn.loggedOff()).not.toContain(stand.instanceSession);
}

describe.each(LONG_TOOLS)('%s', (tool) => {
  const args = LONG_TOOL_ARGS[tool] ?? {};
  const mode = longToolMode(tool, args);

  it(`with a timeout (${mode}): answers at once in its mode's words; the logoff as its mode says`, async () => {
    const stand = await longStand(tool);
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      const call = stand.call(tool, { ...args, timeout: 1 });
      await hold.arrived;
      const answer: CallAnswer = await call;

      expect(answer.isError).toBe(true);
      expect(payloadOf(answer)).toEqual(
        timedOut(mode, IDS_AT_FIRST_REQUEST[tool]),
      );
      const held = stand.standIn.requests.find(stand.isToolRequest);
      const own = held?.session ?? '';
      expect(own).not.toBe(stand.instanceSession);

      if (mode === 'sync-write') {
        // The request goes on: no logoff under it.
        expect(stand.standIn.loggedOff()).toEqual([]);
        await instanceStillWorks(stand, `after-${tool}`);
        expect(stand.standIn.loggedOff()).toEqual([]);
        hold.release();
        await until(() => stand.standIn.loggedOff().length === 1);
      } else {
        // Cut (sync-read) or left to run in SAP (async): logged off at once,
        // the request still held.
        await until(() => stand.standIn.loggedOff().length === 1);
        await instanceStillWorks(stand, `after-${tool}`);
        hold.release();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(stand.standIn.loggedOff()).toEqual([own]);
      expect(loggedOffLast(stand, own)).toBe(true);
      expect(
        stand.standIn.requests.filter(
          (r) => r.session === own && r.sessionType === 'stateful',
        ),
      ).toEqual([]);
    } finally {
      await stand.close();
    }
  });

  it('without a timeout: waits until the stand-in answers', async () => {
    const stand = await longStand(tool);
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      let settled = false;
      const call = stand.call(tool, args).finally(() => {
        settled = true;
      });
      await hold.arrived;
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      expect(stand.standIn.loggedOff()).toEqual([]);

      hold.release();
      const answer = await call;
      expect(payloadOf(answer).timed_out).toBeUndefined();
      const held = stand.standIn.requests.find(stand.isToolRequest);
      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual([held?.session]);
    } finally {
      await stand.close();
    }
  });
});

describe('the modes an argument decides, and the ids an async answer names', () => {
  it('RunATC with wait=true is sync-write: no logoff until the run answers', async () => {
    const stand = await longStand('RunATC');
    try {
      stand.standIn.body(
        (r) => r.method === 'POST' && r.url.includes('/atc/worklists'),
        'worklist-placeholder-3',
      );
      const hold = stand.standIn.hold(
        (r) => stand.isToolRequest(r) && r.url.includes('/atc/runs'),
      );
      const call = stand.call('RunATC', {
        ...LONG_TOOL_ARGS.RunATC,
        wait: true,
        timeout: 1,
      });
      await hold.arrived;
      expect(payloadOf(await call)).toEqual(
        timedOut('sync-write', { worklist_id: 'worklist-placeholder-3' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(stand.standIn.loggedOff()).toEqual([]);
      hold.release();
      await until(() => stand.standIn.loggedOff().length === 1);
    } finally {
      await stand.close();
    }
  });

  it('RunATC (wait=false) is async: a wait ended after the worklist was created names it; logged off at once', async () => {
    const stand = await longStand('RunATC');
    try {
      stand.standIn.body(
        (r) => r.method === 'POST' && r.url.includes('/atc/worklists'),
        'worklist-placeholder-2',
      );
      const hold = stand.standIn.hold(
        (r) => stand.isToolRequest(r) && r.url.includes('/atc/runs'),
      );
      const call = stand.call('RunATC', {
        ...LONG_TOOL_ARGS.RunATC,
        timeout: 1,
      });
      await hold.arrived;
      expect(payloadOf(await call)).toEqual(
        timedOut('async', { worklist_id: 'worklist-placeholder-2' }),
      );
      await until(() => stand.standIn.loggedOff().length === 1);
      hold.release();
    } finally {
      await stand.close();
    }
  });

  it('RunUnitTest: a wait ended while polling names the run, the poll stops, logged off at once', async () => {
    const stand = await longStand('RunUnitTest');
    try {
      stand.standIn.body(
        (r) => r.method === 'POST' && r.url.endsWith('/abapunit/runs'),
        '',
        { location: '/sap/bc/adt/abapunit/runs/run-placeholder-9' },
      );
      const isPoll = (r: { url: string; method: string }) =>
        r.method === 'GET' && r.url.includes('/abapunit/runs/');
      const hold = stand.standIn.hold(
        (r) => stand.isToolRequest(r) && isPoll(r),
      );
      const call = stand.call('RunUnitTest', {
        ...LONG_TOOL_ARGS.RunUnitTest,
        timeout: 1,
      });
      await hold.arrived;
      expect(payloadOf(await call)).toEqual(
        timedOut('async', { run_id: 'run-placeholder-9' }),
      );
      await until(() => stand.standIn.loggedOff().length === 1);
      hold.release();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(
        stand.standIn.requests.filter(
          (r) => stand.isToolRequest(r) && isPoll(r),
        ),
      ).toHaveLength(1);
    } finally {
      await stand.close();
    }
  });

  it('HandlerGet of a UNIT_TEST run is async: names the run and is logged off at once', async () => {
    const stand = await longStand('HandlerGet');
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      const call = stand.call('HandlerGet', {
        object_type: 'UNIT_TEST',
        run_id: 'run-placeholder-1',
        timeout: 1,
      });
      await hold.arrived;
      expect(payloadOf(await call)).toEqual(
        timedOut('async', { run_id: 'run-placeholder-1' }),
      );
      await until(() => stand.standIn.loggedOff().length === 1);
      hold.release();
    } finally {
      await stand.close();
    }
  });
});

it('a timeout that is not a whole number of seconds from 1 is refused before anything is sent', async () => {
  const stand = await longStand('GetWhereUsed');
  try {
    for (const timeout of [0, 1.5, -1]) {
      const answer = await stand.call('GetWhereUsed', {
        ...LONG_TOOL_ARGS.GetWhereUsed,
        timeout,
      });
      expect(answer.isError).toBe(true);
    }
    expect(stand.standIn.requests.filter(stand.isToolRequest)).toEqual([]);
    expect(stand.standIn.loggedOff()).toEqual([]);
  } finally {
    await stand.close();
  }
});
