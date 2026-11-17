// Refused (search): the old `<message>` quote — an error's body searched for
// markup instead of being read by the parser.
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';

export function quoted(error: IAdtError): string | undefined {
  const body = error.response?.data;
  if (typeof body !== 'string') return undefined;
  return body.includes('<message>') ? body : undefined;
}
