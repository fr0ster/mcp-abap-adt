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
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
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
    '[low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).',
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
          "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Without `version` the active version is checked.",
        enum: ['active', 'inactive'],
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
    version && version.toLowerCase() === 'inactive' ? 'inactive' : 'active';
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckStructureLow', detail },
    () =>
      withAdtHeaders(context, 'structure.check', (headers) =>
        createAdtClient(connection, logger)
          .getStructure(resultsFor(structureDocuments))
          .check({ structureName, source: ddl_code }, checkVersion, {
            headers,
            analyse: analyseException,
          }),
      ),
    project(detail, terseCheck),
  );
}
