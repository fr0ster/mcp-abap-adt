import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  purpose,
  sourceReader,
  toolDescription,
} from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
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
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readProgramMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetProgram',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    sourceReader({
      object: 'an ABAP program',
      purpose: purpose(
        "Reads the source of an ABAP program (report), on ABAP Cloud one of SAP's standard programs, at the version asked, or its metadata.",
      ),
      range: 'with-count',
      metadata: true,
    }),
  ),
  inputSchema: z.object({
    program_name: requiredText('program_name is required').describe(
      'Program name.',
    ),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetProgramArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetProgram(
  context: HandlerContext,
  args: GetProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name, version = 'active' } = args;
  const part = readPartOf(args.part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const programName = program_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getProgram(resultsFor(programDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetProgram', detail: 'terse' },
      () => readProgramMetadata(client, { programName }, version),
      (metadata: AdtReading<string>) => ({
        success: true,
        program_name: programName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetProgram', detail: 'terse' },
    range,
    () => obj.read({ programName }, version, { analyse: analyseException }),
    (source, cut) => ({
      success: true,
      program_name: programName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
