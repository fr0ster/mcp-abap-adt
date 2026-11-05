import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  SOURCE_RANGE_WORDS,
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetLocalMacros',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the local macros include of the ABAP class named by class_name, at the version asked. Returns { class_name, version, part: 'source', source }. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    class_name: z.string().describe('Parent class name.'),
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

interface GetLocalMacrosArgs extends SourceRangeArgs {
  class_name: string;
  version?: ReadVersion;
}

export async function handleGetLocalMacros(
  context: HandlerContext,
  args: GetLocalMacrosArgs,
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  if (!class_name) return return_error(new Error('class_name is required'));
  const range = sourceRangeOf(args);
  if (range instanceof Error) return return_error(range);

  // `getLocalMacros()` is typed against `classDocuments`/`IClassResults`,
  // same shipped set as `getClass()` — confirmed against `AdtClient.d.ts`.
  const className = class_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getLocalMacros(
    resultsFor(classDocuments),
  );

  return answerSourceRead(
    { tool: 'GetLocalMacros', detail: 'terse' },
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
