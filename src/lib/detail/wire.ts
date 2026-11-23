/**
 * `detail: 'raw'` is what ADT sent. The shape belongs to the tool, not to
 * the call (the owner's ruling, Codex round 5): a tool that makes one read
 * answers that document as it came; a tool that assembles reads answers a
 * JSON array of the documents, in the order they were read, each as ADT
 * sent it — even when a call made one read — no parse, no projection,
 * nothing of ours mixed in.
 *
 * The responses are every answer the call's connection got while the call
 * ran (`recordedWire`), in read order, batch envelopes included as they
 * came: each with its status and its body, a refusal (a status outside
 * `2xx`, whether the connection answered it or threw it) as it came too —
 * a failed read is visible as the failed response, never as a gap. An
 * assembled tool answers them as `{ status, body }` entries; a one-read
 * tool answers its one body. A call on one connection is strictly sequential
 * (one session, one flow), so the bodies recorded are this call's. A body
 * the connection hands over as text is recorded as it is, bytes decoded as
 * UTF-8; one it hands over as an object (a JSON answer the HTTP client
 * already parsed) is recorded as its JSON text — never as `String()` writes
 * an object.
 *
 * Raw never hides an error: a call the tool refuses at `full`, or answers
 * with an error explained inside it (an entry's `error`, a `failures`
 * list), is answered at `raw` exactly as `full` answers it.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { type JsonValue, parseJson } from '../json';
import { wireResponseOf } from '../wireResponse';

/**
 * A body as the connection gave it, as text: text as it is, bytes as
 * UTF-8, an object as its JSON text, nothing as `''`. The body comes from
 * outside the type system, so it is told apart here.
 */
export function recordedBody(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data === undefined || data === null) return '';
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  return JSON.stringify(data) ?? '';
}

/** One response as recorded: its status and its body as text. */
export interface WireResponse {
  readonly status: number;
  readonly body: string;
}

/** The response a thrown request failure carries, when it carries one (outside the type system). */
function thrownResponse(thrown: unknown): WireResponse | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  const response = wireResponseOf(Reflect.get(thrown, 'response'));
  return response === undefined
    ? undefined
    : { status: response.status, body: recordedBody(response.data) };
}

/** What `run` answered, and every response the connection got meanwhile, in order. */
export async function recordedWire<R>(
  connection: IAbapConnection,
  run: () => Promise<R>,
): Promise<{ result: R; documents: WireResponse[] }> {
  const documents: WireResponse[] = [];
  const own = Object.hasOwn(connection, 'makeAdtRequest');
  const original = connection.makeAdtRequest;
  connection.makeAdtRequest = async (...request) => {
    let answered: Awaited<ReturnType<typeof original>>;
    try {
      answered = await original.apply(connection, request);
    } catch (thrown) {
      // A refusal the connection throws: its response, as it came.
      const response = thrownResponse(thrown);
      if (response !== undefined) documents.push(response);
      throw thrown;
    }
    documents.push({
      status: answered.status,
      body: recordedBody(answered.data),
    });
    return answered;
  };
  try {
    return { result: await run(), documents };
  } finally {
    if (own) connection.makeAdtRequest = original;
    else Reflect.deleteProperty(connection, 'makeAdtRequest');
  }
}

/** A tool's raw shape: one document, or the array of the documents it assembles. */
export type WireShape = 'one' | 'assembled';

/** The words of a one-read tool whose call read another number of documents. */
export function notOneDocumentWords(tool: string, read: number): string {
  return `${tool}: raw answers the one document this tool reads, and the call read ${read}`;
}

/** The raw text of what ADT sent: the one body, or the array of the responses. */
export function wireText(
  documents: readonly WireResponse[],
  shape: WireShape,
): string {
  return shape === 'one'
    ? (documents[0]?.body ?? '')
    : JSON.stringify(documents);
}

/** An answer of the MCP tool shape: what a raw answer replaces the text of. */
interface ToolAnswer {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

/** Whether a JSON value explains an error inside it: a member `error`, or a non-empty `failures`. */
function explainsError(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(explainsError);
  if (value === null || typeof value !== 'object') return false;
  for (const [key, member] of Object.entries(value)) {
    if (key === 'error') return true;
    if (key === 'failures' && Array.isArray(member) && member.length > 0) {
      return true;
    }
    if (explainsError(member)) return true;
  }
  return false;
}

/** Whether a tool's answer refuses, or explains an error inside it. */
function refusesOrExplains(answer: ToolAnswer): boolean {
  if (answer.isError === true) return true;
  return answer.content.some((part) => {
    const json = parseJson(part.text);
    return json !== undefined && explainsError(json);
  });
}

/** Which tool answers, and its raw shape. */
export interface WireOf {
  readonly connection: IAbapConnection;
  readonly tool: string;
  readonly shape: WireShape;
  /**
   * A failure the tool's `full` answer explains in a member of its own (not
   * an `error`): its name. When the full answer carries it, raw answers the
   * responses beside it — `{ responses, <member>: … }` — never a silent
   * success (a read-back that got no response of SAP's).
   */
  readonly explainedBy?: string | undefined;
}

/** The failure a full answer explains in `member`, when it carries one. */
function explainedFailure(
  answer: ToolAnswer,
  member: string,
): JsonValue | undefined {
  for (const part of answer.content) {
    const json = parseJson(part.text);
    if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
      const failure = json[member];
      if (failure !== undefined) return failure;
    }
  }
  return undefined;
}

/**
 * The tool's answer at `raw`: `run` (the tool at `full`, on the recording
 * connection) answered, and its text is what ADT sent. A call `full`
 * refuses or explains an error in is answered as `full` answers it; a
 * one-read tool whose call read another number of documents is an error.
 */
export async function wireAnswer(
  of: WireOf,
  run: () => Promise<ToolAnswer>,
): Promise<ToolAnswer> {
  const { result, documents } = await recordedWire(of.connection, run);
  if (refusesOrExplains(result)) return result;
  const failure =
    of.explainedBy === undefined
      ? undefined
      : explainedFailure(result, of.explainedBy);
  if (of.explainedBy !== undefined && failure !== undefined) {
    return {
      ...result,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            responses: documents,
            [of.explainedBy]: failure,
          }),
        },
      ],
    };
  }
  if (of.shape === 'one' && documents.length !== 1) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'raw_shape',
            tool: of.tool,
            message: notOneDocumentWords(of.tool, documents.length),
          }),
        },
      ],
    };
  }
  return {
    ...result,
    content: [{ type: 'text', text: wireText(documents, of.shape) }],
  };
}
