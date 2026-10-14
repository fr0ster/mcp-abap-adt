/**
 * The system type the transports require (`--system-type` /
 * `SAP_SYSTEM_TYPE` / `system-type`): no default, never guessed — the
 * tools offered, the connector and how the system's answers are read
 * follow from it.
 */
import type { Parameter } from '@mcp-abap-adt/lib/config';

/** `--system-type` / `SAP_SYSTEM_TYPE`, required. */
export const SYSTEM_TYPE_ROW: Parameter = {
  key: 'systemType',
  cli: '--system-type',
  env: 'SAP_SYSTEM_TYPE',
  yaml: 'system-type',
  kind: 'enum',
  values: ['onprem', 'cloud', 'legacy'],
  section: 'OPTIONS',
  help: "SAP system type, required (no default, never guessed): the tools offered, the connector and how the system's answers are read",
};

/**
 * The start's words for a listener (Streamable HTTP, SSE) whose system kind
 * no parameter states: the same shape as stdio's, which names the
 * destination and the `--env` file — a listener has neither.
 */
export function listenerSystemTypeRequiredWords(): string {
  return 'The SAP system type is required — set --system-type, SAP_SYSTEM_TYPE (the environment) or system-type (YAML) to onprem, cloud or legacy; the server did not start';
}
