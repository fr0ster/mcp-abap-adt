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

/**
 * An optional argument whose description lists `values` and whose
 * completion offers them while `completes` holds for the arguments given so
 * far, and nothing otherwise.
 *
 * The completer is set on the optional schema and on the string inside it:
 * the SDK answers `completion/complete` from the schema registered, but
 * enables the completions capability only when the type inside an optional
 * is completable — a prompt whose closed arguments are all optional would
 * otherwise answer `completion/complete` "Method not found".
 */
export function closedOptionalArgument(
  words: string,
  values: readonly string[],
  completes: (given: Readonly<Record<string, string>>) => boolean = () => true,
) {
  const complete = (
    typed: string | undefined,
    context?: { arguments?: Record<string, string> },
  ): string[] =>
    completes(context?.arguments ?? {})
      ? completeFrom(values, typed ?? '')
      : [];
  return completable(
    completable(z.string(), complete)
      .optional()
      .describe(valuesWords(words, values)),
    complete,
  );
}
