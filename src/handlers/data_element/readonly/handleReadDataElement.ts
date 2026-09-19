import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: DataElement. Will be useful for reading, creating, or updating data element. [read-only] Read ABAP data element definition and metadata. Answers: "show data element X", "display data element properties", "view DTEL definition", "get data element type". Returns definition, domain, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name (e.g., Z_MY_DATA_ELEMENT).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['data_element_name'],
  },
} as const;

export async function handleReadDataElement(
  context: HandlerContext,
  args: { data_element_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { data_element_name, version = 'active' } = args;
  if (!data_element_name)
    return return_error(new Error('data_element_name is required'));

  const dataElementName = data_element_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getDataElement(
    resultsFor(dataElementDocuments),
  );

  // A data element has no source of its own — `IDataElementContract`
  // composes `IAdtMetadataReadable` and nothing else, so unlike its siblings
  // in this family there is no `.read()` to call at all: `read` and
  // `readMetadata` fetched the identical document even before 19. One call,
  // used for both fields this tool has always answered.
  return answer(
    { tool: 'ReadDataElement', detail: 'terse' },
    () => obj.readMetadata({ dataElementName }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      data_element_name: dataElementName,
      version,
      source_code: metadata.raw,
      metadata: metadata.raw,
    }),
  );
}
