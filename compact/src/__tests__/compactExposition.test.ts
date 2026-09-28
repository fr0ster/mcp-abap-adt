/**
 * `mcp-abap-adt-compact --exposition=ro|rw`, and why the vocabulary is its own.
 *
 * The command serves the compact facade, so `readonly`/`high`/`low` — sets of the
 * object-oriented surface — mean nothing here. What IS a real choice at startup is
 * which half of the facade to serve: `rw` gives all 22 tools, `ro` the 13 that change
 * nothing. Locally the default is `rw`, every access; `ro` exists for a host that
 * means to hand out a surface which cannot change the system.
 *
 * **A wrong value is refused rather than defaulted.** Starting with a different tool
 * list than the one asked for is the failure this is meant to prevent — the same
 * reasoning that makes `mcp-abap-adt` refuse `--exposition=compact` instead of
 * ignoring it.
 */
import { parseCompactExposition } from '../launcher';

describe('the compact command reads its own exposition', () => {
  it('defaults to rw — locally the server gives every access', () => {
    expect(parseCompactExposition([])).toBe('rw');
    expect(parseCompactExposition(['--transport=stdio'])).toBe('rw');
  });

  it('reads both spellings', () => {
    // `hasArg`-style whole-entry matching missed `--exposition=ro`, which is the
    // spelling everyone writes; both are read here.
    expect(parseCompactExposition(['--exposition=ro'])).toBe('ro');
    expect(parseCompactExposition(['--exposition', 'ro'])).toBe('ro');
    expect(parseCompactExposition(['--exposition=RW'])).toBe('rw');
    expect(parseCompactExposition(['--exposition', ' rw '])).toBe('rw');
  });

  it('takes the last one when a flag is repeated', () => {
    expect(parseCompactExposition(['--exposition=rw', '--exposition=ro'])).toBe(
      'ro',
    );
  });

  it('refuses a flag that was given no value, rather than defaulting', () => {
    // Reported in review: `--exposition="$MODE"` with an unset variable opened all
    // 22 tools, writes included, and an empty repeat overrode a deliberate `ro`.
    // The default belongs to an ABSENT flag only.
    for (const argv of [
      ['--exposition='],
      ['--exposition', ''],
      ['--exposition'],
      ['--exposition', '--transport=stdio'],
      ['--exposition=ro', '--exposition='],
      ['--exposition=ro', '--exposition'],
    ]) {
      expect(() => parseCompactExposition(argv)).toThrow(/no value/);
    }
  });

  it('refuses a set of the object-oriented surface, by name', () => {
    for (const wrong of ['readonly', 'high', 'low', 'compact', 'all']) {
      expect(() => parseCompactExposition([`--exposition=${wrong}`])).toThrow(
        /'ro'.*'rw'|is not a compact set/,
      );
    }
  });

  it('names both commands in the refusal, so the reader knows where to go', () => {
    expect(() => parseCompactExposition(['--exposition=high'])).toThrow(
      /mcp-abap-adt/,
    );
  });
});
