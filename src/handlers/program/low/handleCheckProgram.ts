/**
 * CheckProgramLow Handler - Syntax check for ABAP Program
 *
 * Uses AdtClient.getProgram().check from @mcp-abap-adt/adt-clients 19.
 *
 * **No `version` parameter on this tool, so `status` is always `undefined`.**
 * The shipped `check(config, status, options)` reads `status === 'active' ?
 * 'active' : 'inactive'`, so an omitted status checks the inactive version —
 * the same shipped default `CheckDomainLow`/`CheckTableLow` rely on. Unlike
 * those two, `checkProgram(connection, config.programName, version,
 * config.source, contentType)` DOES read a fourth argument for an
 * unsaved source, but no `source_code` parameter existed on this tool before
 * this migration, so nothing is forwarded there either. Verified against
 * `AdtProgram.js`, not the declaration file.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
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
      session_id: {
        type: 'string',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
      },
      session_state: {
        type: 'object',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name'],
  },
} as const;

interface CheckProgramArgs {
  program_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
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
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, and there is no `version` parameter on this tool to say
        // otherwise.
        .check({ programName }, args.version, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
