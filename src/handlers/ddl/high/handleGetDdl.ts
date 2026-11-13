import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
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
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  SOURCE_RANGE_WORDS,
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readDdlMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDdl',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the CDS view (or classic DDL view) named by ddl_name in one request: its DDL source (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    ddl_name: z.string().describe('DDL source name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetDdlArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetDdl(context: HandlerContext, args: GetDdlArgs) {
  const { connection, logger } = context;
  const { ddl_name, version = 'active' } = args;
  if (!ddl_name) return return_error(new Error('ddl_name is required'));
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
