import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDdl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP DDL source definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_VIEW).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['ddl_name'],
  },
} as const;

interface GetDdlArgs {
  ddl_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetDdl(context: HandlerContext, args: GetDdlArgs) {
  const { connection, logger } = context;
  const { ddl_name, version = 'active' } = args;
  if (!ddl_name) return return_error(new Error('ddl_name is required'));

  const ddlName = ddl_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getDdl(
    resultsFor(ddlDocuments),
  );

  // GetDdl has only ever answered the source, not the metadata — one call,
  // unlike ReadDdl's pair.
  return answer(
    { tool: 'GetDdl', detail: 'terse' },
    () => obj.read({ ddlName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      ddl_name: ddlName,
      version,
      ddl_data: source.raw,
    }),
  );
}
