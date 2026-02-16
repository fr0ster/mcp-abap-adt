/**
 * Integration tests for runtime profiling and dumps handlers.
 *
 * Covers:
 * - RuntimeCreateProfilerTraceParameters
 * - RuntimeListProfilerTraceFiles
 * - RuntimeGetProfilerTraceData
 * - RuntimeListDumps
 * - RuntimeGetDumpById
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { handleRuntimeCreateProfilerTraceParameters } from '../../../../handlers/system/readonly/handleRuntimeCreateProfilerTraceParameters';
import { handleRuntimeGetDumpById } from '../../../../handlers/system/readonly/handleRuntimeGetDumpById';
import { handleRuntimeGetProfilerTraceData } from '../../../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { handleRuntimeListDumps } from '../../../../handlers/system/readonly/handleRuntimeListDumps';
import { handleRuntimeListProfilerTraceFiles } from '../../../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
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

function safeParseTextPayload(result: any): any | undefined {
  try {
    return parseTextPayload(result);
  } catch {
    return undefined;
  }
}

function extractTraceIdFromPayload(payload: unknown): string | undefined {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const match = raw.match(/\/runtime\/traces\/abaptraces\/([A-F0-9]{32})/i);
  return match?.[1];
}

function extractDumpIdFromPayload(payload: unknown): string | undefined {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const match = raw.match(/\/sap\/bc\/adt\/runtime\/dumps\/([A-Za-z0-9]+)/);
  return match?.[1];
}

function extractDumpIdsFromPayload(payload: unknown): string[] {
  const ids = new Set<string>();

  const collectFromValue = (value: unknown): void => {
    if (typeof value === 'string') {
      const regex = /\/sap\/bc\/adt\/runtime\/dumps\/([^"'?&<\s]+)/g;
      let match: RegExpExecArray | null = regex.exec(value);
      while (match) {
        ids.add(match[1]);
        match = regex.exec(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectFromValue(item);
      }
      return;
    }

    if (value && typeof value === 'object') {
      for (const nestedValue of Object.values(
        value as Record<string, unknown>,
      )) {
        collectFromValue(nestedValue);
      }
    }
  };

  collectFromValue(payload);

  if (ids.size === 0) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const regex = /\/sap\/bc\/adt\/runtime\/dumps\/([^"'?&<\s]+)/g;
    let match: RegExpExecArray | null = regex.exec(raw);
    while (match) {
      ids.add(match[1]);
      match = regex.exec(raw);
    }
  }

  return [...ids];
}

describe('Runtime Profiling and Dumps Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('runtime-readonly');
  let profilerIdFromCreate: string | undefined;
  let traceIdFromRun: string | undefined;
  let traceIdFromFeed: string | undefined;
  let dumpIdFromFeed: string | undefined;
  let dumpIdsFromFeed: string[] = [];

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
    'RuntimeCreateProfilerTraceParameters should create profilerId',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const className = params?.profiled_class_name;
        if (!className) {
          throw new Error('SKIP: profiled_class_name is not configured');
        }

        const handlerContext = createHandlerContext({ connection, logger });
        const createResult = await handleRuntimeCreateProfilerTraceParameters(
          handlerContext,
          {
            description: `MCP_RUNTIME_TEST_${Date.now()}`,
            all_procedural_units: true,
            sql_trace: true,
            all_db_events: true,
            max_time_for_tracing: 1800,
          },
        );

        expect(createResult.isError).toBe(false);
        const createData = parseTextPayload(createResult);
        expect(createData.success).toBe(true);
        expect(createData.profiler_id).toBeDefined();
        profilerIdFromCreate = createData.profiler_id;

        // Generate trace activity by running class with created profilerId.
        const executor = new AdtExecutor(connection, logger);
        const classExecutor = executor.getClassExecutor();
        const runResponse = await classExecutor.runWithProfiler(
          { className },
          { profilerId: profilerIdFromCreate as string },
        );
        expect(runResponse.status).toBeGreaterThanOrEqual(200);
        expect(runResponse.status).toBeLessThan(300);

        // Resolve trace ID tied to this execution using executor helper flow.
        const profiledRun = await classExecutor.runWithProfiling(
          { className },
          {
            profilerParameters: {
              description: `MCP_RUNTIME_TEST_EXEC_${Date.now()}`,
              allProceduralUnits: true,
              sqlTrace: true,
              allDbEvents: true,
              maxTimeForTracing: 1800,
            },
          },
        );
        traceIdFromRun = profiledRun.traceId;
        logger?.info(`→ trace id from runWithProfiling: ${traceIdFromRun}`);
      });
    },
    getTimeout('long'),
  );

  it(
    'RuntimeListProfilerTraceFiles should return trace files feed',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const handlerContext = createHandlerContext({ connection, logger });
        const maxAttempts = Math.max(
          1,
          Number.parseInt(String(params?.trace_feed_retries ?? 6), 10) || 6,
        );
        const retryDelayMs = Math.max(
          100,
          Number.parseInt(
            String(params?.trace_feed_retry_delay_ms ?? 1000),
            10,
          ) || 1000,
        );
        let result: any | undefined;
        let data: any | undefined;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          logger?.info(`→ list trace files attempt ${attempt}/${maxAttempts}`);
          result = await handleRuntimeListProfilerTraceFiles(handlerContext);
          expect(result.isError).toBe(false);
          data = parseTextPayload(result);
          expect(data.success).toBe(true);
          expect(data.status).toBe(200);
          traceIdFromFeed = extractTraceIdFromPayload(data.payload);
          if (traceIdFromFeed) {
            break;
          }
          if (attempt < maxAttempts) {
            await delay(retryDelayMs);
          }
        }
        if (!traceIdFromFeed) {
          throw new Error(
            `No trace id found in profiler trace feed after ${maxAttempts} attempts`,
          );
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'RuntimeGetProfilerTraceData should return hitlist data for existing trace',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const handlerContext = createHandlerContext({ connection, logger });

        const traceIdOrUri =
          traceIdFromRun ||
          traceIdFromFeed ||
          params?.trace_id_or_uri ||
          undefined;
        if (!traceIdOrUri) {
          throw new Error(
            'SKIP: no trace_id_or_uri available from feed/config',
          );
        }

        const maxAttempts = Math.max(
          1,
          Number.parseInt(String(params?.trace_read_retries ?? 6), 10) || 6,
        );
        const retryDelayMs = Math.max(
          100,
          Number.parseInt(
            String(params?.trace_read_retry_delay_ms ?? 1500),
            10,
          ) || 1500,
        );
        let result: any | undefined;
        let lastErrorDetails: any;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          logger?.info(
            `→ read trace hitlist attempt ${attempt}/${maxAttempts} (trace=${traceIdOrUri})`,
          );
          result = await handleRuntimeGetProfilerTraceData(handlerContext, {
            trace_id_or_uri: traceIdOrUri,
            view: 'hitlist',
            with_system_events: false,
          });

          if (!result.isError) {
            break;
          }

          lastErrorDetails = safeParseTextPayload(result);
          if (attempt < maxAttempts) {
            await delay(retryDelayMs);
          }
        }

        if (result?.isError) {
          const debugInfo = safeParseTextPayload(result) || lastErrorDetails;
          throw new Error(
            `RuntimeGetProfilerTraceData failed after ${maxAttempts} attempts for trace "${traceIdOrUri}": ${JSON.stringify(debugInfo ?? result, null, 2)}`,
          );
        }

        expect(result?.isError).toBe(false);
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.view).toBe('hitlist');
      });
    },
    getTimeout('long'),
  );

  it(
    'RuntimeListDumps should return dumps feed',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const handlerContext = createHandlerContext({ connection, logger });

        const result = await handleRuntimeListDumps(handlerContext, {
          user: params?.dumps_user || undefined,
          inlinecount: 'allpages',
          top: 50,
        });

        expect(result.isError).toBe(false);
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.status).toBe(200);
        dumpIdFromFeed = extractDumpIdFromPayload(data.payload);
        dumpIdsFromFeed = extractDumpIdsFromPayload(data.payload);
        logger?.info(`→ dumps discovered in feed: ${dumpIdsFromFeed.length}`);
      });
    },
    getTimeout('long'),
  );

  it(
    'RuntimeGetDumpById should read up to 5 dump details from feed',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const handlerContext = createHandlerContext({ connection, logger });
        const configuredLimit = Number.parseInt(
          String(params?.dumps_read_limit ?? 5),
          10,
        );
        const readLimit = Math.max(
          1,
          Number.isNaN(configuredLimit) ? 5 : configuredLimit,
        );
        const candidateDumpIds =
          dumpIdsFromFeed.length > 0
            ? dumpIdsFromFeed
            : dumpIdFromFeed
              ? [dumpIdFromFeed]
              : params?.dump_id
                ? [params.dump_id]
                : [];
        const dumpIdsToRead = candidateDumpIds.slice(0, readLimit);

        if (dumpIdsToRead.length === 0) {
          throw new Error(
            'SKIP: no runtime dumps available in feed/config for this system/user context',
          );
        }

        logger?.info(
          `→ reading dump details for ${dumpIdsToRead.length} dump(s)`,
        );
        for (const dumpId of dumpIdsToRead) {
          const result = await handleRuntimeGetDumpById(handlerContext, {
            dump_id: dumpId,
          });
          expect(result.isError).toBe(false);
          const data = parseTextPayload(result);
          expect(data.success).toBe(true);
          expect(data.dump_id).toBe(dumpId);
        }
      });
    },
    getTimeout('long'),
  );
});
