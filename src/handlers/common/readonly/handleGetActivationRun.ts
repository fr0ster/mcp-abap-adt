/**
 * An activation run read by its id: its status, and the messages it produced.
 * One request each, the document as SAP answered it (compact `HandlerGet`
 * parts `activation_status` and `activation_results`; spec §4.6).
 *
 * A run is started by `POST /activation/runs`, which answers its id in
 * `Location`. `GET /activation/runs/{id}` states `runs:status` — `running`
 * while the run goes on (progress is in attributes of its own), `finished`,
 * `error` or `failed` once it ended (measured on premise and on the cloud
 * trial, 2026-11-04); `GET
 * /activation/results/{id}` carries the `chkl:messages` the run produced.
 * How often to ask, and which status ends the asking, is the caller's; a
 * status read with `with_long_polling` is held by SAP until the run ends.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { compactGetSchema } from '../../../lib/compact/compactSchemas';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  activationExecutedOf,
  activationMessagesOf,
  activationVerdict,
  readingOf,
  runStatusOf,
} from '../../../lib/strategies/activationRun';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

/** The run a read names: HandlerGet's `run_id`, as its schema parses it (the one caller). */
type ActivationRunArgs = Pick<z.output<typeof compactGetSchema>, 'run_id'>;

/**
 * The status read's arguments: with `with_long_polling` `true`, SAP holds
 * the read until the run ends (`?withLongPolling=true`).
 */
type ActivationStatusArgs = Pick<
  z.output<typeof compactGetSchema>,
  'run_id' | 'with_long_polling'
>;

function runIdOf(args: ActivationRunArgs): string | undefined {
  return typeof args?.run_id === 'string' && args.run_id.trim() !== ''
    ? args.run_id.trim()
    : undefined;
}

const missingRunId = (part: string) =>
  return_error(new Error(`part=${part} requires run_id`));

/**
 * `GET /activation/runs/{run_id}`: `{ run_id, part, status, document }`.
 * With `with_long_polling`, the read is a long poll
 * (`?withLongPolling=true`), which SAP holds until the run ends (measured on
 * premise and on the cloud trial, 2026-11-04); without it, one read answered
 * at once.
 */
export async function handleGetActivationStatus(
  context: HandlerContext,
  args: ActivationStatusArgs,
) {
  const runId = runIdOf(args);
  if (runId === undefined) return missingRunId('activation_status');
  const utils = createAdtClient(context.connection, context.logger).getUtils(
    ourUtils,
  );
  return answer(
    { tool: 'HandlerGet', detail: 'raw' },
    () =>
      utils.getActivationRun(runId, {
        analyse: analyseException,
        withLongPolling:
          typeof args.with_long_polling === 'boolean'
            ? args.with_long_polling
            : undefined,
      }),
    (value: AdtReading<unknown>) => ({
      run_id: runId,
      part: 'activation_status',
      status: runStatusOf(value),
      document: readingOf(value).raw,
    }),
  );
}

/** `GET /activation/results/{run_id}`: `{ run_id, part, activated, messages, document }`. */
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
    (value: AdtReading<unknown>) => {
      const messages = activationMessagesOf(value);
      const executed = activationExecutedOf(value);
      return {
        run_id: runId,
        part: 'activation_results',
        // SAP's verdict as the results state it (`activationExecuted`, and
        // no error-severity message); `null` where they state none — a run
        // still going, whose results carry no verdict yet.
        activated:
          executed === undefined ? null : activationVerdict(executed, messages),
        ...(executed === false && messages.length === 0
          ? { nothing_to_activate: true }
          : {}),
        messages,
        document: readingOf(value).raw,
      };
    },
  );
}
