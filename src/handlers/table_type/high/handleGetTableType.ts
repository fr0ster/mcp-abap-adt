import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { readTableTypeMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTableType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP table type named by table_type_name in one request: its ADT metadata document (row type, access, key, package, description). Returns it under `metadata`, with `part: "metadata"`.',
  inputSchema: {
    type: 'object',
    properties: {
      table_type_name: {
        type: 'string',
        description: 'Table type name.',
      },
    },
    required: ['table_type_name'],
  },
} as const;

interface GetTableTypeArgs {
  table_type_name?: string;
}

export async function handleGetTableType(
  context: HandlerContext,
  args: GetTableTypeArgs,
) {
  const { connection, logger } = context;
  const { table_type_name } = args;
  if (!table_type_name) {
    return return_error(new Error('table_type_name is required'));
  }

  const tableTypeName = table_type_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  return answer(
    { tool: 'GetTableType', detail: 'terse' },
    () => readTableTypeMetadata(client, { tableTypeName }),
    (metadata: AdtReading<string>) => ({
      success: true,
      table_type_name: tableTypeName,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
