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
export function project<T, R>(
  detail: AnswerDetail,
  terse: (value: T, status: number) => R,
): (reading: AdtReading<T>) => T | string | R {
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
 * `activationExecuted="false"` with no messages answered both an object that
 * was already active and an activation that left objects inactive; the
 * member reads the inactive list after it, and `analyseActivation`
 * (`@mcp-abap-adt/adt-strategies` 0.22.0) answers it as a success only when
 * none of the objects the activation named is still listed — nothing to
 * activate (fr0ster/mcp-abap-adt#351).
 * Left at `activated: false` alone, that answer reads to a caller as "it did
 * not work" while the tool reports no error. `nothing_to_activate` says which
 * of the two it is, and appears only in the case that was measured: the flag
 * false, and not one message of any severity to explain it.
 *
 * This field is the consumer's half and stays here: the strategy decides
 * whether the answer is a failure, and this decides how a caller reads a
 * success that says nothing was done.
 */
/**
 * What a successful activation answered, by its form: `analyseActivation`
 * has refused every failure before a projection runs. Two forms succeed — the
 * checklist (`chkl:messages`), and an empty `200` (SAP_BASIS 7.40 and 751
 * activate this way: the objects are gone from the inactive list,
 * fr0ster/mcp-abap-adt#351). A form this union does not name has no
 * projection; adding one without its branch in {@link terseActivationAnswer}
 * fails the type check.
 */
export type ActivationAnswer =
  | { readonly form: 'checklist'; readonly checklist: unknown }
  | { readonly form: 'empty' };

/** The activation's answer form, read from the reading: the body is text from outside, read here. */
export function activationAnswerOf(
  reading: AdtReading<unknown>,
): ActivationAnswer | undefined {
  if (reading.raw.trim() === '') return { form: 'empty' };
  const checklist = child(reading.value, 'chkl:messages');
  return checklist ? { form: 'checklist', checklist } : undefined;
}

/** What an activation answers under terse, in this order. */
export type TerseActivationAnswer = {
  activated: boolean;
  generated?: boolean;
  nothing_to_activate?: true;
  messages?: { type: string | undefined; text: string | undefined }[];
};

/** The terse answer of each form; every form has one. */
export function terseActivationAnswer(
  answer: ActivationAnswer,
): TerseActivationAnswer {
  switch (answer.form) {
    case 'checklist': {
      const root = answer.checklist;
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
    // An empty `200`: activated, and nothing more was said.
    case 'empty':
      return { activated: true };
  }
}

/**
 * `chkl:messages` — the checklist's terse answer; any other document has none
 * (`ioc:inactiveObjects` is no success: `analyseActivation` answers it as not
 * activated before any projection runs). An activation's answer is projected
 * by {@link projectActivation}, which reads the empty `200` too.
 */
export const terseActivation: Terse<unknown> = (value) => {
  const checklist = child(value, 'chkl:messages');
  return checklist
    ? terseActivationAnswer({ form: 'checklist', checklist })
    : undefined;
};

/**
 * An activation's answer at `detail`: `raw` the document as it came (empty
 * for an empty `200`), `full` the parse (for an empty `200`, which has none,
 * its terse answer), `terse` {@link terseActivationAnswer} of its form.
 */
export function projectActivation<T>(
  detail: AnswerDetail,
): (reading: AdtReading<T>) => T | string | TerseActivationAnswer | undefined {
  return (reading) => {
    if (detail === 'raw') return reading.raw;
    const answer = activationAnswerOf(reading);
    if (detail === 'full') {
      return answer?.form === 'empty'
        ? terseActivationAnswer(answer)
        : (reading.value ?? reading.raw);
    }
    return answer === undefined ? undefined : terseActivationAnswer(answer);
  };
}

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
 * `del:deletionResult` — the verdict is an attribute. A delete tool answers
 * the delete's own document: a check that permits the delete is followed by
 * it (`deleteIfDeletable`), and a refused check is a failure, answered as one.
 */
export const terseDeletion: Terse<unknown> = (value) => {
  const object = first(childAt(value, 'del:deletionResult', 'del:object'));
  if (!object) return undefined;
  return {
    deleted: attrOf(object, 'del:isDeleted') === 'true',
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
