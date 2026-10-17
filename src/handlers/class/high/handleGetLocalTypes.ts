import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetLocalTypes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Read the local types include of a class (its implementations include), active or inactive version. Returns { class_name, version, part: 'source', source }.",
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.',
        default: 'active',
      },
    },
    required: ['class_name'],
  },
} as const;

interface GetLocalTypesArgs {
  class_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetLocalTypes(
  context: HandlerContext,
  args: GetLocalTypesArgs,
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  if (!class_name) return return_error(new Error('class_name is required'));

  // `getLocalTypes()` is typed against `classDocuments`/`IClassResults`,
  // same shipped set as `getClass()` — confirmed against `AdtClient.d.ts`.
  const className = class_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getLocalTypes(
    resultsFor(classDocuments),
  );

  return answer(
    { tool: 'GetLocalTypes', detail: 'terse' },
    () => obj.read({ className }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      class_name: className,
      version,
      part: 'source',
      source: source.raw,
    }),
  );
}
