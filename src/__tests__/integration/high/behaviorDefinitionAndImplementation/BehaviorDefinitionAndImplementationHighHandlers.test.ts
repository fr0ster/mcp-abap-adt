/**
 * Combined integration tests for BehaviorDefinition + BehaviorImplementation High-Level Handlers
 *
 * BDEF must exist before BIMPL can be created, so both are tested in a single
 * describe block with guaranteed ordering:
 *   1. Create BDEF (no activation) ->  Update BDEF (no activation)
 *   2. Create BIMPL  ->  Update BIMPL
 *   3. Group-activate BDEF + BIMPL class together (avoids activation warnings)
 *   4. Cleanup: delete BIMPL class, then delete BDEF
 *
 * Config keys:
 *   - BDEF:  create_behavior_definition_low / full_workflow
 *   - BIMPL: create_behavior_implementation / builder_behavior_implementation
 *
 * Run: npm test -- --testPathPatterns=integration/behaviorDefinitionAndImplementation.*High
 */

import { handleCreateBehaviorDefinition } from '../../../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import { handleValidateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
import { handleCreateBehaviorImplementation } from '../../../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleDeleteClass } from '../../../../handlers/class/low/handleDeleteClass';
import { handleActivateObject } from '../../../../handlers/common/low/handleActivateObject';
import { getEnabledTestCase, getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import {
  assertNameAvailable,
  createView,
  deleteView,
  type ViewFixture,
} from '../../helpers/rapFixtures';
import { ensureSharedObjects } from '../../helpers/sharedObjects';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  delay,
  extractErrorMessage,
} from '../../helpers/testHelpers';

const testLogger = createTestLogger('bdef-bimpl-high');

describe('BehaviorDefinition + BehaviorImplementation High-Level Handlers Integration', () => {
  let tester: LambdaTester;

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_behavior_definition',
      'full_workflow',
      'bdef-bimpl-high',
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        // Verify CDS view prerequisites exist (ZMCP_SHR_I_BDEF etc.)
        await ensureSharedObjects(context.connection);
      },
      // Cleanup lambda: delete BIMPL class first, then BDEF
      // A refused delete is reported here, not printed as a success. Both
      // branches below used to log `Deleted …` straight after the call: these
      // handlers answer `isError: true` instead of throwing, so the line said
      // the object was gone whatever the server replied. That is exactly how an
      // object still held by an ENQUEUE lock read as cleaned up.
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        const leftBehind: string[] = [];

        // Load BIMPL config to get class name
        const bimplTestCase = getEnabledTestCase(
          'create_behavior_implementation',
          'builder_behavior_implementation',
        );
        const bimplClassName = bimplTestCase?.params?.class_name;

        // 1. Delete BIMPL class (must go first — depends on BDEF)
        if (bimplClassName) {
          try {
            const deleteCtx = createHandlerContext({
              connection,
              logger: testLogger,
            });
            const answer = await handleDeleteClass(deleteCtx, {
              class_name: bimplClassName,
              ...(transportRequest && {
                transport_request: transportRequest,
              }),
            });
            if ((answer as { isError?: boolean })?.isError) {
              const detail = extractErrorMessage(
                answer as {
                  isError: boolean;
                  content: { type: string; text: string }[];
                },
              );
              if (/does not exist|not found|404/i.test(detail)) {
                testLogger?.info?.(
                  `BIMPL class ${bimplClassName} was not there`,
                );
              } else {
                testLogger?.error?.(`Delete BIMPL class refused: ${detail}`);
                leftBehind.push(`BIMPL class ${bimplClassName}: ${detail}`);
              }
            } else {
              testLogger?.info?.(`Deleted BIMPL class ${bimplClassName}`);
            }
          } catch (e: any) {
            const msg = e?.message || String(e);
            if (!msg.includes('not found') && !msg.includes('404')) {
              testLogger?.warn?.(`Failed to delete BIMPL class: ${msg}`);
            }
          }
        }

        // 2. Delete BDEF
        if (objectName) {
          try {
            const deleteCtx = createHandlerContext({
              connection,
              logger: testLogger,
            });
            const answer = await handleDeleteBehaviorDefinition(deleteCtx, {
              name: objectName,
              ...(transportRequest && {
                transport_request: transportRequest,
              }),
            });
            if ((answer as { isError?: boolean })?.isError) {
              const detail = extractErrorMessage(
                answer as {
                  isError: boolean;
                  content: { type: string; text: string }[];
                },
              );
              if (/does not exist|not found|404/i.test(detail)) {
                testLogger?.info?.(`BDEF ${objectName} was not there`);
              } else {
                testLogger?.error?.(`Delete BDEF refused: ${detail}`);
                leftBehind.push(`BDEF ${objectName}: ${detail}`);
              }
            } else {
              testLogger?.info?.(`Deleted BDEF ${objectName}`);
            }
          } catch (e: any) {
            const msg = e?.message || String(e);
            if (!msg.includes('not found') && !msg.includes('404')) {
              testLogger?.error?.(`Failed to delete BDEF: ${msg}`);
              leftBehind.push(`BDEF ${objectName}: ${msg}`);
            }
          }
        }

        // 3. Delete the view this suite created.
        const cleanupParams = context.params ?? {};
        if (cleanupParams.root_view_name) {
          leftBehind.push(
            ...(await deleteView(
              createHandlerContext({ connection, logger: testLogger }),
              {
                name: cleanupParams.root_view_name,
                description: `Root view for ${objectName}`,
                source: cleanupParams.root_view_source,
              },
              transportRequest,
              testLogger,
            )),
          );
        }

        if (leftBehind.length > 0) {
          throw new Error(
            `cleanup did not remove ${leftBehind.length} object(s): ${leftBehind.join('; ')}`,
          );
        }
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async () => {});
  });

  beforeEach(async () => {
    await tester.beforeEach(async () => {});
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should execute full workflow: Create BDEF -> Update BDEF -> Create BIMPL -> Update BIMPL -> Activate both',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const {
          connection,
          objectName,
          params,
          packageName,
          transportRequest,
        } = context;

        if (!objectName) throw new Error('BDEF name is required');

        const handlerCtx = createHandlerContext({
          connection,
          logger: testLogger,
        });

        /**
         * **What this suite was missing entirely.** Every step below used to be
         * `await handler(...)` followed by a log line announcing success, and
         * these handlers do not throw on a refusal — they answer
         * `isError: true` with the server's account in the payload. Measured on
         * 2026-09-24: `grep -c isError` over this file returned **0**, so the
         * suite passed as long as nothing crashed, and its log said `Deleted
         * BDEF`, `BDEF updated` and `group activation completed` over answers
         * nobody read. A cleanup line of exactly that kind is what made an
         * ENQUEUE lock left by the low-tier suite look like it had been
         * cleared.
         */
        const mustSucceed = async (
          step: string,
          run: () => Promise<unknown>,
        ): Promise<void> => {
          const answer = (await run()) as {
            isError: boolean;
            content: { type: string; text: string }[];
          };
          if (answer?.isError) {
            throw new Error(`${step} failed: ${extractErrorMessage(answer)}`);
          }
        };

        // ── Step 0: the view this BDEF is defined over — this suite's own, under
        // its own name, so nothing here can lock a shared name out.
        const rootView: ViewFixture = {
          name: params.root_view_name,
          description: `Root view for ${objectName}`,
          source: params.root_view_source,
        };
        await createView(
          handlerCtx,
          rootView,
          packageName,
          transportRequest,
          testLogger,
        );

        // ── Step 1: Create BDEF (skip activation — will activate together with BIMPL)
        // Ask first whether the name is free: `admissible: false` carries the
        // server's reason, and a run that skips this finds out from a create
        // that is refused for something that reads like another problem.
        await assertNameAvailable(`BDEF ${objectName}`, () =>
          handleValidateBehaviorDefinition(handlerCtx, {
            name: objectName,
            package_name: packageName,
            description: params.description || objectName,
            root_entity: params.root_entity,
            implementation_type: params.implementation_type,
          }),
        );
        testLogger?.info?.(`   * create BDEF: ${objectName}`);
        await mustSucceed(`Create BDEF ${objectName}`, () =>
          handleCreateBehaviorDefinition(handlerCtx, {
            name: objectName,
            package_name: packageName,
            description: params.description || objectName,
            root_entity: params.root_entity,
            implementation_type: params.implementation_type,
            activate: false,
            ...(transportRequest && { transport_request: transportRequest }),
          }),
        );
        testLogger?.info?.(`   + BDEF created (not activated)`);

        // ── Step 2: Update BDEF (skip activation)
        testLogger?.info?.(`   * update BDEF: ${objectName}`);
        await mustSucceed(`Update BDEF ${objectName}`, () =>
          handleUpdateBehaviorDefinition(handlerCtx, {
            name: objectName,
            source_code: params.update_source_code || params.source_code,
            activate: false,
            ...(transportRequest && { transport_request: transportRequest }),
          }),
        );
        testLogger?.info?.(`   + BDEF updated (not activated)`);

        await delay(context.getOperationDelay('update'));

        // ── Step 3: Load BIMPL config
        const bimplTestCase = getEnabledTestCase(
          'create_behavior_implementation',
          'builder_behavior_implementation',
        );
        if (!bimplTestCase) {
          testLogger?.info?.(
            'BIMPL test case not found or disabled, skipping BIMPL steps',
          );
          return;
        }

        const bimplParams = bimplTestCase.params;
        const bimplClassName = bimplParams.class_name;
        const behaviorDefinition =
          bimplParams.behavior_definition || objectName;

        // ── Step 4: Create BIMPL (high-level handler auto-activates internally,
        //            but BIMPL alone can activate OK — BDEF just gets a warning)
        testLogger?.info?.(`   * create BIMPL: ${bimplClassName}`);
        await mustSucceed(`Create BIMPL ${bimplClassName}`, () =>
          handleCreateBehaviorImplementation(handlerCtx, {
            class_name: bimplClassName,
            description: bimplParams.description,
            behavior_definition: behaviorDefinition,
            package_name: packageName,
            ...(transportRequest && { transport_request: transportRequest }),
          }),
        );
        testLogger?.info?.(`   + BIMPL created`);

        await delay(context.getOperationDelay('create'));

        // ── Step 5: Update BIMPL
        testLogger?.info?.(`   * update BIMPL: ${bimplClassName}`);
        // **`activate: false`, because the class cannot compile on its own yet.**
        // The handler activates by default, and the include it writes is
        // generated against the behavior definition — which is still inactive at
        // this point, by design, so that step 6 can activate BDEF and class
        // together. Letting the default run answered *"Activation failed: Class
        // …, Class Include (Local Data Types, Object Types, Macros) IMP"*, and
        // the suite never noticed because it read no answers.
        await mustSucceed(`Update BIMPL ${bimplClassName}`, () =>
          handleUpdateBehaviorImplementation(handlerCtx, {
            class_name: bimplClassName,
            behavior_definition: behaviorDefinition,
            implementation_code:
              bimplParams.update_implementation_code ||
              bimplParams.implementation_code,
            activate: false,
            ...(transportRequest && { transport_request: transportRequest }),
          }),
        );
        testLogger?.info?.(`   + BIMPL updated`);

        await delay(context.getOperationDelay('update'));

        // ── Step 6: Group-activate BDEF + BIMPL class together
        testLogger?.info?.(
          `   * group activate: ${objectName} + ${bimplClassName}`,
        );
        await mustSucceed(
          `Group activation of ${objectName} + ${bimplClassName}`,
          () =>
            handleActivateObject(handlerCtx, {
              objects: [
                { name: objectName.toUpperCase(), type: 'BDEF/BDO' },
                { name: bimplClassName.toUpperCase(), type: 'CLAS/OC' },
              ],
            }),
        );
        testLogger?.info?.(`   + group activation completed`);

        testLogger?.info?.('Full BDEF+BIMPL high-level workflow completed');
      });
    },
    getTimeout('long'),
  );
});
