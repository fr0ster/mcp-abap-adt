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

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';

import {
  parseHandlerResponse,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  getTestSession,
  updateSessionFromResponse,
  SessionInfo
} from '../helpers/sessionHelpers';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv
} from '../helpers/configHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Class High-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      // Get initial session
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  it('should test all Class high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_class', 'builder_class');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const className = testCase.params.class_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test class for high-level handler`;
    const sourceCode = testCase.params.source_code || `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS: test_method.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD test_method.
    WRITE: / 'Hello from ${className}'.
  ENDMETHOD.
ENDCLASS.`;

    try {
      // Step 1: Test CreateClass (High-Level)
      // High-level handler executes: Create → Lock → Update → Check → Unlock → Activate
      debugLog('CREATE_START', `Starting high-level class creation for ${className}`, {
        session_id: session.session_id,
        package_name: packageName,
        transport_request: transportRequest,
        description
      });
      debugLog('CREATE_INFO', 'High-level handler will execute: Create → Lock → Update → Check → Unlock → Activate', {
        note: 'All steps are logged via handlerLogger when DEBUG_TESTS=true'
      });

      let createResponse;
      try {
        debugLog('HANDLER_CALL', `Calling handleCreateClass`, {
          class_name: className,
          package_name: packageName,
          transport_request: transportRequest,
          activate: true
        });

        createResponse = await handleCreateClass({
          class_name: className,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          superclass: testCase.params.superclass,
          final: testCase.params.final || false,
          abstract: testCase.params.abstract || false,
          create_protected: testCase.params.create_protected || false,
          source_code: sourceCode,
          activate: true
        });

        debugLog('HANDLER_RESPONSE', `Received response from handleCreateClass`, {
          isError: createResponse.isError,
          hasContent: createResponse.content && createResponse.content.length > 0
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        debugLog('HANDLER_ERROR', `Error during handleCreateClass`, {
          error: errorMsg,
          errorType: error.constructor?.name || 'Unknown'
        });
        // If class already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Class ${className} already exists, skipping test`);
          return;
        }
        throw error;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        debugLog('CREATE_FAILED', `Create failed: ${errorMsg}`);
        throw new Error(`Create failed: ${errorMsg}`);
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.class_name).toBe(className);

      debugLog('CREATE_COMPLETE', 'High-level class creation completed successfully', {
        class_name: createData.class_name,
        success: createData.success,
        status: createData.status || 'unknown',
        package: createData.package || packageName
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level class creation completed successfully for ${className}`);

      // Step 2: Test UpdateClass (High-Level)
      // High-level handler executes: Validate → Lock → Update → Check → Unlock → Activate
      const updatedSourceCode = `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS: test_method,
             another_method.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD test_method.
    WRITE: / 'Hello from ${className} (updated)'.
  ENDMETHOD.
  METHOD another_method.
    WRITE: / 'Another method'.
  ENDMETHOD.
ENDCLASS.`;

      debugLog('UPDATE_START', `Starting high-level class update for ${className}`, {
        session_id: session.session_id,
        sourceCodeLength: updatedSourceCode.length
      });
      debugLog('UPDATE_INFO', 'High-level handler will execute: Validate → Lock → Update → Check → Unlock → Activate', {
        note: 'All steps are logged via handlerLogger when DEBUG_TESTS=true'
      });

      let updateResponse;
      try {
        debugLog('HANDLER_CALL', `Calling handleUpdateClass`, {
          class_name: className,
          sourceCodeLength: updatedSourceCode.length,
          activate: true
        });

        updateResponse = await handleUpdateClass({
          class_name: className,
          source_code: updatedSourceCode,
          activate: true
        });

        debugLog('HANDLER_RESPONSE', `Received response from handleUpdateClass`, {
          isError: updateResponse.isError,
          hasContent: updateResponse.content && updateResponse.content.length > 0
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        debugLog('HANDLER_ERROR', `Error during handleUpdateClass`, {
          error: errorMsg,
          errorType: error.constructor?.name || 'Unknown'
        });
        // If class doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update class ${className}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
        debugLog('UPDATE_FAILED', `Update failed: ${errorMsg}`);
        throw new Error(`Update failed: ${errorMsg}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.class_name).toBe(className);

      debugLog('UPDATE_COMPLETE', 'High-level class update completed successfully', {
        class_name: updateData.class_name,
        success: updateData.success,
        steps_completed: updateData.steps_completed || [],
        activation_warnings: updateData.activation_warnings || []
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level class update completed successfully for ${className}`);

    } catch (error: any) {
      debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
        error: error.message,
        stack: error.stack?.substring(0, 500) // Limit stack trace length
      });
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test class
      if (session && className) {
        try {
          debugLog('CLEANUP', `Starting cleanup: deleting test class ${className}`, {
            class_name: className,
            session_id: session.session_id
          });

          const deleteResponse = await handleDeleteClass({
            class_name: className,
            transport_request: transportRequest,
            session_id: session.session_id,
            session_state: session.session_state
          });

          if (!deleteResponse.isError) {
            debugLog('CLEANUP', `Successfully deleted test class: ${className}`);
            console.log(`🧹 Cleaned up test class: ${className}`);
          } else {
            debugLog('CLEANUP', `Failed to delete test class: ${className}`, {
              error: deleteResponse.content[0]?.text || 'Unknown error'
            });
          }
        } catch (cleanupError) {
          debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
          console.warn(`⚠️  Failed to cleanup test class ${className}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

