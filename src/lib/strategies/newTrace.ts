import { compareRecordedAt } from '@mcp-abap-adt/adt-clients';
import type {
  IAdtError,
  IAdtResponse,
  ITraceEntry,
} from '@mcp-abap-adt/interfaces';
import { succeededWith } from './sequence';

/**
 * The id this run produced, found by difference.
 *
 * `IClassExecuteWithProfilerOptions`/`ClassExecutor` in adt-clients 19 no
 * longer promise a `traceId` from a run — `IAdtExecutors.d.ts`, on the
 * executors: "a run does not wait for a trace, so 'where to look', 'how many
 * times' and 'how long between tries' were asking the caller to configure a
 * search that no longer happens." A run only schedules and executes; finding
 * what it produced is a search over `IProfiler.list()`, which is what this is.
 *
 * Not by position: `CLIENT_API_REFERENCE.md` measured a feed whose first
 * entries were minutes old and whose last were eight days older, so "the first
 * (or last) id in the document" is a trace chosen at random. Not by
 * `recordedAt` as a string either — `09:00:00Z` sorts below `10:00:00+02:00`
 * while being later — which is what `compareRecordedAt` is exported for. And
 * not by "the newest entry in the whole feed" either, snapshot or no: an entry
 * that was already there before this run can be newer by clock time than the
 * one this run just produced (SAP does not promise the feed is time-ordered,
 * only that `recordedAt` is honest), so only the set difference against the
 * snapshot taken before scheduling tells fresh from stale.
 */
export async function newTraceAfter(
  profiler: {
    list: (o?: {
      user?: string;
    }) => Promise<IAdtResponse<ITraceEntry[], IAdtError>>;
  },
  before: ReadonlySet<string>,
  options: {
    attempts: number;
    delayMs: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<IAdtResponse<string | undefined, IAdtError>> {
  const wait =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const listed = await profiler.list();

    // A refused feed read goes back untouched — the rule `sequence` and
    // `withLock` already follow. Looping past it would turn "SAP said no"
    // into "no trace yet", which is this repository's masking defect in
    // another coat.
    if (!listed.ok) {
      return listed as unknown as IAdtResponse<string | undefined, IAdtError>;
    }

    const fresh = listed
      .getResult()
      .value.filter((entry) => !before.has(entry.id));
    if (fresh.length > 0) {
      return succeededWith([...fresh].sort(compareRecordedAt).at(-1)?.id);
    }
    if (attempt < options.attempts) await wait(options.delayMs);
  }

  // Attempts spent, the feed answering normally every time. A success with no
  // trace id: SAP writes it asynchronously and it may arrive a week later.
  // Nothing refused anything, so there is nothing to report as a failure.
  return succeededWith(undefined as string | undefined);
}
