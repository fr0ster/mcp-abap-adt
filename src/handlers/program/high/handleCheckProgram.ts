import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckProgram as handleCheckProgramLow } from '../low/handleCheckProgram';

export const TOOL_DEFINITION = {
  name: 'CheckProgram',
  available_in: ['onprem', 'legacy'] as const,
  description:
    'Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Not available on cloud.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name (e.g., ZMCP_MY_PROGRAM).',
      },
    },
    required: ['program_name'],
  },
} as const;

export async function handleCheckProgram(
  context: HandlerContext,
  args: { program_name: string },
) {
  const result = await handleCheckProgramLow(context, args);
  return normalizeCheckResponse(result, args.program_name?.toUpperCase());
}
