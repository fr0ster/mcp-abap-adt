/**
 * `IProfiler.list()` answers `IAdtResponse<IAbapTraceEntry[]>` as of
 * adt-clients 19 — already the parsed entries (`id`, `recordedAt`, `user`,
 * `objectName`, `state`, `expiresAt`, `system`, `client`, `host`, `size`,
 * `runtime`/`runtimeABAP`/`runtimeSystem`/`runtimeDatabase`, `isAggregated`,
 * `amdpFileSize` — every field the `abaptraces` feed carries, measured; see
 * `@mcp-abap-adt/interfaces`' `IAbapTraceEntry`), not the transport frame
 * this handler used to hand `response.data` to `parseRuntimePayloadToJson`.
 * There is no XML left for that parser to read here, so it is dropped along
 * with the `status`/`statusText`/`headers`/`config` fields `IAdtResponse` no
 * longer carries — see `answer()`'s own header for why a handler stops
 * reading transport state at all.
 *
 * **Caller-visible shape change**, not just an internal cleanup: this tool
 * used to answer `{success, status, payload: <freeform JSON parsed from the
 * feed XML>}` and now answers `{success, count, entries: IAbapTraceEntry[]}`
 * — named fields instead of a parsed-XML blob shaped by whatever the feed
 * document happened to contain.
 */
import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: 'RuntimeListProfilerTraceFiles',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] List ABAP profiler trace files available in ADT runtime. Returns structured entries with id, recordedAt, user, objectName, state, expiresAt, and sizing/timing fields.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

export async function handleRuntimeListProfilerTraceFiles(
  context: HandlerContext,
) {
  const { connection, logger } = context;
  const profiler = new AdtRuntimeClient(connection, logger).getProfiler();

  return answer(
    { tool: 'RuntimeListProfilerTraceFiles', detail: 'terse' },
    () => profiler.list(),
    (entries) => ({
      success: true,
      count: entries.length,
      entries,
    }),
  );
}
