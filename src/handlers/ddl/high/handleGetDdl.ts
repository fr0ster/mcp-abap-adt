import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { sourceReader, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_PART_FIELD, readPartOf } from '../../../lib/handlers/readPart';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readDdlMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDdl',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    sourceReader({
      object: 'a CDS view or classic DDL view',
      metadata: true,
    }),
  ),
  inputSchema: z.object({
    ddl_name: requiredText('ddl_name is required').describe('DDL source name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetDdlArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetDdl(context: HandlerContext, args: GetDdlArgs) {
  const { connection, logger } = context;
  const { ddl_name, version = 'active' } = args;
  const part = readPartOf(args.part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const ddlName = ddl_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getDdl(resultsFor(ddlDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetDdl', detail: 'terse' },
      () => readDdlMetadata(client, { ddlName }, version),
      (metadata: AdtReading<string>) => ({
        success: true,
        ddl_name: ddlName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetDdl', detail: 'terse' },
    range,
    () => obj.read({ ddlName }, version, { analyse: analyseException }),
    (source, cut) => ({
      success: true,
      ddl_name: ddlName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
