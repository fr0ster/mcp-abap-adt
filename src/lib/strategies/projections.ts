import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { attr, child, childAt, listOf, text } from '../xml/tree';
import type { AdtReading } from './reading';

/**
 * What `detail` picks out of a reading.
 *
 * **The asymmetry worth knowing is read versus write, not operation.** A read
 * is made for its payload, so terse gives the payload. A write is made to
 * change something, so when it works a short confirmation is all a caller
 * needs — and when it does not, what went wrong is the valuable half of the
 * call. So a write pairs a nearly empty projection with the fullest error
 * strategy available. The asymmetry lives here, in the projection, and not in
 * the reading.
 *
 * One parse, three answers. The parse happened once, in the strategy; `detail`
 * decides how much of it a caller sees. It never chooses a different parse.
 *
 * - **terse** — the fields a caller needs to act. The default, and the one the
 *   size budget is for.
 * - **full** — the whole parse.
 * - **raw** — the document as it arrived, which is why a reading carries it.
 */
export type AnswerDetail = 'terse' | 'full' | 'raw';

/** The shape of a terse projection: from a parse, the fields worth naming. */
export type Terse<T> = (value: T, status: number) => unknown;

/**
 * Build the projection `return_answer` calls.
 *
 * A projection that returns `undefined` is a failure, never SUCCESS — the
 * adapter cannot tell a write with nothing to add from a read that found
 * nothing. So a terse projection that has nothing to say says `'SUCCESS'`.
 */
export function project<T>(
  detail: AnswerDetail,
  terse: Terse<T>,
): (reading: AdtReading<T>) => unknown {
  return (reading) => {
    if (detail === 'raw') return reading.raw;
    if (detail === 'full') return reading.value ?? reading.raw;
    return terse(reading.value, reading.status);
  };
}

// ---------------------------------------------------------------------------
// The terse projections, one per document form. Each names fields measured
// from a fixture; see tests/fixtures/adt/README.md.
// ---------------------------------------------------------------------------

/** The attribute `name` of `node` (the reading parser groups them under `@`). */
function attrOf(node: unknown, name: string): string | undefined {
  return attr(child(node, '@'), name);
}

/** A repeatable level's first member, or the level itself when it is one. */
function first(node: unknown): unknown {
  return listOf(node)[0];
}

/** `node`'s text, `''` when it has none. */
function textOf(node: unknown): string {
  return text(node) ?? '';
}

/**
 * A write with nothing to report. A class create answers 200 with zero bytes
 * and a successful source write answers the same, so the status is the verdict.
 */
export const terseWrite: Terse<unknown> = (_value, status) =>
  status >= 200 && status < 300 ? 'SUCCESS' : undefined;

/**
 * `chkl:messages` — did the activation happen, and what was said.
 *
 * **`activated: false` on a successful answer needs a word beside it.**
 * `activationExecuted="false"` with no messages is SAP saying it had nothing
 * to activate — an object that was already active — which
 * `analyseActivation` (`@mcp-abap-adt/adt-strategies` 0.2.0) reads as the
 * success it is, against the corpus case `activation-nothing-to-activate`.
 * Left at `activated: false` alone, that answer reads to a caller as "it did
 * not work" while the tool reports no error. `nothing_to_activate` says which
 * of the two it is, and appears only in the case that was measured: the flag
 * false, and not one message of any severity to explain it.
 *
 * This field is the consumer's half and stays here: the strategy decides
 * whether the answer is a failure, and this decides how a caller reads a
 * success that says nothing was done.
 */
export const terseActivation: Terse<unknown> = (value) => {
  const root = child(value, 'chkl:messages');
  if (root) {
    const messages = listOf(child(root, 'msg')).map((m) => ({
      type: attrOf(m, 'type'),
      text: textOf(childAt(m, 'shortText', 'txt')) || attrOf(m, 'objDescr'),
    }));
    const properties = child(root, 'chkl:properties');
    const activated = attrOf(properties, 'activationExecuted') === 'true';
    return {
      activated,
      generated: attrOf(properties, 'generationExecuted') === 'true',
      ...(!activated && messages.length === 0
        ? { nothing_to_activate: true }
        : {}),
      ...(messages.length ? { messages } : {}),
    };
  }

  // `ioc:inactiveObjects` — what a function group's activate call answers
  // instead of a `chkl:messages` checklist, measured live against
  // `ActivateFunctionGroupLow` (2026-09-21). Not finding a checklist, this
  // used to answer `undefined`, which `answer.ts` turns into
  // `projection_failed`: a real, successful call reported as a broken one.
  //
  // **What it does not do is call it activated.** The document is a list of
  // objects; it contains no verdict, and an activation that failed answers
  // `200` just as this one did — that masking was the root of #154, and the
  // rule this library works by is that a status code is not a result, the
  // answer is. So this reading reports what the answer holds, the objects it
  // named, and says plainly that the answer stated no outcome.
  //
  // Evidence that it is not a failure either, from the same run: a
  // `GetInactiveObjects` read straight afterwards answered `count: 0`, so
  // the objects named here were not left inactive. That is a measurement of
  // the *system*, taken by a second request — which is exactly what
  // `activation_not_stated` tells a caller to do, and exactly what a
  // projection over one document cannot do for them.
  //
  // **And that read-back is a snapshot, not a proof.** Activation is
  // asynchronous: the work can still be running when the next request goes
  // out, so `count: 0` settled that run and `count` above zero would settle
  // nothing — it would mean "not yet" as readily as "not done". A caller who
  // needs certainty reads again; an LLM does that naturally, and a test that
  // asserts once on the first read is asserting a race.
  //
  // `ioc:object` is itself an array per entry (`[""]` on the transport-only
  // entry that opens the list, `[{ "ioc:ref": {...} }]` on an object one) —
  // `first()` un-wraps it the same way every other reading here does.
  const inactive = child(value, 'ioc:inactiveObjects');
  if (inactive) {
    const processed = listOf(child(inactive, 'ioc:entry'))
      .map((entry) => child(first(child(entry, 'ioc:object')), 'ioc:ref'))
      .filter((ref) => attrOf(ref, 'adtcore:name'))
      .map((ref) => ({
        type: attrOf(ref, 'adtcore:type') ?? '',
        name: attrOf(ref, 'adtcore:name') ?? '',
      }));
    return {
      // Deliberately not `activated`. The caller reads the state back — with
      // `GetInactiveObjects`, which answers the question this document does
      // not.
      activation_not_stated: true,
      ...(processed.length ? { objects: processed } : {}),
    };
  }

  return undefined;
};

/** `chkrun:checkRunReports` — did the check run, and what did it find. */
export const terseCheck: Terse<unknown> = (value) => {
  const report = first(
    childAt(value, 'chkrun:checkRunReports', 'chkrun:checkReport'),
  );
  if (!report) return undefined;
  const messages = listOf(
    childAt(report, 'chkrun:checkMessageList', 'chkrun:checkMessage'),
  ).map((m) => {
    const code = attrOf(m, 'chkrun:code');
    return {
      type: attrOf(m, 'chkrun:type'),
      text: attrOf(m, 'chkrun:shortText'),
      ...(code ? { code } : {}),
    };
  });
  return {
    ran: attrOf(report, 'chkrun:status') === 'processed',
    status_text: attrOf(report, 'chkrun:statusText'),
    ...(messages.length ? { messages } : {}),
  };
};

/**
 * `del:deletionResult` and `del:checkResponse` — the verdict is an attribute.
 *
 * A delete tool answers a `del:checkResponse` only when it did not send the
 * delete: the check said the object is not there (`deleteIfDeletable`). So
 * that answer says `deleted: false` beside the check's own verdict and the
 * warning that explains it.
 */
export const terseDeletion: Terse<unknown> = (value) => {
  const result =
    child(value, 'del:deletionResult') ?? child(value, 'del:checkResponse');
  const object = first(child(result, 'del:object'));
  if (!object) return undefined;
  const isDeleted = attrOf(object, 'del:isDeleted');
  return {
    ...(isDeleted !== undefined
      ? { deleted: isDeleted === 'true' }
      : {
          deleted: false,
          deletable: attrOf(object, 'del:isDeletable') === 'true',
        }),
    object: attrOf(object, 'adtcore:name'),
    ...deletionMessage(object),
  };
};

/** SAP's message on a deletion's object, when it carries text. */
function deletionMessage(object: unknown) {
  const message = first(child(object, 'del:message'));
  const said = textOf(child(message, 'del:text'));
  return said
    ? { message: { type: attrOf(message, 'del:type'), text: said } }
    : {};
}

/**
 * `del:checkResponse` alone — the deletion check's verdict: `deletable`, the
 * object, and SAP's message when it carries text (a permitted check may say
 * the object does not exist; that is SAP's answer, as it came).
 */
export const terseDeletionCheck: Terse<unknown> = (value) => {
  const object = first(childAt(value, 'del:checkResponse', 'del:object'));
  if (!object) return undefined;
  return {
    deletable: attrOf(object, 'del:isDeletable') === 'true',
    object: attrOf(object, 'adtcore:name'),
    ...deletionMessage(object),
  };
};

/**
 * The CTS transport check (`POST /cts/transportchecks`, SAP's `checkData`
 * document): `DATA/RESULT` is SAP's verdict and `DATA/MESSAGES/CTS_MESSAGE`
 * its messages, each with `SEVERITY` and `TEXT`.
 *
 * The values recorded: `S` (the check passed, `MESSAGES` empty) and `E` (it
 * refused, its reason in a `CTS_MESSAGE`). `S` answers `admissible: true`,
 * `E` `admissible: false`. Any other value is SAP's and has no recording
 * behind it, so it is answered as `result`, exactly as sent (an absent or
 * empty one as `''`), with SAP's messages and no `admissible` of ours.
 */
export const terseTransportCheck: Terse<unknown> = (value) => {
  const data = childAt(value, 'asx:abap', 'asx:values', 'DATA');
  if (!data) return undefined;
  const result = textOf(child(data, 'RESULT'));
  const messages = listOf(childAt(data, 'MESSAGES', 'CTS_MESSAGE'))
    .map((message) => ({
      type: textOf(child(message, 'SEVERITY')),
      text: textOf(child(message, 'TEXT')),
    }))
    .filter((message) => message.text !== '');
  const said = messages.length > 0 ? { messages } : {};
  if (result === 'S') return { admissible: true, ...said };
  if (result === 'E') return { admissible: false, ...said };
  return { result, ...said };
};

/** Validation: `CHECK_RESULT` means admissible, `SEVERITY` carries a verdict. */
export const terseValidation: Terse<unknown> = (value) => {
  const data = childAt(value, 'asx:abap', 'asx:values', 'DATA');
  if (!data) return undefined;
  const checkResult = child(data, 'CHECK_RESULT');
  if (checkResult !== undefined) {
    return { admissible: textOf(checkResult) === 'X' };
  }
  const severity = textOf(child(data, 'SEVERITY')).toUpperCase();
  return {
    admissible: severity === 'OK',
    ...(severity !== 'OK'
      ? { message: { type: severity, text: textOf(child(data, 'SHORT_TEXT')) } }
      : {}),
  };
};
