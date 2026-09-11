import { XMLParser } from 'fast-xml-parser';

/**
 * Reading a refusal out of the document SAP sent.
 *
 * ADT answers `200` and refuses in the body, so the HTTP status is not the
 * signal. Where the signal *is* differs by document, and the corpus in
 * `tests/fixtures/adt/` measures four forms that do not agree with each other.
 * These readings are one per form, not one per object family — the same four
 * documents serve every family.
 *
 * **Why these are plain functions and not `IAnalyse` implementations yet.** The
 * injectable contract lives in `@mcp-abap-adt/interfaces` 39, and this
 * repository is still on 13 until the stack is raised. The substance of an
 * error strategy is reading the document; wrapping a reading as
 * `(verdict, answer) => verdict === ADT_NO_FAILURE ? read(answer.data) ?? ADT_NO_FAILURE : verdict`
 * is mechanical. Keeping the reading free of the contract means it is testable
 * against the corpus today rather than after the bump, and the wrapper is the
 * only part that has to wait.
 *
 * Every rule below is evidenced by a named fixture, and
 * `src/__tests__/unit/adtRefusalReadings.test.ts` runs each one against it.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Both of these off, and the second is not cosmetic. `parseTagValue` defaults
  // to true and coerces element text that looks numeric, which turns the T100
  // message number `002` into `2` — a key no SAP system recognises. Everything
  // read here is text SAP wrote, and it is kept as written.
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

/** One message SAP attached to its verdict. `W` and `I` are kept, not filtered. */
export interface AdtMessage {
  readonly type: string;
  readonly text: string;
  readonly line?: string;
  readonly code?: string;
}

/**
 * What a reading produces when the document is a refusal.
 *
 * The field names mirror `IAdtError` so that wrapping this as an `IAnalyse`
 * adds `origin` and nothing else. `origin` is deliberately absent here: every
 * one of these is `'refusal'` by construction — SAP answered, about this
 * object, and said no — and a reading that could also return `'connection'`
 * would be claiming to know something it cannot see.
 */
export interface AdtRefusal {
  /** What SAP said, verbatim where SAP said anything. */
  readonly message: string;
  /** `<type id="…">`, the server's own classification, where it gave one. */
  readonly adtType?: string;
  /** `<namespace id="…">`, where the document names one. */
  readonly namespace?: string;
  /** The T100 message key, where the document carries one: `SADT_RESOURCE/002`. */
  readonly t100?: { readonly id: string; readonly no: string };
  /** Every message in the document, `E`, `W` and `I` alike. */
  readonly messages?: ReadonlyArray<AdtMessage>;
  /** Which of the four forms this was read from, for diagnosis. */
  readonly form: 'exception' | 'activation' | 'deletion' | 'checkrun';
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** One child vs many children — the trap that broke the transport tree in #168. */
function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Text of a node that may be a bare string or an element with attributes.
 *
 * `<message lang="EN">text</message>` parses to an object once `lang` is kept,
 * and to a string when it has no attributes. Both spellings occur.
 */
function textOf(node: unknown): string {
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object') {
    const text = (node as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text.trim();
    if (typeof text === 'number') return String(text);
  }
  return '';
}

function parseXml(document: unknown): Record<string, any> | null {
  if (typeof document !== 'string' || document.trim() === '') return null;
  try {
    const parsed = parser.parse(document);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Form 1 — the HTTP status carries it, the document explains it
// ---------------------------------------------------------------------------

/**
 * `exc:exception`, the document behind every non-2xx ADT refusal.
 *
 * Fixtures: `refusal-object-not-found` (404), `refusal-package-not-found-tree`
 * (404), `refusal-lock-held-by-other` (403), `refusal-write-not-locked` (423).
 *
 * This form is the one where the library's own verdict is already a failure, so
 * a strategy built on it **enriches rather than replaces**: `type id` and
 * `namespace id` are the server's words and would otherwise be parsed out by
 * every consumer for themselves.
 */
export function readExceptionRefusal(document: unknown): AdtRefusal | null {
  const root = parseXml(document)?.exception;
  if (!root) return null;

  const properties = new Map<string, string>();
  for (const entry of asArray(root.properties?.entry)) {
    const key = entry?.['@key'];
    if (typeof key === 'string') properties.set(key, textOf(entry));
  }

  const id = properties.get('T100KEY-ID');
  const no = properties.get('T100KEY-NO');

  return {
    form: 'exception',
    message:
      textOf(root.message) ||
      textOf(root.localizedMessage) ||
      'ADT refused the request',
    adtType:
      typeof root.type?.['@id'] === 'string' ? root.type['@id'] : undefined,
    namespace:
      typeof root.namespace?.['@id'] === 'string'
        ? root.namespace['@id']
        : undefined,
    t100: id && no ? { id, no } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Form 2a — activation: a boolean attribute, under HTTP 200
// ---------------------------------------------------------------------------

/**
 * `chkl:messages`, what `POST /activation` answers.
 *
 * Fixtures: `refusal-activation-fails` (200, `activationExecuted="false"` plus a
 * `msg` of type `E`) and `activation-success-verdict` (200,
 * `activationExecuted="true"`, no messages).
 *
 * **Two signals, not one, and that is deliberate.** adt-clients' shipped
 * `activationRefusal` keys on a `msg` of type `E` alone and ignores the
 * attribute. That agrees with both corpus cases, because the failing one
 * carries both. It leaves a hole either side of them: an activation SAP
 * declined without attaching an `E` would be read as a success.
 *
 * `activationExecuted="false"` is SAP stating that nothing was activated. A
 * caller who asked to activate and was told nothing was activated has not
 * succeeded, whether or not SAP explained itself, so the attribute is a refusal
 * on its own. The request carries `preauditRequested=true` and adt-clients does
 * not re-post, so this is the member's final answer and not an intermediate
 * state — checked in `activateObjectInSession`.
 */
export function readActivationRefusal(document: unknown): AdtRefusal | null {
  const root = parseXml(document)?.messages;
  if (!root) return null;

  const messages: AdtMessage[] = asArray(root.msg).map((msg: any) => ({
    type: String(msg?.['@type'] ?? 'I'),
    text:
      textOf(msg?.shortText?.txt) ||
      textOf(msg?.shortText) ||
      textOf(msg?.['@objDescr']) ||
      'activation message',
    line: msg?.['@line'] !== undefined ? String(msg['@line']) : undefined,
    code: msg?.['@code'] !== undefined ? String(msg['@code']) : undefined,
  }));

  const errors = messages.filter((m) => m.type.toUpperCase() === 'E');
  const executed = root.properties?.['@activationExecuted'];
  const activated = executed === 'true' || executed === true;

  if (activated && errors.length === 0) return null;

  const explanation = errors.length
    ? errors.map((m) => m.text).join('; ')
    : 'SAP reported activationExecuted="false" and gave no reason';

  return {
    form: 'activation',
    message: `Activation failed: ${explanation}`,
    messages,
  };
}

// ---------------------------------------------------------------------------
// Form 2b — deletion: two documents, two attributes
// ---------------------------------------------------------------------------

/**
 * `del:checkResponse` and `del:deletionResult`, the two halves of a delete.
 *
 * Fixtures: `refusal-delete-refused` steps 1 and 2 (`isDeletable="false"`, then
 * `isDeleted="false"`), and `delete-success` steps 1 and 2 (both `"true"`).
 *
 * **The presence of `del:message` is not the signal.** A successful delete
 * carries one too, with `del:type="S"` and an empty `del:text` — visible in
 * `delete-success--02`. The attribute is the verdict; the message explains it.
 *
 * **The two documents must not share a reader.** adt-clients ships
 * `deletionRefusal`, which covers the check step; its `parseDeletionCheck` looks
 * for `isDeletable` with a regex and defaults a missing one to `false`. Handed a
 * `deletionResult`, which has no such attribute, it reports every successful
 * delete as refused. This reader dispatches on the root element instead.
 *
 * `isDeleted` has no reader anywhere in this repository today, which is why a
 * refused delete still answers `success: true`.
 */
export function readDeletionRefusal(document: unknown): AdtRefusal | null {
  const parsed = parseXml(document);
  if (!parsed) return null;

  const isCheck = Boolean(parsed.checkResponse);
  const root = parsed.checkResponse ?? parsed.deletionResult;
  const object = root?.object;
  if (!object) return null;

  const message = object.message;
  const messageType = String(message?.['@type'] ?? '').toUpperCase();
  const messageText = textOf(message?.text);

  // Absent means "not stated", and a deletion the server never approved is not
  // one to assume: anything but an explicit "true" is a refusal.
  const verdictAttribute = isCheck ? '@isDeletable' : '@isDeleted';
  const permitted = object[verdictAttribute] === 'true';
  const refused = !permitted || messageType === 'E';
  if (!refused) return null;

  const name =
    typeof object['@name'] === 'string' ? object['@name'] : '(unnamed object)';
  const references =
    isCheck &&
    (object['@externalStrongReferences'] || object['@externalWeakReferences'])
      ? `${object['@externalStrongReferences'] ?? 0} strong and ${object['@externalWeakReferences'] ?? 0} weak external references`
      : undefined;
  const reason = messageText || references || 'the server did not say why';

  return {
    form: 'deletion',
    message: `ADT refuses to delete ${name}: ${reason}`,
    messages: message
      ? [{ type: messageType || 'E', text: messageText || reason }]
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Form 3 — check runs: the status attribute, then the messages
// ---------------------------------------------------------------------------

/**
 * `chkrun:checkRunReports`, what `POST /checkruns` answers.
 *
 * Fixtures: `refusal-check-nonexistent-object` (200,
 * `status="notProcessed"`), `refusal-syntax-check` (200,
 * `status="processed"` plus a `checkMessage` of type `E`), and
 * `check-success-verdict` (200, `status="processed"`, no messages).
 *
 * **Two decisions out of one document, and the order matters.** A check that
 * never ran carries no message list at all, so a rule that only looks for a
 * message of type `E` calls a missing object a clean check. The status is read
 * first, and only a report that says `processed` is worth inspecting for
 * messages. This is the single form of the four where "a message of type E" is
 * the correct test, and it is only correct second.
 *
 * **The echo.** adt-clients measured that SAP sometimes repeats `statusText` as
 * a message of type `E` on a report that passed — "Object Z has been checked" —
 * and filters it by comparing the text. That case is absent from the corpus, so
 * the rule is adopted from their measurement rather than confirmed here; it can
 * only ever suppress a message identical to the status line.
 */
export function readCheckRunRefusal(document: unknown): AdtRefusal | null {
  const parsed = parseXml(document);
  const report = parsed?.checkRunReports?.checkReport ?? parsed?.checkReport;
  if (!report) return null;

  const status = String(report['@status'] ?? '');
  const statusText = String(report['@statusText'] ?? '');

  const messages: AdtMessage[] = asArray(
    report.checkMessageList?.checkMessage,
  ).map((msg: any) => ({
    type: String(msg?.['@type'] ?? 'I'),
    text:
      textOf(msg?.['@shortText']) || textOf(msg?.shortText) || 'check message',
    code: msg?.['@code'] !== undefined ? String(msg['@code']) : undefined,
  }));

  if (status !== 'processed') {
    return {
      form: 'checkrun',
      message:
        statusText || `Check did not run (status: ${status || 'unstated'})`,
      messages,
    };
  }

  const errors = messages.filter(
    (m) =>
      m.type.toUpperCase() === 'E' &&
      m.text.trim().toLowerCase() !== statusText.trim().toLowerCase(),
  );
  if (errors.length === 0) return null;

  return {
    form: 'checkrun',
    message: errors.map((m) => m.text).join('; '),
    messages,
  };
}

// ---------------------------------------------------------------------------
// Form 4 — the one no reading can decide
// ---------------------------------------------------------------------------

/**
 * The package walkers answer an empty body, and it means two different things.
 *
 * Fixtures: `refusal-package-not-found-contents-empty`,
 * `-objectslist-empty` and `-hierarchy-direct` — a package that does not exist —
 * against `read-empty-package-contents`, a package that exists and holds
 * nothing. HTTP 200, no content-type, zero bytes, **the same sha256**. Only the
 * request differs.
 *
 * So there is no strategy to choose here, and writing one would be inventing a
 * signal. A handler that has not asked whether the package exists cannot report
 * "empty", and `GetPackageTree` is the one that already pays that round trip.
 *
 * This function exists so that the absence is stated in code rather than left
 * as a gap: it says the answer is indeterminate, and a caller that has done the
 * pre-check may disregard it.
 */
export function isIndeterminateWalkAnswer(document: unknown): boolean {
  return document === '' || document === undefined || document === null;
}

// ---------------------------------------------------------------------------
// One entry point
// ---------------------------------------------------------------------------

/**
 * Read whichever of the four forms this document is.
 *
 * Dispatches on the root element, so a reader is never handed a document it was
 * not written for — the failure mode that makes `deletionRefusal` report every
 * successful delete as refused when it meets a `deletionResult`.
 *
 * Returns `null` for a document that is not a refusal **and** for one that is
 * none of the four forms. Those two are not the same thing, and a caller that
 * needs to tell them apart should call the specific reader.
 */
export function readAdtRefusal(document: unknown): AdtRefusal | null {
  return (
    readExceptionRefusal(document) ??
    readActivationRefusal(document) ??
    readDeletionRefusal(document) ??
    readCheckRunRefusal(document)
  );
}
