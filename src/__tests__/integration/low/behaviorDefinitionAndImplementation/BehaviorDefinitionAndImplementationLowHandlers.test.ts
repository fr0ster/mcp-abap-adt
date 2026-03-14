/**
 * Combined integration tests for BehaviorDefinition + BehaviorImplementation Low-Level Handlers
 *
 * BDEF must exist before BIMPL can be created, so both are tested in a single
 * test with guaranteed ordering:
 *   1. BDEF:  Validate -> Create -> Lock -> Update -> Unlock (no activate yet)
 *   2. BIMPL: Validate -> CreateClass -> CheckClass -> LockBimpl -> Update(AdtClient) -> UnlockClass
 *   3. Group-activate BDEF + BIMPL class together (avoids activation warnings)
 *   4. Cleanup: delete BIMPL class, then delete BDEF
 *
 * Config keys:
 *   - BDEF:  create_behavior_definition_low / full_workflow
 *   - BIMPL: create_behavior_implementation_low / full_workflow
 *
 * Run: npm test -- --testPathPatterns=integration/behaviorDefinitionAndImplementation.*Low
 */

import { handleCreateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleCreateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import { handleLockBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import { handleUnlockBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleValidateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
import { handleLockBehaviorImplementation } from '../../../../handlers/behavior_implementation/low/handleLockBehaviorImplementation';
import { handleValidateBehaviorImplementation } from '../../../../handlers/behavior_implementation/low/handleValidateBehaviorImplementation';
import { handleCheckClass } from '../../../../handlers/class/low/handleCheckClass';
import { handleCreateClass } from '../../../../handlers/class/low/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/low/handleDeleteClass';
import { handleUnlockClass } from '../../../../handlers/class/low/handleUnlockClass';
import { handleActivateObject } from '../../../../handlers/common/low/handleActivateObject';
import { createAdtClient } from '../../../../lib/clients';
import { getEnabledTestCase, getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { ensureSharedObjects } from '../../helpers/sharedObjects';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  delay,
  extractErrorMessage,
  extractLockHandle,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

const testLogger = createTestLogger('bdef-bimpl-low');

describe('BehaviorDefinition + BehaviorImplementation Low-Level Handlers Integration', () => {
  let tester: LambdaTester;

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_behavior_definition_low',
      'full_workflow',
      'bdef-bimpl-low',
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        await ensureSharedObjects(context.connection);
      },
      // Cleanup lambda: delete BIMPL class first, then BDEF
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;

        const bimplTestCase = getEnabledTestCase(
          'create_behavior_implementation_low',
          'full_workflow',
        );
        const bimplClassName = bimplTestCase?.params?.class_name;

        // 1. Delete BIMPL class
        if (bimplClassName) {
          try {
            await tester.invokeToolOrHandler(
              'DeleteClassLow',
              {
                class_name: bimplClassName,
                ...(transportRequest && {
                  transport_request: transportRequest,
                }),
              },
              async () => {
                const deleteCtx = createHandlerContext({
                  connection,
                  logger: testLogger,
                });
                return handleDeleteClass(deleteCtx, {
                  class_name: bimplClassName,
                  ...(transportRequest && {
                    transport_request: transportRequest,
                  }),
                });
              },
            );
            testLogger?.info?.(`Deleted BIMPL class ${bimplClassName}`);
          } catch (e: any) {
            const msg = e?.message || String(e);
            if (!msg.includes('not found') && !msg.includes('404')) {
              testLogger?.warn?.(`Failed to delete BIMPL class: ${msg}`);
            }
          }
        }

        // 2. Delete BDEF (delete does not require lock)
        if (objectName) {
          try {
            const deleteResponse = await tester.invokeToolOrHandler(
              'DeleteBehaviorDefinitionLow',
              {
                name: objectName,
                ...(transportRequest && {
                  transport_request: transportRequest,
                }),
              },
              async () => {
                const deleteCtx = createHandlerContext({
                  connection,
                  logger: testLogger,
                });
                return handleDeleteBehaviorDefinition(deleteCtx, {
                  name: objectName,
                  ...(transportRequest && {
                    transport_request: transportRequest,
                  }),
                });
              },
            );
            if (deleteResponse.isError) {
              testLogger?.warn?.(`Delete BDEF returned error: ${JSON.stringify(deleteResponse.content)?.substring(0, 300)}`);
            } else {
              testLogger?.info?.(`Deleted BDEF ${objectName}`);
            }
          } catch (e: any) {
            const msg = e?.message || String(e);
            testLogger?.warn?.(`Delete BDEF exception: ${msg}`);
          }
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
    'should execute full BDEF+BIMPL workflow with group activation',
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

        // ═══════════════════════════════════════════════════════════
        // Part 1: BDEF — Validate → Create → Lock → Update → Unlock
        // ═══════════════════════════════════════════════════════════

        // Validate BDEF
        testLogger?.info?.(`   * validate BDEF: ${objectName}`);
        const validateBdefResponse = await tester.invokeToolOrHandler(
          'ValidateBehaviorDefinitionLow',
          {
            name: objectName,
            package_name: packageName,
            description: params.description || objectName,
            root_entity: params.root_entity,
            implementation_type: params.implementation_type,
          },
          async () =>
            handleValidateBehaviorDefinition(handlerCtx, {
              name: objectName,
              package_name: packageName,
              description: params.description || objectName,
              root_entity: params.root_entity,
              implementation_type: params.implementation_type,
            }),
        );
        if (validateBdefResponse.isError) {
          throw new Error(
            `Validate BDEF failed: ${extractErrorMessage(validateBdefResponse)}`,
          );
        }
        testLogger?.info?.(`   + BDEF validated`);

        // Create BDEF
        testLogger?.info?.(`   * create BDEF: ${objectName}`);
        const createBdefResponse = await tester.invokeToolOrHandler(
          'CreateBehaviorDefinitionLow',
          {
            name: objectName,
            package_name: packageName,
            description: params.description || objectName,
            root_entity: params.root_entity,
            implementation_type: params.implementation_type,
            ...(transportRequest && { transport_request: transportRequest }),
          },
          async () =>
            handleCreateBehaviorDefinition(handlerCtx, {
              name: objectName,
              package_name: packageName,
              description: params.description || objectName,
              root_entity: params.root_entity,
              implementation_type: params.implementation_type,
              ...(transportRequest && { transport_request: transportRequest }),
            }),
        );
        if (createBdefResponse.isError) {
          const createErrorMsg = extractErrorMessage(createBdefResponse);
          const errorLower = createErrorMsg.toLowerCase();
          if (
            errorLower.includes('already exist') ||
            errorLower.includes('does already exist') ||
            errorLower.includes('status code 400')
          ) {
            testLogger?.info?.(`   ~ BDEF ${objectName} already exists (or 400), skipping create`);
          } else {
            throw new Error(`Create BDEF failed: ${createErrorMsg}`);
          }
        } else {
          testLogger?.info?.(`   + BDEF created`);
        }

        await delay(context.getOperationDelay('create'));

        // Lock BDEF
        testLogger?.info?.(`   * lock BDEF: ${objectName}`);
        const bdefLockResponse = await tester.invokeToolOrHandler(
          'LockBehaviorDefinitionLow',
          { name: objectName },
          async () =>
            handleLockBehaviorDefinition(handlerCtx, { name: objectName }),
        );
        if (bdefLockResponse.isError) {
          throw new Error(
            `Lock BDEF failed: ${extractErrorMessage(bdefLockResponse)}`,
          );
        }
        const bdefLockData = parseHandlerResponse(bdefLockResponse);
        const bdefLockHandle = extractLockHandle(bdefLockData);
        testLogger?.info?.(`   + BDEF locked`);

        await delay(context.getOperationDelay('lock'));

        // Update + Unlock BDEF (guarantee unlock even if update fails)
        try {
          testLogger?.info?.(`   * update BDEF: ${objectName}`);
          const updateBdefResponse = await tester.invokeToolOrHandler(
            'UpdateBehaviorDefinitionLow',
            {
              name: objectName,
              lock_handle: bdefLockHandle,
              source_code: params.update_source_code || params.source_code,
              ...(transportRequest && { transport_request: transportRequest }),
            },
            async () =>
              handleUpdateBehaviorDefinition(handlerCtx, {
                name: objectName,
                lock_handle: bdefLockHandle,
                source_code: params.update_source_code || params.source_code,
                ...(transportRequest && { transport_request: transportRequest }),
              }),
          );
          if (updateBdefResponse.isError) {
            throw new Error(
              `Update BDEF failed: ${extractErrorMessage(updateBdefResponse)}`,
            );
          }
          testLogger?.info?.(`   + BDEF updated`);
        } finally {
          testLogger?.info?.(`   * unlock BDEF: ${objectName}`);
          await tester.invokeToolOrHandler(
            'UnlockBehaviorDefinitionLow',
            {
              name: objectName,
              lock_handle: bdefLockHandle,
              session_id: '',
            },
            async () =>
              handleUnlockBehaviorDefinition(handlerCtx, {
                name: objectName,
                lock_handle: bdefLockHandle,
                session_id: '',
              }),
          );
          testLogger?.info?.(`   + BDEF unlocked`);
        }

        await delay(context.getOperationDelay('unlock'));

        // ═══════════════════════════════════════════════════════════════
        // Part 2: BIMPL — Validate → Create → Check → Lock → Update → Unlock
        // ═══════════════════════════════════════════════════════════════

        const bimplTestCase = getEnabledTestCase(
          'create_behavior_implementation_low',
          'full_workflow',
        );
        if (!bimplTestCase) {
          testLogger?.info?.('BIMPL test case not found or disabled, skipping');
          return;
        }

        const bimplParams = bimplTestCase.params;
        const className = bimplParams.class_name;
        const behaviorDefinition =
          bimplParams.behavior_definition || objectName;

        if (!className) throw new Error('BIMPL class_name is required');
        if (!bimplParams.description)
          throw new Error('description is required in BIMPL config');

        // Validate BIMPL
        testLogger?.info?.(`   * validate BIMPL: ${className}`);
        const validateResponse = await tester.invokeToolOrHandler(
          'ValidateBehaviorImplementationLow',
          {
            class_name: className,
            behavior_definition: behaviorDefinition,
            package_name: packageName,
            description: bimplParams.description,
          },
          async () =>
            handleValidateBehaviorImplementation(handlerCtx, {
              class_name: className,
              behavior_definition: behaviorDefinition,
              package_name: packageName,
              description: bimplParams.description,
            }),
        );

        if (validateResponse.isError) {
          const errorMsg = extractErrorMessage(validateResponse);
          testLogger?.info?.(
            `Validation error for ${className}: ${errorMsg}, skipping BIMPL`,
          );
          return;
        }
        testLogger?.info?.(`   + BIMPL validated`);

        // Create class
        testLogger?.info?.(`   * create class: ${className}`);
        const createArgs: Record<string, unknown> = {
          class_name: className,
          description: bimplParams.description,
          package_name: packageName,
          ...(transportRequest && { transport_request: transportRequest }),
        };
        const createResponse = await tester.invokeToolOrHandler(
          'CreateClassLow',
          createArgs,
          async () => handleCreateClass(handlerCtx, createArgs as any),
        );

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          if (
            errorMsg.toLowerCase().includes('already exists') ||
            errorMsg.toLowerCase().includes('does already exist')
          ) {
            testLogger?.info?.(
              `BIMPL class ${className} already exists, skipping`,
            );
            return;
          }
          throw new Error(`Create class failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        testLogger?.info?.(`   + class created`);

        await delay(context.getOperationDelay('create'));

        // Check class
        testLogger?.info?.(`   * check class: ${className}`);
        const checkResponse = await tester.invokeToolOrHandler(
          'CheckClassLow',
          { class_name: className },
          async () => handleCheckClass(handlerCtx, { class_name: className }),
        );
        if (checkResponse.isError) {
          throw new Error(
            `Check failed: ${extractErrorMessage(checkResponse)}`,
          );
        }
        testLogger?.info?.(`   + class checked`);

        await delay(context.getOperationDelay('create'));

        // Lock behavior implementation
        testLogger?.info?.(`   * lock BIMPL: ${className}`);
        const lockResponse = await tester.invokeToolOrHandler(
          'LockBehaviorImplementationLow',
          { class_name: className },
          async () =>
            handleLockBehaviorImplementation(handlerCtx, {
              class_name: className,
            }),
        );
        if (lockResponse.isError) {
          throw new Error(`Lock failed: ${extractErrorMessage(lockResponse)}`);
        }
        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        testLogger?.info?.(`   + BIMPL locked`);

        await delay(context.getOperationDelay('lock'));

        // Update implementations include (AdtClient direct — no MCP tool)
        testLogger?.info?.(`   * update implementation: ${className}`);
        if (!bimplParams.implementation_code) {
          throw new Error(
            'implementation_code is required in BIMPL config for update step',
          );
        }

        try {
          if (tester.isHardMode()) {
            testLogger?.info?.(
              'Skipping AdtClient update in hard mode (no MCP tool)',
            );
          } else {
            const client = createAdtClient(connection);
            await client.getBehaviorImplementation().update(
              {
                className,
                behaviorDefinition,
                implementationCode: bimplParams.implementation_code,
                transportRequest,
              },
              { lockHandle },
            );
            testLogger?.info?.(`   + implementation updated`);
          }
        } finally {
          await delay(context.getOperationDelay('update'));

          // Unlock class (guaranteed even if update fails)
          testLogger?.info?.(`   * unlock class: ${className}`);
          try {
            const unlockResponse = await tester.invokeToolOrHandler(
              'UnlockClassLow',
              { class_name: className, lock_handle: lockHandle },
              async () =>
                handleUnlockClass(handlerCtx, {
                  class_name: className,
                  lock_handle: lockHandle,
                }),
            );
            if (unlockResponse.isError) {
              testLogger?.warn?.(`Unlock failed: ${extractErrorMessage(unlockResponse)}`);
            } else {
              testLogger?.info?.(`   + class unlocked`);
            }
          } catch (unlockError: any) {
            testLogger?.warn?.(`Unlock exception: ${unlockError?.message}`);
          }
        }

        await delay(context.getOperationDelay('unlock'));

        // ═══════════════════════════════════════════════════════════
        // Part 3: Group-activate BDEF + BIMPL class together
        // ═══════════════════════════════════════════════════════════

        testLogger?.info?.(`   * group activate: ${objectName} + ${className}`);
        await tester.invokeToolOrHandler(
          'ActivateObjectLow',
          {
            objects: [
              { name: objectName.toUpperCase(), type: 'BDEF/BDO' },
              { name: className.toUpperCase(), type: 'CLAS/OC' },
            ],
          },
          async () =>
            handleActivateObject(handlerCtx, {
              objects: [
                { name: objectName.toUpperCase(), type: 'BDEF/BDO' },
                { name: className.toUpperCase(), type: 'CLAS/OC' },
              ],
            }),
        );
        testLogger?.info?.(`   + group activation completed`);

        testLogger?.info?.('Full BDEF+BIMPL low-level workflow completed');
      });
    },
    getTimeout('long'),
  );
});
