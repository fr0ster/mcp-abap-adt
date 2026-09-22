import { candidatesWorthOpening } from '../integration/helpers/dumpFeed';

/**
 * Which dump-feed entries are worth opening, and what happens when the cheap
 * filter finds none.
 *
 * The filter reads the feed's own `title` — the exception's short text — so a
 * poll opens only the entries that are even the right kind of dump. SAP writes
 * that text in the logon language, and the default filter is one language's
 * string. Left as a gate, a German or Ukrainian session would match nothing,
 * exhaust the polls, and fail a test on a system where the run dumped
 * perfectly well.
 *
 * These hold the fallback in place. There is nothing to run against SAP here:
 * the question is what the selection does with a list, and a list is cheap.
 */

const entry = (id: string, title: string) => ({ id, title });

describe('choosing which dumps to open', () => {
  const feed = [
    entry('3', 'Division by 0 (type I or INT8)'),
    entry('2', 'CX_SY_OPEN_SQL_DB'),
    entry('1', 'Division by 0 (type I or INT8)'),
  ];

  it('opens only the entries whose title matches, newest first', () => {
    const { chosen, narrowed } = candidatesWorthOpening(
      feed,
      'division by 0',
      5,
    );

    expect(narrowed).toBe(true);
    expect(chosen.map((c) => c.id)).toEqual(['3', '1']);
  });

  it('caps how many it opens, however many matched', () => {
    const { chosen } = candidatesWorthOpening(feed, 'division by 0', 1);

    expect(chosen.map((c) => c.id)).toEqual(['3']);
  });

  /**
   * **The case this exists for.** A session whose language is not the one the
   * default filter was written in sees titles like "Division durch 0" — no
   * match — and the run still dumped. Falling back to the newest entries costs
   * a few detail fetches; giving up costs a red suite on a healthy system.
   */
  it('falls back to the newest entries when the title matched none', () => {
    const german = [
      entry('9', 'Division durch 0 (Typ I oder INT8)'),
      entry('8', 'CX_SY_OPEN_SQL_DB'),
    ];

    const { chosen, narrowed } = candidatesWorthOpening(
      german,
      'division by 0',
      5,
    );

    expect(narrowed).toBe(false);
    expect(chosen.map((c) => c.id)).toEqual(['9', '8']);
  });

  it('still opens nothing when the feed itself is empty', () => {
    const { chosen, narrowed } = candidatesWorthOpening([], 'division by 0', 5);

    expect(narrowed).toBe(false);
    expect(chosen).toEqual([]);
  });

  /** Case is the server's business, not the caller's. */
  it('matches a title regardless of case', () => {
    const shouting = [entry('7', 'DIVISION BY 0 (TYPE I OR INT8)')];

    expect(
      candidatesWorthOpening(shouting, 'Division By 0', 5).chosen.map(
        (c) => c.id,
      ),
    ).toEqual(['7']);
  });
});
