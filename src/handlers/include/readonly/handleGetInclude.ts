import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetInclude',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ANY single ABAP include source by name, from anywhere in the repository (an include may live outside any single program tree). Reads includes (PROG/I) by name.',
  inputSchema: {
    include_name: z.string().describe('Name of the ABAP Include'),
  },
} as const;

export async function handleGetInclude(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  if (!args?.include_name) {
    return return_error('Include name is required');
  }
  logger?.info(`Fetching include: ${args.include_name}`);
  // The adt-clients member, answered by `answer()`: SAP's refusal is the
  // method's error as it is, a credential failure the chain's answer, a throw
  // of our own `client_threw`.
  return answer(
    { tool: 'GetInclude', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getInclude(args.include_name, { analyse: analyseException }),
    (source: AdtReading<string>) => source.raw,
  );
}
