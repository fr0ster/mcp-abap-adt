// Refused (property, credential-boolean): a kind flag in a property.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function testContext(config: SapConfig) {
  return { isCloudSystem: config.authType === 'jwt' };
}
