// Passes: an answer's body — a document, not prose — sniffed as markup and
// split into a source's lines: the parser and the line reader's business.
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';

export function lines(answer: IAdtWireResponse): string[] {
  const body = answer.data;
  if (typeof body !== 'string' || body.startsWith('<')) return [];
  return body.split('\n');
}
