import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type IAbapTraceEntry,
} from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { type AnswerTable, answerAt, tsv } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourProfiler } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'RuntimeListProfilerTraceFiles',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [runtime] List ABAP profiler trace files available in ADT runtime. Returns each trace: by default as TSV (id, recordedAt, objectName, state, runtime); with detail medium or full every field (user, expiresAt, system, client, host, size and the runtime split).',
  inputSchema: z.object({ ...DETAIL_SHAPE }),
} as const;

type ListArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** Every field the reading read of a trace, without its uri (medium). */
function mediumEntry(entry: IAbapTraceEntry) {
  const { uri: _uri, ...fields } = entry;
  return fields;
}

/**
 * What RuntimeListProfilerTraceFiles answers at each `detail`, selected
 * before the call (`src/lib/detail`), over adt-strategies' typed reading of
 * the traces feed (`profilerTraceEntries`): terse a TSV row per trace — id,
 * recordedAt, objectName, state, runtime (the uri is the id's, system,
 * client and host the same on every row, the runtime split the profile
 * view's); medium every field but the uri; full the answer before `detail`.
 * The typed reading keeps no document, so raw is the full answer.
 */
const TRACE_ANSWERS: AnswerTable<IAbapTraceEntry[], string | object> = {
  terse: (entries) =>
    [
      `# count ${entries.length}`,
      tsv(
        ['id', 'recordedAt', 'objectName', 'state', 'runtime'],
        entries.map((entry) => [
          entry.id,
          entry.recordedAt,
          entry.objectName,
          entry.state?.text ?? '',
          String(entry.runtime),
        ]),
      ),
    ].join('\n'),
  medium: (entries) => ({
    success: true,
    count: entries.length,
    entries: entries.map(mediumEntry),
  }),
  full: (entries) => ({ success: true, count: entries.length, entries }),
  raw: (entries) => ({ success: true, count: entries.length, entries }),
};

export async function handleRuntimeListProfilerTraceFiles(
  context: HandlerContext,
  args: ListArgs = {},
) {
  const { connection, logger } = context;
  const profiler = new AdtRuntimeClient(connection, logger).getProfiler(
    ourProfiler,
  );
  const shown = answerAt(TRACE_ANSWERS, levelOf(args));

  return answer(
    { tool: 'RuntimeListProfilerTraceFiles', detail: detailOf(args) },
    () => profiler.list({ analyse: analyseException }),
    shown,
  );
}
