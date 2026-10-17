/**
 * Whether a batch's answers keep their raw parts, in its three forms:
 * `--batch-keep-raw-parts`, `MCP_BATCH_KEEP_RAW_PARTS`, and the YAML key
 * `batch.keepRawParts`. CLI beats env beats YAML; default `false`. A value
 * other than `true` or `false` is refused at startup, named in the form it
 * was given.
 *
 * The row itself is lib's shared `BATCH_KEEP_RAW_PARTS_ROW`
 * (`authParameters.ts`), in every binary's table; this reads it alone.
 */

import {
  BATCH_KEEP_RAW_PARTS_CLI,
  BATCH_KEEP_RAW_PARTS_ENV,
  BATCH_KEEP_RAW_PARTS_ROW,
  BATCH_KEEP_RAW_PARTS_YAML,
  type ParameterTable,
  readParameters,
} from './authParameters.js';

export {
  BATCH_KEEP_RAW_PARTS_CLI,
  BATCH_KEEP_RAW_PARTS_ENV,
  BATCH_KEEP_RAW_PARTS_YAML,
};

const BATCH_KEEP_RAW_PARTS_ONLY: ParameterTable = {
  program: 'batch-keep-raw-parts',
  rows: [BATCH_KEEP_RAW_PARTS_ROW],
  removed: [],
};

/** Whether raw parts are kept: the first form given, or `false`. */
export function readBatchKeepRawParts(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: Record<string, unknown> | null,
): boolean {
  return (
    readParameters(BATCH_KEEP_RAW_PARTS_ONLY, argv, env, yaml)
      .batchKeepRawParts === true
  );
}
