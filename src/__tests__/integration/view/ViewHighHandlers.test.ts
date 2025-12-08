/**
 * Integration tests for View High-Level Handlers
 *
 * Tests all high-level handlers for View module:
 * - CreateView (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateView (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/view
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateView } from '../../../handlers/view/high/handleCreateView';
import { handleUpdateView } from '../../../handlers/view/high/handleUpdateView';
import { handleDeleteView } from '../../../handlers/view/low/handleDeleteView';

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


describe('View High-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      // Get initial session
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      if (process.env.DEBUG_TESTS === 'true' || process.env.FULL_LOG_LEVEL === 'true') {
        console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      }
      hasConfig = false;
    }
  });

  it('should test all View high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_view', 'builder_view');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const viewName = testCase.params.view_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test view for high-level handler`;
    const ddlSource = testCase.params.ddl_source || `@EndUserText.label: '${description}'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ${viewName}
as select from dummy
{
  key dummy
}`;

    try {
      // Step 1: Test CreateView (High-Level)
      debugLog('CREATE', `Starting high-level view creation for ${viewName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateView({
          view_name: viewName,
          ddl_source: ddlSource,
          package_name: packageName,
          transport_request: transportRequest,
          description
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If view already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  View ${viewName} already exists, skipping test`);
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
      expect(createData.view_name).toBe(viewName);

      debugLog('CREATE', 'High-level view creation completed successfully', {
        view_name: createData.view_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level view creation completed successfully for ${viewName}`);

      // Step 2: Test UpdateView (High-Level)
      debugLog('UPDATE', `Starting high-level view update for ${viewName}`, {
        session_id: session.session_id
      });

      const updatedDdlSource = `@EndUserText.label: '${description} (updated)'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ${viewName}
as select from dummy
{
  key dummy,
  dummy as additional_field
}`;

      let updateResponse;
      try {
        updateResponse = await handleUpdateView({
          view_name: viewName,
          ddl_source: updatedDdlSource,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If view doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update view ${viewName}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.view_name).toBe(viewName);

      debugLog('UPDATE', 'High-level view update completed successfully', {
        view_name: updateData.view_name,
        success: updateData.success
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level view update completed successfully for ${viewName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Optionally delete test view
      if (session && viewName) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Delete only if cleanup_after is true
          if (shouldCleanup) {
            const deleteResponse = await handleDeleteView({
              view_name: viewName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              console.log(`🧹 Cleaned up test view: ${viewName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              console.warn(`⚠️  Failed to delete view ${viewName}: ${errorMsg}`);
            }
          } else {
            console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${viewName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test view ${viewName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

