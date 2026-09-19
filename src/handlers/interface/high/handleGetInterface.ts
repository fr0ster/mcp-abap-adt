import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetInterface',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP interface definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., Z_MY_INTERFACE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['interface_name'],
  },
} as const;

interface GetInterfaceArgs {
  interface_name: string;
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

  const interfaceName = interface_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getInterface(
    resultsFor(interfaceDocuments),
  );

  // GetInterface has only ever answered the source, not the metadata — one
  // call, unlike ReadInterface's pair.
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
