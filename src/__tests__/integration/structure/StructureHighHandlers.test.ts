/**
 * Integration tests for Structure High-Level Handlers
 *
 * Tests all high-level handlers for Structure module:
 * - CreateStructure (high-level) - handles validate, create, lock, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/structure
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateStructure } from '../../../handlers/structure/high/handleCreateStructure';
import { handleDeleteStructure } from '../../../handlers/structure/low/handleDeleteStructure';

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

// Load environment variables
// loadTestEnv will be called in beforeAll


describe('Structure High-Level Handlers Integration', () => {
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

  it('should test all Structure high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_structure', 'builder_structure');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const structureName = testCase.params.structure_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test structure for high-level handler`;
    const fields = testCase.params.fields || [
      { name: 'FIELD1', description: 'First field', data_type: 'CHAR', length: 10 },
      { name: 'FIELD2', description: 'Second field', data_type: 'CHAR', length: 20 }
    ];

    try {
      // Step 1: Test CreateStructure (High-Level)
      debugLog('CREATE', `Starting high-level structure creation for ${structureName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateStructure({
          structure_name: structureName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          fields
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If structure already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Structure ${structureName} already exists, skipping test`);
          return;
        }
        throw error;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        throw new Error(`Create failed: ${errorMsg}`);
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.structure_name).toBe(structureName);

      debugLog('CREATE', 'High-level structure creation completed successfully', {
        structure_name: createData.structure_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level structure creation completed successfully for ${structureName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Optionally delete test structure
      if (session && structureName) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Delete only if cleanup_after is true
          if (shouldCleanup) {
            const deleteResponse = await handleDeleteStructure({
              structure_name: structureName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              console.log(`🧹 Cleaned up test structure: ${structureName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              console.warn(`⚠️  Failed to delete structure ${structureName}: ${errorMsg}`);
            }
          } else {
            console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${structureName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test structure ${structureName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

