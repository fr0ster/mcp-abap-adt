// Refused (pre-narrowing): a `config` of the whole union held before the wire is known.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function common(settings: SapConfig) {
  return { config: settings, logger: undefined };
}
