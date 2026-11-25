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
 * Raw never hides a failed exchange: a call whose exchange failed (a
 * refusal, no response) and that the tool refuses at `full`, or that full
 * answers with an error explained inside it (an entry's `error`, a
 * `failures` list), is answered at `raw` exactly as `full` answers it. On a
 * parse failure — every exchange answered, our reading refused it — raw
 * still answers the documents.
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
): Promise<{
  result: R;
  documents: WireResponse[];
  unanswered: number;
  failedParts: number;
}> {
  const documents: WireResponse[] = [];
  // Inner parts of a batch envelope SAP answered outside `2xx`: each is a
  // read that failed, whatever the envelope's own status.
  let failedParts = 0;
  // Requests that failed with no response of SAP's (a timeout, an abort, a
  // refusal of the connection's own).
  let unanswered = 0;
  // A batch envelope's parts answered outside `2xx`, counted.
  const countFailedParts = (url: string, body: string) => {
    if (!url.endsWith('/batch')) return;
    failedParts += partStatuses(body).filter(
      (status) => status < 200 || status >= 300,
    ).length;
  };
  const own = Object.hasOwn(connection, 'makeAdtRequest');
  const original = connection.makeAdtRequest;
  connection.makeAdtRequest = async (...request) => {
    let answered: Awaited<ReturnType<typeof original>>;
    try {
      answered = await original.apply(connection, request);
    } catch (thrown) {
      // A refusal the connection throws: its response, as it came — and,
      // for an envelope, its parts' own statuses too.
      const response = thrownResponse(thrown);
      if (response !== undefined) {
        documents.push(response);
        countFailedParts(request[0]?.url ?? '', response.body);
      } else unanswered += 1;
      throw thrown;
    }
    const body = recordedBody(answered.data);
    documents.push({ status: answered.status, body });
    countFailedParts(request[0]?.url ?? '', body);
    return answered;
  };
  try {
    return { result: await run(), documents, unanswered, failedParts };
  } finally {
    if (own) connection.makeAdtRequest = original;
    else Reflect.deleteProperty(connection, 'makeAdtRequest');
  }
}

/**
 * The statuses of a batch envelope's inner parts: each part's status line,
 * read as the batch client reads it — the protocol and its minor version,
 * any run of whitespace, a three-digit code, then whitespace or the line's end. Each
 * is that read's answer. Plain code, line by line.
 */
export function partStatuses(body: string): number[] {
  const statuses: number[] = [];
  for (const raw of body.split('\n')) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const version = text.slice(0, 7).toLowerCase();
    if (version !== 'http/1.' || !isDigit(text[7])) continue;
    const rest = text.slice(8);
    const code = rest.trimStart();
    if (code.length === rest.length) continue;
    const digits = code.slice(0, 3);
    const after = code[3];
    if (
      digits.length === 3 &&
      [...digits].every(isDigit) &&
      (after === undefined || after.trim() === '')
    ) {
      statuses.push(Number(digits));
    }
  }
  return statuses;
}

/** Whether one character is an ASCII digit. */
function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
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

/**
 * The members a full answer reports a failed or unreadable read in, when
 * they hold one: a list of what could not be read.
 */
const UNREAD_MEMBERS = new Set([
  'failures',
  'unreadable',
  'append_candidates_unread',
  'includes_unread',
]);

/**
 * Whether a JSON value reports a failed read inside it: a member `error`,
 * a non-empty list of what could not be read, or `appends_unavailable`.
 */
function explainsError(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(explainsError);
  if (value === null || typeof value !== 'object') return false;
  for (const [key, member] of Object.entries(value)) {
    if (key === 'error') return true;
    if (key === 'appends_unavailable' && member === true) return true;
    if (UNREAD_MEMBERS.has(key) && Array.isArray(member) && member.length > 0) {
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
  const { result, documents, unanswered, failedParts } = await recordedWire(
    of.connection,
    run,
  );
  // The exchange itself failed — a refusal, no response — or full explains
  // an error inside its answer: raw gives the same answer. A call whose
  // every exchange SAP answered but whose parse failed (a `200` that is no
  // outline) still gives the documents: raw is what ADT sent.
  const exchangeFailed =
    unanswered > 0 ||
    failedParts > 0 ||
    documents.some(
      (document) => document.status < 200 || document.status >= 300,
    );
  const parseFailed = result.isError && !exchangeFailed && documents.length > 0;
  // A read full reports as failed or unreadable makes raw an error: full's
  // answer, as an error (Codex round 9).
  if (!parseFailed && refusesOrExplains(result)) {
    return { ...result, isError: true };
  }
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
  // What ADT sent, answered as it came: a success, the parse's failure
  // being full's to explain.
  return {
    ...result,
    isError: false,
    content: [{ type: 'text', text: wireText(documents, of.shape) }],
  };
}
