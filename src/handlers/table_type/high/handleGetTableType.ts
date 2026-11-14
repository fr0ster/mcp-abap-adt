import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { readTableTypeMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTableType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP table type named by table_type_name in one request: its ADT metadata document (row type, access, key, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.',
  inputSchema: z.object({
    table_type_name: z.string().describe('Table type name.'),
    version: READ_VERSION_FIELD,
  }),
} as const;

type GetTableTypeArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetTableType(
  context: HandlerContext,
  args: GetTableTypeArgs,
) {
  const { connection, logger } = context;
  const { table_type_name, version = 'active' } = args;
  if (!table_type_name) {
    return return_error(new Error('table_type_name is required'));
  }

  const tableTypeName = table_type_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  return answer(
    { tool: 'GetTableType', detail: 'terse' },
    () => readTableTypeMetadata(client, { tableTypeName }, version),
    (metadata: AdtReading<string>) => ({
      success: true,
      table_type_name: tableTypeName,
      version,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
