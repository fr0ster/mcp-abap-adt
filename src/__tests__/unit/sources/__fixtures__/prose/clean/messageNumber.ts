// Passes: a message's T100 key compared — the message class and number a
// reader extracted.
import type { AdtMessage } from '@mcp-abap-adt/adt-strategies';

export function isDeleteRefusedInDatabase(message: AdtMessage): boolean {
  return message.t100?.id === 'SWB_TOOL' && message.t100.no === '029';
}
