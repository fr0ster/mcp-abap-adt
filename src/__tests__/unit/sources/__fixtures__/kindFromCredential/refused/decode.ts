// Refused (decode, decode): production code reading a token's claim.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function subjectOf(config: SapConfig): unknown {
  const payload = config.jwtToken?.split('.')[1] ?? '';
  const claims: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  );
  return claims;
}
