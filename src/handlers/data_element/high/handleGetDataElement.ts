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
import { readDataElementMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';

export const TOOL_DEFINITION = {
  name: 'GetDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    readerParts({
      object: 'an ABAP data element',
      holding:
        'its domain or built-in type, its labels, search help, package and description',
    }),
  ),
  inputSchema: z.object({
    data_element_name: requiredText('data_element_name is required').describe(
      'Data element name.',
    ),
    version: READ_VERSION_FIELD,
  }),
} as const;

type GetDataElementArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetDataElement(
  context: HandlerContext,
  args: GetDataElementArgs,
) {
  const { connection, logger } = context;
  const { data_element_name, version = 'active' } = args;
  const dataElementName = data_element_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  // A data element has no source of its own — `IDataElementContract`
  // composes `IAdtMetadataReadable` and nothing else, so unlike its
  // siblings there is no `.read()` to call at all. One call, at the version
  // asked.
  return answer(
    { tool: 'GetDataElement', detail: 'terse' },
    () => readDataElementMetadata(client, { dataElementName }, version),
    (metadata: AdtReading<string>) => ({
      success: true,
      data_element_name: dataElementName,
      version,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
