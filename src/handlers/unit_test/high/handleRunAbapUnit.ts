import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import { WAIT_FIELD } from '../shared/runner';
import { RUN_TARGET_FIELD } from '../shared/runTarget';
/**
 * RunAbapUnit — run ABAP Unit by a run target (`AbapUnitRunTarget` of
 * interfaces-adt): one object of any type the run registry
 * (`ABAP_UNIT_RUN_TYPES`) lists, or one package. Through adt-clients'
 * generic runner (`AdtExecutor.getAbapUnitTestRunner`): the run is started on
 * `POST /abapunit/runs` and, with `wait` (the default), its status read at
 * once and long-polled only while SAP answers it running (`readRunOnce`) —
 * the result of a run SAP answers finished, the run id and SAP's status for
 * one it answers not started — as the per-object run tools do
 * (`runTests.ts`); with `wait: false` the run id is answered at once.
 *
 * The endpoint answers a type it does not run with an empty result, not a
 * refusal (adt-clients' measurements), so the type is checked before anything
 * is sent (`runTarget.ts`, shared with compact `HandlerUnitTestRun`).
 *
 * A CDS view's tests are assigned tests (the registry's `runs:
 * 'assignedTests'`): local test classes marked `"! @testing <view>`. They
 * execute only when the scope sets `foreignTests`; with the default scope the
 * result lists them as a preview, unexecuted (measured by adt-clients on
 * S/4HANA 2025 and ABAP cloud).
 *
 * A test run executes code that can change data in the system, so the tool
 * is in the high group with the per-object run tools, and no read-only
 * binary serves it. SAP_BASIS 7.40 has no `/abapunit/runs`: `available_in` leaves `legacy` out.
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseUnitTestStart } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { scopeOf, waitOf } from '../shared/runner';
import { fieldOf, runFlagsOf, runTargetOf } from '../shared/runTarget';
import { projectRun, waitForRun } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunAbapUnit',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs the ABAP Unit tests of the run target named by target. target.kind object: the tests of the object named by target.name, of the run object type target.type (CLAS/OC a class, CLAS/OCL its test class include, PROG/P a program, FUGR/F a function group, FUNC a function module, DDLS/DF a CDS view, among the listed types). target.kind package: the tests of the package named by target.name, its subpackages too when target.include_subpackages is true. A CDS view has assigned tests: test classes elsewhere marked "! @testing <view>"; they execute when scope.foreign_tests is true, and with the default scope the result lists them as a preview, unexecuted. The run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id) returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id. A long run under a client with a request time limit is started with wait false.',
  inputSchema: z.object({
    target: RUN_TARGET_FIELD,
    scope: z
      .object({
        own_tests: z
          .boolean()
          .optional()
          .describe("Run the object's own tests (default true)."),
        foreign_tests: z
          .boolean()
          .optional()
          .describe(
            'Execute the assigned tests (default false); a CDS view run sets it true.',
          ),
        add_foreign_tests_as_preview: z
          .boolean()
          .optional()
          .describe(
            'List the assigned tests as a preview, unexecuted (default true).',
          ),
      })
      .optional()
      .describe(
        'Which tests the run covers. Assigned tests are test classes linked to the object by an ABAP Doc @testing relation (the tests of a CDS view are such).',
      ),
    risk_level: z
      .object({
        harmless: z
          .boolean()
          .optional()
          .describe('Run harmless tests (default true).'),
        dangerous: z
          .boolean()
          .optional()
          .describe('Run dangerous tests (default true).'),
        critical: z
          .boolean()
          .optional()
          .describe('Run critical tests (default true).'),
      })
      .optional()
      .describe('Risk levels the run accepts.'),
    duration: z
      .object({
        short: z
          .boolean()
          .optional()
          .describe('Run short tests (default true).'),
        medium: z
          .boolean()
          .optional()
          .describe('Run medium tests (default true).'),
        long: z.boolean().optional().describe('Run long tests (default true).'),
      })
      .optional()
      .describe('Durations the run accepts.'),
    wait: WAIT_FIELD,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleRunAbapUnit(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const target = runTargetOf(
    args !== null && typeof args === 'object'
      ? fieldOf(args, 'target')
      : undefined,
  );
  if (target instanceof Error) return return_error(target);
  const flags = runFlagsOf(args);
  if (flags instanceof Error) return return_error(flags);
  const { scope, riskLevel, duration } = flags;
  const wait = waitOf(args);
  const detail = detailOf(args);
  const runner = new AdtExecutor(
    context.connection,
    context.logger,
  ).getAbapUnitTestRunner(ourUnitTest);
  return answer(
    { tool: 'RunAbapUnit', detail },
    () =>
      waitForRun(runner, wait, () =>
        runner.run(target, {
          scope: scopeOf(scope),
          riskLevel,
          duration,
          // A run SAP did not start is a failure (see adt-clients' migration guide to 23).
          analyse: analyseUnitTestStart,
        }),
      ),
    projectRun(detail),
  );
}
