// Clean: the configuration summary names which credential fields are present.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function summary(config: SapConfig): string[] {
  const lines = [`Auth type: ${config.authType}`];
  if (config.authType === 'jwt') {
    lines.push(`JWT token: ${config.jwtToken ? 'present' : 'missing'}`);
  }
  return lines;
}
