/**
 * Example: How to use HighTester with workflow functions (lambda approach)
 * 
 * This shows how tests can define workflow functions (lambdas) that call handlers
 * with logging, while tester provides all infrastructure (connection, session, logger, etc.)
 * 
 * This approach allows:
 * - Tests to define custom handler call logic
 * - Tests to add custom logging
 * - Tester to provide all common infrastructure (connection, session, logger, params, etc.)
 */

import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';

import { HighTester } from '../helpers/testers/HighTester';
import { getTimeout } from '../helpers/configHelpers';
import type { TesterContext } from '../helpers/testers/types';
import { parseHandlerResponse, extractErrorMessage, delay } from '../helpers/testHelpers';
import { updateSessionFromResponse } from '../helpers/sessionHelpers';

describe('Class High-Level Handlers Integration (Example with Workflow Functions)', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_class',
      'builder_class',
      'class-high',
      {
        // Lambda that calls create handler with logging
        create: async (context: TesterContext) => {
          const { connection, session, logger, objectName, params, packageName, transportRequest } = context;
          
          logger.info(`   • create: ${objectName}`);

          const sourceCode = params.source_code || '';
          const createArgs = {
            class_name: objectName,
            package_name: packageName,
            source_code: sourceCode,
            activate: true,
            ...(transportRequest && { transport_request: transportRequest }),
            ...(params.description && { description: params.description }),
            ...(params.superclass && { superclass: params.superclass }),
            session_id: session.session_id,
            session_state: session.session_state
          };

          let createResponse;
          try {
            createResponse = await handleCreateClass(connection, createArgs);
          } catch (error: any) {
            if (error.message?.includes('404')) {
              await delay(1000);
              createResponse = await handleCreateClass(connection, createArgs);
            } else {
              throw error;
            }
          }

          if (createResponse.isError) {
            const errorMsg = extractErrorMessage(createResponse);
            if (errorMsg.includes('already exists') || errorMsg.includes('ExceptionResourceAlreadyExists')) {
              logger.info(`⏭️  SKIP: Object already exists: ${errorMsg}`);
              throw new Error(`SKIP: ${errorMsg}`);
            }
            throw new Error(`Create failed: ${errorMsg}`);
          }

          const createData = parseHandlerResponse(createResponse);
          if (!createData.success) {
            throw new Error(`Create failed: ${JSON.stringify(createData)}`);
          }

          logger.success(`✅ create: ${objectName} completed successfully`);
          updateSessionFromResponse(session, createData);
          
          return createData;
        },

        // Lambda that calls update handler with logging
        update: async (context: TesterContext) => {
          const { connection, session, logger, objectName, params } = context;
          
          logger.info(`   • update: ${objectName}`);

          const updatedSourceCode = params.update_source_code;
          if (!updatedSourceCode) {
            throw new Error('update_source_code is required');
          }

          const updateResponse = await handleUpdateClass(connection, {
            class_name: objectName,
            source_code: updatedSourceCode,
            activate: true,
            session_id: session.session_id,
            session_state: session.session_state
          });

          if (updateResponse.isError) {
            const errorMsg = extractErrorMessage(updateResponse);
            throw new Error(`Update failed: ${errorMsg}`);
          }

          const updateData = parseHandlerResponse(updateResponse);
          if (!updateData.success) {
            throw new Error(`Update failed: ${JSON.stringify(updateData)}`);
          }

          logger.success(`✅ update: ${objectName} completed successfully`);
          
          return updateData;
        },

        // Lambda that calls delete handler with logging
        delete: async (context: TesterContext) => {
          const { connection, logger, objectName, transportRequest } = context;
          
          logger.info(`   • delete: ${objectName}`);

          const deleteResponse = await handleDeleteClass(connection, {
            class_name: objectName,
            ...(transportRequest && { transport_request: transportRequest })
          });

          if (deleteResponse.isError) {
            const errorMsg = extractErrorMessage(deleteResponse);
            logger.warn(`Delete failed (ignored in cleanup): ${errorMsg}`);
            return;
          }

          logger.success(`✅ delete: ${objectName} completed successfully`);
        }
      }
    );
    await tester.beforeAll();
  });

  afterAll(async () => {
    await tester.afterAll();
  });

  beforeEach(async () => {
    await tester.beforeEach();
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it('should test all Class high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});
