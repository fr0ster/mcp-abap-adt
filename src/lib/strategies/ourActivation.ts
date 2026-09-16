import {
  type IAdtMessageFailure,
  analyseActivation as shippedActivation,
} from '@mcp-abap-adt/adt-strategies';
import type { IAnalyse } from '@mcp-abap-adt/interfaces';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces';
import { XMLParser } from 'fast-xml-parser';

/**
 * The activation verdict, decided here.
 *
 * **What the shipped strategy gets wrong.**
 * `analyseActivation` in `@mcp-abap-adt/adt-strategies` treats
 * `chkl:properties activationExecuted="false"` as a refusal on its own,
 * "whether or not SAP explained itself". That is one reading too many:
 * `false` with no `msg` at all is SAP saying it had nothing to activate.
 *
 * **Measured, not argued** — trial, 2026-09-16, three ways, all answering the
 * identical document (`checkExecuted="false" activationExecuted="false"
 * generationExecuted="true"`, no `msg`):
 *
 * - activating a class a second time, straight after an activation that
 *   answered `activationExecuted="true"`. The corpus carries it as
 *   `activation-nothing-to-activate`;
 * - activating a function group straight after creating one — a function
 *   group is created active, `adtcore:version="active"` stands on its
 *   metadata before activation is asked for;
 * - both of those through the tools, which is how it reached us: two
 *   integration suites failing on an object that was never in trouble.
 *
 * The third possible reading — accepted, still running — is ruled out by the
 * contrast: when SAP does have work, it answers `activationExecuted="true"`
 * in the same request rather than deferring behind a 200. adt-clients
 * `v18.0.2:src/utils/activationUtils.ts:45-75` recorded the same finding from
 * its own probe ("class already active | 200 | false | none") and concluded
 * that the attribute says whether ADT did work, not whether the work
 * succeeded.
 *
 * **Why the verdict lives in the consumer and not upstream.** It is a
 * judgement about what an answer means for a caller, which is this
 * repository's half of the split: adt-clients returns consumer-agnostic
 * answers, and refining them is ours. The same rule already put the
 * composites here — create+lock+update+unlock, the lock, the polling.
 *
 * **It narrows the shipped strategy, never widens it.** Everything else is
 * delegated: the message parsing, the enrichment, a verdict the library
 * already reached before any strategy ran. Only the one measured
 * false positive is taken back, and only when the document says both things
 * at once — the attribute is `false` AND there is no message of any severity
 * to explain it. A `false` with an `E` beside it stays the refusal it is;
 * that is `refusal-activation-fails` in the corpus, and it still fails.
 */
export const ourActivation: IAnalyse<IAdtMessageFailure> = (
  verdict,
  answer,
) => {
  const shipped = shippedActivation(verdict, answer);

  // Not a failure either way, or the library had already failed the call
  // before any document was read — a transport error, a non-2xx status.
  // Neither is ours to reverse.
  if (shipped === ADT_NO_FAILURE) return shipped;
  if (verdict !== ADT_NO_FAILURE) return shipped;

  return isNothingToActivate(answer?.data) ? ADT_NO_FAILURE : shipped;
};

/**
 * Parsed, not matched. The attribute and the message list are structure, and
 * a substring search for `activationExecuted="false"` would answer yes to a
 * document that carries it inside a message's own text.
 *
 * Namespace prefixes are stripped, because the same document has arrived as
 * `chkl:properties` and as `properties` depending on who parsed it first.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

function isNothingToActivate(data: unknown): boolean {
  if (typeof data !== 'string' || data.trim() === '') return false;

  let root: Record<string, unknown> | undefined;
  try {
    root = (parser.parse(data) as Record<string, any>)?.messages;
  } catch {
    return false;
  }
  if (!root) return false;

  const properties = (root as Record<string, any>).properties;
  if (properties?.['@activationExecuted'] !== 'false') return false;

  // Any message at all, of any severity, means SAP had something to say —
  // and this reading is only for the case where it said nothing.
  const messages = (root as Record<string, any>).msg;
  if (messages === undefined || messages === null) return true;
  return Array.isArray(messages) ? messages.length === 0 : false;
}
