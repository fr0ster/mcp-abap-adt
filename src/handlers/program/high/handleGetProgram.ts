import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetProgram',
  available_in: ['onprem', 'legacy'] as const,
  description:
    'Retrieve ABAP program definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name (e.g., Z_MY_PROGRAM).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['program_name'],
  },
} as const;

interface GetProgramArgs {
  program_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetProgram(
  context: HandlerContext,
  args: GetProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name, version = 'active' } = args;
  if (!program_name) return return_error(new Error('program_name is required'));

  const programName = program_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getProgram(
    resultsFor(programDocuments),
  );

  // GetProgram has only ever answered the source, not the metadata — one
  // call, unlike ReadProgram's pair. Unlike ReadProgram, it never rejected
  // includes by object type either, so that gate is not reintroduced here.
  return answer(
    { tool: 'GetProgram', detail: 'terse' },
    () => obj.read({ programName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      program_name: programName,
      version,
      program_data: source.raw,
    }),
  );
}
