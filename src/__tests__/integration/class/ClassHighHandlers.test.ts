/**
 * Integration tests for Class High-Level Handlers
 *
 * Tests all high-level handlers for Class module:
 * - CreateClass (high-level) - handles create, lock, update, check, unlock, activate
 * - UpdateClass (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/class
 */

import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';

import { LambdaTester } from '../helpers/testers/LambdaTester';
import { getTimeout } from '../helpers/configHelpers';
import type { LambdaTesterContext } from '../helpers/testers/types';
import { parseHandlerResponse, extractErrorMessage, createHandlerContext } from '../helpers/testHelpers';
import { updateSessionFromResponse } from '../helpers/sessionHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';

describe('Class High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('class-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_class',
      'builder_class',
      'class-high',
      'builder_class'
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        // Basic setup - connection is already created in tester
      },
      // Cleanup lambda - will be called by tester after checking YAML params
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;

        logger?.info(`   • cleanup: delete ${objectName}`);
        try {
          const deleteLogger = createTestLogger('class-high-delete');
          const deleteCtx = createHandlerContext({ connection, logger: deleteLogger });
          const deleteResponse = await handleDeleteClass(deleteCtx, {
            class_name: objectName,
            ...(transportRequest && { transport_request: transportRequest })
          });
          if (deleteResponse.isError) {
            const errorMsg = extractErrorMessage(deleteResponse);
            logger?.warn(`Delete failed (ignored in cleanup): ${errorMsg}`);
          } else {
            logger?.success(`✅ cleanup: deleted ${objectName} successfully`);
          }
        } catch (error: any) {
          logger?.warn(`Cleanup delete error (ignored): ${error.message || String(error)}`);
        }
      }
    );
  }, getTimeout('long'));

  afterEach(async () => {
    // cleanupAfter is automatically called by tester.afterEach()
    // It checks YAML params and calls cleanup lambda if needed
    await tester.afterEach();
  });

  it('should test all Class high-level handlers', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, session, objectName, params, packageName, transportRequest } = context;

      expect(objectName).toBeDefined();
      expect(objectName).not.toBe('');

      // Step 1: Create
      logger?.info(`   • create: ${objectName}`);
      const createLogger = createTestLogger('class-high-create');
      const createCtx = createHandlerContext({ connection, logger: createLogger });
      const sourceCode = params.source_code || '';
      const createResponse = await handleCreateClass(createCtx, {
        class_name: objectName,
        package_name: packageName,
        source_code: sourceCode,
        activate: true,
        ...(transportRequest && { transport_request: transportRequest }),
        ...(params.description && { description: params.description }),
        ...(params.superclass && { superclass: params.superclass })
      });

      expect(createResponse.isError).toBe(false);
      if (createResponse.isError) {
        const errorMsg = extractErrorMessage(createResponse);
        // Try to extract more detailed error information
        let detailedError = errorMsg;
        if (createResponse.content && createResponse.content.length > 0) {
          const firstContent = createResponse.content[0];
          if (firstContent.type === 'json') {
            detailedError = JSON.stringify(firstContent.text, null, 2);
            createLogger?.error(`Create error details: ${detailedError}`);
          } else if (firstContent.text) {
            detailedError = firstContent.text;
            createLogger?.error(`Create error: ${detailedError}`);
          }
        }
        // Log full response for debugging
        createLogger?.error(`Full error response: ${JSON.stringify(createResponse.content, null, 2)}`);
        fail(`Create failed: ${detailedError}`);
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.data).toBeDefined();

      // Check for errors from state.errors (warnings/errors that occurred during creation)
      if (createData.errors && Array.isArray(createData.errors) && createData.errors.length > 0) {
        logger?.warn(`⚠️ Create completed with ${createData.errors.length} error(s)/warning(s):`);
        createData.errors.forEach((err: any) => {
          logger?.warn(`  - [${err.method || 'unknown'}]: ${err.error || String(err)}`);
        });
        // Log errors but don't fail test - these are warnings from state.errors
        // They indicate non-critical issues (e.g., warnings during check)
      }

      logger?.success(`✅ create: ${objectName} completed successfully`);
      updateSessionFromResponse(session, createData);

      // Wait a bit after creation before update to ensure object is ready
      // Use delay from YAML config (operation_delays.create or default) via context
      const delay = context.getOperationDelay('create');
      logger?.info(`   • waiting ${delay}ms after creation before update...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Step 2: Update
      logger?.info(`   • update: ${objectName}`);
      const updateLogger = createTestLogger('class-high-update');
      const updateCtx = createHandlerContext({ connection, logger: updateLogger });
      let updatedSourceCode = params.update_source_code;
      if (!updatedSourceCode) {
        const originalSourceCode = params.source_code || '';
        updatedSourceCode = originalSourceCode.replace(
          /PUBLIC SECTION\./,
          'PUBLIC SECTION.\n    " Updated via MCP ABAP ADT test'
        );
        if (updatedSourceCode === originalSourceCode) {
          updatedSourceCode = originalSourceCode + '\n    " Updated via MCP ABAP ADT test';
        }
      }

      const updateResponse = await handleUpdateClass(updateCtx, {
        class_name: objectName!,
        source_code: updatedSourceCode,
        activate: true
      });

      expect(updateResponse.isError).toBe(false);
      if (updateResponse.isError) {
        const errorMsg = extractErrorMessage(updateResponse);
        // Try to extract more detailed error information
        let detailedError = errorMsg;
        if (updateResponse.content && updateResponse.content.length > 0) {
          const firstContent = updateResponse.content[0];
          if (firstContent.type === 'json') {
            detailedError = JSON.stringify(firstContent.text, null, 2);
            updateLogger?.error(`Update error details: ${detailedError}`);
          } else if (firstContent.text) {
            detailedError = firstContent.text;
            updateLogger?.error(`Update error: ${detailedError}`);
          }
        }
        fail(`Update failed: ${detailedError}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      // handleUpdateClass returns data at root level, not in data field
      expect(updateData.class_name).toBeDefined();

      // Check for errors from state.errors (warnings/errors that occurred during update)
      if (updateData.errors && Array.isArray(updateData.errors) && updateData.errors.length > 0) {
        logger?.warn(`⚠️ Update completed with ${updateData.errors.length} error(s)/warning(s):`);
        updateData.errors.forEach((err: any) => {
          logger?.warn(`  - [${err.method || 'unknown'}]: ${err.error || String(err)}`);
        });
        // Log errors but don't fail test - these are warnings from state.errors
      }

      logger?.success(`✅ update: ${objectName} completed successfully`);
    });
  }, getTimeout('long'));
});
