import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
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

function attrs(node: unknown): Record<string, string> {
  const a = (node as { '@'?: Record<string, string> } | undefined)?.['@'];
  return a && typeof a === 'object' ? a : {};
}

function first(node: unknown): unknown {
  return Array.isArray(node) ? node[0] : node;
}

function text(node: unknown): string {
  if (typeof node === 'string') return node;
  const t = (node as { '#text'?: unknown } | undefined)?.['#text'];
  return typeof t === 'string' ? t : '';
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
export const terseActivation: Terse<any> = (value) => {
  const root = value?.['chkl:messages'];
  if (root) {
    const messages = (root.msg ?? []).map((m: unknown) => ({
      type: attrs(m).type,
      text: text((m as any)?.shortText?.txt) || attrs(m).objDescr,
    }));
    const activated =
      attrs(root['chkl:properties']).activationExecuted === 'true';
    return {
      activated,
      generated: attrs(root['chkl:properties']).generationExecuted === 'true',
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
  const inactive = value?.['ioc:inactiveObjects'];
  if (inactive) {
    const entriesRaw = inactive['ioc:entry'];
    const entries = Array.isArray(entriesRaw)
      ? entriesRaw
      : entriesRaw
        ? [entriesRaw]
        : [];
    const processed = entries
      .map((entry: any) =>
        attrs((first(entry?.['ioc:object']) as any)?.['ioc:ref']),
      )
      .filter((a: Record<string, string>) => a['adtcore:name'])
      .map((a: Record<string, string>) => ({
        type: a['adtcore:type'] ?? '',
        name: a['adtcore:name'] ?? '',
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
export const terseCheck: Terse<any> = (value) => {
  const report = first(
    value?.['chkrun:checkRunReports']?.['chkrun:checkReport'],
  );
  if (!report) return undefined;
  const a = attrs(report);
  const messages = (
    report['chkrun:checkMessageList']?.['chkrun:checkMessage'] ?? []
  ).map((m: unknown) => ({
    type: attrs(m)['chkrun:type'],
    text: attrs(m)['chkrun:shortText'],
    ...(attrs(m)['chkrun:code'] ? { code: attrs(m)['chkrun:code'] } : {}),
  }));
  return {
    ran: a['chkrun:status'] === 'processed',
    status_text: a['chkrun:statusText'],
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
export const terseDeletion: Terse<any> = (value) => {
  const result = value?.['del:deletionResult'] ?? value?.['del:checkResponse'];
  const object = first(result?.['del:object']);
  if (!object) return undefined;
  const a = attrs(object);
  const message = first(object['del:message']) as
    | { 'del:text'?: unknown }
    | undefined;
  return {
    ...(a['del:isDeleted'] !== undefined
      ? { deleted: a['del:isDeleted'] === 'true' }
      : { deleted: false, deletable: a['del:isDeletable'] === 'true' }),
    object: a['adtcore:name'],
    ...(text(message?.['del:text'])
      ? {
          message: {
            type: attrs(message)['del:type'],
            text: text(message?.['del:text']),
          },
        }
      : {}),
  };
};

/** Validation: `CHECK_RESULT` means admissible, `SEVERITY` carries a verdict. */
export const terseValidation: Terse<any> = (value) => {
  const data = value?.['asx:abap']?.['asx:values']?.DATA;
  if (!data) return undefined;
  if (data.CHECK_RESULT !== undefined) {
    return { admissible: text(data.CHECK_RESULT) === 'X' };
  }
  const severity = text(data.SEVERITY).toUpperCase();
  return {
    admissible: severity === 'OK',
    ...(severity !== 'OK'
      ? { message: { type: severity, text: text(data.SHORT_TEXT) } }
      : {}),
  };
};
