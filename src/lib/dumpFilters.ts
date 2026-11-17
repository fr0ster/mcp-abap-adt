/**
 * The dumps feed's filters, read by `RuntimeListFeeds` and compact
 * `HandlerDumpList`: each filter's attribute and operator, and the rule a
 * call's filters keep — a leaf module, so both tools' schemas state it.
 */

import { isBlank } from './plainText';

/**
 * The dumps feed's filters and the attribute and operator each one is sent
 * as. The attributes are the ones the feed's descriptor declares
 * (`GET /sap/bc/adt/feeds`, `feed:queryAttribute`); `user` offers `equals`
 * and `notEquals` only, the others `contains` as well.
 */
export const DUMP_FILTERS = [
  ['user', 'user', 'equals'],
  ['runtime_error', 'runtimeError', 'contains'],
  ['exception', 'exception', 'contains'],
  ['object_name', 'objectName', 'contains'],
  ['package', 'package', 'contains'],
  ['component', 'component', 'contains'],
] as const;

/**
 * A value is written into the expression as it stands, so what would end an
 * operand — a blank, a comma, a parenthesis — is refused rather than sent.
 */
export function isOperand(value: string): boolean {
  if (value.length === 0) return false;
  for (const character of value) {
    if (isBlank(character) || ',()'.includes(character)) return false;
  }
  return true;
}

/**
 * The refusal of the dumps filters on `feedType` (`undefined`: none): a
 * dumps-only filter on another feed, or a filter that is not one operand.
 * The rule of a single feed's call (its schema) and of each feed of a
 * `feed_types` list (its own answer).
 */
export function dumpFiltersRefusal(
  feedType: string,
  args: {
    readonly [K in (typeof DUMP_FILTERS)[number][0]]?: string | undefined;
  },
): { words: string; path: string } | undefined {
  const dumpOnly = DUMP_FILTERS.filter(
    ([param]) => param !== 'user' && args[param]?.trim(),
  ).map(([param]) => param);
  const [first] = dumpOnly;
  if (feedType !== 'dumps' && first !== undefined) {
    return {
      words: `${dumpOnly.join(', ')} filter the dumps feed; feed_type is ${feedType}.`,
      path: first,
    };
  }
  if (feedType !== 'dumps') return undefined;
  for (const [param] of DUMP_FILTERS) {
    const value = args[param]?.trim();
    if (value && !isOperand(value)) {
      return {
        words: `${param} must not contain blanks, commas or parentheses: "${value}"`,
        path: param,
      };
    }
  }
  return undefined;
}
