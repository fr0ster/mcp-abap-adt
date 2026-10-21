/**
 * An activation run read by its id: its status, and the messages it produced.
 * One request each, the document as SAP answered it (compact `HandlerGet`
 * parts `activation_status` and `activation_results`; spec §4.6).
 *
 * A run is started by `POST /activation/runs`, which answers its id in
 * `Location`. `GET /activation/runs/{id}` states `runs:status` — `finished`,
 * `error`, `failed`, or a progress value while it runs; `GET
 * /activation/results/{id}` carries the `chkl:messages` the run produced.
 * How often to ask, and which status ends the asking, is the caller's.
 */
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  activationMessagesOf,
  readingOf,
  runStatusOf,
} from '../../../lib/strategies/activationRun';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

interface ActivationRunArgs {
  run_id?: unknown;
}

function runIdOf(args: ActivationRunArgs): string | undefined {
  return typeof args?.run_id === 'string' && args.run_id.trim() !== ''
    ? args.run_id.trim()
    : undefined;
}

const missingRunId = (part: string) =>
  return_error(new Error(`part=${part} requires run_id`));

/** `GET /activation/runs/{run_id}`: `{ run_id, part, status, document }`. */
export async function handleGetActivationStatus(
  context: HandlerContext,
  args: ActivationRunArgs,
) {
  const runId = runIdOf(args);
  if (runId === undefined) return missingRunId('activation_status');
  const utils = createAdtClient(context.connection, context.logger).getUtils(
    ourUtils,
  );
  return answer(
    { tool: 'HandlerGet', detail: 'raw' },
    () => utils.getActivationRun(runId, { analyse: analyseException }),
    (value: unknown) => ({
      run_id: runId,
      part: 'activation_status',
      status: runStatusOf(value),
      document: readingOf(value).raw,
    }),
  );
}

/** `GET /activation/results/{run_id}`: `{ run_id, part, messages, document }`. */
export async function handleGetActivationResults(
  context: HandlerContext,
  args: ActivationRunArgs,
) {
  const runId = runIdOf(args);
  if (runId === undefined) return missingRunId('activation_results');
  const utils = createAdtClient(context.connection, context.logger).getUtils(
    ourUtils,
  );
  return answer(
    { tool: 'HandlerGet', detail: 'raw' },
    () => utils.getActivationResults(runId, { analyse: analyseException }),
    (value: unknown) => ({
      run_id: runId,
      part: 'activation_results',
      messages: activationMessagesOf(value),
      document: readingOf(value).raw,
    }),
  );
}
