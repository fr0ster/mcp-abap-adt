/**
 * The idle bound on held state, in its three forms: `--state-idle-minutes`,
 * `MCP_STATE_IDLE_MINUTES`, and the top-level YAML key `state-idle-minutes`.
 * CLI beats env beats YAML. A value under 30, over 35791, not a whole number,
 * or not a number is refused at startup, named in the form it was given.
 *
 * The row itself is lib's shared `STATE_IDLE_ROW` (`authParameters.ts`), in
 * the HTTP and SSE binaries' tables (stdio has no idle bound); this reads it
 * alone.
 */

import {
  type ParameterTable,
  readParameters,
  STATE_IDLE_CLI,
  STATE_IDLE_ENV,
  STATE_IDLE_ROW,
  STATE_IDLE_YAML,
} from './authParameters.js';

export { STATE_IDLE_CLI, STATE_IDLE_ENV, STATE_IDLE_YAML };

const STATE_IDLE_ONLY: ParameterTable = {
  program: 'state-idle-minutes',
  rows: [STATE_IDLE_ROW],
  removed: [],
};

/** The bound in minutes: the first form given, or 30. */
export function readStateIdleMinutes(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): number {
  return readParameters(STATE_IDLE_ONLY, argv, env, yaml)
    .stateIdleMinutes as number;
}
