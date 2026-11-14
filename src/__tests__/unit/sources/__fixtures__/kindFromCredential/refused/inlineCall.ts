// Refused (argument, kind): a same-file function's answer, read from the
// credential, passed where a kind flag is expected.
import type { SapConfig } from '@mcp-abap-adt/connection';

type CloudFlag = boolean;

declare function declareCloud(cloud: CloudFlag): void;

function authOf(config: SapConfig): string {
  return config.authType;
}

export function declareFrom(config: SapConfig): void {
  declareCloud(authOf(config) === 'jwt');
}
