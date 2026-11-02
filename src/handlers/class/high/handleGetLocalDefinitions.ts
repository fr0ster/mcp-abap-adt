import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_PROPERTY,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetLocalDefinitions',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Reads the local definitions include (the definitions include) of the ABAP class named by class_name, at the version asked. Returns { class_name, version, part: 'source', source }.",
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name.',
      },
      version: READ_VERSION_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface GetLocalDefinitionsArgs {
  class_name: string;
  version?: ReadVersion;
}

export async function handleGetLocalDefinitions(
  context: HandlerContext,
  args: GetLocalDefinitionsArgs,
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  if (!class_name) return return_error(new Error('class_name is required'));

  // `getLocalDefinitions()` is typed against `classDocuments`/`IClassResults`,
  // same shipped set as `getClass()` — confirmed against `AdtClient.d.ts`.
  const className = class_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getLocalDefinitions(
    resultsFor(classDocuments),
  );

  return answer(
    { tool: 'GetLocalDefinitions', detail: 'terse' },
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
