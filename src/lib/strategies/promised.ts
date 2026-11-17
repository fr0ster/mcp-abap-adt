import { type JsonValue, jsonOfNode } from '../json';
import { terseWrite } from './projections';
import type { AdtReading } from './reading';
import {
  parseStructure,
  rawOf,
  reading,
  statusOnly,
  verbatim,
} from './reading';

/**
 * The structured reading of a tool that promised JSON: the document's parse,
 * typed at the parse and written as JSON ({@link jsonOfNode}); `null` for one
 * that does not parse.
 */
const jsonReading = reading(
  (answer): JsonValue => jsonOfNode(parseStructure(rawOf(answer))),
);

/**
 * What the tool promised to return. That is what picks the strategy.
 *
 * Not the operation, not the object type. A tool's contract says what shape its
 * answer is, and the strategy's only job is to produce it:
 *
 *   text  — class source, function module source. The text IS the answer.
 *   xml   — a domain, metadata. The tool hands the document through as it came.
 *   json  — everything else.
 */
export type PromisedForm = 'text' | 'xml' | 'json';

/**
 * The reading for a READ.
 *
 * `text` and `xml` are the same reading, and that is not an oversight: both
 * promise the document unchanged, and the only difference is what the caller
 * will do with it. Parsing either would break the promise.
 */
export function readingFor(form: PromisedForm) {
  return form === 'json' ? jsonReading : verbatim;
}

/**
 * The reading for a WRITE — a create, an update, a delete, an activate.
 *
 * Deliberately the thinnest one there is. A write is made to change something:
 * when it works, "it worked" is all a caller needs, and when it does not, what
 * went wrong is the valuable half of the call and it arrives through `analyse`,
 * not through here. A class create answers 200 with zero bytes, so there is
 * nothing to read even when it succeeds.
 */
export const writeReading = statusOnly;

/**
 * And its projection: worked, or nothing — never `undefined` on a success.
 *
 * `Terse<T, R>` — two parameters, `(value, status)` — same as `terseWrite`
 * itself. **Not what `answer()`'s `project` takes.** `answer<T>(ctx, call,
 * project: (value: T) => unknown)` is one parameter, and a function requiring
 * a second, required one is not assignable where the caller supplies only the
 * first — TS2345, "Target signature provides too few arguments." (A function
 * MAY drop a trailing parameter its caller does not need; it may never gain
 * one the caller does not supply.) A handler wires this into a write by
 * passing it through `project(detail, terseWrite)` instead — see
 * `resultSets.ts` for the `AdtReading` that supplies the `status`, and
 * `src/handlers/domain/low` for every real call site. `writeProjection`
 * itself stays two-parameter, exactly `terseWrite`, because that is what lets
 * it be exercised directly against a reading in `strategyPromised.test.ts`
 * without a caller in between.
 */
export const writeProjection = terseWrite;

/**
 * A read's answer, in the promised form, at the requested detail.
 *
 * For `text` and `xml` all three detail levels coincide — the document is the
 * answer, and there is nothing to summarise or expand. That is not a special
 * case to apologise for; it is what promising the document means.
 */
export function answerRead(
  form: PromisedForm,
  reading: AdtReading<JsonValue>,
  detail: 'terse' | 'full' | 'raw',
): JsonValue {
  if (form !== 'json') return reading.raw;
  if (detail === 'raw') return reading.raw;
  return reading.value;
}
