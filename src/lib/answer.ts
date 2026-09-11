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
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';

export type AnswerDetail = 'terse' | 'full' | 'raw';

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
function local(kind: string, ctx: AnswerContext, message: string): McpResult {
  return json(
    { error: kind, tool: ctx.tool, detail: ctx.detail, message },
    true,
  );
}

/**
 * What an error strategy may add beyond `IAdtError`.
 *
 * `messages` is the one shape every refusal in the corpus reduces to: a
 * severity and a sentence, plus whatever identity the carrier happened to keep.
 * See `src/lib/adtRefusal.ts` and `tests/fixtures/adt/README.md`.
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
  ctx: AnswerContext,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    message: error.message,
    origin: error.origin,
  };
  if (error.code !== undefined) payload.code = error.code;
  if (error.adtType !== undefined) payload.adt_type = error.adtType;
  if (error.namespace !== undefined) payload.namespace = error.namespace;

  // Two fields, copied by name — not the object. The contract types `request`
  // as `{ method?, url? }`, but a type is not a filter: TypeScript accepts a
  // wider object structurally, and a strategy that put its transport config
  // here would send headers, an Authorization bearer and cookies straight to
  // the model. This is the same leak `response` is kept out of the payload for.
  const method = error.request?.method;
  const url = error.request?.url;
  if (typeof method === 'string' || typeof url === 'string') {
    const request: Record<string, string> = {};
    if (typeof method === 'string') request.method = method;
    if (typeof url === 'string') request.url = url;
    payload.request = request;
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

  const body = (error.response as { data?: unknown } | undefined)?.data;
  if (ctx.detail === 'raw' && typeof body === 'string') {
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
      failurePayload(answer.getError() as IAdtError & MessageCarrier, ctx),
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
    return local('client_threw', ctx, messageOf(thrown));
  }

  try {
    return return_answer(response, project, ctx);
  } catch (thrown) {
    // Deliberately broader than the projection. This catch also covers
    // getError(), building the failure payload and serialising it — everything
    // the adapter does after the call returns. Naming it projection_threw would
    // point a reader at the projection for a defect that may be in any of them.
    return local('adapter_threw', ctx, messageOf(thrown));
  }
}
