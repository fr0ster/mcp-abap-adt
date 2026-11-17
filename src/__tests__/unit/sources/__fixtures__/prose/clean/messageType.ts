// Passes: a message's type letter compared.
import type { AdtRefusal } from '@mcp-abap-adt/adt-strategies';

export function hasError(refusal: AdtRefusal): boolean {
  return refusal.messages.some((message) => message.type === 'E');
}
