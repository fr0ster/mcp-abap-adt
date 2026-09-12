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
 * return answer(ctx, () => sequence(
 *   () => client.getDomain().read({ domainName }, 'active', { analyse: analyseException }),
 *   (current) => client.getDomain().update({ domainName }, patch(current), { lockHandle, analyse: analyseException }),
 * ), writeProjection);
 * ```
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
