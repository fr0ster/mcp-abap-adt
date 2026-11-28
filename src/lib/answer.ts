/**
 * How a handler answers.
 *
 * adt-clients 18 hands back `IAdtResponse`, whose two type parameters are the two
 * injected strategies. Turning either half into an MCP result is this file's job, and
 * only this file's: a handler that did it itself would repeat four lines per tool and
 * throw away everything the error contract carries.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import {
  ADT_CONNECTION_CAUSES,
  ADT_NO_FAILURE,
  type IAdtError,
  type IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';
import { readAdtFailureInCall } from './adtFailureReading';
import type { IAnswerSerializer } from './answerSerializer';
import {
  answerRead,
  failurePayload as chainFailurePayload,
  type FailureAnswer,
} from './auth/answerFailure';
import { failureOf } from './auth/failures';
import { callTransportRequest } from './callTransport';
import {
  type AnswerObject,
  type AnswerValue,
  type JsonValue,
  jsonOrText,
  parseJson,
} from './json';
import type { SourcePosition } from './sourceHref';
import type { AnswerDetail } from './strategies/projections';
import {
  type FailedRequest,
  safeCleanup,
  safeRequest,
  thrownCleanup,
} from './strategies/safeFields';
import { methodFailureOf, stepOf, withStep } from './strategies/step';
import { cleanupOf, type StepError } from './strategies/stepResponse';
import {
  isSystemContextRefusal,
  SystemContextMissingError,
} from './systemContextGuard';
import { child, isElement } from './thrownValue';
import { wireResponseOf } from './wireResponse';
import { wireValueOf } from './wireValue';

export type { AnswerDetail };

export interface AnswerContext {
  /** The tool's own name, so a local failure can say where it happened. */
  tool: string;
  detail: AnswerDetail;
  /**
   * Facts the handler states beside its answer, success or failure alike,
   * read once the call is done (the definition SAP stored, read by the wait
   * after a write): their fields ride along the way `cleanup` does. A
   * `string` answer becomes `{ result, … }`. `undefined`: nothing to add.
   */
  beside?: () => AnswerObject | undefined;
}

/** `payload` with the context's facts beside it (`AnswerContext.beside`). */
function withBeside(
  payload: AnswerObject,
  ctx: AnswerContext | undefined,
): AnswerObject {
  const beside = ctx?.beside?.();
  return beside === undefined ? payload : { ...payload, ...beside };
}

export type McpResult = {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
};

/**
 * An answer whose content is a value, not text: the registration serialises
 * each `json` item to text (`normalizeToolContent`).
 */
export type JsonAnswer = {
  isError: boolean;
  content: Array<{ type: 'json'; json: JsonValue }>;
};

/**
 * An answer's payload, every content part of it: one part its JSON, else
 * its text; several parts, each so, in order — no part left out.
 */
export function answerPayload(result: McpResult): JsonValue {
  const parts = result.content.map((part) => jsonOrText(part.text));
  return parts.length === 1 ? (parts[0] ?? null) : parts;
}

/** One answer of a list call, as its JSON entry is written: its payload whole. */
export interface ListedAnswer {
  readonly isError: boolean;
  readonly answer: JsonValue;
  readonly i: number;
}

/** A list call's answer as its JSON entry reads it. */
export function listedAnswer(result: McpResult, i: number): ListedAnswer {
  return { isError: result.isError, answer: answerPayload(result), i };
}

function text(value: string, isError = false): McpResult {
  return { isError, content: [{ type: 'text', text: value }] };
}

/** A value as an answer's JSON text. */
const answers: IAnswerSerializer<McpResult> = {
  json<P>(payload: P, isError = false): McpResult {
    return text(JSON.stringify(payload), isError);
  },
};

/** A failure's payload as its answer: `isError` always. */
const failures: IAnswerSerializer<FailureAnswer> = {
  json<P>(payload: P): FailureAnswer {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    };
  },
};

/**
 * A failure of our own reading, which never borrows an `AdtFailureOrigin`:
 * `connection` and `refusal` are both claims about the server, and neither is true
 * when the defect is in this process.
 */
/**
 * What names a connection failure on an answer (#394): `connection_cause`
 * (the network code), `session_error` (the connection's session error) and
 * `session_lost` (SAP answered on a replaced session) — so a model and a test
 * tell a network drop, a lost session and SAP's refusal apart without reading
 * words. Only a listed code is kept: never a message, an address or a URL.
 */
interface ConnectionFacts {
  connection_cause?: string;
  session_error?: string;
  session_lost?: string;
}

const SESSION_ERRORS: readonly string[] = Object.values(ADT_SESSION_ERROR);

/** The connection facts an `IAdtError` states, as its fields type them. */
function connectionFactsOfError(error: IAdtError): ConnectionFacts {
  return {
    ...(error.connectionCause !== undefined && {
      connection_cause: error.connectionCause,
    }),
    ...(error.sessionError !== undefined && {
      session_error: error.sessionError,
    }),
    ...(error.sessionLost !== undefined && {
      session_lost: error.sessionLost,
    }),
  };
}

/** A member of a thrown value, read guarded: a throwing getter is absent. */
function guardedChild(thrown: unknown, name: string): unknown {
  try {
    return child(thrown, name);
  } catch {
    return undefined;
  }
}

/**
 * The connection facts a thrown value carries: its `code` when it is a listed
 * network code or session error, its `sessionLost` when it is a listed
 * session error. A value from outside the type system, read guarded.
 */
function connectionFactsOfThrown(thrown: unknown): ConnectionFacts {
  const code = guardedChild(thrown, 'code');
  const lost = guardedChild(thrown, 'sessionLost');
  const cause = ADT_CONNECTION_CAUSES.find((listed) => listed === code);
  const session = SESSION_ERRORS.find((listed) => listed === code);
  const replaced = SESSION_ERRORS.find((listed) => listed === lost);
  return {
    ...(cause !== undefined && { connection_cause: cause }),
    ...(session !== undefined && { session_error: session }),
    ...(replaced !== undefined && { session_lost: replaced }),
  };
}

function local(
  kind: string,
  ctx: AnswerContext,
  message: string,
  thrown?: unknown,
): FailureAnswer {
  const payload: { [key: string]: AnswerValue } = {
    error: kind,
    tool: ctx.tool,
    detail: ctx.detail,
    message,
    ...connectionFactsOfThrown(thrown),
  };

  // A lock left held is a fact about SAP, not about the throw, and it must
  // survive it. Read structurally rather than by `instanceof`, so an error
  // built against a second copy of the module still renders.
  const cleanup = thrownCleanup(child(thrown, 'cleanup'));
  if (cleanup !== undefined) payload.cleanup = cleanup;
  if (child(thrown, 'operation') === 'succeeded') {
    payload.operation = 'succeeded';
  }
  // The step the handler was doing when it threw (`atStep`).
  const step = stepOf(thrown);
  if (step !== undefined) payload.step = step;

  return failures.json(withBeside(payload, ctx));
}

/**
 * What an error strategy may add beyond `IAdtError`.
 *
 * `messages` is the one shape every refusal in the corpus reduces to: a
 * severity and a sentence, plus whatever identity the carrier happened to keep.
 * See `@mcp-abap-adt/adt-strategies` and `tests/fixtures/adt/README.md`.
 */
interface MessageCarrier {
  /**
   * What an activation left inactive — `IAdtActivationFailure.stillInactive`
   * of `@mcp-abap-adt/adt-strategies` (0.22.0): the objects SAP listed
   * (`ioc:inactiveObjects`), or the ones the inactive list read after a
   * silent checklist still names (fr0ster/mcp-abap-adt#351).
   */
  stillInactive?: ReadonlyArray<{
    uri: string;
    type: string;
    name: string;
    parentUri?: string;
  }>;
  messages?: ReadonlyArray<{
    type: string;
    text: string;
    code?: string;
    t100?: { id: string; no: string; values?: ReadonlyArray<string> };
    uri?: string;
    /** The object an activation run's message is about (`objName`). */
    objectName?: string;
    /** `objDescr`: the object, and its part, as SAP describes it. */
    object?: string;
    /** Where the message stands in its source (`#start=` of its href). */
    position?: SourcePosition;
    /** The source an activation run's message's href names. */
    source_uri?: string;
    /** A strategy's deprecated `line`: not read — the answer's comes from `position`. */
    line?: string;
  }>;
}

/** A message's position, rebuilt field by field as the message is. */
function positionValue(position: SourcePosition): AnswerValue {
  const out: { [key: string]: AnswerValue } = {
    line: position.line,
    column: position.column,
  };
  if (position.end !== undefined) {
    out.end = { line: position.end.line, column: position.end.column };
  }
  return out;
}

/** The fixed words of the hint beside `CTS_WBO_API` 019. */
export const TRANSPORT_HINT_WORDS =
  'SAP answered that the object is already locked in this transport request: pass it as transport_request and call again.';

/**
 * The fixed words of the hint beside `CTS_WBO_API` 020: the call passed a
 * task, and SAP names the request that holds the object.
 */
export const TRANSPORT_HINT_WORDS_020 =
  'SAP names the transport request that holds the object: pass that request as transport_request and call again.';

/** The `CTS_WBO_API` numbers that name a request to pass, each with its words. */
const TRANSPORT_HINTS: ReadonlyMap<string, string> = new Map([
  ['019', TRANSPORT_HINT_WORDS],
  ['020', TRANSPORT_HINT_WORDS_020],
]);

/**
 * A transport request number: three letters or digits of the system, `K`, six
 * digits. Read by plain code, not a pattern.
 */
function isRequestNumber(value: string): boolean {
  if (value.length !== 10) return false;
  for (let i = 0; i < 3; i += 1) {
    const c = value.charAt(i);
    const letter = c >= 'A' && c <= 'Z';
    const digit = c >= '0' && c <= '9';
    if (!letter && !digit) return false;
  }
  if (value[3] !== 'K') return false;
  for (let i = 4; i < 10; i += 1) {
    const c = value.charAt(i);
    if (c < '0' || c > '9') return false;
  }
  return true;
}

/**
 * The fixed words when SAP names the very request the call sent: passing it
 * again changes nothing (a deleted object's entry still recorded there makes
 * a re-create answer `CTS_WBO_API` 019 even with that request).
 */
export const TRANSPORT_ENTRY_HELD_WORDS =
  "SAP names the transport request this call already passed: the object's entry is still in that request (a deleted object's entry, say), and passing the same request again does not help. Deal with the entry first — remove the object from the request with the request's tools — then call again.";

/**
 * The request the failed call sent: the one `corrNr` of its URL, as the
 * client wrote it. Read by `URLSearchParams` over the text after the first
 * `?`; none, or more than one, is no request.
 */
export function attemptedRequest(
  request: FailedRequest | undefined,
): string | undefined {
  const url = safeRequest(request)?.url;
  if (url === undefined) return undefined;
  const at = url.indexOf('?');
  if (at < 0) return undefined;
  const sent = new URLSearchParams(url.slice(at + 1)).getAll('corrNr');
  return sent.length === 1 && sent[0] !== '' ? sent[0] : undefined;
}

/**
 * What to pass when SAP refused a write because the object is already
 * recorded in a request (`CTS_WBO_API` 019, "already locked in request …";
 * 020, the same when a task was passed, naming the task's request;
 * fr0ster/mcp-abap-adt#314). Nothing is resent; the caller decides.
 *
 * The number is taken from the message's T100 values by its shape, so the
 * values' order and the language of the text decide nothing. A message
 * holding no value of that shape gives no hint.
 *
 * **Only a request the call did not send is offered.** When SAP names the
 * request the call sent (`attempted`: the call's `transport_request` and
 * the `corrNr` of its URL), the hint is
 * `TRANSPORT_ENTRY_HELD_WORDS` alone, with no `transport_request`: the same
 * call again would be refused the same way.
 */
export function transportHint(
  messages: MessageCarrier['messages'],
  attempted: ReadonlyArray<string | undefined> = [],
): { transport_request?: string; text: string } | undefined {
  for (const m of messages ?? []) {
    const t100 = m.t100;
    if (t100 === undefined || t100.id !== 'CTS_WBO_API') continue;
    const no = String(t100.no).padStart(3, '0');
    const words = TRANSPORT_HINTS.get(no);
    if (words === undefined) continue;
    const request = (t100.values ?? []).find(isRequestNumber);
    if (request === undefined) continue;
    if (attempted.some((sent) => sent?.trim().toUpperCase() === request)) {
      return { text: TRANSPORT_ENTRY_HELD_WORDS };
    }
    return { transport_request: request, text: words };
  }
  return undefined;
}

/**
 * The allowlist.
 *
 * `response` is never serialised: it holds headers, cookies and possibly
 * circular references, and its body is reachable as `raw_body` at
 * `detail: 'raw'`.
 */
export function failurePayload(
  error: StepError & MessageCarrier,
  detail?: AnswerDetail,
): FailureEntry {
  const payload: { [key: string]: AnswerValue } = {
    message: error.message,
    origin: error.origin,
  };
  // Where the error arose, added by the handler (`atStep`) — beside the
  // method's error, never in place of any of it.
  const step = stepOf(error);
  if (step !== undefined) payload.step = step;
  // The status SAP answered with, when SAP answered: what tells a refusal by
  // SAP from a failure with no answer behind it (no status, no `raw_body`).
  const status = error.response?.status;
  if (typeof status === 'number') payload.status = status;
  if (error.code !== undefined) payload.code = error.code;
  Object.assign(payload, connectionFactsOfError(error));
  if (error.adtType !== undefined) payload.adt_type = error.adtType;
  if (error.namespace !== undefined) payload.namespace = error.namespace;

  // Two fields, copied by name — not the object. The rule lives in
  // `safeFields.ts` because `withLock` needs the same one for its carrier.
  const request = safeRequest(error.request);
  if (request !== undefined) payload.request = request;

  // What a failed release left behind, and whether the operation itself
  // landed. Both are facts no strategy judged, so they are added beside the
  // failure rather than folded into its message.
  const cleanup = safeCleanup(error.cleanup);
  if (cleanup !== undefined) payload.cleanup = cleanup;
  if (error.operation === 'succeeded') {
    payload.operation = 'succeeded';
  }

  // Messages are rebuilt field by field for the same reason `request` is. The
  // T100 key travels with them: the message class, its number and the values
  // substituted into the sentence are the only thing in the corpus a caller can
  // match on without reading English, and `no` stays the zero-padded string SAP
  // sent — SADT_RESOURCE/26 is a key no system knows.
  //
  // Where each message stands is the message's own: the strategy states its
  // `object` (`objDescr`), `uri` and `position` (its href's `#start=`), and
  // an activation run's message its `source_uri` (adt-strategies 0.23.2,
  // `activationMessagesOf`). `line` is answered deprecated as the source
  // line of `position` (`String(position.line)`), absent without one; a
  // strategy's own `line` is not read.
  if (error.messages !== undefined) {
    payload.messages = error.messages.map((m) => {
      const out: { [key: string]: AnswerValue } = {
        type: m.type,
        text: m.text,
      };
      if (m.object !== undefined) out.object = m.object;
      if (m.uri !== undefined) out.uri = m.uri;
      if (m.source_uri !== undefined) out.source_uri = m.source_uri;
      if (m.position !== undefined) {
        out.position = positionValue(m.position);
        // Deprecated (24.0.1): the source line as text, kept for a reader
        // of `line`; `position.line` is the field to read.
        out.line = String(m.position.line);
      }
      if (m.code !== undefined) out.code = m.code;
      if (m.objectName !== undefined) out.objectName = m.objectName;
      if (m.t100 !== undefined) {
        const t100: { [key: string]: AnswerValue } = {
          id: m.t100.id,
          no: String(m.t100.no),
        };
        if (m.t100.values !== undefined) t100.values = m.t100.values;
        out.t100 = t100;
      }
      return out;
    });
    // What the call sent: its own argument, and the `corrNr` of the failed
    // request's URL — either one naming SAP's request means a resend of it
    // would not help.
    const hint = transportHint(error.messages, [
      callTransportRequest(),
      attemptedRequest(error.request),
    ]);
    if (hint !== undefined) payload.hint = hint;
  }

  // What an activation left inactive, field by field like the messages: the
  // objects a caller names in its next call (activating them again with
  // `preaudit: false`, or in a group).
  if (error.stillInactive !== undefined && error.stillInactive.length > 0) {
    payload.still_inactive = error.stillInactive.map((o) => ({
      name: o.name,
      type: o.type,
      uri: o.uri,
      ...(o.parentUri !== undefined ? { parent_uri: o.parentUri } : {}),
    }));
  }

  // SAP's body, by who said no.
  //
  // **A refusal SAP made — any status but a `2xx` — carries it whatever
  // `detail` says.** Its body is SAP's own account of the refusal (an
  // `exc:exception`, a T100 message), and the consumer wants everything on
  // this path; gating it behind a parameter that shapes successes hid it
  // exactly where it was the point.
  //
  // **A failure a strategy raised on a `2xx` carries it only with
  // `detail: 'raw'`.** SAP did not refuse: its body is an ordinary document —
  // the whole message class for a number it does not hold, 613 KB measured —
  // and the strategy's verdict (message, code, messages) already says what
  // is wrong with it. Handing the document on unasked cost a model its
  // context for a one-line answer; a caller who wants it asks for `raw`. A
  // tool without a `detail` parameter has no way to ask, and answers such a
  // failure without the body.
  //
  // The empty string is not a document — emitting `raw_body: ""` would read as
  // "SAP sent an empty body" when nothing was sent at all.
  const body = wireValueOf(error.response?.data);
  const answeredOk =
    typeof status === 'number' && status >= 200 && status < 300;
  if (
    body.kind === 'text' &&
    body.text !== '' &&
    (!answeredOk || detail === 'raw')
  ) {
    payload.raw_body = body.text;
  }
  return payload;
}

/**
 * A method's failed answer, as the consumer gets it: the method's error as it
 * is, plus the step it arose at when the handler named one. The one rendering
 * every handler shares — `return_answer` and a handler that works by throws
 * (`methodFailureOf`) alike.
 */
export function answerFailure(
  failed: IAdtError,
  ctx?: AnswerContext,
): FailureAnswer {
  const error: StepError & MessageCarrier = failed;
  // A failure that carries a refusal: answered as the chain
  // made it, never rebuilt from the error's message.
  const read = failureOf(error);
  if (read !== undefined) return answerRead(read);
  // The instance's own reading of the failure, when the call runs inside one
  // (`runWithAdtFailureReader`): stdio's `--deferred-logon` answers a request
  // that reached no answer as `no_connection`.
  const own = readAdtFailureInCall(failed);
  if (own !== undefined) return answerRead(own);
  // Refused here, before any request: not a claim about the server.
  if (ctx !== undefined && isSystemContextRefusal(error.message)) {
    return local('system_context_missing', ctx, error.message);
  }
  return failures.json(withBeside(failurePayload(error, ctx?.detail), ctx));
}

/**
 * One failure as an entry of a list — several failures in one answer (a
 * batch's items, a cleanup's steps): the payload the consumer gets for that
 * failure alone, with its step. A chain failure is its own payload,
 * never the method's message.
 */
export type FailureEntry = AnswerObject;

/** A method's failed answer as an entry: its error as it is, with the step. */
export function failureEntry(
  failed: IAdtError,
  step: string,
  detail?: AnswerDetail,
): FailureEntry {
  const read = failureOf(failed);
  if (read !== undefined) return { ...chainFailurePayload(read), step };
  return failurePayload(withStep(failed, step), detail);
}

/**
 * A throw as an entry: a carried method error as it is, a chain failure as
 * its own payload, anything else the method's own failure — `client_threw`,
 * never dressed as SAP's answer.
 */
export function thrownEntry(thrown: unknown, step: string): FailureEntry {
  const read = failureOf(thrown);
  if (read !== undefined) return { ...chainFailurePayload(read), step };
  const carried = methodFailureOf(thrown);
  if (carried !== undefined) return failureEntry(carried, step);
  return {
    error: 'client_threw',
    message: messageOf(thrown),
    ...connectionFactsOfThrown(thrown),
    step,
  };
}

/**
 * Whether a failure is a credential failure — the credentials are the same
 * for every item of a batch, so it ends the call instead of being one item's
 * answer: a chain failure (`authentication_failed`), or a `401` SAP answered.
 */
export function isCredentialFailure(thrown: unknown): boolean {
  if (failureOf(thrown)?.error === 'authentication_failed') return true;
  const carried = methodFailureOf(thrown);
  return carried?.response?.status === 401;
}

/**
 * The catch of a best-effort call (a wait for a write to be visible): a
 * credential failure is rethrown as it came — every further request would be
 * refused again, so the tool's call ends with it; anything else is dropped.
 */
export function unlessCredentialFailure(thrown: unknown): undefined {
  if (isCredentialFailure(thrown)) throw thrown;
  return undefined;
}

/** A failed payload (a delegated handler's answer) that is a credential failure. */
export function isCredentialPayload(payload: FailureEntry): boolean {
  return payload.error === 'authentication_failed' || payload.status === 401;
}

/**
 * A delegated handler's failed answer as an entry: its payload as it is,
 * with the step added unless it names one. `undefined` for a success or an
 * answer whose text is not a JSON object.
 */
export function failedPayloadOf(
  result: McpResult | undefined,
  step: string,
): FailureEntry | undefined {
  if (result?.isError !== true) return;
  const text = result.content[0]?.text;
  if (text === undefined) return;
  const payload = parseJson(text);
  if (!isElement(payload)) return;
  return 'step' in payload ? payload : { ...payload, step };
}

export function return_answer<T, R>(
  answer: IAdtResponse<T, IAdtError>,
  project: (value: T) => R,
  ctx: AnswerContext,
): McpResult {
  if (!answer.ok) return answerFailure(answer.getError(), ctx);

  const projected = project(answer.getResult().value);

  if (projected === undefined) {
    return local(
      'projection_failed',
      ctx,
      `the ${ctx.detail} projection produced no value for ${ctx.tool}`,
    );
  }

  // A lock left behind survives a success.
  //
  // `withLock` answers the body's own result when the body succeeded, even
  // if the release afterwards did not — a write that landed is not a failed
  // call, which is what these handlers said before the migration. But the
  // lock is still held and only the caller can act on it, so the note rides
  // along instead of being dropped on the floor the way the old
  // `logger.warn` dropped it.
  //
  // Shape: unchanged when there is nothing to report, which is almost
  // always. A terse write's `'SUCCESS'` is a string and has nowhere to put a
  // field, so in the rare case it becomes `{ result: 'SUCCESS', cleanup }`.
  // The context's facts (`AnswerContext.beside`) ride along the same way.
  const cleanup = safeCleanup(cleanupOf(answer));
  const beside = ctx.beside?.();
  if (cleanup !== undefined || beside !== undefined) {
    const added = { ...(cleanup !== undefined ? { cleanup } : {}), ...beside };
    return answers.json(
      typeof projected === 'string'
        ? { result: projected, ...added }
        : {
            ...(typeof projected === 'object' && projected !== null
              ? projected
              : {}),
            ...added,
          },
    );
  }

  return typeof projected === 'string'
    ? text(projected)
    : answers.json(projected);
}

/** A thrown value's words: an `Error`'s `message`, else the value written out. */
export function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * A thrown value's `message` when it carries one (an `Error`, or any object
 * with the member), written out; else the value itself written out — what
 * `error?.message ?? String(error)` read, without assuming the shape.
 */
export function messageCarriedBy(thrown: unknown): string {
  const message = child(thrown, 'message');
  return message === undefined || message === null
    ? String(thrown)
    : String(message);
}

/**
 * A throw from a handler's call, as the consumer gets it — the one rendering
 * `answer()` and a handler that works by throws share.
 */
export function answerThrown(
  thrown: unknown,
  ctx: AnswerContext,
): FailureAnswer {
  // The failure reader first: a thrown refusal is the chain's.
  const read = failureOf(thrown);
  if (read !== undefined) return answerRead(read);
  // Refused here, before any request: not a claim about the server.
  if (thrown instanceof SystemContextMissingError) {
    return local('system_context_missing', ctx, thrown.message);
  }
  return local('client_threw', ctx, messageOf(thrown), thrown);
}

/**
 * The single entry point a handler uses.
 *
 * `IAdtResponse` covers what the server said; it does not cover a throw.
 * adt-clients throws from more than its readings — argument validation,
 * unsupported-operation checks, its own invariants — and our projection can
 * throw on a shape it did not expect. Both are caught here and named apart, and
 * neither borrows an `AdtFailureOrigin`: a parser defect reported as an expired
 * session sends a caller to reauthenticate over a bug in this process.
 */
export async function answer<T, R>(
  ctx: AnswerContext,
  call: () => Promise<IAdtResponse<T, IAdtError>>,
  project: (value: T) => R,
): Promise<McpResult> {
  let response: IAdtResponse<T, IAdtError>;
  try {
    response = await call();
  } catch (thrown) {
    return answerThrown(thrown, ctx);
  }

  try {
    return return_answer(response, project, ctx);
  } catch (thrown) {
    // Deliberately broader than the projection. This catch also covers
    // getError(), building the failure payload and serialising it — everything
    // the adapter does after the call returns. Naming it projection_threw would
    // point a reader at the projection for a defect that may be in any of them.
    return local('adapter_threw', ctx, messageOf(thrown), thrown);
  }
}

/**
 * A throw caught by a handler that works by throws, as the consumer gets it:
 * a carried method error as it is with its step, a chain failure as the
 * chain made it — and anything else the method's own failure,
 * `client_threw`, never its message as bare text.
 */
export function answerCaught(thrown: unknown, ctx: AnswerContext): McpResult {
  // Only our own throws carry an error (`carryingFailure`); a chain failure
  // never does, and `answerThrown` reads it first.
  const carried = methodFailureOf(thrown);
  if (carried !== undefined) return answerFailure(carried, ctx);
  return answerThrown(thrown, ctx);
}

/** What a direct request asked: its method and its url, as sent. */
export interface SentRequest {
  method: string;
  url: string;
}

/**
 * A direct request's throw (`makeAdtRequest`, for a resource no adt-clients
 * member reads) as the method's error: read the way adt-clients reads a
 * request that threw (`recogniseFailure`) and enriched by the strategy every
 * read passes (`analyseException`) — SAP's status, `adt_type`, T100
 * `messages` and body, with the request (none named when `sent` is
 * `undefined`: a request this server did not build, a batch's envelope).
 * `undefined` for a chain failure, which its own reader answers as it came.
 */
export function requestFailureOf(
  thrown: unknown,
  sent: SentRequest | undefined,
): IAdtError | undefined {
  if (failureOf(thrown) !== undefined) return undefined;
  return requestErrorOf(thrown, sent);
}

/** A request's throw as its error, as SAP answered it; the chain is not asked. */
export function requestErrorOf(
  thrown: unknown,
  sent: SentRequest | undefined,
): IAdtError {
  const carried = child(thrown, 'message');
  const message =
    typeof carried === 'string'
      ? carried
      : typeof thrown === 'string'
        ? thrown
        : 'The request did not complete';
  // The thrown value is outside the type system: its answer is read, and one
  // that is not a wire answer is none.
  const response = wireResponseOf(child(thrown, 'response'));
  const verdict: IAdtError = {
    origin: 'connection',
    message,
    response,
    ...(sent !== undefined
      ? { request: { method: sent.method, url: sent.url } }
      : {}),
  };
  const read = analyseException(verdict, response);
  return read === ADT_NO_FAILURE ? verdict : read;
}

/**
 * A direct request's throw, answered: a chain failure as it came, anything
 * else the request's error as SAP answered it, with the step.
 */
export function answerRequestThrown(
  thrown: unknown,
  sent: SentRequest,
  step: string,
): McpResult {
  const read = failureOf(thrown);
  if (read !== undefined) return answerRead(read);
  return answerFailure(withStep(requestErrorOf(thrown, sent), step));
}

/** A direct request's throw as an entry: the chain's payload, or the request's error, with the step. */
export function requestThrownEntry(
  thrown: unknown,
  sent: SentRequest | undefined,
  step: string,
): FailureEntry {
  const read = failureOf(thrown);
  if (read !== undefined) return { ...chainFailurePayload(read), step };
  return failureEntry(requestErrorOf(thrown, sent), step);
}
