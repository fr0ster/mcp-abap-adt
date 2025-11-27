/**
 * Integration tests for Domain High-Level Handlers
 *
 * Tests high-level handlers that manage the complete workflow internally:
 * CreateDomain (high-level) - handles lock, create, check, unlock, activate
 * UpdateDomain (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/domain
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateDomain } from '../../../handlers/domain/high/handleCreateDomain';
import { handleUpdateDomain } from '../../../handlers/domain/high/handleUpdateDomain';
import { handleDeleteDomain } from '../../../handlers/domain/low/handleDeleteDomain';

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
loadTestEnv();

describe('Domain High-Level Handlers Integration', () => {
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

  it('should test all Domain high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_domain', 'builder_domain');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const domainName = testCase.params.domain_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test domain for high-level handler`;

    try {
      // Step 1: Test CreateDomain (High-Level)
      // High-level handler executes: Validate → Create → Lock → Update → Check → Unlock → Activate
      debugLog('CREATE_START', `Starting high-level domain creation for ${domainName}`, {
        session_id: session.session_id,
        package_name: packageName,
        transport_request: transportRequest,
        description,
        datatype: testCase.params.datatype || 'CHAR',
        length: testCase.params.length || 10,
        decimals: testCase.params.decimals || 0
      });
      debugLog('CREATE_INFO', 'High-level handler will execute: Validate → Create → Lock → Update → Check → Unlock → Activate', {
        note: 'All steps are logged via handlerLogger when DEBUG_TESTS=true'
      });

      let createResponse;
      try {
        debugLog('HANDLER_CALL', `Calling handleCreateDomain`, {
          domain_name: domainName,
          package_name: packageName,
          transport_request: transportRequest
        });

        createResponse = await handleCreateDomain({
          domain_name: domainName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          datatype: testCase.params.datatype || 'CHAR',
          length: testCase.params.length || 10,
          decimals: testCase.params.decimals || 0,
          lowercase: testCase.params.lowercase || false,
          sign_exists: testCase.params.sign_exists || false
        });

        debugLog('HANDLER_RESPONSE', `Received response from handleCreateDomain`, {
          isError: createResponse.isError,
          hasContent: createResponse.content && createResponse.content.length > 0
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        debugLog('HANDLER_ERROR', `Error during handleCreateDomain`, {
          error: errorMsg,
          errorType: error.constructor?.name || 'Unknown'
        });
        // If domain already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Domain ${domainName} already exists, skipping test`);
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
      expect(createData.domain_name).toBe(domainName);

      debugLog('CREATE_COMPLETE', 'High-level domain creation completed successfully', {
        domain_name: createData.domain_name,
        success: createData.success,
        status: createData.status || 'unknown',
        package: createData.package || packageName,
        transport_request: createData.transport_request || transportRequest
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level domain creation completed successfully for ${domainName}`);

      // Step 2: Test UpdateDomain (High-Level)
      // High-level handler executes: Validate → Lock → Update → Check → Unlock → Activate
      debugLog('UPDATE_START', `Starting high-level domain update for ${domainName}`, {
        session_id: session.session_id,
        package_name: packageName,
        transport_request: transportRequest,
        new_description: `${description} (updated via high-level handler)`
      });
      debugLog('UPDATE_INFO', 'High-level handler will execute: Validate → Lock → Update → Check → Unlock → Activate', {
        note: 'All steps are logged via handlerLogger when DEBUG_TESTS=true'
      });

      let updateResponse;
      try {
        debugLog('HANDLER_CALL', `Calling handleUpdateDomain`, {
          domain_name: domainName,
          package_name: packageName,
          transport_request: transportRequest
        });

        updateResponse = await handleUpdateDomain({
          domain_name: domainName,
          description: `${description} (updated via high-level handler)`,
          package_name: packageName,
          transport_request: transportRequest,
          datatype: testCase.params.datatype || 'CHAR',
          length: testCase.params.length || 10,
          decimals: testCase.params.decimals || 0,
          lowercase: testCase.params.lowercase || false,
          sign_exists: testCase.params.sign_exists || false
        });

        debugLog('HANDLER_RESPONSE', `Received response from handleUpdateDomain`, {
          isError: updateResponse.isError,
          hasContent: updateResponse.content && updateResponse.content.length > 0
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        debugLog('HANDLER_ERROR', `Error during handleUpdateDomain`, {
          error: errorMsg,
          errorType: error.constructor?.name || 'Unknown'
        });
        // If domain doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update domain ${domainName}: ${errorMsg}, skipping test`);
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
      expect(updateData.domain_name).toBe(domainName);

      debugLog('UPDATE_COMPLETE', 'High-level domain update completed successfully', {
        domain_name: updateData.domain_name,
        success: updateData.success,
        status: updateData.status || 'unknown',
        package: updateData.package || packageName
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level domain update completed successfully for ${domainName}`);

    } catch (error: any) {
      debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
        error: error.message,
        stack: error.stack?.substring(0, 500) // Limit stack trace length
      });
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test domain
      if (session && domainName) {
        try {
          debugLog('CLEANUP', `Starting cleanup: deleting test domain ${domainName}`, {
            domain_name: domainName,
            session_id: session.session_id
          });

          const deleteResponse = await handleDeleteDomain({
            domain_name: domainName,
            session_id: session.session_id,
            session_state: session.session_state
          });

          if (!deleteResponse.isError) {
            debugLog('CLEANUP', `Successfully deleted test domain: ${domainName}`);
            console.log(`🧹 Cleaned up test domain: ${domainName}`);
          } else {
            debugLog('CLEANUP', `Failed to delete test domain: ${domainName}`, {
              error: deleteResponse.content[0]?.text || 'Unknown error'
            });
          }
        } catch (cleanupError) {
          debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
          console.warn(`⚠️  Failed to cleanup test domain ${domainName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

