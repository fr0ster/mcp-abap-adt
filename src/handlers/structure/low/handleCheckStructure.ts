/**
 * CheckStructureLow Handler - Syntax check for ABAP Structure
 *
 * Uses AdtClient.getStructure().check from @mcp-abap-adt/adt-clients 19.
 *
 * `ddl_code` is not a dead parameter: the shipped `AdtStructure.check()`
 * passes `config.source` straight into
 * `checkStructure(connection, name, version, config.source, logger)`, so a
 * caller validating unsaved code still reaches the server with it. Verified
 * against `AdtStructure.js`, not the declaration file.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name.',
      },
      ddl_code: {
        type: 'string',
        description:
          'Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: inactive",
        enum: ['active', 'inactive'],
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
      ...DETAIL_PROPERTY,
    },
    required: ['structure_name'],
  },
} as const;

interface CheckStructureArgs {
  structure_name: string;
  ddl_code?: string;
  version?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckStructure(
  context: HandlerContext,
  args: CheckStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, ddl_code, version } = args;

  if (!structure_name) {
    return return_error(new Error('structure_name is required'));
  }

  const structureName = structure_name.toUpperCase();
  const checkVersion =
    version && version.toLowerCase() === 'active' ? 'active' : 'inactive';
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckStructureLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getStructure(resultsFor(structureDocuments))
        .check({ structureName, source: ddl_code }, checkVersion, {
          analyse: analyseException,
        }),
    project(detail, terseCheck),
  );
}
