import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'GetInterface',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an ABAP interface in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified, not yet activated version.',
        default: 'active',
      },
    },
    required: ['interface_name'],
  },
} as const;

interface GetInterfaceArgs {
  interface_name: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
}

export async function handleGetInterface(
  context: HandlerContext,
  args: GetInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name, version = 'active' } = args;
  if (!interface_name)
    return return_error(new Error('interface_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  const interfaceName = interface_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getInterface(
    resultsFor(interfaceDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetInterface', detail: 'terse' },
      () => obj.readMetadata({ interfaceName }, { analyse: analyseException }),
      (metadata: AdtReading<string>) => ({
        success: true,
        interface_name: interfaceName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answer(
    { tool: 'GetInterface', detail: 'terse' },
    () => obj.read({ interfaceName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      interface_name: interfaceName,
      version,
      interface_data: source.raw,
    }),
  );
}
