import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { createAdtClient } from '../../../lib/clients';
import { sourceReader, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetLocalTypes',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    sourceReader({
      object: 'the local types (implementations) include of an ABAP class',
      range: 'with-count',
    }),
  ),
  inputSchema: z.object({
    class_name: requiredText('class_name is required').describe(
      'Parent class name.',
    ),
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetLocalTypesArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetLocalTypes(
  context: HandlerContext,
  args: GetLocalTypesArgs,
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  const range = sourceRangeOf(args);
  if (range instanceof Error) return return_error(range);

  // `getLocalTypes()` is typed against `classDocuments`/`IClassResults`,
  // same shipped set as `getClass()` — confirmed against `AdtClient.d.ts`.
  const className = class_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getLocalTypes(
    resultsFor(classDocuments),
  );

  return answerSourceRead(
    { tool: 'GetLocalTypes', detail: 'terse' },
    range,
    () => obj.read({ className }, version, { analyse: analyseException }),
    (source, cut) => ({
      success: true,
      class_name: className,
      version,
      part: 'source',
      source,
      ...rangeFields(cut),
    }),
  );
}
