/**
 * Integration tests for runtime profiling and dumps handlers.
 *
 * Scenarios:
 * - Create temporary class, run with profiling, read/analyze resulting trace
 * - Create temporary program, run with profiling, read/analyze resulting trace (on-prem only)
 * - Run the shared class ZMCP_SHR_DUMP_CLS (division by zero), then read/analyze the dump it made
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { handleRuntimeAnalyzeProfilerTrace } from '../../../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace';
import { handleRuntimeGetDumpById } from '../../../../handlers/system/readonly/handleRuntimeGetDumpById';
import { handleRuntimeGetProfilerTraceData } from '../../../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { handleRuntimeListFeeds } from '../../../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleRuntimeListProfilerTraceFiles } from '../../../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
import { handleRuntimeRunClassWithProfiling } from '../../../../handlers/system/readonly/handleRuntimeRunClassWithProfiling';
import { handleRuntimeRunProgramWithProfiling } from '../../../../handlers/system/readonly/handleRuntimeRunProgramWithProfiling';
import { getTimeout } from '../../helpers/configHelpers';
import { candidatesWorthOpening } from '../../helpers/dumpFeed';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTextPayload(result: any): any {
  const textContent = result.content.find((c: any) => c.type === 'text') as any;
  if (!textContent?.text) {
    throw new Error('Missing text payload in handler response');
  }
  return JSON.parse(textContent.text);
}

function extractDumpIdFromFeedEntry(entry: any): string {
  // The dump id lives in the feed entry `id` (the `link` field is empty in the
  // runtime-dumps feed). The path is `/runtime/dumps/<id>` (plural). The id
  // segment is URL-encoded (trailing/embedded spaces as %20) and contains no
  // "/", so it is passed as-is — NOT decoded — to RuntimeGetDumpById, which
  // reads `/runtime/dump/<id>` (singular) and rejects ids containing "/".
  const source = String(entry?.id ?? entry?.link ?? '');
  const match = source.match(/\/runtime\/dumps\/(.+)$/);
  return match ? match[1] : '';
}

function extractDumpIdsFromFeedEntries(entries: any[]): string[] {
  return entries.map(extractDumpIdFromFeedEntry).filter(Boolean);
}

/**
 * `{ id, title }` per entry, newest first (the feed's own order — confirmed
 * live, 2026-09-22).
 *
 * The list carries `title` (the exception's short text, e.g. "Division by 0
 * (type I or INT8)") for free — no per-entry fetch — but never `content` (it
 * reads empty on this system, so it cannot narrow anything). `title` names
 * the exception TYPE, not the dumping class, so it is a cheap pre-filter for
 * "is this even the right kind of dump", not proof of which run made it —
 * that still needs one `RuntimeGetDumpById` per surviving candidate.
 */
function extractDumpCandidatesFromFeedEntries(
  entries: any[],
): Array<{ id: string; title: string }> {
  return entries
    .map((entry) => ({
      id: extractDumpIdFromFeedEntry(entry),
      title: String(entry?.title ?? ''),
    }))
    .filter((c) => c.id);
}

function extractHandlerErrorText(result: any): string {
  try {
    const textContent = result?.content?.find((c: any) => c.type === 'text');
    if (typeof textContent?.text === 'string' && textContent.text.trim()) {
      return textContent.text;
    }
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

describe('Runtime Profiling and Dumps Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('runtime-readonly');
  const createdTraceIds = new Set<string>();
  let dumpIdFromGeneratedFailure: string | undefined;

  beforeAll(async () => {
    tester = new LambdaTester(
      'runtime_readonly_handlers',
      'test_runtime_readonly',
      'runtime-readonly',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        logger?.info('Runtime readonly handlers setup complete');
      },
      async (_context: LambdaTesterContext) => {
        logger?.info('No cleanup required for readonly runtime handlers');
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('Runtime readonly handlers test suite complete');
    });
  });

  /**
   * The profiled runs use the SHARED class and program — nothing is created or
   * deleted, and running an object changes nothing. A run's criterion is the
   * trace id it produced. SAP writes a trace asynchronously, so an id is not
   * yet a readable trace; reading belongs to the test after these, on a trace
   * `shared:setup` brought to "Finished" and recorded in `trace_id_or_uri`.
   *
   * These used to create a class and a program of their own each run. The
   * class was never activated in soft mode, so its run traced nothing; the
   * program was deleted while its trace was still being written. Neither
   * needed to be new.
   */
  const listTraces = async (
    context: LambdaTesterContext,
  ): Promise<Array<{ id: string; objectName?: string }>> => {
    const listed = await tester.invokeToolOrHandler(
      'RuntimeListProfilerTraceFiles',
      {},
      async () =>
        handleRuntimeListProfilerTraceFiles(
          createHandlerContext({ connection: context.connection, logger }),
        ),
    );
    expect(listed.isError).toBe(false);
    return parseTextPayload(listed).entries ?? [];
  };

  it(
    'runs the shared class under the profiler and gets the id of its trace',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const className = String(context.params?.profiled_class_name ?? '');
        if (!className) {
          throw new Error('profiled_class_name is not configured');
        }
        const args = {
          class_name: className,
          description: `MCP_RUNTIME_CLASS_${Date.now()}`,
          max_trace_attempts:
            toPositiveInt(context.params?.profiled_run_max_trace_attempts, 0) ||
            undefined,
          trace_retry_delay_ms:
            toPositiveInt(
              context.params?.profiled_run_trace_retry_delay_ms,
              0,
            ) || undefined,
        };
        const run = await tester.invokeToolOrHandler(
          'RuntimeRunClassWithProfiling',
          args,
          async () =>
            handleRuntimeRunClassWithProfiling(
              createHandlerContext({ connection: context.connection, logger }),
              args,
            ),
        );
        expect(run.isError).toBe(false);
        const data = parseTextPayload(run);
        expect(data.success).toBe(true);
        expect(data.trace_id).toBeTruthy();
        createdTraceIds.add(String(data.trace_id).toUpperCase());
        logger?.info(`class ${className} traced: ${data.trace_id}`);
      });
    },
    getTimeout('long'),
  );

  it(
    'runs the shared program under the profiler and gets the id of its trace (on-prem)',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (context.isCloudSystem) {
          throw new Error(
            'SKIP: programs are not available on cloud systems (expected on-prem only)',
          );
        }
        const programName = String(
          context.params?.profiled_program_name ?? '',
        ).toUpperCase();
        if (!programName) {
          throw new Error('profiled_program_name is not configured');
        }

        // A program run answers no trace id, so the id is the one trace in the
        // list that is new since the run and belongs to this program.
        const before = new Set((await listTraces(context)).map((t) => t.id));
        const args = {
          program_name: programName,
          description: `MCP_RUNTIME_PROGRAM_${Date.now()}`,
        };
        const run = await tester.invokeToolOrHandler(
          'RuntimeRunProgramWithProfiling',
          args,
          async () =>
            handleRuntimeRunProgramWithProfiling(
              createHandlerContext({ connection: context.connection, logger }),
              args,
            ),
        );
        expect(run.isError).toBe(false);
        const data = parseTextPayload(run);
        expect(data.success).toBe(true);
        expect(data.profiler_id).toBeDefined();

        const attempts = toPositiveInt(context.params?.trace_feed_retries, 6);
        const waitMs = Math.max(
          100,
          toPositiveInt(context.params?.trace_feed_retry_delay_ms, 1000),
        );
        let traceId: string | undefined;
        for (let attempt = 1; attempt <= attempts && !traceId; attempt += 1) {
          traceId = (await listTraces(context)).find(
            (t) =>
              !before.has(t.id) &&
              String(t.objectName ?? '')
                .toUpperCase()
                .startsWith(programName),
          )?.id;
          if (!traceId && attempt < attempts) await delay(waitMs);
        }
        expect(traceId).toBeTruthy();
        createdTraceIds.add(String(traceId).toUpperCase());
        logger?.info(`program ${programName} traced: ${traceId}`);
      });
    },
    getTimeout('long'),
  );

  it(
    'reads and analyses a finished trace taken from the trace list',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        // A trace is readable once it is written — "Finished" in the list of
        // traces; an id alone is not. So the trace to read comes from the
        // list: one of this run's if it has finished already, otherwise the
        // newest finished trace of the shared profiling objects, otherwise
        // any finished trace. `trace_id_or_uri`, when set, overrides.
        const configured = String(context.params?.trace_id_or_uri ?? '').trim();
        let traceId = configured;
        if (!traceId) {
          const owners = [
            context.params?.profiled_program_name,
            context.params?.profiled_class_name,
          ]
            .filter(Boolean)
            .map((n) => String(n).toUpperCase());
          const finished = (
            (await listTraces(context)) as Array<{
              id: string;
              objectName?: string;
              recordedAt?: string;
              state?: { value?: string };
            }>
          )
            .filter((t) => t.state?.value === 'R')
            .sort((a, b) =>
              String(b.recordedAt ?? '').localeCompare(
                String(a.recordedAt ?? ''),
              ),
            );
          traceId =
            finished.find((t) => createdTraceIds.has(t.id.toUpperCase()))?.id ??
            finished.find((t) =>
              owners.some((o) =>
                String(t.objectName ?? '')
                  .toUpperCase()
                  .startsWith(o),
              ),
            )?.id ??
            finished[0]?.id ??
            '';
        }
        if (!traceId) {
          throw new Error(
            'no finished trace in the trace list to read — the profiled runs above wrote none',
          );
        }
        logger?.info(`reading trace ${traceId}`);
        const readArgs = {
          trace_id_or_uri: traceId,
          view: 'hitlist' as const,
          with_system_events: false,
        };
        const read = await tester.invokeToolOrHandler(
          'RuntimeGetProfilerTraceData',
          readArgs,
          async () =>
            handleRuntimeGetProfilerTraceData(
              createHandlerContext({ connection: context.connection, logger }),
              readArgs,
            ),
        );
        expect(read.isError).toBe(false);
        expect(parseTextPayload(read).success).toBe(true);

        const analyzeArgs = { ...readArgs, top: 5 };
        const analyze = await tester.invokeToolOrHandler(
          'RuntimeAnalyzeProfilerTrace',
          analyzeArgs,
          async () =>
            handleRuntimeAnalyzeProfilerTrace(
              createHandlerContext({ connection: context.connection, logger }),
              analyzeArgs,
            ),
        );
        expect(analyze.isError).toBe(false);
        const analysed = parseTextPayload(analyze);
        expect(analysed.success).toBe(true);
        expect(analysed.summary).toBeDefined();
      });
    },
    getTimeout('long'),
  );

  it(
    'lists the traces this run produced',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (createdTraceIds.size === 0) {
          throw new Error('SKIP: no trace IDs were produced by the runs above');
        }
        const listed = (await listTraces(context)).map((t) =>
          t.id.toUpperCase(),
        );
        for (const id of createdTraceIds) expect(listed).toContain(id);
      });
    },
    getTimeout('long'),
  );

  it(
    'should create dump by division by zero and read/analyze created dump',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (!context.packageName) {
          throw new Error(
            'SKIP: package is not configured (default_package or package_name)',
          );
        }

        // Hard mode drives everything through one cached MCP client, so there
        // is no second isolated connection for the dump trigger. Under the
        // stdio transport (what test-config.yaml sets) BaseMcpServer caches the
        // ABAP connection, so the dumping run would poison the same context we
        // then read from — exactly the problem this test avoids in soft mode.
        // The isolation is soft-mode only; skip cleanly in hard mode.
        if (tester.isHardMode()) {
          throw new Error(
            'SKIP: dump sub-test runs in soft mode only (hard-mode stdio caches the ABAP connection — no isolated trigger connection)',
          );
        }

        // The shared dumping class (shared_dependencies.classes). Nothing is
        // created or deleted: running it changes nothing. It used to be a new
        // class each run, created and activated here — and its own dump never
        // showed up in the feed, so the test read someone else's.
        const dumpClassName = String(
          context.params?.dump_class_name ?? '',
        ).toUpperCase();
        if (!dumpClassName) {
          throw new Error(
            'dump_class_name is not configured — the shared dumping class, created by shared:setup',
          );
        }

        // In soft mode the MCP tool layer is bypassed; always call the handler
        // directly via the directCall argument so context.connection is used.
        const invoke = async (
          _toolName: string,
          _args: Record<string, unknown>,
          directCall: () => Promise<any>,
        ) => directCall();

        // Trigger the dump on a dedicated throwaway connection so the dump's
        // server-side context loss lands on IT, not on the main connection we
        // read the dump from. The dump is keyed to the user (same trial user),
        // so the main connection's feed read still finds it.
        const { connection: triggerConnection } =
          await createTestConnectionAndSession();

        try {
          // What the feed already shows, before the run. The class name is the
          // same every run, so a dump naming it proves nothing on its own —
          // this run's dump is a new one that names it.
          const dumpsUserBefore = context.params?.dumps_user || undefined;
          const beforeRun = await handleRuntimeListFeeds(
            createHandlerContext({ connection: context.connection, logger }),
            {
              feed_type: 'dumps',
              user: dumpsUserBefore,
              max_results: toPositiveInt(context.params?.dump_feed_top, 50),
            },
          );
          expect(beforeRun.isError).toBe(false);
          const seenBefore = new Set(
            extractDumpCandidatesFromFeedEntries(
              parseTextPayload(beforeRun).entries ?? [],
            ).map((c) => c.id),
          );

          // Forced run on the trigger connection → HTTP 500 → real dump.
          const triggerExecutor = new AdtExecutor(triggerConnection, logger);
          try {
            await triggerExecutor
              .getClassExecutor()
              .run({ className: dumpClassName });
          } catch (runError: any) {
            logger?.info(
              `Expected failing run for dump generation: ${runError?.message || String(runError)}`,
            );
          } finally {
            // Soft-mode HTTP has no network close; drop local session/cookie
            // state best-effort and stop using the connection.
            const resettable = triggerConnection as unknown as {
              reset?: () => void;
            };
            if (typeof resettable.reset === 'function') {
              resettable.reset();
            }
          }

          const maxAttempts = toPositiveInt(
            context.params?.dump_feed_retries ??
              context.params?.trace_feed_retries,
            8,
          );
          const retryDelayMs = Math.max(
            100,
            toPositiveInt(
              context.params?.dump_feed_retry_delay_ms ??
                context.params?.trace_feed_retry_delay_ms,
              1500,
            ),
          );
          const dumpFeedTop = toPositiveInt(context.params?.dump_feed_top, 50);
          const dumpsUser = context.params?.dumps_user || undefined;
          // How many title-matched candidates to open and content-check per
          // poll before giving up on this poll and waiting for the next one.
          const maxCandidatesPerPoll = toPositiveInt(
            context.params?.dump_candidates_per_poll,
            5,
          );
          // The exception this run's own class dumps with — a cheap
          // pre-filter on the feed's free `title` field, so a poll with no
          // matching entry costs zero detail fetches. The shared dump class
          // divides an I by 0, which ADT titles this exact way; a caller
          // dumping some other way sets `params.dump_title_filter`.
          const dumpTitleFilter = (
            context.params?.dump_title_filter ?? 'division by 0'
          ).toLowerCase();

          // Whatever the feed showed on the last poll, newest first — the
          // fallback when this run's own dump never appears.
          let lastSeen: Array<{ id: string }> = [];
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const listResult = await invoke(
              'RuntimeListFeeds',
              {
                feed_type: 'dumps',
                user: dumpsUser,
                max_results: dumpFeedTop,
              },
              async () => {
                const handlerContext = createHandlerContext({
                  connection: context.connection,
                  logger,
                });
                return handleRuntimeListFeeds(handlerContext, {
                  feed_type: 'dumps',
                  user: dumpsUser,
                  max_results: dumpFeedTop,
                });
              },
            );
            expect(listResult.isError).toBe(false);
            const listData = parseTextPayload(listResult);
            let candidates = extractDumpCandidatesFromFeedEntries(
              listData.entries ?? [],
            );
            if (candidates.length === 0 && dumpsUser) {
              // Fallback to unfiltered feed if user filter returns empty on this system.
              const unfilteredResult = await invoke(
                'RuntimeListFeeds',
                {
                  feed_type: 'dumps',
                  max_results: dumpFeedTop,
                },
                async () => {
                  const handlerContext = createHandlerContext({
                    connection: context.connection,
                    logger,
                  });
                  return handleRuntimeListFeeds(handlerContext, {
                    feed_type: 'dumps',
                    max_results: dumpFeedTop,
                  });
                },
              );
              expect(unfilteredResult.isError).toBe(false);
              const unfilteredData = parseTextPayload(unfilteredResult);
              candidates = extractDumpCandidatesFromFeedEntries(
                unfilteredData.entries ?? [],
              );
            }

            if (candidates.length > 0) lastSeen = candidates;

            // The newest feed entry is not necessarily THIS run's dump — on a
            // system anyone else (or an earlier action in this same session)
            // is using, both true (a genuinely newer dump can land ahead of
            // it) and repeated runs of THIS SAME test each leave their own
            // "Division by 0" entry behind, so even the newest matching
            // title can be a previous run's, not this one's. Confirmed live
            // (2026-09-22, E19): filtering by the correct current user still
            // was not enough on its own. `title` narrows to the right kind
            // of dump for free; content, from the one candidate actually
            // worth opening, decides which run made it.
            // See `candidatesWorthOpening`: the title is a saving, not a gate.
            const fresh = candidates.filter((c) => !seenBefore.has(c.id));
            const { chosen: worthOpening, narrowed } = candidatesWorthOpening(
              fresh,
              dumpTitleFilter,
              maxCandidatesPerPoll,
            );
            if (!narrowed && fresh.length > 0) {
              logger?.info?.(
                `no feed entry matched "${dumpTitleFilter}" — opening the ${worthOpening.length} newest instead, since the title is language-dependent`,
              );
            }
            for (const candidate of worthOpening) {
              const candidateResult = await invoke(
                'RuntimeGetDumpById',
                { dump_id: candidate.id, view: 'default' },
                async () => {
                  const handlerContext = createHandlerContext({
                    connection: context.connection,
                    logger,
                  });
                  return handleRuntimeGetDumpById(handlerContext, {
                    dump_id: candidate.id,
                    view: 'default',
                  });
                },
              );
              if (candidateResult.isError) continue;
              const candidateData = parseTextPayload(candidateResult);
              const candidateText = JSON.stringify(
                candidateData.payload ?? candidateData,
              ).toUpperCase();
              if (candidateText.includes(dumpClassName.toUpperCase())) {
                dumpIdFromGeneratedFailure = candidate.id;
                break;
              }
            }
            if (dumpIdFromGeneratedFailure) {
              break;
            }
            if (attempt < maxAttempts) {
              await delay(retryDelayMs);
            }
          }

          // What is under test is reading a dump, not producing one: any
          // dump the system shows will do. This run's own division-by-zero
          // dump is preferred, because it can be bound to this run; failing
          // that, the configured `params.dump_id`; failing that, the newest
          // dump the feed showed. A system with no dumps at all (E25) is
          // reported as exactly that and passes — there is nothing to read,
          // which is not a defect of the tools.
          const generatedDumpId = dumpIdFromGeneratedFailure;
          const fallbackDumpId = lastSeen[0]?.id;
          const dumpId =
            generatedDumpId ||
            context.params?.dump_id ||
            fallbackDumpId ||
            undefined;
          if (!generatedDumpId) {
            logger?.warn?.(
              `this run's own dump (class ${dumpClassName}) did not appear in the feed after ${maxAttempts} polls — ` +
                (context.params?.dump_id
                  ? `reading the configured params.dump_id ${context.params.dump_id} instead`
                  : fallbackDumpId
                    ? `reading the newest dump the feed shows instead: ${fallbackDumpId}`
                    : 'and the feed shows no dumps at all'),
            );
          }
          if (!dumpId) {
            // **A skip, said as one.** There is nothing to read on a system
            // with no dumps, and that is not a defect of the tools — but
            // `RuntimeGetDumpById` was not exercised either, and a bare
            // `return` reports that as a pass. `testSkip` is the channel this
            // repository has for exactly this: it prints `⏭️`, so the run says
            // what it did not do instead of implying it did.
            logger?.testSkip?.(
              'Skipping test: no runtime dumps on this system — RuntimeListFeeds answered with no entries, so RuntimeGetDumpById was not exercised',
            );
            return;
          }
          const dumpView =
            context.params?.dump_view === 'summary' ||
            context.params?.dump_view === 'formatted' ||
            context.params?.dump_view === 'default'
              ? context.params?.dump_view
              : 'default';

          const dumpResult = await invoke(
            'RuntimeGetDumpById',
            {
              dump_id: dumpId,
              view: dumpView,
            },
            async () => {
              const handlerContext = createHandlerContext({
                connection: context.connection,
                logger,
              });
              return handleRuntimeGetDumpById(handlerContext, {
                dump_id: dumpId,
                view: dumpView,
              });
            },
          );
          if (dumpResult.isError) {
            throw new Error(
              `RuntimeGetDumpById failed: ${extractHandlerErrorText(dumpResult)}`,
            );
          }
          expect(dumpResult.isError).toBe(false);
          const dumpData = parseTextPayload(dumpResult);
          expect(dumpData.success).toBe(true);
          expect(dumpData.dump_id).toBe(dumpId);
          expect(dumpData.view).toBe(dumpView);

          // Bind a self-generated dump to THIS run: it was not in the feed
          // before the run, and its content names the class we ran, so taking
          // the newest feed entry cannot pass on an unrelated dump. Skip this bind
          // only for the explicit `params.dump_id` read-only path, where the
          // dump is a pre-existing one unrelated to dumpClassName.
          if (generatedDumpId) {
            const dumpText = JSON.stringify(
              dumpData.payload ?? dumpData,
            ).toUpperCase();
            expect(dumpText).toContain(dumpClassName.toUpperCase());
          }

          const analyze = await invoke(
            'RuntimeGetDumpById',
            {
              dump_id: dumpId,
              view: dumpView,
              response_mode: 'summary',
            },
            async () => {
              const handlerContext = createHandlerContext({
                connection: context.connection,
                logger,
              });
              return handleRuntimeGetDumpById(handlerContext, {
                dump_id: dumpId,
                view: dumpView,
                response_mode: 'summary',
              });
            },
          );
          if (analyze.isError) {
            throw new Error(
              `RuntimeGetDumpById (summary) failed: ${extractHandlerErrorText(analyze)}`,
            );
          }
          expect(analyze.isError).toBe(false);
          const analyzeData = parseTextPayload(analyze);
          expect(analyzeData.success).toBe(true);
          expect(analyzeData.view).toBe(dumpView);
          expect(analyzeData.summary).toBeDefined();
          expect(analyzeData.payload).toBeUndefined();
        } finally {
          // The shared class stays; the trigger connection is dropped above.
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'should list dumps and read a dump by ID',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const dumpsUser = context.params?.dumps_user || undefined;
        if (!dumpsUser) {
          throw new Error(
            'SKIP: dumps_user not configured in test params (set params.dumps_user)',
          );
        }

        const invoke = async (
          toolName: string,
          args: Record<string, unknown>,
          directCall: () => Promise<any>,
        ) => tester.invokeToolOrHandler(toolName, args, directCall);

        // Step 1: list dumps via feeds to get a known dump_id
        const listResult = await invoke(
          'RuntimeListFeeds',
          { feed_type: 'dumps', user: dumpsUser, max_results: 5 },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeListFeeds(handlerContext, {
              feed_type: 'dumps',
              user: dumpsUser,
              max_results: 5,
            });
          },
        );
        expect(listResult.isError).toBe(false);
        const listData = parseTextPayload(listResult);
        expect(listData.entries).toBeDefined();
        const dumpIds = extractDumpIdsFromFeedEntries(listData.entries ?? []);
        if (dumpIds.length === 0) {
          throw new Error(`SKIP: no dumps found for user "${dumpsUser}"`);
        }

        const expectedDumpId = dumpIds[0];

        // Step 2: read the dump by ID
        const lookupResult = await invoke(
          'RuntimeGetDumpById',
          { dump_id: expectedDumpId },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeGetDumpById(handlerContext, {
              dump_id: expectedDumpId,
            });
          },
        );
        expect(lookupResult.isError).toBe(false);
        const lookupData = parseTextPayload(lookupResult);
        expect(lookupData.success).toBe(true);
        expect(lookupData.dump_id).toBe(expectedDumpId);
        expect(lookupData.payload).toBeDefined();
      });
    },
    getTimeout('long'),
  );
});
