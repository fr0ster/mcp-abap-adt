import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadDdl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: DDL source. Will be useful for reading, creating, or updating a DDL source. [read-only] Read ABAP CDS view source code and metadata. Answers: "show CDS view source", "display view definition", "view CDS X", "get CDS code". Returns source code, package, responsible, description.',
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
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['ddl_name'],
  },
} as const;

export async function handleReadDdl(
  context: HandlerContext,
  args: { ddl_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { ddl_name, version = 'active' } = args;
  if (!ddl_name) return return_error(new Error('ddl_name is required'));

  const ddlName = ddl_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getDdl(
    resultsFor(ddlDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadDdl', detail: 'terse' },
    () =>
      pair(
        () => obj.read({ ddlName }, version, { analyse: analyseException }),
        () => obj.readMetadata({ ddlName }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      ddl_name: ddlName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
