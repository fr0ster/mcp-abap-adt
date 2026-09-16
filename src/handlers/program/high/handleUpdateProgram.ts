/**
 * UpdateProgram Handler - Update Existing ABAP Program Source Code
 *
 * Uses AdtClient.getProgram().{lock,check,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> (check, iff activating) -> update -> unlock ->
 * (activate). The pre-write check gates the write exactly as the
 * pre-migration handler did — only when `activate` is true. The
 * pre-migration handler's *post*-unlock check is gone: its own `catch`
 * never rethrew, so it could never have changed the answer.
 *
 * **The source goes through `options.sourceCode` for `update`,
 * `config.sourceCode` for `check`.** See `UpdateProgramLow` for `update`.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseCheck,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import { isCloudConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateProgram',
  available_in: ['onprem', 'legacy'] as const,
  description:
    'Operation: Update, Create. Subject: Program. Will be useful for updating or creating program. Update source code of an existing ABAP program. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description:
          'Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP program source code.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name', 'source_code'],
  },
} as const;

interface UpdateProgramArgs {
  program_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateProgram(
  context: HandlerContext,
  args: UpdateProgramArgs,
) {
  const { connection, logger } = context;

  if (!args.program_name || !args.source_code) {
    return return_error(
      new Error('Missing required parameters: program_name and source_code'),
    );
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  const programName = args.program_name.toUpperCase();
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateProgram', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getProgram(
        resultsFor(programDocuments),
      );

      const written = await withLock(
        () => obj.lock({ programName }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const update = () =>
            obj.update(
              { programName, transportRequest: args.transport_request },
              {
                sourceCode: args.source_code,
                lockHandle,
                analyse: analyseException,
              },
            );
          // A conditional phase of the sequence, not a hand-rolled
          // short-circuit: see UpdateClass for the reasoning.
          return shouldActivate
            ? sequence(
                () =>
                  obj.check(
                    { programName, sourceCode: args.source_code },
                    'inactive',
                    { analyse: analyseCheck },
                  ),
                update,
              )
            : update();
        },
        (lockHandle) => obj.unlock({ programName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ programName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
