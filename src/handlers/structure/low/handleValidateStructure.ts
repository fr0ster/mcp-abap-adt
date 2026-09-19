/**
 * ValidateStructureLow Handler - Validate ABAP Structure Name
 *
 * Uses AdtClient.getStructure().validate from @mcp-abap-adt/adt-clients 19.
 *
 * `packageName` reaches `config` here, but the shipped
 * `validateStructureName(connection, name, config.description)` never reads
 * a third argument — the wire request carries no package. Kept in `config`
 * anyway because the field compiles and the tool schema still requires it
 * (removing an existing parameter is not this migration's job). Verified
 * against `AdtStructure.js`, not the declaration file.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP structure name before creation. Checks if the name is valid and available. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name to validate (e.g., Z_MY_PROGRAM).',
      },
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required by this tool, but the validation endpoint takes no package — the verdict is package-independent.',
      },
      description: {
        type: 'string',
        description: 'Structure description. Required for validation.',
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
    required: ['structure_name', 'package_name', 'description'],
  },
} as const;

interface ValidateStructureArgs {
  structure_name: string;
  package_name: string;
  description: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidateStructure(
  context: HandlerContext,
  args: ValidateStructureArgs,
) {
  const { connection, logger } = context;
  const {
    structure_name,
    package_name,
    description,
    session_id,
    session_state,
  } = args;

  if (!structure_name || !package_name || !description) {
    return return_error(
      new Error('structure_name, package_name, and description are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const structureName = structure_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateStructureLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getStructure(resultsFor(structureDocuments))
        .validate(
          {
            structureName,
            description,
            packageName: package_name.toUpperCase(),
          },
          { analyse: analyseValidation },
        ),
    project(detail, terseValidation),
  );
}
