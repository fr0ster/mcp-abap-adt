/**
 * Integration tests for runtime profiling and dumps handlers.
 *
 * Scenarios:
 * - Create temporary class, run with profiling, read/analyze resulting trace
 * - Create temporary program, run with profiling, read/analyze resulting trace (on-prem only)
 * - Create temporary class with division by zero, run, then read/analyze runtime dump
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { handleRuntimeAnalyzeProfilerTrace } from '../../../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace';
import { handleRuntimeGetDumpById } from '../../../../handlers/system/readonly/handleRuntimeGetDumpById';
import { handleRuntimeGetProfilerTraceData } from '../../../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { handleRuntimeListFeeds } from '../../../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleRuntimeListProfilerTraceFiles } from '../../../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
import { handleRuntimeRunClassWithProfiling } from '../../../../handlers/system/readonly/handleRuntimeRunClassWithProfiling';
import { handleRuntimeRunProgramWithProfiling } from '../../../../handlers/system/readonly/handleRuntimeRunProgramWithProfiling';
import { createAdtClient } from '../../../../lib/clients';
import { withLock } from '../../../../lib/strategies/withLock';
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

function createName(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${stamp}${random}`.slice(0, 30);
}

function normalizeNamePrefix(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '')
    .trim();
  return normalized || fallback;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function extractTraceIdsFromPayload(payload: unknown): string[] {
  const ids = new Set<string>();
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const regex = /\/runtime\/traces\/abaptraces\/([A-F0-9]{32})/gi;
  let match: RegExpExecArray | null = regex.exec(raw);
  while (match) {
    ids.add(match[1].toUpperCase());
    match = regex.exec(raw);
  }
  return [...ids];
}

function buildRunnableClassSource(className: string): string {
  return `CLASS ${className} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    " Do measurable CPU work so the runtime profiler has time to arm and
    " actually captures a trace — a trivial single-statement body finishes
    " before tracing engages, so no trace file is ever written (the trace
    " then never resolves no matter how long we poll).
    DATA lv_x TYPE i.
    DO 2000000 TIMES.
      lv_x = sy-index MOD 100.
    ENDDO.
    out->write( lv_x ).
    out->write( |MCP runtime class profiling ${className}| ).
  ENDMETHOD.
ENDCLASS.
`;
}

function buildDumpClassSource(className: string): string {
  return `CLASS ${className} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA lv_num TYPE i VALUE 1.
    DATA lv_den TYPE i VALUE 0.
    DATA lv_res TYPE i.
    lv_res = lv_num / lv_den.
    out->write( |${className} result: ${'${'} lv_res }| ).
  ENDMETHOD.
ENDCLASS.
`;
}

function buildRunnableProgramSource(programName: string): string {
  return `REPORT ${programName}.
WRITE: / 'MCP runtime program profiling ${programName}'.
`;
}

async function createRunnableClass(
  context: LambdaTesterContext,
  className: string,
  source: string,
  invokeTool?: (
    toolName: string,
    args: Record<string, unknown>,
    directCall: () => Promise<any>,
  ) => Promise<any>,
  options?: { activate?: boolean },
): Promise<void> {
  if (invokeTool) {
    const createResponse = await invokeTool(
      'CreateClass',
      {
        class_name: className,
        package_name: context.packageName,
        transport_request: context.transportRequest,
        description: `MCP runtime test ${className}`.slice(0, 60),
        source_code: source,
        activate: true,
      },
      async () => {
        throw new Error(
          'Direct CreateClass call is not available in hard mode',
        );
      },
    );
    if (createResponse?.isError) {
      throw new Error(extractHandlerErrorText(createResponse));
    }
    return;
  }

  const client = createAdtClient(context.connection, context.logger);
  await client.getClass().create({
    className,
    packageName: context.packageName,
    transportRequest: context.transportRequest,
    description: `MCP runtime test ${className}`.slice(0, 60),
  });
  // adt-clients 19 has no `activateOnUpdate` convenience — the source goes
  // through `options.source` under a caller-held lock (see
  // UpdateClassLow), and activation is its own call after unlock.
  const obj = client.getClass();
  const written = await withLock(
    () => obj.lock({ className }),
    (lockHandle) =>
      obj.update(
        { className, transportRequest: context.transportRequest },
        { source, lockHandle },
      ),
    (lockHandle) => obj.unlock({ className }, lockHandle),
  );
  if (written.ok && options?.activate === true) {
    await obj.activate({ className });
  }
}

async function deleteClassIfExists(
  context: LambdaTesterContext,
  className?: string,
  invokeTool?: (
    toolName: string,
    args: Record<string, unknown>,
    directCall: () => Promise<any>,
  ) => Promise<any>,
): Promise<void> {
  if (!className) {
    return;
  }
  try {
    if (invokeTool) {
      const deleteResponse = await invokeTool(
        'DeleteClass',
        {
          class_name: className,
          transport_request: context.transportRequest,
        },
        async () => {
          throw new Error(
            'Direct DeleteClass call is not available in hard mode',
          );
        },
      );
      if (deleteResponse?.isError) {
        throw new Error(extractHandlerErrorText(deleteResponse));
      }
      return;
    }

    const client = createAdtClient(context.connection, context.logger);
    await client.getClass().delete({
      className,
      transportRequest: context.transportRequest,
    });
  } catch (error: any) {
    context.logger?.warn(
      `Cleanup class ${className} failed: ${error?.message}`,
    );
  }
}

async function createRunnableProgram(
  context: LambdaTesterContext,
  programName: string,
  source: string,
  invokeTool?: (
    toolName: string,
    args: Record<string, unknown>,
    directCall: () => Promise<any>,
  ) => Promise<any>,
): Promise<void> {
  if (invokeTool) {
    const createResponse = await invokeTool(
      'CreateProgram',
      {
        program_name: programName,
        package_name: context.packageName,
        transport_request: context.transportRequest,
        description: `MCP runtime test ${programName}`.slice(0, 60),
        source_code: source,
        activate: true,
      },
      async () => {
        throw new Error(
          'Direct CreateProgram call is not available in hard mode',
        );
      },
    );
    if (createResponse?.isError) {
      throw new Error(extractHandlerErrorText(createResponse));
    }
    return;
  }

  const client = createAdtClient(context.connection, context.logger);
  await client.getProgram().create({
    programName,
    packageName: context.packageName,
    transportRequest: context.transportRequest,
    description: `MCP runtime test ${programName}`.slice(0, 60),
  });
  // adt-clients 19 has no `activateOnUpdate` convenience — see
  // createRunnableClass above for the same shape.
  const obj = client.getProgram();
  const written = await withLock(
    () => obj.lock({ programName }),
    (lockHandle) =>
      obj.update(
        { programName, transportRequest: context.transportRequest },
        { source, lockHandle },
      ),
    (lockHandle) => obj.unlock({ programName }, lockHandle),
  );
  if (written.ok) {
    await obj.activate({ programName });
  }
}

async function deleteProgramIfExists(
  context: LambdaTesterContext,
  programName?: string,
  invokeTool?: (
    toolName: string,
    args: Record<string, unknown>,
    directCall: () => Promise<any>,
  ) => Promise<any>,
): Promise<void> {
  if (!programName) {
    return;
  }
  try {
    if (invokeTool) {
      const deleteResponse = await invokeTool(
        'DeleteProgram',
        {
          program_name: programName,
          transport_request: context.transportRequest,
        },
        async () => {
          throw new Error(
            'Direct DeleteProgram call is not available in hard mode',
          );
        },
      );
      if (deleteResponse?.isError) {
        throw new Error(extractHandlerErrorText(deleteResponse));
      }
      return;
    }

    const client = createAdtClient(context.connection, context.logger);
    await client.getProgram().delete({
      programName,
      transportRequest: context.transportRequest,
    });
  } catch (error: any) {
    context.logger?.warn(
      `Cleanup program ${programName} failed: ${error?.message}`,
    );
  }
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

  it(
    'should create class, run with profiling, and read/analyze created trace',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (!context.packageName) {
          throw new Error(
            'SKIP: package is not configured (default_package or package_name)',
          );
        }

        const className = createName(
          normalizeNamePrefix(
            context.params?.profiled_class_prefix,
            'ZADT_RTCLS',
          ),
        );
        const invoke = async (
          toolName: string,
          args: Record<string, unknown>,
          directCall: () => Promise<any>,
        ) => tester.invokeToolOrHandler(toolName, args, directCall);

        try {
          await createRunnableClass(
            context,
            className,
            buildRunnableClassSource(className),
            tester.isHardMode() ? invoke : undefined,
          );

          const profiledRunArgs = {
            class_name: className,
            description: `MCP_RUNTIME_CLASS_${Date.now()}`,
            all_procedural_units: true,
            sql_trace: true,
            all_db_events: true,
            max_time_for_tracing: 1800,
            max_trace_attempts:
              toPositiveInt(
                context.params?.profiled_run_max_trace_attempts,
                0,
              ) || undefined,
            trace_retry_delay_ms:
              toPositiveInt(
                context.params?.profiled_run_trace_retry_delay_ms,
                0,
              ) || undefined,
          };
          const profiledRun = await invoke(
            'RuntimeRunClassWithProfiling',
            profiledRunArgs,
            async () => {
              const handlerContext = createHandlerContext({
                connection: context.connection,
                logger,
              });
              return handleRuntimeRunClassWithProfiling(
                handlerContext,
                profiledRunArgs,
              );
            },
          );

          expect(profiledRun.isError).toBe(false);
          const runData = parseTextPayload(profiledRun);
          expect(runData.success).toBe(true);

          // adt-clients 19: a run only schedules and executes — finding the
          // trace it produced is a feed search bounded by
          // max_trace_attempts/trace_retry_delay_ms (newTrace.ts), and an
          // exhausted search is `success: true` with no trace id, not a
          // failure: "SAP writes it asynchronously and it may arrive a week
          // later. Nothing refused anything, so there is nothing to report
          // as a failure." (newTrace.ts). The old contract's guarantee that
          // a run answers its own trace id is gone — recorded by Task 24 —
          // so this no longer hard-asserts `trace_id`; it is tolerated
          // missing the same way the program variant below already tolerates
          // it via its own polling loop.
          if (!runData.trace_id) {
            logger?.warn(
              'Class profiling trace not found within the polling budget — skipping trace read',
            );
          } else {
            const traceId = String(runData.trace_id).toUpperCase();
            createdTraceIds.add(traceId);

            const traceData = await invoke(
              'RuntimeGetProfilerTraceData',
              {
                trace_id_or_uri: traceId,
                view: 'hitlist',
                with_system_events: false,
              },
              async () => {
                const handlerContext = createHandlerContext({
                  connection: context.connection,
                  logger,
                });
                return handleRuntimeGetProfilerTraceData(handlerContext, {
                  trace_id_or_uri: traceId,
                  view: 'hitlist',
                  with_system_events: false,
                });
              },
            );
            expect(traceData.isError).toBe(false);
            const tracePayload = parseTextPayload(traceData);
            expect(tracePayload.success).toBe(true);

            const analyze = await invoke(
              'RuntimeAnalyzeProfilerTrace',
              {
                trace_id_or_uri: traceId,
                view: 'hitlist',
                top: 5,
                with_system_events: false,
              },
              async () => {
                const handlerContext = createHandlerContext({
                  connection: context.connection,
                  logger,
                });
                return handleRuntimeAnalyzeProfilerTrace(handlerContext, {
                  trace_id_or_uri: traceId,
                  view: 'hitlist',
                  top: 5,
                  with_system_events: false,
                });
              },
            );
            expect(analyze.isError).toBe(false);
            const analyzePayload = parseTextPayload(analyze);
            expect(analyzePayload.success).toBe(true);
            expect(analyzePayload.summary).toBeDefined();
          }
        } finally {
          await deleteClassIfExists(
            context,
            className,
            tester.isHardMode() ? invoke : undefined,
          );
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'should create program, run with profiling, and read/analyze created trace (on-prem)',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (context.isCloudSystem) {
          throw new Error(
            'SKIP: programs are not available on cloud systems (expected on-prem only)',
          );
        }
        if (!context.packageName) {
          throw new Error(
            'SKIP: package is not configured (default_package or package_name)',
          );
        }

        const programName = createName(
          normalizeNamePrefix(
            context.params?.profiled_program_prefix,
            'ZADT_RTPRG',
          ),
        );
        const invoke = async (
          toolName: string,
          args: Record<string, unknown>,
          directCall: () => Promise<any>,
        ) => tester.invokeToolOrHandler(toolName, args, directCall);

        try {
          await createRunnableProgram(
            context,
            programName,
            buildRunnableProgramSource(programName),
            tester.isHardMode() ? invoke : undefined,
          );

          const profiledRun = await invoke(
            'RuntimeRunProgramWithProfiling',
            {
              program_name: programName,
              description: `MCP_RUNTIME_PROGRAM_${Date.now()}`,
              all_procedural_units: true,
              sql_trace: true,
              all_db_events: true,
              max_time_for_tracing: 1800,
            },
            async () => {
              const handlerContext = createHandlerContext({
                connection: context.connection,
                logger,
              });
              return handleRuntimeRunProgramWithProfiling(handlerContext, {
                program_name: programName,
                description: `MCP_RUNTIME_PROGRAM_${Date.now()}`,
                all_procedural_units: true,
                sql_trace: true,
                all_db_events: true,
                max_time_for_tracing: 1800,
              });
            },
          );

          // Program execution is fire-and-forget — trace is written asynchronously.
          // We only verify the run itself succeeded and returned a profilerId.
          expect(profiledRun.isError).toBe(false);
          const runData = parseTextPayload(profiledRun);
          expect(runData.success).toBe(true);
          expect(runData.profiler_id).toBeDefined();

          // Poll for the trace file to appear (SAP writes it asynchronously)
          let traceId: string | undefined;
          for (let attempt = 0; attempt < 5; attempt++) {
            await delay(3000);
            const listResponse = await invoke(
              'RuntimeListProfilerTraceFiles',
              {},
              async () => {
                const handlerContext = createHandlerContext({
                  connection: context.connection,
                  logger,
                });
                return handleRuntimeListProfilerTraceFiles(handlerContext);
              },
            );
            if (!listResponse.isError) {
              const listData = parseTextPayload(listResponse);
              const traces: any[] = listData.traces ?? listData.items ?? [];
              const found = traces.find(
                (t: any) =>
                  t.profiler_id === runData.profiler_id ||
                  t.profilerId === runData.profiler_id,
              );
              if (found) {
                traceId = String(
                  found.trace_id ?? found.traceId ?? found.id ?? '',
                ).toUpperCase();
                break;
              }
            }
          }

          if (!traceId) {
            logger?.warn(
              'Program profiling trace not found after polling — skipping trace read',
            );
          } else {
            createdTraceIds.add(traceId);
            const traceData = await invoke(
              'RuntimeGetProfilerTraceData',
              {
                trace_id_or_uri: traceId,
                view: 'hitlist',
                with_system_events: false,
              },
              async () => {
                const handlerContext = createHandlerContext({
                  connection: context.connection,
                  logger,
                });
                return handleRuntimeGetProfilerTraceData(handlerContext, {
                  trace_id_or_uri: traceId!,
                  view: 'hitlist',
                  with_system_events: false,
                });
              },
            );
            expect(traceData.isError).toBe(false);
            const tracePayload = parseTextPayload(traceData);
            expect(tracePayload.success).toBe(true);
          }
        } finally {
          await deleteProgramIfExists(
            context,
            programName,
            tester.isHardMode() ? invoke : undefined,
          );
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'should list profiler traces and include at least one trace created in this test run',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (createdTraceIds.size === 0) {
          throw new Error('SKIP: no trace IDs were created by profiling tests');
        }

        const invoke = async (
          toolName: string,
          args: Record<string, unknown>,
          directCall: () => Promise<any>,
        ) => tester.invokeToolOrHandler(toolName, args, directCall);
        const maxAttempts = toPositiveInt(
          context.params?.trace_feed_retries,
          6,
        );
        const retryDelayMs = Math.max(
          100,
          toPositiveInt(context.params?.trace_feed_retry_delay_ms, 1000),
        );

        let found = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const result = await invoke(
            'RuntimeListProfilerTraceFiles',
            {},
            async () => {
              const handlerContext = createHandlerContext({
                connection: context.connection,
                logger,
              });
              return handleRuntimeListProfilerTraceFiles(handlerContext);
            },
          );
          expect(result.isError).toBe(false);
          const data = parseTextPayload(result);
          const traceIds = extractTraceIdsFromPayload(data.payload);
          found = traceIds.some((id) => createdTraceIds.has(id.toUpperCase()));
          if (found) {
            break;
          }
          if (attempt < maxAttempts) {
            await delay(retryDelayMs);
          }
        }

        expect(found).toBe(true);
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

        const dumpClassName = createName(
          normalizeNamePrefix(context.params?.dump_class_prefix, 'ZADT_RTDMP'),
        );

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
        const triggerContext: LambdaTesterContext = {
          ...context,
          connection: triggerConnection,
        };

        try {
          // create + ACTIVATE the division-by-zero class on the trigger
          // connection (active so the forced run actually executes and dumps).
          await createRunnableClass(
            triggerContext,
            dumpClassName,
            buildDumpClassSource(dumpClassName),
            undefined,
            { activate: true },
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
          // matching entry costs zero detail fetches. `buildDumpClassSource`
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
            const { chosen: worthOpening, narrowed } = candidatesWorthOpening(
              candidates,
              dumpTitleFilter,
              maxCandidatesPerPoll,
            );
            if (!narrowed && candidates.length > 0) {
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

          // Bind a self-generated dump to THIS run: its content must reference
          // the uniquely-named class we just dumped, so taking the newest feed
          // entry cannot pass on an unrelated pre-existing dump. Skip this bind
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
          await deleteClassIfExists(context, dumpClassName, undefined);
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
