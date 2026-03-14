/**
 * Integration test: CRUD on objects assigned to a transport request
 *
 * Reproduces the issue from GitHub #11: editing objects in unreleased
 * transports fails on legacy systems (and possibly on-prem).
 *
 * Scenario:
 *   1. Create a class in a transportable package (recorded to transport)
 *   2. Read the class (GetClass + ReadClass with metadata)
 *   3. Update the class source code
 *   4. Delete the class
 *
 * Prerequisites in test-config.yaml section `create_transported_object`:
 *   - transport_request: an existing unreleased transport
 *   - package_name: a transportable package (not $TMP)
 *   - class_name: test class name (default ZMCP_BLD_TRCLS)
 *
 * Run: npm test -- --testPathPattern=TransportedObjectCrud
 */

import { handleCreateClass } from '../../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/high/handleDeleteClass';
import { handleGetClass } from '../../../../handlers/class/high/handleGetClass';
import { handleUpdateClass } from '../../../../handlers/class/high/handleUpdateClass';
import { handleReadClass } from '../../../../handlers/class/readonly/handleReadClass';
import {
  getOperationDelay,
  getSystemType,
  getTimeout,
  loadTestConfig,
  loadTestEnv,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../../helpers/sessionHelpers';
import {
  createHandlerContext,
  delay,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('Transported Object CRUD (GitHub #11)', () => {
  const logger = createTestLogger('transport-crud');

  let connection: any;
  let session: SessionInfo;
  let transportRequest: string;
  let packageName: string;
  let className: string;
  let testEnabled = false;

  beforeAll(async () => {
    await loadTestEnv();

    const systemType = getSystemType();
    logger?.info(`System type: ${systemType}`);

    const config = loadTestConfig();
    const section = config?.create_transported_object;

    if (!section || section.enabled === false) {
      logger?.warn('create_transported_object is disabled in config');
      return;
    }

    if (!section.transport_request) {
      logger?.warn(
        'No transport_request in create_transported_object — skipping',
      );
      return;
    }

    if (!section.package_name) {
      logger?.warn('No package_name in create_transported_object — skipping');
      return;
    }

    transportRequest = String(section.transport_request).trim();
    packageName = String(section.package_name).trim();
    className = String(section.class_name || 'ZMCP_BLD_TRCLS').trim();

    logger?.info(
      `Transport: ${transportRequest}, Package: ${packageName}, Class: ${className}`,
    );

    const result = await createTestConnectionAndSession('transport-crud');
    connection = result.connection;
    session = result.session;
    testEnabled = true;
  }, getTimeout('long'));

  afterAll(async () => {
    if (testEnabled && className && connection) {
      logger?.info(`Cleanup: deleting class ${className}`);
      try {
        const ctx = createHandlerContext({ connection, logger });
        await handleDeleteClass(ctx, {
          class_name: className,
          transport_request: transportRequest,
        });
        logger?.success(`Cleanup: class ${className} deleted`);
      } catch (e: any) {
        logger?.warn(`Cleanup class delete failed: ${e.message}`);
      }
    }
  }, getTimeout('long'));

  it(
    'should CRUD a class in a transportable package',
    async () => {
      if (!testEnabled) {
        logger?.warn('Skipping — test not enabled or missing config');
        return;
      }

      // Step 1: Create class in transportable package
      logger?.info(
        `Step 1: Creating class ${className} in ${packageName}, TR ${transportRequest}`,
      );
      const createCtx = createHandlerContext({ connection, logger });
      const createResponse = await handleCreateClass(createCtx, {
        class_name: className,
        package_name: packageName,
        transport_request: transportRequest,
        description: 'MCP test class in transport (GitHub #11)',
      });

      expect(createResponse.isError).toBe(false);
      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      logger?.success(`Step 1: Class ${className} created`);

      await delay(getOperationDelay('create'));

      // Step 2: Read the class (high-level GetClass)
      logger?.info('Step 2: Reading class via GetClass');
      const getCtx = createHandlerContext({ connection, logger });
      const getResponse = await handleGetClass(getCtx, {
        class_name: className,
      });

      expect(getResponse.isError).toBe(false);
      const getData = parseHandlerResponse(getResponse);
      expect(getData.success).toBe(true);
      logger?.success('Step 2: GetClass succeeded');

      // Step 3: Read with metadata (readonly ReadClass)
      logger?.info('Step 3: Reading class via ReadClass (source + metadata)');
      const readCtx = createHandlerContext({ connection, logger });
      const readResponse = await handleReadClass(readCtx, {
        class_name: className,
      });

      expect(readResponse.isError).toBe(false);
      const readData = parseHandlerResponse(readResponse);
      expect(readData.success).toBe(true);
      expect(readData.source_code).toBeDefined();
      expect(readData.metadata).toBeDefined();
      logger?.success('Step 3: ReadClass with metadata succeeded');

      // Step 4: Update the class source code (the critical operation — GitHub #11)
      logger?.info(`Step 4: Updating class source (TR: ${transportRequest})`);
      const updateCtx = createHandlerContext({ connection, logger });
      const newSource = `CLASS ${className} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD run.
    " Updated by MCP transport CRUD test
  ENDMETHOD.
ENDCLASS.`;

      const updateResponse = await handleUpdateClass(updateCtx, {
        class_name: className,
        source_code: newSource,
        transport_request: transportRequest,
      });

      expect(updateResponse.isError).toBe(false);
      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      logger?.success('Step 4: UpdateClass in transport succeeded');

      // Step 5: Delete the class
      logger?.info(`Step 5: Deleting class ${className}`);
      const deleteCtx = createHandlerContext({ connection, logger });
      const deleteResponse = await handleDeleteClass(deleteCtx, {
        class_name: className,
        transport_request: transportRequest,
      });

      expect(deleteResponse.isError).toBe(false);
      logger?.success('Step 5: DeleteClass succeeded');
      className = ''; // Prevent double-delete in afterAll
    },
    getTimeout('long'),
  );
});
