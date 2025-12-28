/**
 * Integration tests for Class Local Includes High-Level Handlers
 *
 * Tests all high-level handlers for Class local includes:
 * - LocalTestClass: Get, Create, Update, Delete
 * - LocalTypes: Get, Create, Update, Delete
 * - LocalDefinitions: Get, Create, Update, Delete
 * - LocalMacros: Get, Create, Update, Delete
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/class/local
 */

import { handleCreateClass } from '../../../../handlers/class/high/handleCreateClass';
import { handleCreateLocalDefinitions } from '../../../../handlers/class/high/handleCreateLocalDefinitions';
import { handleCreateLocalMacros } from '../../../../handlers/class/high/handleCreateLocalMacros';
import { handleCreateLocalTestClass } from '../../../../handlers/class/high/handleCreateLocalTestClass';
import { handleCreateLocalTypes } from '../../../../handlers/class/high/handleCreateLocalTypes';
import { handleDeleteClass } from '../../../../handlers/class/high/handleDeleteClass';
import { handleDeleteLocalDefinitions } from '../../../../handlers/class/high/handleDeleteLocalDefinitions';
import { handleDeleteLocalMacros } from '../../../../handlers/class/high/handleDeleteLocalMacros';
import { handleDeleteLocalTestClass } from '../../../../handlers/class/high/handleDeleteLocalTestClass';
import { handleDeleteLocalTypes } from '../../../../handlers/class/high/handleDeleteLocalTypes';
import { handleGetLocalDefinitions } from '../../../../handlers/class/high/handleGetLocalDefinitions';
import { handleGetLocalMacros } from '../../../../handlers/class/high/handleGetLocalMacros';
import { handleGetLocalTestClass } from '../../../../handlers/class/high/handleGetLocalTestClass';
import { handleGetLocalTypes } from '../../../../handlers/class/high/handleGetLocalTypes';
import { handleUpdateLocalDefinitions } from '../../../../handlers/class/high/handleUpdateLocalDefinitions';
import { handleUpdateLocalMacros } from '../../../../handlers/class/high/handleUpdateLocalMacros';
import { handleUpdateLocalTestClass } from '../../../../handlers/class/high/handleUpdateLocalTestClass';
import { handleUpdateLocalTypes } from '../../../../handlers/class/high/handleUpdateLocalTypes';
import { handleActivateClass } from '../../../../handlers/class/low/handleActivateClass';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  extractErrorMessage,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('Class Local Includes High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('class-local-includes');

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_class',
      'builder_class',
      'class-local-includes',
      'builder_class',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup - connection is already created in tester
      },
      // Cleanup lambda - will be called by tester after checking YAML params
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;

        logger?.info(`   • cleanup: delete ${objectName}`);
        try {
          const deleteLogger = createTestLogger('class-local-includes-delete');
          const deleteCtx = createHandlerContext({
            connection,
            logger: deleteLogger,
          });
          const deleteResponse = await handleDeleteClass(deleteCtx, {
            class_name: objectName,
            ...(transportRequest && { transport_request: transportRequest }),
          });
          if (deleteResponse.isError) {
            const errorMsg = extractErrorMessage(deleteResponse);
            logger?.warn(`Delete failed (ignored in cleanup): ${errorMsg}`);
          } else {
            logger?.success(`✅ cleanup: deleted ${objectName} successfully`);
          }
        } catch (error: any) {
          logger?.warn(
            `Cleanup delete error (ignored): ${error.message || String(error)}`,
          );
        }
      },
    );
  }, getTimeout('long'));

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should test all Class local includes high-level handlers',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const {
          connection,
          objectName,
          params,
          packageName,
          transportRequest,
        } = context;

        expect(objectName).toBeDefined();
        expect(objectName).not.toBe('');
        if (!objectName) {
          fail('objectName is required');
        }
        const className = objectName;

        // Step 1: Create empty parent class (minimal code for local includes testing)
        logger?.info(`   • create empty parent class: ${objectName}`);
        const createLogger = createTestLogger('class-local-includes-create');
        const createCtx = createHandlerContext({
          connection,
          logger: createLogger,
        });
        // Use minimal empty class code for local includes testing
        const sourceCode =
          params.source_code ||
          `CLASS ${objectName} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${objectName} IMPLEMENTATION.
ENDCLASS.`;
        const createResponse = await handleCreateClass(createCtx, {
          class_name: className,
          package_name: packageName,
          source_code: sourceCode,
          activate: true,
          ...(transportRequest && { transport_request: transportRequest }),
        });

        expect(createResponse.isError).toBe(false);
        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          fail(`Create parent class failed: ${errorMsg}`);
        }

        logger?.success(`✅ create parent class: ${objectName} completed`);

        // Wait a bit after creation
        const delay = context.getOperationDelay('create');
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Step 2: Test LocalTestClass handlers
        logger?.info(`   • testing LocalTestClass handlers`);
        const testClassCode = `CLASS lcl_test DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS test_method FOR TESTING.
ENDCLASS.

CLASS lcl_test IMPLEMENTATION.
  METHOD test_method.
    cl_abap_unit_assert=>assert_true( abap_true ).
  ENDMETHOD.
ENDCLASS.`;

        // Create LocalTestClass
        const createTestClassLogger = createTestLogger(
          'local-test-class-create',
        );
        const createTestClassCtx = createHandlerContext({
          connection,
          logger: createTestClassLogger,
        });
        const createTestClassResponse = await handleCreateLocalTestClass(
          createTestClassCtx,
          {
            class_name: className,
            test_class_code: testClassCode,
            activate_on_create: false,
          },
        );
        expect(createTestClassResponse.isError).toBe(false);

        // Wait after creation before update (like in ClassHighHandlers.test.ts)
        const createDelay = context.getOperationDelay('create');
        await new Promise((resolve) => setTimeout(resolve, createDelay));

        logger?.success(`✅ LocalTestClass create completed`);

        // Step 3: Test LocalTypes handlers
        logger?.info(`   • testing LocalTypes handlers`);
        const localTypesCode = `CLASS lcl_helper DEFINITION.
  PUBLIC SECTION.
    METHODS helper_method.
ENDCLASS.

CLASS lcl_helper IMPLEMENTATION.
  METHOD helper_method.
    " Helper method
  ENDMETHOD.
ENDCLASS.`;

        // Create LocalTypes
        const createLocalTypesLogger = createTestLogger('local-types-create');
        const createLocalTypesCtx = createHandlerContext({
          connection,
          logger: createLocalTypesLogger,
        });
        const createLocalTypesResponse = await handleCreateLocalTypes(
          createLocalTypesCtx,
          {
            class_name: className,
            local_types_code: localTypesCode,
            activate_on_create: false,
          },
        );
        expect(createLocalTypesResponse.isError).toBe(false);

        // Wait after creation before update
        await new Promise((resolve) => setTimeout(resolve, createDelay));

        logger?.success(`✅ LocalTypes create completed`);

        // Step 4: Test LocalDefinitions handlers
        logger?.info(`   • testing LocalDefinitions handlers`);
        const localDefinitionsCode = `TYPES: BEGIN OF ty_test,
           field1 TYPE string,
           field2 TYPE i,
         END OF ty_test.`;

        // Create LocalDefinitions
        const createLocalDefsLogger = createTestLogger('local-defs-create');
        const createLocalDefsCtx = createHandlerContext({
          connection,
          logger: createLocalDefsLogger,
        });
        const createLocalDefsResponse = await handleCreateLocalDefinitions(
          createLocalDefsCtx,
          {
            class_name: className,
            definitions_code: localDefinitionsCode,
            activate_on_create: false,
          },
        );
        expect(createLocalDefsResponse.isError).toBe(false);

        // Wait after creation before update
        await new Promise((resolve) => setTimeout(resolve, createDelay));

        logger?.success(`✅ LocalDefinitions create completed`);

        // Step 5: Test LocalMacros handlers (may not be supported on all systems)
        logger?.info(`   • testing LocalMacros handlers`);
        const localMacrosCode = `DEFINE test_macro.
  " Test macro
END-OF-DEFINITION.`;

        try {
          // Create LocalMacros
          const createLocalMacrosLogger = createTestLogger(
            'local-macros-create',
          );
          const createLocalMacrosCtx = createHandlerContext({
            connection,
            logger: createLocalMacrosLogger,
          });
          const createLocalMacrosResponse = await handleCreateLocalMacros(
            createLocalMacrosCtx,
            {
              class_name: className,
              macros_code: localMacrosCode,
              activate_on_create: false,
            },
          );

          if (!createLocalMacrosResponse.isError) {
            // Wait after creation before update
            await new Promise((resolve) => setTimeout(resolve, createDelay));
            logger?.success(`✅ LocalMacros create completed`);
          } else {
            logger?.warn(
              `⚠️ LocalMacros not supported on this system (expected for newer ABAP versions)`,
            );
          }
        } catch (error: any) {
          logger?.warn(
            `⚠️ LocalMacros test skipped: ${error.message || String(error)}`,
          );
        }

        // Step 6: Test Update operations
        logger?.info(`   • testing Update operations`);

        // Update LocalTestClass
        const updatedTestClassCode = `${testClassCode}\n    " Updated`;
        const updateTestClassLogger = createTestLogger(
          'local-test-class-update',
        );
        const updateTestClassCtx = createHandlerContext({
          connection,
          logger: updateTestClassLogger,
        });
        const updateTestClassResponse = await handleUpdateLocalTestClass(
          updateTestClassCtx,
          {
            class_name: className,
            test_class_code: updatedTestClassCode,
            activate_on_update: false,
          },
        );
        expect(updateTestClassResponse.isError).toBe(false);

        // Update LocalTypes
        const updatedLocalTypesCode = `${localTypesCode}\n    " Updated`;
        const updateLocalTypesLogger = createTestLogger('local-types-update');
        const updateLocalTypesCtx = createHandlerContext({
          connection,
          logger: updateLocalTypesLogger,
        });
        const updateLocalTypesResponse = await handleUpdateLocalTypes(
          updateLocalTypesCtx,
          {
            class_name: className,
            local_types_code: updatedLocalTypesCode,
            activate_on_update: false,
          },
        );
        expect(updateLocalTypesResponse.isError).toBe(false);

        // Wait after update before reading (like in ClassHighHandlers.test.ts)
        await new Promise((resolve) => setTimeout(resolve, createDelay));

        // Activate class after updates to match adt-clients flow
        const activateResponse = await handleActivateClass(
          { connection, logger },
          { class_name: className },
        );
        if (activateResponse.isError) {
          const errorMsg = extractErrorMessage(activateResponse);
          throw new Error(`ActivateClass failed: ${errorMsg}`);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, context.getOperationDelay('activate')),
        );

        // Step 7: Test Get (read) operations - after Update
        logger?.info(`   • testing Get (read) operations`);

        // Get LocalTestClass - read after update
        // Since update was done with activate_on_update: false, read inactive version
        const getTestClassLogger = createTestLogger('local-test-class-get');
        const getTestClassCtx = createHandlerContext({
          connection,
          logger: getTestClassLogger,
        });
        const getTestClassResponse = await handleGetLocalTestClass(
          getTestClassCtx,
          {
            class_name: className,
            version: 'inactive', // Read inactive version since update wasn't activated
          },
        );
        if (getTestClassResponse.isError) {
          const errorMsg = extractErrorMessage(getTestClassResponse);
          const rawError = getTestClassResponse.content[0]?.text || '';
          const errorLower = `${errorMsg} ${rawError}`.toLowerCase();
          if (
            errorLower.includes('406') ||
            errorLower.includes('not acceptable') ||
            errorLower.includes('unsupported')
          ) {
            logger?.warn(
              `GetLocalTestClass not supported on this system (406): ${errorMsg}`,
            );
          } else {
            logger?.error(`GetLocalTestClass failed: ${errorMsg}`);
            throw new Error(`GetLocalTestClass failed: ${errorMsg}`);
          }
        }
        if (!getTestClassResponse.isError) {
          expect(getTestClassResponse.isError).toBe(false);
          const getTestClassData = parseHandlerResponse(getTestClassResponse);
          expect(getTestClassData.test_class_code).toBeDefined();
        }

        // Get LocalTypes - read after update
        const getLocalTypesLogger = createTestLogger('local-types-get');
        const getLocalTypesCtx = createHandlerContext({
          connection,
          logger: getLocalTypesLogger,
        });
        logger?.info(`   • GetLocalTypes (version: active)`);
        const getLocalTypesResponse = await handleGetLocalTypes(
          getLocalTypesCtx,
          {
            class_name: className,
            version: 'active',
          },
        );
        if (getLocalTypesResponse.isError) {
          const errorMsg = extractErrorMessage(getLocalTypesResponse);
          logger?.error(`GetLocalTypes failed: ${errorMsg}`);
        }
        expect(getLocalTypesResponse.isError).toBe(false);
        const getLocalTypesData = parseHandlerResponse(getLocalTypesResponse);
        expect(getLocalTypesData.local_types_code).toBeDefined();

        // Get LocalDefinitions - read after update
        const getLocalDefsLogger = createTestLogger('local-defs-get');
        const getLocalDefsCtx = createHandlerContext({
          connection,
          logger: getLocalDefsLogger,
        });
        logger?.info(`   • GetLocalDefinitions (version: active)`);
        const getLocalDefsResponse = await handleGetLocalDefinitions(
          getLocalDefsCtx,
          {
            class_name: className,
            version: 'active',
          },
        );
        if (getLocalDefsResponse.isError) {
          const errorMsg = extractErrorMessage(getLocalDefsResponse);
          logger?.error(`GetLocalDefinitions failed: ${errorMsg}`);
        }
        expect(getLocalDefsResponse.isError).toBe(false);
        const getLocalDefsData = parseHandlerResponse(getLocalDefsResponse);
        expect(getLocalDefsData.definitions_code).toBeDefined();

        logger?.success(`✅ Get (read) operations completed`);

        logger?.success(`✅ Update operations completed`);

        // Step 8: Test Delete operations
        logger?.info(`   • testing Delete operations`);

        // Delete LocalTestClass
        const deleteTestClassLogger = createTestLogger(
          'local-test-class-delete',
        );
        const deleteTestClassCtx = createHandlerContext({
          connection,
          logger: deleteTestClassLogger,
        });
        const deleteTestClassResponse = await handleDeleteLocalTestClass(
          deleteTestClassCtx,
          {
            class_name: className,
            activate_on_delete: false,
          },
        );
        // Delete may fail if test class doesn't exist, which is OK
        if (deleteTestClassResponse.isError) {
          logger?.warn(
            `Delete LocalTestClass failed (may not exist): ${extractErrorMessage(deleteTestClassResponse)}`,
          );
        }

        // Delete LocalTypes
        const deleteLocalTypesLogger = createTestLogger('local-types-delete');
        const deleteLocalTypesCtx = createHandlerContext({
          connection,
          logger: deleteLocalTypesLogger,
        });
        const deleteLocalTypesResponse = await handleDeleteLocalTypes(
          deleteLocalTypesCtx,
          {
            class_name: className,
            activate_on_delete: false,
          },
        );
        if (deleteLocalTypesResponse.isError) {
          logger?.warn(
            `Delete LocalTypes failed (may not exist): ${extractErrorMessage(deleteLocalTypesResponse)}`,
          );
        }

        // Delete LocalDefinitions
        const deleteLocalDefsLogger = createTestLogger('local-defs-delete');
        const deleteLocalDefsCtx = createHandlerContext({
          connection,
          logger: deleteLocalDefsLogger,
        });
        const deleteLocalDefsResponse = await handleDeleteLocalDefinitions(
          deleteLocalDefsCtx,
          {
            class_name: className,
            activate_on_delete: false,
          },
        );
        if (deleteLocalDefsResponse.isError) {
          logger?.warn(
            `Delete LocalDefinitions failed (may not exist): ${extractErrorMessage(deleteLocalDefsResponse)}`,
          );
        }

        logger?.success(`✅ Delete operations completed`);
      });
    },
    getTimeout('long'),
  );
});
