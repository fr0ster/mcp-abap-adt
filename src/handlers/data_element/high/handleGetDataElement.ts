import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { readDataElementMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP data element named by data_element_name in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['data_element_name'],
  },
} as const;

interface GetDataElementArgs {
  data_element_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetDataElement(
  context: HandlerContext,
  args: GetDataElementArgs,
) {
  const { connection, logger } = context;
  const { data_element_name, version = 'active' } = args;
  if (!data_element_name)
    return return_error(new Error('data_element_name is required'));

  const dataElementName = data_element_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  // A data element has no source of its own — `IDataElementContract`
  // composes `IAdtMetadataReadable` and nothing else, so unlike its
  // siblings there is no `.read()` to call at all. `version` is not
  // forwarded — the library ignores it at every level for this family — and
  // is echoed, deliberately unfixed (task 11 fix round 1, deferred to the
  // documentation task). One call, used for the one field this tool has
  // always answered.
  return answer(
    { tool: 'GetDataElement', detail: 'terse' },
    () => readDataElementMetadata(client, { dataElementName }),
    (metadata: AdtReading<string>) => ({
      success: true,
      data_element_name: dataElementName,
      version,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
