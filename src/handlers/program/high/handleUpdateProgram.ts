import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
 * **The source goes through `options.source` for `update`,
 * `config.source` for `check`.** See `UpdateProgramLow` for `update`.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateProgram',
  available_in: ['onprem'] as const,
  description:
    'Update source code of an existing ABAP program. Locks, updates, unlocks, and optionally activates.',
  inputSchema: z.object({
    program_name: z
      .string()
      .describe('Program name. Program must already exist.'),
    source_code: z.string().describe('Complete ABAP program source code.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    activate: z
      .boolean()
      .optional()
      .describe(
        'Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.',
      ),
    ...DETAIL_SHAPE,
  }),
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

  const programName = args.program_name.toUpperCase();
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateProgram', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createOnPremAdtClient(connection, logger).getProgram(
        resultsFor(programDocuments),
      );

      const written = await withLock(
        () => obj.lock({ programName }, { analyse: analyseLock }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const update = atStep('update', () =>
            withAdtHeaders(context, 'program.update', (headers) =>
              obj.update(
                { programName, transportRequest: args.transport_request },
                {
                  headers,
                  source: args.source_code,
                  lockHandle,
                  analyse: analyseException,
                },
              ),
            ),
          );
          // A conditional phase of the sequence, not a hand-rolled
          // short-circuit: see UpdateClass for the reasoning.
          return shouldActivate
            ? sequence(
                atStep('check', () =>
                  withAdtHeaders(context, 'program.check', (headers) =>
                    obj.check(
                      { programName, source: args.source_code },
                      'inactive',
                      { headers, analyse: analyseException },
                    ),
                  ),
                ),
                update,
              )
            : update();
        },
        (lockHandle) =>
          obj.unlock({ programName }, lockHandle, {
            analyse: analyseException,
          }),
        { type: 'PROGRAM', name: programName },
      );

      if (!written.ok || !shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'program.activate', (headers) =>
            obj.activate(
              { programName },
              { headers, analyse: analyseActivation },
            ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
