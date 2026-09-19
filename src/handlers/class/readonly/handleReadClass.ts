import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: Class. Will be useful for reading, creating, or updating class. [read-only] Read ABAP class source code and metadata. Answers: "show class code", "display class source", "view class definition/implementation", "get class X". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['class_name'],
  },
} as const;

export async function handleReadClass(
  context: HandlerContext,
  args: { class_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  if (!class_name) return return_error(new Error('class_name is required'));

  const className = class_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getClass(
    resultsFor(classDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadClass', detail: 'terse' },
    () =>
      pair(
        () => obj.read({ className }, version, { analyse: analyseException }),
        () => obj.readMetadata({ className }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      class_name: className,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
