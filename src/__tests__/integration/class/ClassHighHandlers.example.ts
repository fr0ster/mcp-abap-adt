/**
 * Example: How to use LambdaTester with workflow functions (lambda approach)
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

import { LambdaTester } from '../helpers/testers/LambdaTester';
import { getTimeout } from '../helpers/configHelpers';
import type { LambdaTesterContext } from '../helpers/testers/types';
import { parseHandlerResponse, extractErrorMessage, createHandlerContext } from '../helpers/testHelpers';
import { updateSessionFromResponse } from '../helpers/sessionHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';

describe('Class High-Level Handlers Integration (Example with Workflow Functions)', () => {
  let tester: LambdaTester;
  // Logger is created in test scope and captured by closure in lambdas
  const logger = createTestLogger('class-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_class',
      'builder_class',
      'class-high',
      'builder_class'
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        // Additional setup if needed
      },
      // Cleanup lambda - will be called by tester after checking YAML params
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;

        logger?.info(`   • delete: ${objectName}`);
        const handlerContext = createHandlerContext({ connection, logger });
        const deleteResponse = await handleDeleteClass(handlerContext, {
          class_name: objectName,
          ...(transportRequest && { transport_request: transportRequest })
        });
        if (deleteResponse.isError) {
          const errorMsg = extractErrorMessage(deleteResponse);
          logger?.warn(`Delete failed (ignored in cleanup): ${errorMsg}`);
        } else {
          logger?.success(`✅ delete: ${objectName} completed successfully`);
        }
      }
    );
  });

  afterEach(async () => {
    // cleanupAfter is automatically called by tester.afterEach()
    // It checks YAML params and calls cleanup lambda if needed
    await tester.afterEach();
  });

  it('should test all Class high-level handlers', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, session, objectName, params, packageName, transportRequest } = context;

      // Create
      logger?.info(`   • create: ${objectName}`);
      const handlerContext = createHandlerContext({ connection, logger });
      const createResponse = await handleCreateClass(handlerContext, {
        class_name: objectName!,
        package_name: packageName,
        source_code: params.source_code || '',
        activate: true,
        ...(transportRequest && { transport_request: transportRequest }),
        ...(params.description && { description: params.description }),
        ...(params.superclass && { superclass: params.superclass })
      });

      if (createResponse.isError) {
        const errorMsg = extractErrorMessage(createResponse);
        if (errorMsg.includes('already exists') || errorMsg.includes('ExceptionResourceAlreadyExists')) {
          logger?.info(`⏭️  SKIP: Object already exists: ${errorMsg}`);
          throw new Error(`SKIP: ${errorMsg}`);
        }
        throw new Error(`Create failed: ${errorMsg}`);
      }

      const createData = parseHandlerResponse(createResponse);
      if (!createData.success) {
        throw new Error(`Create failed: ${JSON.stringify(createData)}`);
      }

      logger?.success(`✅ create: ${objectName} completed successfully`);
      updateSessionFromResponse(session, createData);

      // Update
      logger?.info(`   • update: ${objectName}`);
      const updatedSourceCode = params.update_source_code;
      if (!updatedSourceCode) {
        throw new Error('update_source_code is required');
      }

      const updateResponse = await handleUpdateClass(handlerContext, {
        class_name: objectName!,
        source_code: updatedSourceCode,
        activate: true,
      });

      if (updateResponse.isError) {
        const errorMsg = extractErrorMessage(updateResponse);
        throw new Error(`Update failed: ${errorMsg}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      if (!updateData.success) {
        throw new Error(`Update failed: ${JSON.stringify(updateData)}`);
      }

      logger?.success(`✅ update: ${objectName} completed successfully`);
    });
  }, getTimeout('long'));
});
