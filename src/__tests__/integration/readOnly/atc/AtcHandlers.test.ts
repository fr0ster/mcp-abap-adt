/**
 * Integration tests for the ATC handlers: RunATC → GetATCRunStatus →
 * GetATCFindings.
 *
 * Runs the ABAP Test Cockpit over a shared object with the system's DEFAULT
 * check variant. ATC reads the object and changes nothing in it, so a shared
 * object is safe to check. What a variant finds is the system's, so the count
 * comes from the test case (`min_findings`); the answers are held to their
 * shape and consistency, and every finding to its fields.
 *
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/atc
 */

import { handleGetATCFindings } from '../../../../handlers/atc/high/handleGetATCFindings';
import { handleGetATCRunStatus } from '../../../../handlers/atc/high/handleGetATCRunStatus';
import { handleRunATC } from '../../../../handlers/atc/high/handleRunATC';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  delay,
  extractErrorMessage,
} from '../../helpers/testHelpers';

function payload(result: any): any {
  const text = result.content.find((c: any) => c.type === 'text')?.text;
  if (!text) throw new Error('No response payload found');
  return JSON.parse(text);
}

describe('ATC Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('atc-test');

  beforeAll(async () => {
    tester = new LambdaTester('run_atc', 'default_variant', 'atc-test');
    await tester.beforeAll(
      async () => {
        logger?.info('Setup complete');
      },
      async () => {
        // Read-only: ATC changes nothing in the checked object.
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async () => {});
  });

  /** RunATC's own arguments, from the test case. */
  function runArgs(params: any, wait: boolean) {
    return {
      objects: [
        {
          name: params.object_name as string,
          type: params.object_type as string,
        },
      ],
      check_variant: params.check_variant as string,
      max_findings: params.max_findings ?? 100,
      wait,
    };
  }

  /** GetATCFindings, and the checks every findings answer must pass. */
  async function readFindings(
    connection: any,
    worklistId: string,
    params: any,
  ) {
    const result = await tester.invokeToolOrHandler(
      'GetATCFindings',
      { worklist_id: worklistId },
      async () =>
        handleGetATCFindings(createHandlerContext({ connection, logger }), {
          worklist_id: worklistId,
        } as any),
    );
    if (result.isError) {
      throw new Error(`GetATCFindings failed: ${extractErrorMessage(result)}`);
    }
    const data = payload(result);
    expect(data.worklist_id).toBe(worklistId);
    expect(data.objects_checked).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.finding_count).toBe(data.findings.length);
    expect(data.finding_count).toBeGreaterThanOrEqual(params.min_findings ?? 0);
    const byPriority = Object.values(data.by_priority ?? {}).reduce(
      (sum: number, n: any) => sum + Number(n),
      0,
    );
    expect(byPriority).toBeLessThanOrEqual(data.finding_count);
    for (const finding of data.findings) {
      expect(typeof finding.object).toBe('string');
      expect(finding.object.length).toBeGreaterThan(0);
      expect(typeof finding.object_type).toBe('string');
      if (finding.priority !== undefined) {
        expect([1, 2, 3]).toContain(Number(finding.priority));
      }
      if (finding.line !== undefined) {
        expect(finding.line).toBeGreaterThan(0);
      }
      expect(typeof finding.check).toBe('string');
      expect(typeof finding.message).toBe('string');
    }
    logger?.info(
      `ATC ${params.check_variant} on ${params.object_name}: ${data.objects_checked} object(s), ${data.finding_count} finding(s) ${JSON.stringify(data.by_priority ?? {})}`,
    );
    return data;
  }

  it(
    'runs without waiting, polls the run to its end, and reads the findings',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const args = runArgs(params, false);

        const started = await tester.invokeToolOrHandler(
          'RunATC',
          args,
          async () =>
            handleRunATC(
              createHandlerContext({ connection, logger }),
              args as any,
            ),
        );
        if (started.isError) {
          throw new Error(`RunATC failed: ${extractErrorMessage(started)}`);
        }
        const run = payload(started);
        expect(run.success).toBe(true);
        expect(run.check_variant).toBe(params.check_variant);
        expect(run.waited).toBe(false);
        expect(typeof run.worklist_id).toBe('string');
        expect(typeof run.run_id).toBe('string');

        const deadline = Date.now() + (params.poll_timeout_ms ?? 120000);
        let finished = false;
        while (!finished) {
          const polled = await tester.invokeToolOrHandler(
            'GetATCRunStatus',
            { run_id: run.run_id },
            async () =>
              handleGetATCRunStatus(
                createHandlerContext({ connection, logger }),
                { run_id: run.run_id } as any,
              ),
          );
          if (polled.isError) {
            throw new Error(
              `GetATCRunStatus failed: ${extractErrorMessage(polled)}`,
            );
          }
          const status = payload(polled);
          expect(typeof status.is_finished).toBe('boolean');
          finished = status.is_finished;
          if (!finished) {
            if (Date.now() > deadline) {
              throw new Error(
                `ATC run ${run.run_id} still "${status.status}" after ${params.poll_timeout_ms ?? 120000} ms`,
              );
            }
            await delay(params.poll_interval_ms ?? 3000);
          }
        }

        await readFindings(connection, run.worklist_id, params);
      });
    },
    getTimeout('long'),
  );

  it(
    'runs and waits, then reads the same kind of findings',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const args = runArgs(params, true);

        const done = await tester.invokeToolOrHandler(
          'RunATC',
          args,
          async () =>
            handleRunATC(
              createHandlerContext({ connection, logger }),
              args as any,
            ),
        );
        if (done.isError) {
          throw new Error(`RunATC failed: ${extractErrorMessage(done)}`);
        }
        const run = payload(done);
        expect(run.waited).toBe(true);
        expect(run.run_id).toBeUndefined();
        expect(typeof run.finding_stats).toBe('string');

        await readFindings(connection, run.worklist_id, params);
      });
    },
    getTimeout('long'),
  );

  it(
    'refuses a run with no objects',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;
        const result = await tester.invokeToolOrHandler(
          'RunATC',
          { objects: [] },
          async () =>
            handleRunATC(createHandlerContext({ connection, logger }), {
              objects: [],
            } as any),
        );
        expect(result.isError).toBe(true);
      });
    },
    getTimeout('long'),
  );
});
