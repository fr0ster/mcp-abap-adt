import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetProgram',
  available_in: ['onprem'] as const,
  description:
    'Read an ABAP program in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.',
        default: 'active',
      },
    },
    required: ['program_name'],
  },
} as const;

interface GetProgramArgs {
  program_name: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
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
  const obj = createAdtClient(connection, logger).getProgram(
    resultsFor(programDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetProgram', detail: 'terse' },
      () => obj.readMetadata({ programName }, { analyse: analyseException }),
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
