/**
 * How a handler answers.
 *
 * adt-clients 18 hands back `IAdtResponse`, whose two type parameters are the two
 * injected strategies. Turning either half into an MCP result is this file's job, and
 * only this file's: a handler that did it itself would repeat four lines per tool and
 * throw away everything the error contract carries.
 *
 * See docs/superpowers/specs/2026-09-08-result-error-strategies-design.md.
 */
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AnswerDetail } from './strategies/projections';
import { safeCleanup, safeRequest } from './strategies/safeFields';

export type { AnswerDetail };

export interface AnswerContext {
  /** The tool's own name, so a local failure can say where it happened. */
  tool: string;
  detail: AnswerDetail;
}

export interface McpResult {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

function text(value: string, isError = false): McpResult {
  return { isError, content: [{ type: 'text', text: value }] };
}

function json(payload: unknown, isError = false): McpResult {
  return text(JSON.stringify(payload, null, 2), isError);
}

/**
 * A failure of our own reading, which never borrows an `AdtFailureOrigin`:
 * `connection` and `refusal` are both claims about the server, and neither is true
 * when the defect is in this process.
 */
function local(
  kind: string,
  ctx: AnswerContext,
  message: string,
  thrown?: unknown,
): McpResult {
  const payload: Record<string, unknown> = {
    error: kind,
    tool: ctx.tool,
    detail: ctx.detail,
    message,
  };

  // A lock left held is a fact about SAP, not about the throw, and it must
  // survive it. Read structurally rather than by `instanceof`, so an error
  // built against a second copy of the module still renders.
  const cleanup = safeCleanup(
    (thrown as { cleanup?: unknown } | undefined)?.cleanup,
  );
  if (cleanup !== undefined) payload.cleanup = cleanup;
  if (
    (thrown as { operation?: unknown } | undefined)?.operation === 'succeeded'
  ) {
    payload.operation = 'succeeded';
  }

  return json(payload, true);
}

/**
 * What an error strategy may add beyond `IAdtError`.
 *
 * `messages` is the one shape every refusal in the corpus reduces to: a
 * severity and a sentence, plus whatever identity the carrier happened to keep.
 * See `@mcp-abap-adt/adt-strategies` and `tests/fixtures/adt/README.md`.
 */
interface MessageCarrier {
  messages?: ReadonlyArray<{
    type: string;
    text: string;
    code?: string;
    t100?: { id: string; no: string; values?: ReadonlyArray<string> };
    line?: string;
    uri?: string;
  }>;
}

/**
 * The allowlist.
 *
 * `response` is never serialised: it holds headers, cookies and possibly
 * circular references, and its body is reachable as `raw_body` at
 * `detail: 'raw'`.
 */
function failurePayload(
  error: IAdtError & MessageCarrier,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    message: error.message,
    origin: error.origin,
  };
  if (error.code !== undefined) payload.code = error.code;
  if (error.adtType !== undefined) payload.adt_type = error.adtType;
  if (error.namespace !== undefined) payload.namespace = error.namespace;

  // Two fields, copied by name — not the object. The rule lives in
  // `safeFields.ts` because `withLock` needs the same one for its carrier.
  const request = safeRequest(error.request);
  if (request !== undefined) payload.request = request;

  // What a failed release left behind, and whether the operation itself
  // landed. Both are facts no strategy judged, so they are added beside the
  // failure rather than folded into its message.
  const cleanup = safeCleanup((error as { cleanup?: unknown }).cleanup);
  if (cleanup !== undefined) payload.cleanup = cleanup;
  if ((error as { operation?: unknown }).operation === 'succeeded') {
    payload.operation = 'succeeded';
  }

  // Messages are rebuilt field by field for the same reason `request` is. The
  // T100 key travels with them: the message class, its number and the values
  // substituted into the sentence are the only thing in the corpus a caller can
  // match on without reading English, and `no` stays the zero-padded string SAP
  // sent — SADT_RESOURCE/26 is a key no system knows.
  if (error.messages !== undefined) {
    payload.messages = error.messages.map((m) => {
      const out: Record<string, unknown> = { type: m.type, text: m.text };
      if (m.code !== undefined) out.code = m.code;
      if (m.line !== undefined) out.line = m.line;
      if (m.uri !== undefined) out.uri = m.uri;
      if (m.t100 !== undefined) {
        const t100: Record<string, unknown> = {
          id: m.t100.id,
          no: String(m.t100.no),
        };
        if (m.t100.values !== undefined) t100.values = m.t100.values;
        out.t100 = t100;
      }
      return out;
    });
  }

  // Whatever `detail` says. It is a parameter of the RESULT projection, and a
  // failure is not a projection: on this path the consumer wants everything,
  // and gating the one field that carries everything behind a parameter that
  // shapes successes hid it exactly where it was the point.
  //
  // The empty string is not a document — emitting `raw_body: ""` would read as
  // "SAP sent an empty body" when nothing was sent at all.
  const body = (error.response as { data?: unknown } | undefined)?.data;
  if (typeof body === 'string' && body !== '') {
    payload.raw_body = body;
  }
  return payload;
}

export function return_answer<T>(
  answer: IAdtResponse<T, IAdtError>,
  project: (value: T) => unknown,
  ctx: AnswerContext,
): McpResult {
  if (!answer.ok) {
    return json(
      failurePayload(answer.getError() as IAdtError & MessageCarrier),
      true,
    );
  }

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
  const cleanup = safeCleanup(
    (answer as { cleanup?: unknown } | undefined)?.cleanup,
  );
  if (cleanup !== undefined) {
    return json(
      typeof projected === 'string'
        ? { result: projected, cleanup }
        : { ...(projected as Record<string, unknown>), cleanup },
    );
  }

  return typeof projected === 'string' ? text(projected) : json(projected);
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
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
export async function answer<T>(
  ctx: AnswerContext,
  call: () => Promise<IAdtResponse<T, IAdtError>>,
  project: (value: T) => unknown,
): Promise<McpResult> {
  let response: IAdtResponse<T, IAdtError>;
  try {
    response = await call();
  } catch (thrown) {
    return local('client_threw', ctx, messageOf(thrown), thrown);
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
