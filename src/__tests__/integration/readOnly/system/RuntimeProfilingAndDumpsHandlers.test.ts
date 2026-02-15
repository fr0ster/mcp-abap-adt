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

function parseTextPayload(result: any): any {
  const textContent = result.content.find((c: any) => c.type === 'text') as any;
  if (!textContent?.text) {
    throw new Error('Missing text payload in handler response');
  }
  return JSON.parse(textContent.text);
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

describe('Runtime Profiling and Dumps Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('runtime-readonly');
  let profilerIdFromCreate: string | undefined;
  let traceIdFromFeed: string | undefined;
  let dumpIdFromFeed: string | undefined;

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
      });
    },
    getTimeout('long'),
  );

  it(
    'RuntimeListProfilerTraceFiles should return trace files feed',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;
        const handlerContext = createHandlerContext({ connection, logger });

        const result = await handleRuntimeListProfilerTraceFiles(handlerContext);
        expect(result.isError).toBe(false);

        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.status).toBe(200);
        traceIdFromFeed = extractTraceIdFromPayload(data.payload);
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
          traceIdFromFeed ||
          profilerIdFromCreate ||
          params?.trace_id_or_uri ||
          undefined;
        if (!traceIdOrUri) {
          throw new Error('SKIP: no trace_id_or_uri available from feed/config');
        }

        const result = await handleRuntimeGetProfilerTraceData(handlerContext, {
          trace_id_or_uri: traceIdOrUri,
          view: 'hitlist',
          with_system_events: false,
        });

        expect(result.isError).toBe(false);
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
          user: params?.dumps_user,
          inlinecount: 'allpages',
          top: 50,
        });

        expect(result.isError).toBe(false);
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.status).toBe(200);
        dumpIdFromFeed = extractDumpIdFromPayload(data.payload);
      });
    },
    getTimeout('long'),
  );

  it(
    'RuntimeGetDumpById should read dump details for existing dump ID',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const handlerContext = createHandlerContext({ connection, logger });

        const dumpId = dumpIdFromFeed || params?.dump_id || 'INVALID_DUMP_ID';

        const result = await handleRuntimeGetDumpById(handlerContext, {
          dump_id: dumpId,
        });
        if (dumpId === 'INVALID_DUMP_ID') {
          expect(result.isError).toBe(true);
          return;
        }

        expect(result.isError).toBe(false);
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.dump_id).toBe(dumpId);
      });
    },
    getTimeout('long'),
  );
});
