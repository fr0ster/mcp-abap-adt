/**
 * A prompt argument from a closed set: its completion and its description
 * built from the one list of values, so a client without completion reads
 * in the description exactly what a client with it is offered.
 */
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import * as z from 'zod';

/** The values starting with what the user typed, compared without regard to case. */
export function completeFrom(
  values: readonly string[],
  typed: string,
): string[] {
  const prefix = typed.toLowerCase();
  return values.filter((value) => value.toLowerCase().startsWith(prefix));
}

/** `<words>: <value>, <value>, ….`, or `<words>.` when there is no value. */
export function valuesWords(words: string, values: readonly string[]): string {
  return values.length === 0 ? `${words}.` : `${words}: ${values.join(', ')}.`;
}

/** A required argument whose description lists `values` and whose completion offers them. */
export function closedArgument(words: string, values: readonly string[]) {
  return completable(z.string().describe(valuesWords(words, values)), (typed) =>
    completeFrom(values, typed),
  );
}

/**
 * An optional argument whose description lists `values` and whose
 * completion offers them while `completes` holds for the arguments given so
 * far, and nothing otherwise.
 */
export function closedOptionalArgument(
  words: string,
  values: readonly string[],
  completes: (given: Readonly<Record<string, string>>) => boolean = () => true,
) {
  return completable(
    z.string().optional().describe(valuesWords(words, values)),
    (typed, context) =>
      completes(context?.arguments ?? {})
        ? completeFrom(values, typed ?? '')
        : [],
  );
}
