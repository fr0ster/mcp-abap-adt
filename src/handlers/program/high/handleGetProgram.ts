import { programDocuments } from '@mcp-abap-adt/adt-clients';
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
import { readProgramMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetProgram',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP program (report) named by program_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. On ABAP Cloud, the programs are SAP\'s standard programs.',
  inputSchema: z.object({
    program_name: z.string().describe('Program name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
  }),
} as const;

interface GetProgramArgs {
  program_name: string;
  part?: ReadPart;
  version?: ReadVersion;
}

export async function handleGetProgram(
  context: HandlerContext,
  args: GetProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name, version = 'active' } = args;
  if (!program_name) return return_error(new Error('program_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

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
  return answer(
    { tool: 'GetProgram', detail: 'terse' },
    () => obj.read({ programName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      program_name: programName,
      version,
      part,
      source: source.raw,
    }),
  );
}
