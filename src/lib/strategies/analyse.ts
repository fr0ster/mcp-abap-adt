import type {
  IAdtError,
  IAdtWireResponse,
  IAnalyse,
} from '@mcp-abap-adt/interfaces';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces';
import {
  type AdtMessage,
  type AdtRefusal,
  readActivationRefusal,
  readAdtRefusal,
  readCheckRunRefusal,
  readDeletionRefusal,
  readExceptionRefusal,
  readUnitTestRefusal,
  readValidationRefusal,
} from '../adtRefusal';

/**
 * The error axis: readings, injected.
 *
 * `adtRefusal.ts` holds the readings — pure functions over a document. This
 * file is what makes them strategies: `analyse` is an option on every call, and
 * these are what gets passed.
 *
 * **Why this matters most for a write.** A create answers 200 with zero bytes
 * on a class and 201 with the whole object on a domain; either way the useful
 * information in a failed create is the refusal, not the result. The result
 * strategy for such a member can be trivial. This one cannot.
 */

/** What our strategies answer: the contract, plus the normalised messages. */
export interface IAdtMessageFailure extends IAdtError {
  readonly messages: ReadonlyArray<AdtMessage>;
}

/**
 * Turn a reading into a failure.
 *
 * `origin` is always `'refusal'`: a reading only ever sees a document, and a
 * document means SAP answered. `connection` is the library's to give, and when
 * it has given one this never runs.
 */
function asFailure(
  refusal: AdtRefusal,
  answer: IAdtWireResponse | undefined,
): IAdtMessageFailure {
  return {
    origin: 'refusal',
    message: refusal.message,
    adtType: refusal.adtType,
    namespace: refusal.namespace,
    messages: refusal.messages,
    response: answer,
    request: requestOf(answer),
  };
}

/** Method and url, copied by name. Never the object the transport held. */
function requestOf(
  answer: IAdtWireResponse | undefined,
): { method?: string; url?: string } | undefined {
  const config = (answer as { config?: { method?: unknown; url?: unknown } })
    ?.config;
  const method = typeof config?.method === 'string' ? config.method : undefined;
  const url = typeof config?.url === 'string' ? config.url : undefined;
  return method || url ? { method, url } : undefined;
}

/**
 * The library's own verdict, enriched from the document rather than replaced.
 *
 * When the status was already a failure the library has built an `IAdtError`
 * with the message. The document it came on carries more — the exception's
 * `type id`, its namespace, and the T100 key with the values substituted into
 * the sentence — and that is the only thing in the corpus a caller can match on
 * without reading English. Throwing it away because the library got there first
 * would be the whole point of injecting a strategy, missed.
 */
function enrich(
  verdict: IAdtError,
  answer: IAdtWireResponse | undefined,
): IAdtMessageFailure {
  const refusal = readExceptionRefusal(
    (answer as { data?: unknown } | undefined)?.data,
  );
  if (!refusal) {
    return { ...verdict, messages: [{ type: 'E', text: verdict.message }] };
  }
  return {
    ...verdict,
    adtType: verdict.adtType ?? refusal.adtType,
    namespace: verdict.namespace ?? refusal.namespace,
    messages: refusal.messages,
  };
}

/**
 * Build an `analyse` from a reading.
 *
 * The shape is the same for all of them, and it is three decisions:
 *
 * 1. The library already called it a failure — enrich, never discard.
 * 2. The library saw no failure and the document says otherwise — this is the
 *    HTTP-200-with-a-refusal-inside case the whole design exists for.
 * 3. Neither — `ADT_NO_FAILURE`, a verdict rather than an absence.
 */
function analyser(
  read: (document: unknown) => AdtRefusal | null,
): IAnalyse<IAdtMessageFailure> {
  return (verdict, answer) => {
    if (verdict !== ADT_NO_FAILURE) return enrich(verdict, answer);
    const refusal = read((answer as { data?: unknown } | undefined)?.data);
    return refusal ? asFailure(refusal, answer) : ADT_NO_FAILURE;
  };
}

/** `chkl:messages` — `activationExecuted="false"` or a message of type `E`. */
export const analyseActivation = analyser(readActivationRefusal);

/** `del:deletionResult` and `del:checkResponse` — the verdict is an attribute. */
export const analyseDeletion = analyser(readDeletionRefusal);

/** `chkrun:checkRunReports` — the status first, then the messages. */
export const analyseCheck = analyser(readCheckRunRefusal);

/** Name admissibility. Three families refuse with the status, two with a body. */
export const analyseValidation = analyser(readValidationRefusal);

/** `aunit:runResult` — alerts on the method that failed. */
export const analyseUnitTest = analyser(readUnitTestRefusal);

/**
 * For a member whose refusals arrive as `exc:exception` and nothing else —
 * a read, a lock, a create, a write.
 *
 * It still enriches, which is the point: the library's verdict has the
 * sentence, and the document has the identity.
 */
export const analyseException = analyser(readExceptionRefusal);

/**
 * When the form is not known in advance.
 *
 * Dispatches on the root element. Use a named reading where the form IS known:
 * a dispatcher that meets a document it does not recognise answers `null`, and
 * `null` here means "not a failure".
 */
export const analyseAny = analyser(readAdtRefusal);
