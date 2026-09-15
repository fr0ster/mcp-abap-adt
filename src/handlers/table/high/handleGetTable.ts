import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP table definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., Z_MY_TABLE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['table_name'],
  },
} as const;

interface GetTableArgs {
  table_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetTable(
  context: HandlerContext,
  args: GetTableArgs,
) {
  const { connection, logger } = context;
  const { table_name, version = 'active' } = args;
  if (!table_name) return return_error(new Error('table_name is required'));

  const tableName = table_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getTable(
    resultsFor(tableDocuments),
  );

  // GetTable has only ever answered the source, not the metadata — one
  // call, unlike ReadTable's pair.
  return answer(
    { tool: 'GetTable', detail: 'terse' },
    () => obj.read({ tableName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      table_name: tableName,
      version,
      table_data: source.raw,
    }),
  );
}
