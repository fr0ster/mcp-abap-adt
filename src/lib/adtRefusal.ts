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

/**
 * One message SAP attached to its verdict, in the one shape every form reduces
 * to: **a severity and a sentence.**
 *
 * That reduction is the whole point. The forms carry wildly different amounts —
 * a T100 key and its placeholders at one end, a bare sentence in an attribute at
 * the other — but every refusal that carries anything at all carries those two.
 * A strategy can rest on them; everything else is enrichment that may be absent.
 *
 * `W` and `I` are kept, not filtered: the caller decides what a warning means.
 */
export interface AdtMessage {
  /** Normalised to a single letter: `E`, `W`, `I`, `S`. */
  readonly type: string;
  /** The sentence, as SAP rendered it. Always present. */
  readonly text: string;
  /**
   * The server's own identifier for this message, where the carrier gave one.
   * Two unrelated things wear this: an `exc:exception` names a class like
   * `ExceptionResourceNotFound`, a syntax finding names the compiler's
   * `MESSAGE(GTH)`. Neither is a T100 key.
   */
  readonly code?: string;
  /**
   * The ABAP message key, where the carrier kept it — `SADT_RESOURCE` `026`
   * with the values that were substituted into the text. Only `exc:exception`
   * has ever supplied this; the same message arriving through another carrier
   * comes as the sentence alone.
   */
  readonly t100?: {
    readonly id: string;
    readonly no: string;
    readonly values?: ReadonlyArray<string>;
  };
  readonly line?: string;
  readonly uri?: string;
}

/** SAP spells severity three ways. One letter out. */
function severity(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!s) return 'E';
  if (s.startsWith('ERROR') || s === 'E') return 'E';
  if (s.startsWith('WARN') || s === 'W') return 'W';
  if (s.startsWith('INFO') || s === 'I') return 'I';
  if (s.startsWith('SUCCESS') || s === 'S') return 'S';
  if (s === 'OK') return 'S';
  // ABAP Unit grades its alerts on its own scale.
  if (s === 'CRITICAL' || s === 'FATAL') return 'E';
  if (s === 'TOLERABLE') return 'W';
  return s;
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
  /**
   * Every message in the document, `E`, `W` and `I` alike, normalised.
   *
   * Never empty. A form that states no severity gets one inferred — an
   * `exc:exception` IS the refusal, and a check that never ran says so in its
   * status — because a caller that has to ask "did this carrier happen to
   * include a severity" is back to handling five shapes.
   */
  readonly messages: ReadonlyArray<AdtMessage>;
  /** Which form this was read from, for diagnosis. */
  readonly form:
    | 'exception'
    | 'activation'
    | 'deletion'
    | 'checkrun'
    | 'validation'
    | 'unittest';
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
  const values = [...properties.entries()]
    .filter(([key]) => /^T100KEY-V\d+$/.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
  const text =
    textOf(root.message) ||
    textOf(root.localizedMessage) ||
    'ADT refused the request';
  const adtType =
    typeof root.type?.['@id'] === 'string' ? root.type['@id'] : undefined;

  return {
    form: 'exception',
    message: text,
    adtType,
    namespace:
      typeof root.namespace?.['@id'] === 'string'
        ? root.namespace['@id']
        : undefined,
    // The severity is not in the document: an exc:exception IS the refusal and
    // the HTTP status carries the verdict. It is stated here anyway so that the
    // richest form reduces to the same {severity, text} as the poorest.
    messages: [
      {
        type: 'E',
        text,
        code: adtType,
        t100:
          id && no
            ? { id, no, values: values.length ? values : undefined }
            : undefined,
      },
    ],
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
    type: severity(msg?.['@type']),
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
    messages: [
      { type: severity(messageType || 'E'), text: messageText || reason },
    ],
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
 * **The echo, and a debt.** The rule that a message of type `E` whose text
 * equals `statusText` is not an error came from a note in adt-clients, not from
 * anything measured here. Notes in that package describe the strategies IT
 * ships; ours are injected and are ours to establish. The rule is kept because
 * it can only ever suppress a message identical to the status line, which is
 * inert when the echo does not happen — but it is unverified, and the corpus
 * needs a capture of a check that produces one before it counts as measured.
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
    // A check that never ran carries no message list at all: the reason sits in
    // an attribute and no severity is stated anywhere. One is supplied, so this
    // form reduces to {severity, text} like every other.
    const text =
      statusText || `Check did not run (status: ${status || 'unstated'})`;
    return {
      form: 'checkrun',
      message: text,
      messages: messages.length
        ? messages
        : [{ type: 'E', text, code: status }],
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
// Form 5 — validation: is the NAME admissible. Not a check run.
// ---------------------------------------------------------------------------

/**
 * Name admissibility, and nothing else.
 *
 * **`validate` is not `check`, and the two must not be read into each other.**
 * Validation asks one narrow question: *is this name admissible for an object
 * of this type in this package* — in practice, is it free and well-formed. It
 * never looks at source, and it says nothing about whether the object would be
 * correct. That is `check`'s job, at `POST /checkruns`, which is form 3 above
 * and a different document entirely.
 *
 * The endpoints say so themselves: `.../validation/objectname`, answering
 * `com.sap.adt.oo.clifname.check` and `com.sap.adt.wb.objname.check` — *name*
 * checks. An element called `CHECK_RESULT` lives in this document and belongs
 * to validation, not to a check run; the word is what made this easy to confuse
 * and is exactly why it is written down here.
 *
 * Measured on the trial system, ours rather than taken from anyone's notes, and
 * every row has a fixture:
 *
 * | family | name taken | name free |
 * |---|---|---|
 * | class | **400** `exc:exception` `InvalidClifName` | 200 `CHECK_RESULT` `X` |
 * | domain | **400** `exc:exception` `InvalidObjName` | 200 `CHECK_RESULT` `X` |
 * | table | **400** `exc:exception` `InvalidObjName` | 200 `CHECK_RESULT` `X` |
 * | DDL | **200** `SEVERITY` `ERROR` + `SHORT_TEXT` | 200 `SEVERITY` `OK` |
 * | function group | **200** `SEVERITY` `ERROR` + `SHORT_TEXT` | — |
 *
 * Three families refuse with the HTTP status and are already form 1; two answer
 * 200 with the refusal in the body. This reading covers the second kind. The
 * only refusal reason observed is "already exists", which is what a question
 * about a name can answer.
 *
 * **The discriminator is the value of `SEVERITY`, not its presence.** A free
 * DDL name answers `<SEVERITY>OK</SEVERITY>` with an empty `SHORT_TEXT`, so a
 * rule that fired on the element being there would refuse every admissible
 * name. Only `OK` and `ERROR` have been seen; anything else is treated as a
 * refusal, because a verdict this reading does not recognise is not one it may
 * report as permission to create.
 */
export function readValidationRefusal(document: unknown): AdtRefusal | null {
  const data = parseXml(document)?.abap?.values?.DATA;
  if (!data || typeof data !== 'object') return null;

  // The admissible-name answer. Present means "yes"; there is nothing to refuse.
  if (data.CHECK_RESULT !== undefined) return null;

  const rawSeverity = textOf(data.SEVERITY).toUpperCase();
  if (!rawSeverity || rawSeverity === 'OK') return null;

  const shortText = textOf(data.SHORT_TEXT);
  const longText = textOf(data.LONG_TEXT);

  return {
    form: 'validation',
    message: shortText || longText || `Validation answered ${rawSeverity}`,
    messages: [{ type: severity(rawSeverity), text: shortText || longText }],
  };
}

// ---------------------------------------------------------------------------
// Form 6 — a unit test run: alerts on the method that failed
// ---------------------------------------------------------------------------

/**
 * `aunit:runResult`, what `GET /abapunit/results/<id>` answers.
 *
 * A run is three exchanges and only the third says anything about the outcome:
 *
 * 1. `POST /abapunit/runs` answers **201 with a zero-byte body**. The run id is
 *    in the `Location` header, and nowhere else. This is why a result strategy
 *    is handed the whole answer rather than the body — here the body is empty
 *    and the answer is a header.
 * 2. `GET /abapunit/runs/<id>` answers `aunit:run` with
 *    `aunit:progress status="FINISHED"`. **It is byte-identical for a run that
 *    passed and one that failed** — it reports progress, not verdict. Reading
 *    pass/fail from it would call every completed run a success.
 * 3. `GET /abapunit/results/<id>` answers this document.
 *
 * A method that passed is a bare `testMethod`. A method that failed carries
 * `alerts`, and the alert is the same pair as everywhere else: a severity and a
 * sentence. ABAP Unit grades on its own scale — `critical`, `fatal`,
 * `tolerable` — which `severity` maps onto the usual letters.
 *
 * Fixtures: `unittest-run-passing` and `refusal-unittest-run-failing`.
 */
export function readUnitTestRefusal(document: unknown): AdtRefusal | null {
  const root = parseXml(document)?.runResult;
  if (!root) return null;

  const messages: AdtMessage[] = [];
  for (const program of asArray(root.program)) {
    for (const testClass of asArray(program?.testClasses?.testClass)) {
      for (const method of asArray(testClass?.testMethods?.testMethod)) {
        for (const alert of asArray(method?.alerts?.alert)) {
          const details = asArray(alert?.details?.detail)
            .map((d: any) => textOf(d?.['@text']))
            .filter(Boolean);
          messages.push({
            type: severity(alert?.['@severity']),
            text: textOf(alert?.title) || details[0] || 'unit test alert',
            code: textOf(alert?.['@kind']) || undefined,
            uri:
              typeof method?.['@uri'] === 'string' ? method['@uri'] : undefined,
          });
        }
      }
    }
  }

  const failures = messages.filter((m) => m.type === 'E');
  if (failures.length === 0) return null;

  return {
    form: 'unittest',
    message: failures.map((m) => m.text).join('; '),
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
    readCheckRunRefusal(document) ??
    readValidationRefusal(document) ??
    readUnitTestRefusal(document)
  );
}
