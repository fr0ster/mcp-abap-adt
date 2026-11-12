import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).',
  inputSchema: z.object({
    structure_name: z.string().describe('Structure name.'),
    ddl_code: z
      .string()
      .optional()
      .describe(
        'Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.',
      ),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe(
        "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Without `version` the active version is checked.",
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type CheckStructureArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
