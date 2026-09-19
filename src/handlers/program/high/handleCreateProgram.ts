/**
 * CreateProgram Handler - ABAP Program Creation via ADT API
 *
 * Uses AdtClient.getProgram().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it. The pre-migration handler's own `validate()`
 * call is dropped — this is a bare create, matching `CreateProgramLow`.
 * `description`, `programType` and `application` all reach the wire; no
 * source — that is `UpdateProgram`'s job, after `LockProgram`.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { isCloudConnection, return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateProgram',
  available_in: ['onprem'] as const,
  description:
    'Operation: Create. Subject: Program. Will be useful for creating program. Create a new ABAP program (report) in SAP system. Creates the program object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description:
          'Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y).',
      },
      description: {
        type: 'string',
        description:
          'Program description. If not provided, program_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      program_type: {
        type: 'string',
        description:
          "Program type: 'executable' (Report), 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool'. Default: 'executable'",
        enum: [
          'executable',
          'include',
          'module_pool',
          'function_group',
          'class_pool',
          'interface_pool',
        ],
      },
      application: {
        type: 'string',
        description:
          "Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'",
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name', 'package_name'],
  },
} as const;

interface CreateProgramArgs {
  program_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  program_type?: string;
  application?: string;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateProgram(
  context: HandlerContext,
  args: CreateProgramArgs,
) {
  const { connection, logger } = context;

  if (!args.program_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: program_name and package_name'),
    );
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const programName = args.program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateProgram', detail },
    () =>
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        .create(
          {
            programName,
            description: args.description || programName,
            packageName: args.package_name,
            transportRequest: args.transport_request,
            programType: args.program_type,
            application: args.application,
            masterLanguage: args.master_language,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
