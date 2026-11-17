// Refused (assignment, kind): a `CloudFlag` bound to the credential type.
import type { SapConfig } from '@mcp-abap-adt/connection';

type CloudFlag = boolean;

export function flagOf(config: SapConfig): void {
  const flag: CloudFlag = ['jwt'].includes(config.authType);
  void flag;
}
