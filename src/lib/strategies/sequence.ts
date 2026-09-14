import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';

/**
 * A handler that issues several calls, with the strategies still in charge.
 *
 * adt-clients 19 removed the members that made several requests, so the order
 * is the handler's now. What did NOT move is who decides a failure: every step
 * carries its own `analyse`, and the verdict on each answer is that strategy's.
 * This runs the steps and hands back **the failing step's own answer,
 * untouched** — so the payload the caller sees is the one the strategy built,
 * with its origin, its messages and its T100 key.
 *
 * ```typescript
 * const domain = client.getDomain(resultsFor(domainDocuments));
 * return answer(ctx, () => sequence(
 *   () => domain.readMetadata({ domainName }, { analyse: analyseException }),
 *   (current) => domain.updateMetadata({ domainName }, { lockHandle, xmlContent: patch(current), analyse: analyseException }),
 * ), project(detail, terseWrite));
 * ```
 *
 * This example used to pass `writeProjection` (from `promised.ts`) straight
 * to `answer()` in place of the last line above. That does not compile:
 * `writeProjection` is `Terse<unknown>` — `(value, status)`, same as
 * `terseWrite` — and `answer()`'s `project` takes one argument. A function
 * that requires a second, required parameter is not assignable where the
 * caller supplies only the first — TS2345, "Target signature provides too
 * few arguments." (Dropping a trailing parameter a caller does not use is
 * fine; gaining one it does not supply is not.) `project(detail, terseWrite)`
 * is the real bridge: it reads a write's `AdtReading` (`statusOnly`, or
 * `verbatim` for the DDIC creates that answer a document — see
 * `resultSets.ts`) and hands `terseWrite` the `status` off of it. Every
 * migrated write handler in `src/handlers/domain/low` uses it this way.
 *
 * **It never builds an error of its own.** A sequence that composed a sentence
 * like "step 2 of 3 failed" would be inventing a verdict beside the one the
 * strategy already gave, and a caller would then have two accounts of the same
 * refusal. Which step it was is in the failure's `request`, which is where the
 * contract puts it.
 */

/** A step: given what the previous one produced, make the next call. */
export type Step<TIn, TOut> = (
  previous: TIn,
) => Promise<IAdtResponse<TOut, IAdtError>>;

/** Run two steps, stopping at the first failure and returning it as it came. */
export async function sequence<A, B>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: Step<A, B>,
): Promise<IAdtResponse<B, IAdtError>>;
/** Run three. */
export async function sequence<A, B, C>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: Step<A, B>,
  third: Step<B, C>,
): Promise<IAdtResponse<C, IAdtError>>;
/** Run four. A create that validates, creates, writes its body and activates. */
export async function sequence<A, B, C, D>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: Step<A, B>,
  third: Step<B, C>,
  fourth: Step<C, D>,
): Promise<IAdtResponse<D, IAdtError>>;
/** Run five. The full lifecycle create, with its check between write and activate. */
export async function sequence<A, B, C, D, E>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: Step<A, B>,
  third: Step<B, C>,
  fourth: Step<C, D>,
  fifth: Step<D, E>,
): Promise<IAdtResponse<E, IAdtError>>;
export async function sequence(
  first: () => Promise<IAdtResponse<unknown, IAdtError>>,
  ...rest: Array<Step<unknown, unknown>>
): Promise<IAdtResponse<unknown, IAdtError>> {
  let answer = await first();
  for (const step of rest) {
    // The failing step's answer is the answer. Not re-wrapped, not summarised:
    // the strategy that judged it already said everything there is to say.
    if (!answer.ok) return answer;
    answer = await step(answer.getResult().value);
  }
  return answer;
}

/**
 * Two calls whose BOTH answers are the result.
 *
 * `sequence` answers the last step, which is what a read-modify-write wants. A
 * read that reports a document and its metadata wants both, and capturing the
 * first outside the run would put the ordering back in the handler one
 * assignment at a time.
 *
 * The failure rule is `sequence`'s exactly: the failing step's own answer,
 * untouched, and the second step is never reached when the first refuses.
 */
export async function pair<A, B>(
  first: () => Promise<IAdtResponse<A, IAdtError>>,
  second: (a: A) => Promise<IAdtResponse<B, IAdtError>>,
): Promise<IAdtResponse<[A, B], IAdtError>> {
  const a = await first();
  if (!a.ok) return a as unknown as IAdtResponse<[A, B], IAdtError>;

  const valueA = a.getResult().value;
  const b = await second(valueA);
  if (!b.ok) return b as unknown as IAdtResponse<[A, B], IAdtError>;

  const both: [A, B] = [valueA, b.getResult().value];
  return {
    ok: true,
    getResult: () => ({ value: both }),
    getError: () => {
      throw new Error('pair: asked for the error of a success');
    },
  } as unknown as IAdtResponse<[A, B], IAdtError>;
}
