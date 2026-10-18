/**
 * The one way a server call reaches an adt-clients member that takes a
 * header pair (`options.headers: IAdtHeaders`): `withAdtHeaders(context,
 * operation, (headers) => member(…, { headers, … }))`.
 *
 * - The pair sent is the system's kept one (`context.adtHeaders`,
 *   `AdtHeaderPairs`), else the operation's default (`DEFAULT_ADT_HEADERS`).
 * - The format correction, the server's own: an answer `406` names the
 *   types SAP serves (`extractSupportedAccept`) — the call is made once more
 *   with them as the Accept, the Content-Type as sent; an answer `415` names
 *   the Content-Type (`extractSupportedContentType`, its first) — the call is
 *   made once more with it, the Accept as sent. The corrected pair is kept
 *   for the system. A `406`/`415` that names nothing, or names what was
 *   sent, is the call's answer; the second call's answer is the call's
 *   answer, whatever it is.
 * - Inside an internal batch phase (`runPhase`) the phase corrects: right
 *   after its envelope answered, the parts SAP answered `406`/`415` are
 *   recorded again in one envelope of their own, each by this same call with
 *   the corrected pair (`correctPhaseParts`, `src/lib/batch/phases.ts`).
 * - Inside a call recorded in batch mode (`BatchBegin` … `BatchEnd`) the call
 *   is made once: a `406`/`415` part is that call's answer.
 */
import {
  extractSupportedAccept,
  extractSupportedContentType,
} from '@mcp-abap-adt/adt-clients';
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import type { AdtHeaderPort } from './AdtHeaderPairs';
import { type AdtOperation, DEFAULT_ADT_HEADERS } from './defaultPairs';
import { adtCallScope, type HeaderInvocation } from './scope';

const NOT_ACCEPTABLE = 406;
const UNSUPPORTED_MEDIA_TYPE = 415;

/** What `withAdtHeaders` reads of a call's context. */
export interface AdtHeadersContext {
  adtHeaders?: AdtHeaderPort;
}

/** `value[key]`, a throwing getter read as absent. */
function readSafely(value: unknown, key: string): unknown {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return undefined;
  }
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * The corrected pair for a failure (`406` or `415`) of a request sent with
 * `sent`; `undefined` when the failure is neither, names nothing, or names
 * what was sent.
 */
export function correctedPair(
  failure: unknown,
  sent: IAdtHeaders,
): IAdtHeaders | undefined {
  const status = readSafely(readSafely(failure, 'response'), 'status');
  if (status === NOT_ACCEPTABLE) {
    let types: string[];
    try {
      types = extractSupportedAccept(failure);
    } catch {
      return undefined;
    }
    if (types.length === 0) return undefined;
    const accept = types.join(', ');
    if (accept === sent.accept) return undefined;
    return { accept, contentType: sent.contentType };
  }
  if (status === UNSUPPORTED_MEDIA_TYPE) {
    let types: string[];
    try {
      types = extractSupportedContentType(failure);
    } catch {
      return undefined;
    }
    const contentType = types[0];
    if (contentType === undefined || contentType === sent.contentType) {
      return undefined;
    }
    return { accept: sent.accept, contentType };
  }
  return undefined;
}

/**
 * The failure a member's answer carries (`ok: false`, `getError()`), else
 * `undefined`.
 */
function failureOfAnswer(answer: unknown): unknown {
  if (readSafely(answer, 'ok') !== false) return undefined;
  const getError = readSafely(answer, 'getError');
  if (typeof getError !== 'function') return undefined;
  try {
    return getError.call(answer);
  } catch {
    return undefined;
  }
}

/** The failure of a settled call: its answer's, or what it threw. */
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function failureOf<T>(settled: Settled<T>): unknown {
  return settled.ok ? failureOfAnswer(settled.value) : settled.error;
}

async function settle<T>(work: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, error };
  }
}

function unwrap<T>(settled: Settled<T>): T {
  if (settled.ok) return settled.value;
  throw settled.error;
}

/**
 * `call` with the pair of `operation` for the call's system, corrected once
 * on a `406`/`415` (see the file header).
 */
export async function withAdtHeaders<T>(
  context: AdtHeadersContext,
  operation: AdtOperation,
  call: (headers: IAdtHeaders) => Promise<T>,
): Promise<T> {
  const port = context.adtHeaders;
  const headers = port?.pairFor(operation) ?? DEFAULT_ADT_HEADERS[operation];
  const scope = adtCallScope.getStore();
  if (scope?.recorded === true) return call(headers);
  if (scope?.phase !== undefined) {
    const invocation: HeaderInvocation = {
      operation,
      sent: headers,
      port,
      call: (pair) => call(pair),
      parts: 0,
      redone: undefined,
    };
    const first = await settle(() =>
      adtCallScope.run({ ...scope, invocation }, () => call(headers)),
    );
    // The phase recorded it again with the corrected pair: that is the
    // call's answer.
    if (invocation.redone !== undefined) {
      return (await invocation.redone) as T;
    }
    // Recorded nothing in the phase (sent on another connection): corrected
    // here, as outside a phase.
    if (invocation.parts === 0)
      return correctOnce(port, operation, headers, first, call);
    return unwrap(first);
  }
  const first = await settle(() => call(headers));
  return correctOnce(port, operation, headers, first, call);
}

async function correctOnce<T>(
  port: AdtHeaderPort | undefined,
  operation: AdtOperation,
  sent: IAdtHeaders,
  first: Settled<T>,
  call: (headers: IAdtHeaders) => Promise<T>,
): Promise<T> {
  const corrected = correctedPair(failureOf(first), sent);
  if (corrected === undefined) return unwrap(first);
  port?.remember(operation, corrected);
  return call(corrected);
}

/**
 * The header pairs a value carries as a call's context (`adtHeaders`), read
 * safely: what a debug session bound to a call's context sends with.
 */
export function adtHeadersOf(origin: unknown): AdtHeadersContext {
  const port = readSafely(origin, 'adtHeaders') as AdtHeaderPort | undefined;
  return port === undefined ? {} : { adtHeaders: port };
}
