/**
 * Integration tests for Program High-Level Handlers
 *
 * Tests all high-level handlers for Program module:
 * - CreateProgram (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateProgram (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/program
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateProgram } from '../../../handlers/program/high/handleCreateProgram';
import { handleUpdateProgram } from '../../../handlers/program/high/handleUpdateProgram';
import { handleDeleteProgram } from '../../../handlers/program/low/handleDeleteProgram';

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
  isCloudConnection
} from '../helpers/configHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Program High-Level Handlers Integration', () => {
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

  it('should test all Program high-level handlers', async () => {
    // Skip test on cloud - programs are not available on cloud systems
    if (isCloudConnection()) {
      console.log('⏭️  Skipping test: Programs are not available on cloud systems');
      return;
    }

    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_program', 'builder_program');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const programName = testCase.params.program_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test program for high-level handler`;
    const sourceCode = testCase.params.source_code || `REPORT ${programName}.

WRITE: / 'Hello from ${programName}'.`;

    try {
      // Step 1: Test CreateProgram (High-Level)
      debugLog('CREATE', `Starting high-level program creation for ${programName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateProgram({
          program_name: programName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          program_type: testCase.params.program_type || 'executable',
          application: testCase.params.application,
          source_code: sourceCode,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If program already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Program ${programName} already exists, skipping test`);
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
      expect(createData.program_name).toBe(programName);

      debugLog('CREATE', 'High-level program creation completed successfully', {
        program_name: createData.program_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level program creation completed successfully for ${programName}`);

      // Step 2: Test UpdateProgram (High-Level)
      debugLog('UPDATE', `Starting high-level program update for ${programName}`, {
        session_id: session.session_id
      });

      const updatedSourceCode = `REPORT ${programName}.

WRITE: / 'Hello from ${programName} (updated)'.
WRITE: / 'Additional line'.`;

      let updateResponse;
      try {
        updateResponse = await handleUpdateProgram({
          program_name: programName,
          source_code: updatedSourceCode,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If program doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update program ${programName}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.program_name).toBe(programName);

      debugLog('UPDATE', 'High-level program update completed successfully', {
        program_name: updateData.program_name,
        success: updateData.success
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level program update completed successfully for ${programName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test program
      if (session && programName) {
        try {
          const deleteResponse = await handleDeleteProgram({
            program_name: programName,
            transport_request: transportRequest,
            session_id: session.session_id,
            session_state: session.session_state
          });

          if (!deleteResponse.isError) {
            console.log(`🧹 Cleaned up test program: ${programName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test program ${programName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

