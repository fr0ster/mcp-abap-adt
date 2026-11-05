// Refused (search ×2): a computed pattern — whatever the argument, a search
// of SAP's text is refused.
import type { AdtMessage } from '@mcp-abap-adt/adt-strategies';

export function mentions(message: AdtMessage, word: string): boolean {
  const text = message.text;
  return text.includes(word) || text.split(word).length > 1;
}
