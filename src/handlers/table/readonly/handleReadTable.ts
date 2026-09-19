import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: Table. Will be useful for reading, creating, or updating table. [read-only] Read ABAP table definition and metadata. Answers: "show table fields", "display table structure", "view table X", "get table definition". Returns field list, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., Z_MY_TABLE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['table_name'],
  },
} as const;

export async function handleReadTable(
  context: HandlerContext,
  args: { table_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { table_name, version = 'active' } = args;
  if (!table_name) return return_error(new Error('table_name is required'));

  const tableName = table_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getTable(
    resultsFor(tableDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadTable', detail: 'terse' },
    () =>
      pair(
        () => obj.read({ tableName }, version, { analyse: analyseException }),
        () => obj.readMetadata({ tableName }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      table_name: tableName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
