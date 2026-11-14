// Refused (assignment, kind): the kind assigned from the credential type.
import type { SapConfig } from '@mcp-abap-adt/connection';

export let declaredKind: 'cloud' | 'onprem' = 'onprem';

export function decide(config: SapConfig): void {
  declaredKind = config.authType === 'jwt' ? 'cloud' : 'onprem';
}
