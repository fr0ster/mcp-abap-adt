/**
 * Integration tests for ATC High-Level Handlers
 *
 * Tests the full async ATC flow:
 *   ListATCCheckVariants → RunATC → GetATCRunStatus (poll) → GetATCFindings
 *
 * Configure the target object in tests/test-config.yaml under the `atc` section
 * (defaults to a package; can also be a single class for a faster run).
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true      - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/high/atc/AtcHighHandlers
 */

import { handleGetATCFindings } from '../../../../handlers/atc/high/handleGetATCFindings';
import { handleGetATCRunStatus } from '../../../../handlers/atc/high/handleGetATCRunStatus';
import { handleListATCCheckVariants } from '../../../../handlers/atc/high/handleListATCCheckVariants';
import { handleRunATC } from '../../../../handlers/atc/high/handleRunATC';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  delay,
  extractErrorMessage,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('ATC High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('atc-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'atc',
      'package_findings',
      'atc-high',
      'package_findings',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup — connection is already created in tester
      },
      async (_context: LambdaTesterContext) => {
        // ATC runs don't need cleanup (worklists expire server-side)
      },
    );
  }, getTimeout('long'));

  beforeEach(async () => {
    await tester.beforeEach(async (_context: LambdaTesterContext) => {
      // No additional setup needed
    });
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      // No additional cleanup needed
    });
  });

  it(
    'should execute the full ATC flow: ListATCCheckVariants → RunATC → poll GetATCRunStatus → GetATCFindings',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params, logger: contextLogger } = context;
        const testLogger = contextLogger || logger;

        if (!params) {
          testLogger?.warn('No test parameters found, skipping test');
          return;
        }

        const objectName = params.object_name as string | undefined;
        const objectType = params.object_type as string | undefined;
        if (!objectName || !objectType) {
          testLogger?.warn(
            'object_name / object_type missing from atc test params, skipping test',
          );
          return;
        }
        const checkVariant = (params.check_variant as string) || undefined;
        const maxFindings = (params.max_findings as number | undefined) ?? 100;
        const pollIntervalMs =
          (params.poll_interval_ms as number | undefined) ?? 4000;
        const maxPolls = (params.max_polls as number | undefined) ?? 75;
        const findingsFormat =
          (params.findings_format as 'xml' | 'checkstyle' | undefined) ?? 'xml';

        // Step 1: ListATCCheckVariants — read-only sanity check
        testLogger?.info('   • list ATC check variants');
        const listResponse = await tester.invokeToolOrHandler(
          'ListATCCheckVariants',
          { max_item_count: 50, name_pattern: '*' },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger: testLogger,
            });
            return handleListATCCheckVariants(handlerContext, {
              max_item_count: 50,
              name_pattern: '*',
            });
          },
        );
        if (listResponse.isError) {
          const errorMsg = extractErrorMessage(listResponse);
          throw new Error(`ListATCCheckVariants failed: ${errorMsg}`);
        }
        const listData = parseHandlerResponse(listResponse);
        expect(listData.success).toBe(true);
        expect(typeof listData.variants).toBe('string');
        expect(listData.variants).toContain('<');
        testLogger?.success('list ATC check variants completed successfully');

        // Step 2: RunATC — start a worklist + run
        testLogger?.info(
          `   • RunATC on ${objectType} ${objectName.toUpperCase()}` +
            (checkVariant
              ? ` (variant: ${checkVariant})`
              : ' (system default)'),
        );
        const runArgs: {
          object_name: string;
          object_type:
            | 'class'
            | 'interface'
            | 'program'
            | 'function_group'
            | 'include'
            | 'package';
          check_variant?: string;
          max_findings?: number;
        } = {
          object_name: objectName,
          object_type: objectType as
            | 'class'
            | 'interface'
            | 'program'
            | 'function_group'
            | 'include'
            | 'package',
          max_findings: maxFindings,
        };
        if (checkVariant) {
          runArgs.check_variant = checkVariant;
        }
        const runResponse = await tester.invokeToolOrHandler(
          'RunATC',
          runArgs,
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger: testLogger,
            });
            return handleRunATC(handlerContext, runArgs);
          },
        );
        if (runResponse.isError) {
          const errorMsg = extractErrorMessage(runResponse);
          throw new Error(`RunATC failed: ${errorMsg}`);
        }
        const runData = parseHandlerResponse(runResponse);
        expect(runData.success).toBe(true);
        expect(runData.worklist_id).toBeDefined();
        expect(runData.run_id).toBeDefined();
        expect(String(runData.worklist_id)).toHaveLength(32);
        const worklistId = runData.worklist_id as string;
        const runId = runData.run_id as string;
        testLogger?.success(
          `RunATC completed (worklist_id: ${worklistId}, run_id: ${runId}, variant: ${runData.check_variant ?? 'n/a'})`,
        );

        // Step 3: poll GetATCRunStatus until finished
        testLogger?.info(`   • poll GetATCRunStatus for run_id ${runId}`);
        let finished = false;
        for (let i = 0; i < maxPolls; i++) {
          if (i > 0) {
            await delay(pollIntervalMs);
          }
          const statusResponse = await tester.invokeToolOrHandler(
            'GetATCRunStatus',
            { run_id: runId, with_long_polling: true },
            async () => {
              const handlerContext = createHandlerContext({
                connection,
                logger: testLogger,
              });
              return handleGetATCRunStatus(handlerContext, {
                run_id: runId,
                with_long_polling: true,
              });
            },
          );
          if (statusResponse.isError) {
            const errorMsg = extractErrorMessage(statusResponse);
            throw new Error(`GetATCRunStatus failed: ${errorMsg}`);
          }
          const statusData = parseHandlerResponse(statusResponse);
          expect(statusData.success).toBe(true);
          const statusBody =
            typeof statusData.run_status === 'string'
              ? statusData.run_status
              : '';
          if (statusBody.includes('status="finished"')) {
            finished = true;
            testLogger?.success(
              `GetATCRunStatus reports finished after ${i + 1} poll(s)`,
            );
            break;
          }
          if (statusBody.includes('status="cancelled"')) {
            throw new Error(`ATC run ${runId} was cancelled by the server`);
          }
        }
        expect(finished).toBe(true);

        // Step 4: GetATCFindings
        testLogger?.info(
          `   • GetATCFindings for worklist_id ${worklistId} (format: ${findingsFormat})`,
        );
        const findingsResponse = await tester.invokeToolOrHandler(
          'GetATCFindings',
          {
            worklist_id: worklistId,
            format: findingsFormat,
            include_exempted_findings: false,
          },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger: testLogger,
            });
            return handleGetATCFindings(handlerContext, {
              worklist_id: worklistId,
              format: findingsFormat,
              include_exempted_findings: false,
            });
          },
        );
        if (findingsResponse.isError) {
          const errorMsg = extractErrorMessage(findingsResponse);
          throw new Error(`GetATCFindings failed: ${errorMsg}`);
        }
        const findingsData = parseHandlerResponse(findingsResponse);
        expect(findingsData.success).toBe(true);
        expect(findingsData.worklist_id).toBe(worklistId);
        expect(typeof findingsData.findings).toBe('string');
        // Findings body is XML — accept either Checkstyle output or native
        // ATC worklist XML, since the server may ignore the format Accept
        // header for this endpoint on some systems.
        const findingsBody = findingsData.findings as string;
        expect(findingsBody).toContain('<');
        const looksLikeAtcXml =
          findingsBody.includes('atcworklist:worklist') ||
          findingsBody.includes('checkstyle') ||
          findingsBody.includes('<file ') ||
          findingsBody.includes('<finding');
        expect(looksLikeAtcXml).toBe(true);
        testLogger?.success(
          `GetATCFindings completed (${findingsBody.length} bytes)`,
        );
      });
    },
    getTimeout('long'),
  );
});
