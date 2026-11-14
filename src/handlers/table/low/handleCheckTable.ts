import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CheckTableLow Handler - Syntax check for ABAP Table
 *
 * Uses AdtClient.getTable().check from @mcp-abap-adt/adt-clients 19.
 *
 * **`ddl_code` is the source checked.** Since adt-clients 43,
 * `AdtTable.check()` sends `config.source` as the check run's artifact, as
 * the structure check does (#9): given `ddl_code`, the check is of that
 * source, not only of what is saved.
 *
 * **`reporter` does not reach the wire.** `AdtTable.check()` always runs
 * `'abapCheckRun'`; the parameter stays on the schema, unforwarded.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'CheckTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages.',
  inputSchema: z.object({
    table_name: z.string().describe('Table name'),
    ddl_code: z
      .string()
      .optional()
      .describe(
        'DDL source to check instead of the saved version: sent with the check run.',
      ),
    version: z
      .enum(['active', 'inactive', 'new'])
      .optional()
      .describe(
        "Version to check: 'active' selects the last activated version. 'inactive' and 'new' both check the inactive version. Without `version` the active version is checked.",
      ),
    reporter: z
      .enum(['tableStatusCheck', 'abapCheckRun'])
      .optional()
      .describe(
        "Accepted for compatibility; not sent to the server. The shipped check endpoint always runs 'abapCheckRun', regardless of this value.",
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type CheckTableArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCheckTable(
  context: HandlerContext,
  args: CheckTableArgs,
) {
  const { connection, logger } = context;
  const { table_name, version, ddl_code } = args;

  if (!table_name) {
    return return_error(new Error('table_name is required'));
  }

  const tableName = table_name.toUpperCase();
  const validVersions = ['active', 'inactive', 'new'];
  const checkVersion =
    version && validVersions.includes(version.toLowerCase())
      ? version.toLowerCase()
      : 'active';
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckTableLow', detail },
    () =>
      withAdtHeaders(context, 'table.check', (headers) =>
        createAdtClient(connection, logger)
          .getTable(resultsFor(tableDocuments))
          .check({ tableName, source: ddl_code }, checkVersion, {
            headers,
            analyse: analyseException,
          }),
      ),
    project(detail, terseCheck),
  );
}
