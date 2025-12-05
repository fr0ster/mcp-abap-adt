/**
 * Integration tests for Table High-Level Handlers
 *
 * Tests all high-level handlers for Table module:
 * - CreateTable (high-level) - handles validate, create, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/table
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateTable } from '../../../handlers/table/high/handleCreateTable';
import { handleDeleteTable } from '../../../handlers/table/low/handleDeleteTable';

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


describe('Table High-Level Handlers Integration', () => {
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

  it('should test all Table high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_table', 'builder_table');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const tableName = testCase.params.table_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const ddlCode = testCase.params.ddl_code || `@EndUserText.label: 'Test table'
@AbapCatalog.tableCategory: #TRANSPARENT
define table ${tableName.toLowerCase()} {
  key client : abap.clnt not null;
  key id : abap.char(10) not null;
  name : abap.char(255);
}`;

    try {
      // Step 1: Test CreateTable (High-Level)
      debugLog('CREATE', `Starting high-level table creation for ${tableName}`, {
        session_id: session.session_id,
        package_name: packageName
      });

      let createResponse;
      try {
        createResponse = await handleCreateTable({
          table_name: tableName,
          ddl_code: ddlCode,
          package_name: packageName,
          transport_request: transportRequest
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If table already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Table ${tableName} already exists, skipping test`);
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
      expect(createData.table_name).toBe(tableName);

      debugLog('CREATE', 'High-level table creation completed successfully', {
        table_name: createData.table_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level table creation completed successfully for ${tableName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Optionally delete test table
      if (session && tableName) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Delete only if cleanup_after is true
          if (shouldCleanup) {
            const deleteResponse = await handleDeleteTable({
              table_name: tableName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              console.log(`🧹 Cleaned up test table: ${tableName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              console.warn(`⚠️  Failed to delete table ${tableName}: ${errorMsg}`);
            }
          } else {
            console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${tableName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test table ${tableName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

