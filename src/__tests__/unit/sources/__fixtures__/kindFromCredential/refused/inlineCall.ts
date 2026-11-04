// Refused (argument, kind): a same-file function's answer, computed from the
// credential type, passed where a kind flag is expected.
import type { SapConfig } from '@mcp-abap-adt/connection';

type CloudFlag = boolean;

declare function declareCloud(cloud: CloudFlag): void;

function isJwt(config: SapConfig): boolean {
  return ['jwt'].includes(config.authType);
}

export function declareFrom(config: SapConfig): void {
  declareCloud(isJwt(config));
}
