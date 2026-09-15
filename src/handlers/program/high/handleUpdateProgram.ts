/**
 * UpdateProgram Handler - Update Existing ABAP Program Source Code
 *
 * Uses AdtClient.getProgram().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> update -> unlock -> (activate). The pre-write and
 * post-unlock syntax checks the pre-migration handler ran are gone: they
 * duplicated what `update`'s own `analyseException` already verdicts, and
 * dropping them matches this tool's documented contract ("Locks, updates,
 * unlocks, and optionally activates") and every low-tier sibling.
 *
 * **The source goes through `options.sourceCode`.** See `UpdateProgramLow`.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
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
        (lockHandle) =>
          obj.update(
            { programName, transportRequest: args.transport_request },
            {
              sourceCode: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
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
