import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { readerParts, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { readTableTypeMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';

export const TOOL_DEFINITION = {
  name: 'GetTableType',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    readerParts({
      object: 'an ABAP table type',
      holding: 'its element type, access, key, package and description',
    }),
  ),
  inputSchema: z.object({
    table_type_name: requiredText('table_type_name is required').describe(
      'Table type name.',
    ),
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
