/**
 * A listed long tool's `timeout` cuts its read (spec §5.8, §14.9), one case
 * per tool on the approved list, against the ADT stand-in:
 *
 * - with `timeout` and the tool's first request held at the stand-in, the
 *   call answers at once in fixed words ("cancelled; nothing was changed",
 *   `isError: true`), and the logoff of the call's own session is received
 *   right after the timeout, the request still held; the instance's next
 *   call works on the instance's own session, which is never logged off;
 * - without `timeout` the call waits until the stand-in answers, and its own
 *   session is logged off after the answer.
 *
 * `HandlerGet`'s run modes (`UNIT_TEST` / `CDS_UNIT_TEST`) are not reads: a
 * `timeout` there is refused before anything is sent, and without one the
 * call runs as an ordinary one, on the instance's connection.
 */

import {
  LONG_TOOLS,
  TIMEOUT_NOT_FOR_RUN_WORDS,
  timedOutWords,
} from '../../../lib/longTools';
import { isLogoff } from '../../helpers/adtStandIn';
import {
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

describe.each(LONG_TOOLS)('%s', (tool) => {
  const args = LONG_TOOL_ARGS[tool] ?? {};

  it('with a timeout: the read is cut — answered in fixed words, its session logged off at once', async () => {
    const stand = await longStand(tool);
    try {
      const hold = stand.standIn.hold(stand.isToolRequest);
      const call = stand.call(tool, { ...args, timeout: 1 });
      await hold.arrived;
      const answer = await call;

      expect(answer.isError).toBe(true);
      expect(payloadOf(answer)).toEqual({
        timed_out: true,
        timeout: 1,
        message: timedOutWords(1),
      });
      const own = stand.standIn.requests.find(stand.isToolRequest)?.session;
      expect(own).not.toBe(stand.instanceSession);
      // Logged off right after the timeout, the request still held.
      await until(() => stand.standIn.loggedOff().length === 1);
      expect(stand.standIn.loggedOff()).toEqual([own]);

      // The instance's next call works, on the instance's own session.
      const probe = await stand.call('ProbeAdt', { id: `after-${tool}` });
      expect(probe.isError).toBeFalsy();
      expect(probeAnswered(stand, `after-${tool}`)).toBe(true);

      hold.release();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(stand.standIn.loggedOff()).toEqual([own]);
      expect(
        stand.standIn.requests.filter(
          (r) => r.session === own && r.sessionType === 'stateful',
        ),
      ).toEqual([]);
    } finally {
      await stand.close();
    }
  });

  it('without a timeout: waits until the stand-in answers, then logs off', async () => {
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
      expect(loggedOffLast(stand, held?.session ?? '')).toBe(true);
    } finally {
      await stand.close();
    }
  });
});

describe.each(['UNIT_TEST', 'CDS_UNIT_TEST'])(
  'HandlerGet %s (a run, not a read)',
  (objectType) => {
    it('a timeout is refused before anything is sent', async () => {
      const stand = await longStand('HandlerGet');
      try {
        const answer = await stand.call('HandlerGet', {
          object_type: objectType,
          run_id: 'run-placeholder-1',
          timeout: 1,
        });
        expect(answer.isError).toBe(true);
        expect(answer.content?.[0]?.text ?? '').toContain(
          TIMEOUT_NOT_FOR_RUN_WORDS,
        );
        expect(
          stand.standIn.requests.filter((r) => r.url.includes('abapunit')),
        ).toEqual([]);
        expect(stand.standIn.loggedOff()).toEqual([]);
      } finally {
        await stand.close();
      }
    });

    it('without one, runs as an ordinary call on the instance’s connection', async () => {
      const stand = await longStand('HandlerGet');
      try {
        await stand.call('HandlerGet', {
          object_type: objectType,
          run_id: 'run-placeholder-1',
        });
        const polls = stand.standIn.requests.filter((r) =>
          r.url.includes('/abapunit/runs/run-placeholder-1'),
        );
        expect(polls.length).toBeGreaterThan(0);
        expect(polls.every((r) => r.session === stand.instanceSession)).toBe(
          true,
        );
        expect(stand.standIn.loggedOff()).toEqual([]);
      } finally {
        await stand.close();
      }
    });
  },
);

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
