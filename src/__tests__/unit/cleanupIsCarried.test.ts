import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A held lock has to survive every call made after it.
 *
 * This defect came back three times in one branch, each time in a new shape:
 * `withLock` answered a failure instead of the write; then the handlers
 * dropped the note by returning the activation's answer instead of the
 * write's; then `sequence` dropped it one step earlier still, because a
 * lifecycle create runs its `withLock` as a step and the check answers in its
 * place. The first two were found by review, not by a test — the tests were
 * written after, and each only pins the shape it was written for.
 *
 * So this one pins the *rule* instead, and reads the sources rather than
 * running anything: a handler that holds a lock and then makes one more call
 * whose answer it returns must carry the note across. Not a substitute for
 * the behavioural tests; a net under the next handler someone writes.
 */
const HANDLERS = join(__dirname, '../../handlers');

/**
 * The activation after the write: the one call these handlers make *after* the
 * lock is done with, and whose answer they return in the write's place.
 *
 * Only this shape. A `return obj.check(...)` inside a sequence step looks the
 * same but is carried by `sequence` itself, and flagging it would teach the
 * next person to silence the test rather than read it.
 */
const RETURNS_AN_ACTIVATION = /\n\s*return (?!carryCleanup)\w+\.activate\(/;

const sources = readdirSync(HANDLERS, {
  recursive: true,
  encoding: 'utf-8',
})
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({
    name,
    text: readFileSync(join(HANDLERS, name), 'utf-8'),
  }));

describe('a lock nobody released is carried to the caller', () => {
  it('has handlers to check', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('is never dropped by a call made after the lock was held', () => {
    const holding = sources.filter(({ text }) => text.includes('withLock('));
    // The ones that `return withLock(...)` outright need nothing: the note
    // rides out on the answer they return.
    const offenders = holding
      .filter(({ text }) => RETURNS_AN_ACTIVATION.test(text))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  /**
   * And the two places the note can be dropped between calls rather than by a
   * handler: a sequence's later step, and the tuple `pair` builds from scratch.
   */
  it('is carried between the steps of a sequence', () => {
    const sequenceSource = readFileSync(
      join(__dirname, '../../lib/strategies/sequence.ts'),
      'utf-8',
    );
    expect(sequenceSource).toContain('answer = carryCleanup(answer, next)');
    expect(sequenceSource).toContain('carryCleanup(a, carryCleanup(b,');
  });
});
