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
import { readFunctionGroupMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';

export const TOOL_DEFINITION = {
  name: 'GetFunctionGroup',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    readerParts({
      object: 'an ABAP function group',
      holding: 'its package, description and contents',
    }),
  ),
  inputSchema: z.object({
    function_group_name: requiredText(
      'function_group_name is required',
    ).describe('FunctionGroup name.'),
    version: READ_VERSION_FIELD,
  }),
} as const;

type GetFunctionGroupArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetFunctionGroup(
  context: HandlerContext,
  args: GetFunctionGroupArgs,
) {
  const { connection, logger } = context;
  const { function_group_name, version = 'active' } = args;
  const functionGroupName = function_group_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  // A function group is a container: it has no source of its own —
  // `IFunctionGroupContract` composes `IAdtMetadataReadable` and nothing
  // else, so unlike its siblings there is no `.read()` to call at all. One
  // call, at the version asked.
  return answer(
    { tool: 'GetFunctionGroup', detail: 'terse' },
    () => readFunctionGroupMetadata(client, { functionGroupName }, version),
    (metadata: AdtReading<string>) => ({
      success: true,
      function_group_name: functionGroupName,
      version,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
