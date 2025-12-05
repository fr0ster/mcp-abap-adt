/**
 * Integration tests for MetadataExtension Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateMetadataExtensionLow → CreateMetadataExtensionLow → LockMetadataExtensionLow →
 * UpdateMetadataExtensionLow → UnlockMetadataExtensionLow → ActivateMetadataExtensionLow → DeleteMetadataExtensionLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/metadataExtension
 */

import { handleValidateMetadataExtension } from '../../../handlers/ddlx/low/handleValidateMetadataExtension';
import { handleCreateMetadataExtension } from '../../../handlers/ddlx/low/handleCreateMetadataExtension';
import { handleLockMetadataExtension } from '../../../handlers/ddlx/low/handleLockMetadataExtension';
import { handleUpdateMetadataExtension } from '../../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { handleUnlockMetadataExtension } from '../../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { handleActivateMetadataExtension } from '../../../handlers/ddlx/low/handleActivateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../../handlers/ddlx/low/handleDeleteMetadataExtension';

import {
  parseHandlerResponse,
  extractLockHandle,
  delay,
  debugLog,
  logTestStep
} from '../helpers/testHelpers';
import {
  getTestSession,
  updateSessionFromResponse,
  extractLockSession,
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

describe('MetadataExtension Low-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testDdlxName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_metadata_extension_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testDdlxName = testCase.params.name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testDdlxName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestDdlxName: !!testDdlxName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const ddlxName = testDdlxName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test metadata extension for low-level handler`;


      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;
      let objectWasCreated = false; // Track if object was actually created

      try {
        // Step 1: Validate
        console.log(`🔍 Step 1: Validating ${ddlxName}...`);
        const validateResponse = await handleValidateMetadataExtension({
        name: ddlxName,
        description: description,
        package_name: packageName,
        session_id: session.session_id,
        session_state: session.session_state
      });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          console.log(`⏭️  Validation error for ${ddlxName}: ${errorMsg}, skipping test`);
          return;
        }

        const validateData = parseHandlerResponse(validateResponse);
        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || '';
          console.log(`⏭️  Validation failed for ${ddlxName}: ${message}, skipping test`);
          return;
        }

        session = updateSessionFromResponse(session, validateData);
        console.log(`✅ Step 1: Validation successful for ${ddlxName}`);

        // Step 2: Create
        console.log(`📦 Step 2: Creating ${ddlxName}...`);
        const createResponse = await handleCreateMetadataExtension({
          name: ddlxName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  MetadataExtension ${ddlxName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.name).toBe(ddlxName);
        objectWasCreated = true;
        console.log(`✅ Step 2: Created ${ddlxName} successfully`);

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        console.log(`🔒 Step 3: Locking ${ddlxName}...`);
        const lockResponse = await handleLockMetadataExtension({
          name: ddlxName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          throw new Error(`Lock failed: ${lockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        const lockSession = extractLockSession(lockData);

        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();

        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;
        console.log(`✅ Step 3: Locked ${ddlxName} successfully`);

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        console.log(`📝 Step 4: Updating ${ddlxName}...`);
        const sourceCode = testCase.params.source_code || `@Metadata.layer: #CORE
annotate view ${testCase.params.view_name || 'ZI_VIEW'} with {
  @EndUserText.label: '${description}'
}`;

        const updateResponse = await handleUpdateMetadataExtension({
          name: ddlxName,
          source_code: sourceCode,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (updateResponse.isError) {
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.session_id).toBe(lockSession.session_id);
        console.log(`✅ Step 4: Updated ${ddlxName} successfully`);

        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        console.log(`🔓 Step 5: Unlocking ${ddlxName}...`);
        const unlockResponse = await handleUnlockMetadataExtension({
          name: ddlxName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (unlockResponse.isError) {
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);
        console.log(`✅ Step 5: Unlocked ${ddlxName} successfully`);

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        console.log(`⚡ Step 6: Activating ${ddlxName}...`);
        const activateResponse = await handleActivateMetadataExtension({
          name: ddlxName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);
        console.log(`✅ Step 6: Activated ${ddlxName} successfully`);

        console.log(`✅ Full workflow completed successfully for ${ddlxName}`);

      } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: only if object was actually created in this test run
        if (!objectWasCreated) {
          return;
        }
        // Only proceed with cleanup if object was successfully created
        if (session && ddlxName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockMetadataExtension({
                  name: ddlxName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                // Ignore unlock errors during cleanup
              }
            }
            await delay(1000);
            const deleteResponse = await handleDeleteMetadataExtension({
              name: ddlxName,
              transport_request: transportRequest
            });
            if (!deleteResponse.isError) {
              console.log(`🧹 Cleaned up test metadata extension: ${ddlxName}`);
            } else {
              // Check if object doesn't exist (404) - that's okay, it may have been deleted already
              const errorMsg = deleteResponse.content[0]?.text || '';
              if (errorMsg.includes('not found') || errorMsg.includes('already be deleted')) {
                // Object doesn't exist - that's fine, no need to log error
              } else {
                // Other error - log but don't fail test
                console.warn(`⚠️  Failed to delete metadata extension ${ddlxName}: ${errorMsg}`);
              }
            }
          } catch (cleanupError: any) {
            // Ignore cleanup errors - object may not exist or may have been deleted already
          }
        }
      }
    }, getTimeout('long'));
  });
});
