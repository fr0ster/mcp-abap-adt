/**
 * A request SAP refused for its session token: status `403` with the header
 * `x-csrf-token: Required` (the header's name and value without regard to
 * case), as SAP's ICF answers a request whose token it does not accept. The
 * token is checked before the request is processed, so nothing of it ran;
 * the connection has already fetched a new token and sent the request once
 * more. SAP's words for it misled consumers, so the answer carries fixed
 * words in their place (the owner, 2026-11-18), and the original goes to
 * the server's log at `debug`.
 *
 * Decided by the status and the header alone: SAP's text is never read.
 */
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { logger } from './logger';
import { asciiLower } from './plainText';
import { entries, isList } from './thrownValue';
import { wireValueOf } from './wireValue';

/** What the consumer gets for such a refusal, in place of SAP's words. */
export const CSRF_REFUSAL_WORDS =
  "SAP refused the request's session token (HTTP 403); the request was not executed.";

/** A header's value as one text: a list's first entry, a string as it is; anything else none. */
function headerText(value: unknown): string {
  if (isList(value)) {
    const [first] = value;
    return typeof first === 'string' ? first : '';
  }
  return typeof value === 'string' ? value : '';
}

/** Whether `response` is SAP's refusal of the session token. */
export function isCsrfRefusal(response: IAdtWireResponse | undefined): boolean {
  if (response?.status !== 403) return false;
  // Read as SAP's answer, outside the type system: a refusal handed over
  // with no headers object (a connection of an embedder's) names none.
  for (const [name, value] of entries(response.headers)) {
    if (asciiLower(name) !== 'x-csrf-token') continue;
    if (asciiLower(headerText(value).trim()) === 'required') return true;
  }
  return false;
}

/**
 * The original refusal to the server's log at `debug`: its status, the
 * failure's words and SAP's body as text — no header, so no token and no
 * cookie.
 */
export function logCsrfRefusal(
  response: IAdtWireResponse,
  message: string,
): void {
  const body = wireValueOf(response.data);
  logger.debug('SAP refused the session token (403); answered in fixed words', {
    status: response.status,
    message,
    body: body.kind === 'text' ? body.text : undefined,
  });
}
