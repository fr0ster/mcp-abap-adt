import { type Terse, terseWrite } from './projections';
import type { AdtReading } from './reading';
import { statusOnly, structured, verbatim } from './reading';

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
  return form === 'json' ? structured : verbatim;
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

/** And its projection: worked, or nothing — never `undefined` on a success. */
export const writeProjection: Terse<unknown> = terseWrite;

/**
 * A read's answer, in the promised form, at the requested detail.
 *
 * For `text` and `xml` all three detail levels coincide — the document is the
 * answer, and there is nothing to summarise or expand. That is not a special
 * case to apologise for; it is what promising the document means.
 */
export function answerRead(
  form: PromisedForm,
  reading: AdtReading<unknown>,
  detail: 'terse' | 'full' | 'raw',
): unknown {
  if (form !== 'json') return reading.raw;
  if (detail === 'raw') return reading.raw;
  return reading.value;
}
