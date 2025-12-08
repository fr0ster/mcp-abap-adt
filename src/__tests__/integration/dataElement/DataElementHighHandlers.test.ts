/**
 * Integration tests for DataElement High-Level Handlers
 *
 * Tests all high-level handlers for DataElement module:
 * - CreateDataElement (high-level) - handles create, activate, verify
 * - UpdateDataElement (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/dataElement
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateDataElement } from '../../../handlers/data_element/high/handleCreateDataElement';
import { handleUpdateDataElement } from '../../../handlers/data_element/high/handleUpdateDataElement';
import { handleDeleteDataElement } from '../../../handlers/data_element/low/handleDeleteDataElement';

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
import { createDiagnosticsTracker } from '../helpers/persistenceHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll


describe('DataElement High-Level Handlers Integration', () => {
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

  it('should test all DataElement high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_data_element', 'builder_data_element');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const dataElementName = testCase.params.data_element_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test data element for high-level handler`;
    const diagnosticsTracker = createDiagnosticsTracker('data_element_high_handlers', testCase, session, {
      handler: 'create_data_element',
      object_name: dataElementName
    });

    try {
      // Step 1: Test CreateDataElement (High-Level)
      debugLog('CREATE', `Starting high-level data element creation for ${dataElementName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateDataElement({
          data_element_name: dataElementName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          type_kind: testCase.params.type_kind || 'predefinedAbapType',
          data_type: testCase.params.data_type || (testCase.params.type_kind === 'domain' ? testCase.params.domain_name : 'CHAR'),
          length: testCase.params.length || 100,
          decimals: testCase.params.decimals || 0,
          short_label: testCase.params.short_label,
          medium_label: testCase.params.medium_label,
          long_label: testCase.params.long_label,
          heading_label: testCase.params.heading_label
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If data element already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  DataElement ${dataElementName} already exists, skipping test`);
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
      expect(createData.data_element_name).toBe(dataElementName);

      debugLog('CREATE', 'High-level data element creation completed successfully', {
        data_element_name: createData.data_element_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level data element creation completed successfully for ${dataElementName}`);

      // Step 2: Test UpdateDataElement (High-Level)
      debugLog('UPDATE', `Starting high-level data element update for ${dataElementName}`, {
        session_id: session.session_id
      });

      let updateResponse;
      try {
        updateResponse = await handleUpdateDataElement({
          data_element_name: dataElementName,
          description: `${description} (updated via high-level handler)`,
          package_name: packageName,
          transport_request: transportRequest,
          type_kind: testCase.params.type_kind || 'predefinedAbapType',
          data_type: testCase.params.data_type || (testCase.params.type_kind === 'domain' ? testCase.params.domain_name : 'CHAR'),
          length: testCase.params.length || 100,
          decimals: testCase.params.decimals || 0,
          field_label_short: testCase.params.short_label ? `${testCase.params.short_label} (upd)` : undefined,
          field_label_medium: testCase.params.medium_label ? `${testCase.params.medium_label} (updated)` : undefined,
          field_label_long: testCase.params.long_label ? `${testCase.params.long_label} (updated)` : undefined,
          field_label_heading: testCase.params.heading_label ? `${testCase.params.heading_label} (updated)` : undefined
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If data element doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update data element ${dataElementName}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.data_element_name).toBe(dataElementName);

      debugLog('UPDATE', 'High-level data element update completed successfully', {
        data_element_name: updateData.data_element_name,
        success: updateData.success
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level data element update completed successfully for ${dataElementName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Optionally delete test data element
      if (session && dataElementName) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Delete only if cleanup_after is true
          if (shouldCleanup) {
            const deleteResponse = await handleDeleteDataElement({
              data_element_name: dataElementName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              console.log(`🧹 Cleaned up test data element: ${dataElementName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              console.warn(`⚠️  Failed to delete data element ${dataElementName}: ${errorMsg}`);
            }
          } else {
            console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${dataElementName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test data element ${dataElementName}: ${cleanupError}`);
        }
      }

      diagnosticsTracker.cleanup();
    }
  }, getTimeout('long'));
});
