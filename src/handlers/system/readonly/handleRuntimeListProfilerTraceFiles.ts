import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type IAbapTraceEntry,
  profilerTraceEntries,
} from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import {
  answered,
  type DetailTable,
  entries,
  formatted,
  rawLevel,
  readingAt,
  rows,
  writeJson,
  writeListing,
} from '../../../lib/detail';
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
 * What RuntimeListProfilerTraceFiles answers at each `detail`: the reading
 * passed to the call (`src/lib/detail`) — terse, medium and full over
 * adt-strategies' typed reading of
 * the traces feed (`profilerTraceEntries`): terse a TSV row per trace — id,
 * recordedAt, objectName, state, runtime (the uri is the id's, system,
 * client and host the same on every row, the runtime split the profile
 * view's); medium every field but the uri; full the answer before `detail`;
 * raw the feed as ADT sent it.
 */
/** Every trace the feed held, by its id. */
// Every trace the feed held, written by the listing writers.
const TRACE_READINGS: DetailTable<string | object> = {
  terse: formatted(
    profilerTraceEntries,
    (entries: IAbapTraceEntry[]) =>
      writeListing({
        heads: [{ head: 'count', value: String(entries.length) }],
        reading: { entries },
        lists: {
          entries: rows('entries', {
            columns: [
              { name: 'id', cell: (entry: IAbapTraceEntry) => entry.id },
              {
                name: 'recordedAt',
                cell: (entry: IAbapTraceEntry) => entry.recordedAt,
              },
              {
                name: 'objectName',
                cell: (entry: IAbapTraceEntry) => entry.objectName,
              },
              {
                name: 'state',
                cell: (entry: IAbapTraceEntry) => entry.state?.text ?? '',
              },
              {
                name: 'runtime',
                cell: (entry: IAbapTraceEntry) => String(entry.runtime),
              },
            ],
            header: 'always',
          }),
        },
      }).answer,
  ),
  medium: formatted(
    profilerTraceEntries,
    (traces: IAbapTraceEntry[]) =>
      writeJson(
        { success: true, count: traces.length },
        { entries: traces },
        {
          entries: entries('entries', mediumEntry),
        },
      ).answer,
  ),
  full: formatted(profilerTraceEntries, (entries: IAbapTraceEntry[]) => ({
    success: true,
    count: entries.length,
    entries,
  })),
  raw: rawLevel,
};

export async function handleRuntimeListProfilerTraceFiles(
  context: HandlerContext,
  args: ListArgs = {},
) {
  const { connection, logger } = context;
  // The level's reading, selected before the call and passed to it.
  const profiler = new AdtRuntimeClient(connection, logger).getProfiler({
    ...ourProfiler,
    list: readingAt(TRACE_READINGS, levelOf(args)),
  });

  return answer(
    { tool: 'RuntimeListProfilerTraceFiles', detail: detailOf(args) },
    () => profiler.list({ analyse: analyseException }),
    answered,
  );
}
