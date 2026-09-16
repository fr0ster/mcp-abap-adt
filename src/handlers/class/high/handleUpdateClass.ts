/**
 * UpdateClass Handler - Update existing ABAP class source code (optional activation)
 *
 * Uses AdtClient.getClass().{lock,check,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — the lock is held for the
 * whole write, and released on every path out (a refused check, a refused
 * update, a thrown projection, a refused unlock all still unlock).
 *
 * Workflow: lock -> (check, iff activating) -> update -> unlock -> (activate).
 * The pre-write check gates the write exactly as the pre-migration handler
 * did — only when `activate` is true, the new source is checked against the
 * inactive version before it is written, and a refusal stops the write; on
 * the default path (`activate` false) no check runs, matching the
 * pre-migration handler on that path too. The pre-migration handler's
 * *post*-unlock check is gone: its own `catch` never rethrew, so it could
 * never have changed the answer — dead code, not a materially observable
 * behaviour, unlike the pre-write one restored here.
 *
 * **The source goes in `options` for `update`, `config` for `check`.** See
 * `UpdateClassLow` for `update` — the shipped `AdtClass.update()` reads
 * `options?.sourceCode` only. `AdtClass.check()`'s shipped body reads
 * `config.sourceCode` — the one channel `check` alone still uses, for a
 * source that is not on the server yet.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseCheck, analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateClass',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update, Create. Subject: Class. Will be useful for updating or creating class. Update source code of an existing ABAP class. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_TEST_CLASS_001).',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP class source code.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after update. Default: false.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'source_code'],
  },
} as const;

interface UpdateClassArgs {
  class_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateClass(
  context: HandlerContext,
  args: UpdateClassArgs,
) {
  const { connection, logger } = context;

  if (!args.class_name || !args.source_code) {
    return return_error(
      new Error('Missing required parameters: class_name and source_code'),
    );
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateClass', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getClass(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const update = () =>
            obj.update(
              { className, transportRequest: args.transport_request },
              {
                sourceCode: args.source_code,
                lockHandle,
                analyse: analyseException,
              },
            );
          // A conditional phase of the sequence, not a hand-rolled
          // short-circuit: when activating, the check is a real first step
          // and a refusal stops the write via `sequence`'s own discipline;
          // when not, there is no first step and `update` runs alone.
          return shouldActivate
            ? sequence(
                () =>
                  obj.check(
                    { className, sourceCode: args.source_code },
                    'inactive',
                    { analyse: analyseCheck },
                  ),
                update,
              )
            : update();
        },
        (lockHandle) => obj.unlock({ className }, lockHandle),
      );
      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ className }, { analyse: ourActivation });
    },
    project(detail, terseWrite),
  );
}
