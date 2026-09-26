/**
 * CreateProgramLow Handler - Create ABAP Program
 *
 * Uses AdtClient.getProgram().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 *
 * **`description`, `programType` and `application` all reach the wire.**
 * Unlike `table`'s and `structure`'s create, `AdtProgram.create()`'s shipped
 * body forwards `config.description`, `config.programType` and
 * `config.application` straight into the request it builds. No source: the
 * DDL/ABAP body is `UpdateProgramLow`'s job, after `LockProgramLow`. Verified
 * against `AdtProgram.js`.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import {
  isCloudConnection,
  restoreSessionInConnection,
  return_error,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateProgramLow',
  available_in: ['onprem'] as const,
  description:
    '[low-level] Create a new ABAP program. - use CreateProgram (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description:
          'Program name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'Program description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      program_type: {
        type: 'string',
        description:
          "Program type: 'executable', 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool' (optional).",
      },
      application: {
        type: 'string',
        description: "Application area (optional, default: '*').",
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name', 'description', 'package_name'],
  },
} as const;

interface CreateProgramArgs {
  program_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  program_type?: string;
  application?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateProgram(
  context: HandlerContext,
  args: CreateProgramArgs,
) {
  const { connection, logger } = context;
  const {
    program_name,
    description,
    package_name,
    transport_request,
    program_type,
    application,
    session_id,
    session_state,
  } = args;

  if (!program_name || !description || !package_name) {
    return return_error(
      new Error('program_name, description, and package_name are required'),
    );
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const programName = program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateProgramLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        .create(
          {
            programName,
            description,
            packageName: package_name,
            transportRequest: transport_request,
            programType: program_type,
            application,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
