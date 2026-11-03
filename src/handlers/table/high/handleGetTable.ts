import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_FIELD,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { readTableMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP database table named by table_name in one request: its definition with its fields, as source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read.',
  inputSchema: z.object({
    table_name: z.string().describe('Table name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
  }),
} as const;

interface GetTableArgs {
  table_name: string;
  part?: ReadPart;
  version?: ReadVersion;
}

export async function handleGetTable(
  context: HandlerContext,
  args: GetTableArgs,
) {
  const { connection, logger } = context;
  const { table_name, version = 'active' } = args;
  if (!table_name) return return_error(new Error('table_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  const tableName = table_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getTable(resultsFor(tableDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetTable', detail: 'terse' },
      () => readTableMetadata(client, { tableName }, version),
      (metadata: AdtReading<string>) => ({
        success: true,
        table_name: tableName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answer(
    { tool: 'GetTable', detail: 'terse' },
    () => obj.read({ tableName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      table_name: tableName,
      version,
      part,
      source: source.raw,
    }),
  );
}
