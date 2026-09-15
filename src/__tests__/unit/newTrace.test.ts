/**
 * `newTraceAfter` — task 24, Step 3.
 *
 * Everything that can go wrong in the feed search lives here; the handler
 * tests (`runtimeProfiling.test.ts`) exercise it only through two handlers and
 * one happy path.
 */
import { newTraceAfter } from '../../lib/strategies/newTrace';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

const entry = (id: string, recordedAt: string) => ({ id, recordedAt });
const feed = (...entries: ReturnType<typeof entry>[]) => okResponse(entries);
const never = async () => {
  throw new Error('should not have waited');
};

it('answers on the first read when a new id is already there, without waiting', async () => {
  const list = jest.fn(async () =>
    feed(entry('new-1', '2026-09-14T09:00:00Z')),
  );
  const found = await newTraceAfter({ list } as any, new Set(), {
    attempts: 5,
    delayMs: 2000,
    sleep: never,
  });
  if (!found.ok) throw new Error('expected a found id');
  expect(found.getResult().value).toBe('new-1');
  expect(list).toHaveBeenCalledTimes(1);
});

it('ignores every id that was already in the snapshot', async () => {
  const before = new Set(['old-1', 'old-2']);
  const found = await newTraceAfter(
    {
      list: async () =>
        feed(
          entry('old-1', '2026-09-14T12:00:00Z'),
          entry('old-2', '2026-09-14T11:00:00Z'),
        ),
    } as any,
    before,
    { attempts: 1, delayMs: 0, sleep: never },
  );
  // Nothing new, so no id — and a SUCCESS, because nothing refused anything.
  if (!found.ok) throw new Error('expected a success with no id');
  expect(found.getResult().value).toBeUndefined();
});

it('picks the newest of several new ids, by time and not by text — and not by document position either', async () => {
  // 09:00Z is 09:00 UTC; 10:30+02:00 is 08:30 UTC. `new-late` is later in
  // time despite sorting lower as a string, which is what compareRecordedAt
  // is for — and it is listed SECOND, not first, so a comparator dropped in
  // favour of "take the first fresh entry" fails here too.
  const found = await newTraceAfter(
    {
      list: async () =>
        feed(
          entry('new-early', '2026-09-14T10:30:00+02:00'),
          entry('new-late', '2026-09-14T09:00:00Z'),
        ),
    } as any,
    new Set(),
    { attempts: 1, delayMs: 0, sleep: never },
  );
  if (!found.ok) throw new Error('expected a found id');
  expect(found.getResult().value).toBe('new-late');
});

it('waits between attempts and stops at the count it was given', async () => {
  const slept: number[] = [];
  const list = jest.fn(async () => feed());
  const found = await newTraceAfter({ list } as any, new Set(), {
    attempts: 3,
    delayMs: 250,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  expect(list).toHaveBeenCalledTimes(3);
  // Two waits for three attempts: none after the last.
  expect(slept).toEqual([250, 250]);
  if (!found.ok) throw new Error('expected a success with no id');
  expect(found.getResult().value).toBeUndefined();
});

it('hands a refused read straight back and stops asking', async () => {
  const list = jest.fn(async () => refusedResponse('Session expired'));
  const found = await newTraceAfter({ list } as any, new Set(), {
    attempts: 5,
    delayMs: 0,
    sleep: never,
  });
  if (found.ok) throw new Error('expected the refusal');
  expect(found.getError().message).toBe('Session expired');
  // Once. Retrying past a refusal is asking a question already answered, and
  // exhausting the attempts would turn it into "no trace yet".
  expect(list).toHaveBeenCalledTimes(1);
});

// Pinned per the repository owner's ruling on task 24: a search that skips the
// set difference can still pass a tidy feed by accident, because "the newest
// entry" and "the newest fresh entry" agree whenever nothing pre-existing is
// newer than what the run just produced. This feed breaks that coincidence on
// purpose — the pre-existing entry is BOTH the newest by `recordedAt` AND last
// in document order, while the genuinely new one is older and earlier.
//
//  · ignore the snapshot, take the newest by recordedAt → picks `old-newest`
//  · ignore the snapshot, take the last in the list      → picks `old-newest`
//  · difference against the snapshot (correct)           → picks `fresh-1`,
//    the only entry `before` does not already name
it('is not fooled by a pre-existing entry that is both newest by time and last in the list', async () => {
  const before = new Set(['old-newest']);
  const found = await newTraceAfter(
    {
      list: async () =>
        feed(
          entry('fresh-1', '2026-09-14T09:00:00Z'),
          entry('old-newest', '2026-09-14T12:00:00Z'),
        ),
    } as any,
    before,
    { attempts: 1, delayMs: 0, sleep: never },
  );
  if (!found.ok) throw new Error('expected a found id');
  expect(found.getResult().value).toBe('fresh-1');
});
