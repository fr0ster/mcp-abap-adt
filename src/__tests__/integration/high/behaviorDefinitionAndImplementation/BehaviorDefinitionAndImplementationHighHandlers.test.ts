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
import { handleCreateBehaviorImplementation } from '../../../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleDeleteClass } from '../../../../handlers/class/low/handleDeleteClass';
import { handleActivateObject } from '../../../../handlers/common/low/handleActivateObject';
import { getEnabledTestCase, getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { ensureSharedObjects } from '../../helpers/sharedObjects';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext, delay } from '../../helpers/testHelpers';

const testLogger = createTestLogger('bdef-bimpl-high');

describe('BehaviorDefinition + BehaviorImplementation High-Level Handlers Integration', () => {
  let tester: LambdaTester;

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_behavior_definition_low',
      'full_workflow',
      'bdef-bimpl-high',
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        // Verify CDS view prerequisites exist (ZMCP_SHR_I_BDEF etc.)
        await ensureSharedObjects(context.connection);
      },
      // Cleanup lambda: delete BIMPL class first, then BDEF
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;

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
            await handleDeleteClass(deleteCtx, {
              class_name: bimplClassName,
              ...(transportRequest && {
                transport_request: transportRequest,
              }),
            });
            testLogger?.info?.(`Deleted BIMPL class ${bimplClassName}`);
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
            await handleDeleteBehaviorDefinition(deleteCtx, {
              name: objectName,
              ...(transportRequest && {
                transport_request: transportRequest,
              }),
            });
            testLogger?.info?.(`Deleted BDEF ${objectName}`);
          } catch (e: any) {
            const msg = e?.message || String(e);
            if (!msg.includes('not found') && !msg.includes('404')) {
              testLogger?.warn?.(`Failed to delete BDEF: ${msg}`);
            }
          }
        }
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async () => {});
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

        // ── Step 1: Create BDEF (skip activation — will activate together with BIMPL)
        testLogger?.info?.(`   * create BDEF: ${objectName}`);
        await handleCreateBehaviorDefinition(handlerCtx, {
          name: objectName,
          package_name: packageName,
          description: params.description || objectName,
          root_entity: params.root_entity,
          implementation_type: params.implementation_type,
          activate: false,
          ...(transportRequest && { transport_request: transportRequest }),
        });
        testLogger?.info?.(`   + BDEF created (not activated)`);

        // ── Step 2: Update BDEF (skip activation)
        testLogger?.info?.(`   * update BDEF: ${objectName}`);
        await handleUpdateBehaviorDefinition(handlerCtx, {
          name: objectName,
          source_code: params.update_source_code || params.source_code,
          activate: false,
          ...(transportRequest && { transport_request: transportRequest }),
        });
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
        await handleCreateBehaviorImplementation(handlerCtx, {
          class_name: bimplClassName,
          description: bimplParams.description,
          behavior_definition: behaviorDefinition,
          package_name: packageName,
          ...(transportRequest && { transport_request: transportRequest }),
        });
        testLogger?.info?.(`   + BIMPL created`);

        await delay(context.getOperationDelay('create'));

        // ── Step 5: Update BIMPL
        testLogger?.info?.(`   * update BIMPL: ${bimplClassName}`);
        await handleUpdateBehaviorImplementation(handlerCtx, {
          class_name: bimplClassName,
          behavior_definition: behaviorDefinition,
          implementation_code:
            bimplParams.update_implementation_code ||
            bimplParams.implementation_code,
          ...(transportRequest && { transport_request: transportRequest }),
        });
        testLogger?.info?.(`   + BIMPL updated`);

        await delay(context.getOperationDelay('update'));

        // ── Step 6: Group-activate BDEF + BIMPL class together
        testLogger?.info?.(
          `   * group activate: ${objectName} + ${bimplClassName}`,
        );
        await handleActivateObject(handlerCtx, {
          objects: [
            { name: objectName.toUpperCase(), type: 'BDEF/BDO' },
            { name: bimplClassName.toUpperCase(), type: 'CLAS/OC' },
          ],
        });
        testLogger?.info?.(`   + group activation completed`);

        testLogger?.info?.('Full BDEF+BIMPL high-level workflow completed');
      });
    },
    getTimeout('long'),
  );
});
