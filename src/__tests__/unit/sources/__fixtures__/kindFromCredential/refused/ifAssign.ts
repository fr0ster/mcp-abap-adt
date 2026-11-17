// Refused (assignment, kind): a kind assigned in a branch on the credential.
import type { SapConfig } from '@mcp-abap-adt/connection';

declare function stateSystemKind(kind: 'cloud' | 'onprem'): void;

export function declareFrom(config: SapConfig): void {
  let kind: 'cloud' | 'onprem' = 'onprem';
  if (config.authType === 'jwt') kind = 'cloud';
  stateSystemKind(kind);
}
