import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type IAbapTraceEntry,
  profilerTraceEntries,
} from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { purpose, toolDescription } from '../../../lib/description';
import {
  about,
  answered,
  entries,
  formatted,
  headShape,
  type ListDetailTable,
  type RowSchemas,
  rawLevel,
  readingAt,
  rows,
  writeJson,
  writeListing,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourProfiler } from '../../../lib/strategies/resultSets';

/** The lists the listing writes: what the description states. */
export const TRACE_FILES_LISTS: RowSchemas<{ entries: IAbapTraceEntry[] }> = {
  entries: about(
    'for each trace',
    rows('entries', {
      columns: [
        {
          name: 'id',
          means: 'its ID',
          cell: (entry: IAbapTraceEntry) => entry.id,
        },
        {
          name: 'recordedAt',
          means: 'when it was recorded',
          cell: (entry: IAbapTraceEntry) => entry.recordedAt,
        },
        {
          name: 'objectName',
          means: 'the object it traced',
          cell: (entry: IAbapTraceEntry) => entry.objectName,
        },
        {
          name: 'state',
          means: 'its state',
          cell: (entry: IAbapTraceEntry) => entry.state?.text ?? '',
        },
        {
          name: 'runtime',
          means: 'its runtime',
          cell: (entry: IAbapTraceEntry) => String(entry.runtime),
        },
      ],
      header: 'always',
    }),
  ),
};

/** The heads the listing opens with. */
export const TRACE_FILES_HEADS = [headShape('count', 'how many there are')];

export const TOOL_DEFINITION = {
  name: 'RuntimeListProfilerTraceFiles',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose('Lists the ABAP profiler traces recorded in the system.'),
  }),
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
const TRACE_READINGS: ListDetailTable<string | object> = {
  terse: written(profilerTraceEntries, (entries: IAbapTraceEntry[]) =>
    writeListing({
      heads: [{ head: 'count', value: String(entries.length) }],
      reading: { entries },
      lists: TRACE_FILES_LISTS,
    }),
  ),
  medium: written(profilerTraceEntries, (traces: IAbapTraceEntry[]) =>
    writeJson(
      { success: true, count: traces.length },
      { entries: traces },
      {
        entries: entries('entries', mediumEntry),
      },
    ),
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
