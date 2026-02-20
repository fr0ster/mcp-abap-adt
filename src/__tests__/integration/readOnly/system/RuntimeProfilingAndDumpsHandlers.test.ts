/**
 * Integration tests for runtime profiling and dumps handlers.
 *
 * Scenarios:
 * - Create temporary class, run with profiling, read/analyze resulting trace
 * - Create temporary program, run with profiling, read/analyze resulting trace (on-prem only)
 * - Create temporary class with division by zero, run, then read/analyze runtime dump
 */

import { AdtClient, AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { handleRuntimeAnalyzeDump } from '../../../../handlers/system/readonly/handleRuntimeAnalyzeDump';
import { handleRuntimeAnalyzeProfilerTrace } from '../../../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace';
import { handleRuntimeGetDumpById } from '../../../../handlers/system/readonly/handleRuntimeGetDumpById';
import { handleRuntimeGetProfilerTraceData } from '../../../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { handleRuntimeListDumps } from '../../../../handlers/system/readonly/handleRuntimeListDumps';
import { handleRuntimeListProfilerTraceFiles } from '../../../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
import { handleRuntimeRunClassWithProfiling } from '../../../../handlers/system/readonly/handleRuntimeRunClassWithProfiling';
import { handleRuntimeRunProgramWithProfiling } from '../../../../handlers/system/readonly/handleRuntimeRunProgramWithProfiling';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
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

function extractDumpIdsFromPayload(payload: unknown): string[] {
  const ids = new Set<string>();
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const regex = /\/sap\/bc\/adt\/runtime\/dump(?:s)?\/([^"'?&<\s]+)/g;
  let match: RegExpExecArray | null = regex.exec(raw);
  while (match) {
    ids.add(match[1]);
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
  sourceCode: string,
): Promise<void> {
  const client = new AdtClient(context.connection, context.logger);
  await client.getClass().create({
    className,
    packageName: context.packageName,
    transportRequest: context.transportRequest,
    description: `MCP runtime test ${className}`.slice(0, 60),
  });
  await client.getClass().update({
    className,
    transportRequest: context.transportRequest,
    sourceCode,
  });
}

async function deleteClassIfExists(
  context: LambdaTesterContext,
  className?: string,
): Promise<void> {
  if (!className) {
    return;
  }
  try {
    const client = new AdtClient(context.connection, context.logger);
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
  sourceCode: string,
): Promise<void> {
  const client = new AdtClient(context.connection, context.logger);
  await client.getProgram().create({
    programName,
    packageName: context.packageName,
    transportRequest: context.transportRequest,
    description: `MCP runtime test ${programName}`.slice(0, 60),
  });
  await client.getProgram().update({
    programName,
    transportRequest: context.transportRequest,
    sourceCode,
  });
}

async function deleteProgramIfExists(
  context: LambdaTesterContext,
  programName?: string,
): Promise<void> {
  if (!programName) {
    return;
  }
  try {
    const client = new AdtClient(context.connection, context.logger);
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
        const handlerContext = createHandlerContext({
          connection: context.connection,
          logger,
        });

        try {
          await createRunnableClass(
            context,
            className,
            buildRunnableClassSource(className),
          );

          const profiledRun = await handleRuntimeRunClassWithProfiling(
            handlerContext,
            {
              class_name: className,
              description: `MCP_RUNTIME_CLASS_${Date.now()}`,
              all_procedural_units: true,
              sql_trace: true,
              all_db_events: true,
              max_time_for_tracing: 1800,
            },
          );

          expect(profiledRun.isError).toBe(false);
          const runData = parseTextPayload(profiledRun);
          expect(runData.success).toBe(true);
          expect(runData.trace_id).toBeDefined();
          const traceId = String(runData.trace_id).toUpperCase();
          createdTraceIds.add(traceId);

          const traceData = await handleRuntimeGetProfilerTraceData(
            handlerContext,
            {
              trace_id_or_uri: traceId,
              view: 'hitlist',
              with_system_events: false,
            },
          );
          expect(traceData.isError).toBe(false);
          const tracePayload = parseTextPayload(traceData);
          expect(tracePayload.success).toBe(true);

          const analyze = await handleRuntimeAnalyzeProfilerTrace(
            handlerContext,
            {
              trace_id_or_uri: traceId,
              view: 'hitlist',
              top: 5,
              with_system_events: false,
            },
          );
          expect(analyze.isError).toBe(false);
          const analyzePayload = parseTextPayload(analyze);
          expect(analyzePayload.success).toBe(true);
          expect(analyzePayload.summary).toBeDefined();
        } finally {
          await deleteClassIfExists(context, className);
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
        const handlerContext = createHandlerContext({
          connection: context.connection,
          logger,
        });

        try {
          await createRunnableProgram(
            context,
            programName,
            buildRunnableProgramSource(programName),
          );

          const profiledRun = await handleRuntimeRunProgramWithProfiling(
            handlerContext,
            {
              program_name: programName,
              description: `MCP_RUNTIME_PROGRAM_${Date.now()}`,
              all_procedural_units: true,
              sql_trace: true,
              all_db_events: true,
              max_time_for_tracing: 1800,
            },
          );

          expect(profiledRun.isError).toBe(false);
          const runData = parseTextPayload(profiledRun);
          expect(runData.success).toBe(true);
          expect(runData.trace_id).toBeDefined();
          const traceId = String(runData.trace_id).toUpperCase();
          createdTraceIds.add(traceId);

          const traceData = await handleRuntimeGetProfilerTraceData(
            handlerContext,
            {
              trace_id_or_uri: traceId,
              view: 'hitlist',
              with_system_events: false,
            },
          );
          expect(traceData.isError).toBe(false);
          const tracePayload = parseTextPayload(traceData);
          expect(tracePayload.success).toBe(true);
        } finally {
          await deleteProgramIfExists(context, programName);
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

        const handlerContext = createHandlerContext({
          connection: context.connection,
          logger,
        });
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
          const result =
            await handleRuntimeListProfilerTraceFiles(handlerContext);
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

        const dumpClassName = createName(
          normalizeNamePrefix(context.params?.dump_class_prefix, 'ZADT_RTDMP'),
        );
        const handlerContext = createHandlerContext({
          connection: context.connection,
          logger,
        });

        try {
          await createRunnableClass(
            context,
            dumpClassName,
            buildDumpClassSource(dumpClassName),
          );

          const executor = new AdtExecutor(context.connection, logger);
          try {
            await executor.getClassExecutor().run({ className: dumpClassName });
          } catch (runError: any) {
            logger?.info(
              `Expected failing run for dump generation: ${runError?.message || String(runError)}`,
            );
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

          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const listResult = await handleRuntimeListDumps(handlerContext, {
              user: dumpsUser,
              inlinecount: 'allpages',
              top: dumpFeedTop,
            });
            expect(listResult.isError).toBe(false);
            const listData = parseTextPayload(listResult);
            let dumpIds = extractDumpIdsFromPayload(listData.payload);
            if (dumpIds.length === 0 && dumpsUser) {
              // Fallback to unfiltered feed if user filter returns empty on this system.
              const unfilteredResult = await handleRuntimeListDumps(
                handlerContext,
                {
                  inlinecount: 'allpages',
                  top: dumpFeedTop,
                },
              );
              expect(unfilteredResult.isError).toBe(false);
              const unfilteredData = parseTextPayload(unfilteredResult);
              dumpIds = extractDumpIdsFromPayload(unfilteredData.payload);
            }
            if (dumpIds.length > 0) {
              dumpIdFromGeneratedFailure = dumpIds[0];
              break;
            }
            if (attempt < maxAttempts) {
              await delay(retryDelayMs);
            }
          }

          const dumpId =
            dumpIdFromGeneratedFailure || context.params?.dump_id || undefined;
          if (!dumpId) {
            throw new Error(
              'SKIP: no runtime dump found after forced division-by-zero run (set params.dump_id as fallback)',
            );
          }
          const dumpView =
            context.params?.dump_view === 'summary' ||
            context.params?.dump_view === 'formatted' ||
            context.params?.dump_view === 'default'
              ? context.params?.dump_view
              : 'default';

          const dumpResult = await handleRuntimeGetDumpById(handlerContext, {
            dump_id: dumpId,
            view: dumpView,
          });
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

          const analyze = await handleRuntimeAnalyzeDump(handlerContext, {
            dump_id: dumpId,
            view: dumpView,
            include_payload: false,
          });
          if (analyze.isError) {
            throw new Error(
              `RuntimeAnalyzeDump failed: ${extractHandlerErrorText(analyze)}`,
            );
          }
          expect(analyze.isError).toBe(false);
          const analyzeData = parseTextPayload(analyze);
          expect(analyzeData.success).toBe(true);
          expect(analyzeData.view).toBe(dumpView);
          expect(analyzeData.summary).toBeDefined();
        } finally {
          await deleteClassIfExists(context, dumpClassName);
        }
      });
    },
    getTimeout('long'),
  );
});
