/**
 * The ADT batch envelope as a fake instance connection sees it: what an
 * `AdtBatchConnection` sends (`multipart/mixed`, one `application/http` part
 * per recorded request) read back into its inner requests, and an answer
 * built part by part. Plain string code over the wire format adt-clients
 * writes (`buildBatchPayload` / `innerRequest`) and reads
 * (`parseBatchResponse`).
 */
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';

/** One request inside an envelope. */
export interface InnerRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** What SAP answers to one inner request. */
export interface PartAnswer {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}

function headerOf(
  headers: IAbapRequestOptions['headers'],
  name: string,
): string | undefined {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name) return String(value);
  }
  return undefined;
}

/** The inner requests of an envelope request, in the order sent. */
export function innerRequests(request: IAbapRequestOptions): InnerRequest[] {
  const type = headerOf(request.headers, 'content-type') ?? '';
  const marker = 'boundary=';
  const at = type.indexOf(marker);
  if (at < 0) throw new Error('not an envelope: no boundary');
  const boundary = type.slice(at + marker.length).trim();
  const body = String(request.data ?? '');
  const chunks = body.split(`--${boundary}`).slice(1);
  const inner: InnerRequest[] = [];
  for (const chunk of chunks) {
    if (chunk.startsWith('--')) break;
    // Part headers, a blank line, then the inner request.
    const start = chunk.indexOf('\r\n\r\n');
    const text = chunk.slice(start + 4);
    const lineEnd = text.indexOf('\r\n');
    const [method = '', url = ''] = text.slice(0, lineEnd).split(' ');
    const headEnd = text.indexOf('\r\n\r\n', lineEnd);
    const headers: Record<string, string> = {};
    const headText = headEnd > lineEnd ? text.slice(lineEnd + 2, headEnd) : '';
    for (const line of headText.split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) {
        headers[line.slice(0, colon).toLowerCase()] = line
          .slice(colon + 1)
          .trim();
      }
    }
    const rest = headEnd >= 0 ? text.slice(headEnd + 4) : '';
    // The inner request ends with one CRLF before the next delimiter.
    const inBody = rest.endsWith('\r\n') ? rest.slice(0, -2) : rest;
    inner.push({ method, url, headers, body: inBody });
  }
  return inner;
}

const ANSWER_BOUNDARY = 'batch_answer_placeholder';

/** The envelope's answer: a `200` `multipart/mixed` carrying `parts`, in order. */
export function envelopeResponse(parts: PartAnswer[]): IAdtWireResponse {
  const answered = parts
    .map((part) => {
      const headers = Object.entries(part.headers ?? {})
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join('');
      const body = part.body ?? '';
      const tail = body === '' ? '' : `${body}\r\n`;
      return `--${ANSWER_BOUNDARY}\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nHTTP/1.1 ${part.status} ${part.statusText ?? ''}\r\n${headers}\r\n${tail}`;
    })
    .join('');
  const data = `${answered}--${ANSWER_BOUNDARY}--\r\n`;
  return {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': `multipart/mixed; boundary=${ANSWER_BOUNDARY}`,
    },
    data,
  } as IAdtWireResponse;
}

/** A failed request as a connection throws it: SAP's answer under `response`. */
export function statusError(
  status: number,
  statusText: string,
  data = '',
  headers: Record<string, string> = {},
): Error & { response: unknown } {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, statusText, headers, data },
  });
}

/** One envelope a fake connection received. */
export interface SeenEnvelope {
  url: string;
  accept: string | undefined;
  session: 'stateful' | 'stateless';
  parts: InnerRequest[];
}

/** What a fake answers to an envelope (or throws). */
export type EnvelopeAnswer = (
  parts: InnerRequest[],
  seen: SeenEnvelope,
) => IAdtWireResponse | Promise<IAdtWireResponse>;

/** Answers each part by `part`. */
export const partByPart =
  (part: (inner: InnerRequest) => PartAnswer): EnvelopeAnswer =>
  (parts) =>
    envelopeResponse(parts.map(part));

/**
 * A fake instance connection that answers envelopes with `answer`; every
 * other request (none is expected while a batch runs) goes to `direct`,
 * else `200` with an empty body. It records every envelope with the session
 * type in force when it was sent, every direct request, and its logoff
 * (`disconnect`).
 */
export function envelopeConnection(
  answer: EnvelopeAnswer,
  direct?: (request: IAbapRequestOptions) => Promise<IAdtWireResponse>,
) {
  const envelopes: SeenEnvelope[] = [];
  const directs: IAbapRequestOptions[] = [];
  let session: 'stateful' | 'stateless' = 'stateless';
  const connection = {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    getBaseUrl: jest.fn(async () => 'https://system.invalid'),
    getSessionId: () => null,
    setSessionType: jest.fn((type: 'stateful' | 'stateless') => {
      session = type;
    }),
    getSessionType: () => session,
    makeAdtRequest: jest.fn(async (request: IAbapRequestOptions) => {
      if (request.url.endsWith('/batch')) {
        const seen: SeenEnvelope = {
          url: request.url,
          accept: headerOf(request.headers, 'accept'),
          session,
          parts: innerRequests(request),
        };
        envelopes.push(seen);
        return answer(seen.parts, seen);
      }
      directs.push(request);
      if (direct !== undefined) return direct(request);
      return { status: 200, statusText: 'OK', headers: {}, data: '' };
    }),
  };
  return { connection, envelopes, directs };
}
