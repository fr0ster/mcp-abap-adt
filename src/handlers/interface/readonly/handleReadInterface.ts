import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadInterface',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Read, Create, Update. Subject: Interface. Will be useful for reading, creating, or updating interface. [read-only] Read ABAP interface source code and metadata. Answers: "show interface code", "display interface definition", "view interface X", "get interface source". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., ZIF_MY_INTERFACE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['interface_name'],
  },
} as const;

export async function handleReadInterface(
  context: HandlerContext,
  args: { interface_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { interface_name, version = 'active' } = args;
  if (!interface_name)
    return return_error(new Error('interface_name is required'));

  const interfaceName = interface_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getInterface(
    resultsFor(interfaceDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadInterface', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ interfaceName }, version, {
            analyse: analyseException,
          }),
        () =>
          obj.readMetadata({ interfaceName }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      interface_name: interfaceName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
