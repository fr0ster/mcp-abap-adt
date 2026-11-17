// Refused (equality ×2): SAP's text compared with words — a refusal's
// message, and a `switch` over an error's message.
import type { AdtRefusal } from '@mcp-abap-adt/adt-strategies';

export function isMissing(refusal: AdtRefusal): boolean {
  return refusal.message === 'Object does not exist';
}

export function kindOf(error: Error): number {
  switch (error.message) {
    case 'Object does not exist':
      return 1;
    default:
      return 0;
  }
}
