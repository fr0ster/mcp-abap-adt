/**
 * Integration tests for MetadataExtension High-Level Handlers
 *
 * Tests all high-level handlers for MetadataExtension module:
 * - CreateMetadataExtension (high-level) - handles create, lock, check, unlock, activate
 * - UpdateMetadataExtension (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/metadataExtension
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateMetadataExtension } from '../../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../../handlers/ddlx/low/handleDeleteMetadataExtension';

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


describe('MetadataExtension High-Level Handlers Integration', () => {
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

  it('should test all MetadataExtension high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration - use low-level test case as template
    const testCase = getEnabledTestCase('create_metadata_extension_low', 'full_workflow');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const ddlxName = testCase.params.name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test metadata extension for high-level handler`;
    const sourceCode = testCase.params.source_code || `@Metadata.layer: #CORE
annotate view ZI_TEST_ENTITY with {
  @EndUserText.label: '${description}'
}`;

    try {
      // Step 1: Test CreateMetadataExtension (High-Level)
      debugLog('CREATE', `Starting high-level metadata extension creation for ${ddlxName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateMetadataExtension({
          name: ddlxName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If metadata extension already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  MetadataExtension ${ddlxName} already exists, skipping test`);
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
      expect(createData.name).toBe(ddlxName);

      debugLog('CREATE', 'High-level metadata extension creation completed successfully', {
        name: createData.name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level metadata extension creation completed successfully for ${ddlxName}`);

      // Step 2: Test UpdateMetadataExtension (High-Level)
      debugLog('UPDATE', `Starting high-level metadata extension update for ${ddlxName}`, {
        session_id: session.session_id
      });

      const updatedSourceCode = `@Metadata.layer: #CORE
annotate view ZI_TEST_ENTITY with {
  @EndUserText.label: '${description} (updated)'
  @UI.hidden: true
  field1;
}`;

      let updateResponse;
      try {
        updateResponse = await handleUpdateMetadataExtension({
          name: ddlxName,
          source_code: updatedSourceCode,
          transport_request: transportRequest,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If metadata extension doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update metadata extension ${ddlxName}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.name).toBe(ddlxName);

      debugLog('UPDATE', 'High-level metadata extension update completed successfully', {
        name: updateData.name,
        success: updateData.success
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level metadata extension update completed successfully for ${ddlxName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test metadata extension
      if (session && ddlxName) {
        try {
          const deleteResponse = await handleDeleteMetadataExtension({
            name: ddlxName,
            transport_request: transportRequest
          });

          if (!deleteResponse.isError) {
            console.log(`🧹 Cleaned up test metadata extension: ${ddlxName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test metadata extension ${ddlxName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

