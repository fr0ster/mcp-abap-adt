/**
 * CheckProgramLow Handler - Syntax check for ABAP Program
 *
 * Uses AdtClient.getProgram().check from @mcp-abap-adt/adt-clients 19.
 *
 * The shipped `check(config, status, options)` reads `status === 'active' ?
 * 'active' : 'inactive'`, so the handler names the version itself: active
 * unless `version` is `inactive` (#181). `checkProgram(connection,
 * config.programName, version, config.source, contentType)` also reads a
 * fourth argument for an unsaved source; this tool has no `source_code`
 * parameter, so nothing is forwarded there. Verified against `AdtProgram.js`.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { isCloudConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckProgramLow',
  available_in: ['onprem'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name'],
  },
} as const;

interface CheckProgramArgs {
  program_name: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckProgram(
  context: HandlerContext,
  args: CheckProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name } = args;

  if (!program_name) {
    return return_error(new Error('program_name is required'));
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  const programName = program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckProgramLow', detail },
    () =>
      withAdtHeaders(context, 'program.check', (headers) =>
        createAdtClient(connection, logger)
          .getProgram(resultsFor(programDocuments))
          .check(
            { programName },
            args.version === 'inactive' ? 'inactive' : 'active',
            {
              headers,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseCheck),
  );
}
