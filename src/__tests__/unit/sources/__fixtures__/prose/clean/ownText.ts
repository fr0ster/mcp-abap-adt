// Passes: our own text built from SAP's, matched nowhere; a presence test.
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';

export function words(error: IAdtError): string {
  const said = error.message.trim();
  if (said === '') return 'SAP said nothing';
  return `SAP Error: ${said}`;
}
