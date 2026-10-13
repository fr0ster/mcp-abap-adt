/**
 * RF11 — no timer is left pending after a listed long call (spec §5.8,
 * §14.9), one case per tool on the approved list: the call's `timeout` is a
 * timer of the call's own, cleared when the call settles. Its delay (37 s
 * here) marks it among every other timer the process sets; after a call
 * that finished in time each such timer was cleared, and after a call whose
 * wait ended it has fired.
 */

import { LONG_TOOLS } from '../../../lib/longTools';
import { LONG_TOOL_ARGS, longStand, payloadOf, until } from './harness';

jest.setTimeout(60_000);

/** The call's timer, recognised by its delay. */
const MARK_SECONDS = 37;

interface Recorded {
  handle: ReturnType<typeof setTimeout>;
  ms: number;
  fired: boolean;
  cleared: boolean;
}

let recorded: Recorded[];

beforeEach(() => {
  recorded = [];
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const realSet = global.setTimeout;
  const realClear = global.clearTimeout;
  jest.spyOn(global, 'setTimeout').mockImplementation(((
    callback: (...a: unknown[]) => void,
    ms?: number,
    ...rest: unknown[]
  ) => {
    if (ms !== MARK_SECONDS * 1000 && ms !== 1000) {
      return realSet(callback, ms, ...rest);
    }
    const entry = { ms, fired: false, cleared: false } as Recorded;
    entry.handle = realSet(
      (...a: unknown[]) => {
        entry.fired = true;
        callback(...a);
      },
      ms,
      ...rest,
    );
    recorded.push(entry);
    return entry.handle;
  }) as typeof setTimeout);
  jest.spyOn(global, 'clearTimeout').mockImplementation(((
    handle?: ReturnType<typeof setTimeout>,
  ) => {
    for (const entry of recorded) {
      if (entry.handle === handle) entry.cleared = true;
    }
    realClear(handle);
  }) as typeof clearTimeout);
});

afterEach(() => jest.restoreAllMocks());

const pending = () =>
  recorded.filter((entry) => !entry.fired && !entry.cleared);

describe.each(LONG_TOOLS)('%s', (tool) => {
  it('a call that finished within its timeout leaves no timer pending', async () => {
    const stand = await longStand(tool);
    try {
      const answer = await stand.call(tool, {
        ...(LONG_TOOL_ARGS[tool] ?? {}),
        timeout: MARK_SECONDS,
      });
      expect(payloadOf(answer).timed_out).toBeUndefined();
      const own = recorded.filter((entry) => entry.ms === MARK_SECONDS * 1000);
      expect(own).toHaveLength(1);
      expect(pending()).toEqual([]);
    } finally {
      await stand.close();
    }
  });
});

it('a call whose wait its timeout ended leaves no timer pending: it fired', async () => {
  const stand = await longStand('GetWhereUsed');
  try {
    const hold = stand.standIn.hold(stand.isToolRequest);
    const call = stand.call('GetWhereUsed', {
      ...LONG_TOOL_ARGS.GetWhereUsed,
      timeout: 1,
    });
    await hold.arrived;
    expect(payloadOf(await call).timed_out).toBe(true);
    expect(recorded.some((entry) => entry.ms === 1000 && entry.fired)).toBe(
      true,
    );
    expect(pending()).toEqual([]);
    hold.release();
    await until(() => stand.standIn.loggedOff().length === 1);
    expect(pending()).toEqual([]);
  } finally {
    await stand.close();
  }
});
