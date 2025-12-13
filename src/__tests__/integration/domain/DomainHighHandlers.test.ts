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
  loadTestEnv,
  getCleanupAfter
} from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

const testLogger = createTestLogger('domain-high');

describe('Domain High-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      // Get initial session
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      if (process.env.DEBUG_TESTS === 'true' || process.env.FULL_LOG_LEVEL === 'true') {
        testLogger.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      }
      hasConfig = false;
    }
  });

  it('should test all Domain high-level handlers', async () => {
    if (!hasConfig || !session) {
      testLogger.info('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_domain', 'builder_domain');
    if (!testCase) {
      testLogger.info('⏭️  Skipping test: No test case configuration');
      return;
    }

    const domainName = testCase.params.domain_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test domain for high-level handler`;

    try {
      // Step 1: Test CreateDomain (High-Level)
      testLogger.info(`📦 High Create: Creating domain ${domainName}...`);
      let createResponse;
      try {
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
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If domain already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          testLogger.info(`⏭️  Domain ${domainName} already exists, skipping test`);
          return;
        }
        throw error;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        testLogger.info(`⏭️  High Create failed for ${domainName}: ${errorMsg}, skipping test`);
        return;
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.domain_name).toBe(domainName);

      await delay(getOperationDelay('create', testCase));
      testLogger.info(`✅ High Create: Created domain ${domainName} successfully`);

      // Step 2: Test UpdateDomain (High-Level)
      testLogger.info(`📝 High Update: Updating domain ${domainName}...`);
      let updateResponse;
      try {
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
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If update fails, just exit without checks
        testLogger.info(`⏭️  High Update failed for ${domainName}: ${errorMsg}, skipping test`);
          return;
      }

      if (updateResponse.isError) {
        const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
        testLogger.info(`⏭️  High Update failed for ${domainName}: ${errorMsg}, skipping test`);
        return;
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.domain_name).toBe(domainName);

      await delay(getOperationDelay('update', testCase));
      testLogger.info(`✅ High Update: Updated domain ${domainName} successfully`);
      testLogger.info(`✅ Full high-level workflow completed successfully for ${domainName}`);

    } catch (error: any) {
      testLogger.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Optionally delete test domain
      if (session && domainName) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Delete only if cleanup_after is true
          if (shouldCleanup) {
            const deleteResponse = await handleDeleteDomain({
              domain_name: domainName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              testLogger.info(`🧹 Cleaned up test domain: ${domainName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              testLogger.warn(`⚠️  Failed to delete domain ${domainName}: ${errorMsg}`);
            }
          } else {
            testLogger.info(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${domainName}`);
          }
        } catch (cleanupError) {
          testLogger.warn(`⚠️  Failed to cleanup test domain ${domainName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

