import { readFileSync } from 'node:fs';
import {
  legacyEnabledHandlers,
  legacyExposure,
} from '../../../scripts/lib/analyseOmissions';

describe('legacyEnabledHandlers', () => {
  it('excludes a handler legacy is never offered', () => {
    const kept = legacyEnabledHandlers('src/__tests__/fixtures/legacy/*.ts');
    expect(kept).not.toContain(
      'src/__tests__/fixtures/legacy/not-on-legacy.ts',
    );
    // Three of the four fixtures declare (or omit) `legacy`; the fourth names
    // two environments and neither of them is `legacy`.
    expect(kept.length).toBe(3);
  });

  /** Which handlers a legacy system is offered at all — the input to the ledger. */
  it('finds exactly the handlers legacy is offered', () => {
    // The ledger below is fail-open without this, and a threshold is not
    // enough. A floor of "most of the tree" still allows the filter to
    // quietly stop matching thirty handlers: their exposures drop out of
    // `actual`, the ledger logs them as "fixed", and losing coverage reads as
    // progress — which is the most dangerous shape a defect can take in this
    // repository.
    //
    // So the set is pinned, not counted. Adding a handler or changing its
    // `available_in` is a deliberate change to what legacy is offered, and
    // recording it here is the same discipline Task 1 applies to the tool
    // surface: the snapshot moves when someone means it to.
    const recorded: string[] = JSON.parse(
      readFileSync('tests/fixtures/legacy-handlers.json', 'utf8'),
    );
    expect(legacyEnabledHandlers().sort()).toEqual(recorded.sort());
  });
});

describe('legacyExposure', () => {
  it.each([
    ['chain.ts', 'getPackage().readMetadata'],
    // 109 call sites take this shape.
    ['aliased.ts', 'getPackage().readMetadata'],
    // 7 take this one, 3 of them among the twenty-three. An assertion hides
    // the factory from a walk that knows only calls and identifiers.
    ['asserted.ts', 'getUnitTest().getStatus'],
  ])('sees the factory through %s', (fixture, pair) => {
    const found = legacyExposure([`src/__tests__/fixtures/legacy/${fixture}`]);
    // Every one of these must find exactly one, because [] is what a clean
    // result looks like and is therefore the wrong way to be wrong.
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(pair);
  });

  it('reports nothing for a tool legacy is never offered', () => {
    // not-on-legacy.ts calls a flagged member (`getPackage().create`), but
    // `legacyExposure` on its own does not filter by availability — that is
    // `legacyEnabledHandlers`'s job. Fed the raw fixture it finds the call;
    // the ledger test below is what proves the two compose correctly.
    const found = legacyExposure([
      'src/__tests__/fixtures/legacy/not-on-legacy.ts',
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('getPackage().create');
  });

  /**
   * The pairs where a handler still lands on a legacy member that decides
   * for itself. On a legacy system those calls take adt-clients' verdict, so
   * a refusal encoded inside a 200 stays masked there.
   *
   * This is the ledger Task 26's pin cannot be: that one reads the library's
   * declarations, and all twenty-three handlers could sit on the old members
   * with it still green. This one reads the calls.
   *
   * **Exact equality, both directions.** An earlier draft failed only on a
   * new pair and logged a disappeared one, reasoning that failing when a
   * handler is fixed would punish the improvement. That was wrong twice. It
   * made the whole ledger fail-open — a regression in the AST walk stops
   * seeing real calls, every entry reads as "fixed", and losing the analysis
   * looks exactly like finishing the work — and it let this file, and the
   * release notes built from it, drift with nothing ever forcing the update.
   *
   * Regenerating the snapshot is part of making the fix, not a penalty for
   * it. That is the bargain every snapshot test makes, and the one Task 1
   * already makes for the tool surface.
   */
  it('lands on exactly the legacy members recorded, and no others', () => {
    const recorded: string[] = JSON.parse(
      readFileSync('tests/fixtures/legacy-exposure.json', 'utf8'),
    );
    // Filtered, for the same reason the snapshot is: a tool not offered on
    // legacy never reaches a Legacy class, and recording it as exposure
    // invents a masking defect that cannot happen.
    const actual = legacyExposure(legacyEnabledHandlers());

    // An addition is a handler that moved onto a member which decides alone.
    // A disappearance is either a fix worth recording or a walk that stopped
    // working, and those two are indistinguishable from here — which is
    // exactly why neither may pass in silence.
    expect(actual.sort()).toEqual(recorded.sort());
  });
});
