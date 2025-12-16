/**
 * Integration tests for ServiceDefinition High-Level Handlers
 *
 * Tests all high-level handlers for ServiceDefinition module:
 * - CreateServiceDefinition (high-level) - handles validate, create, activate
 * - UpdateServiceDefinition (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/serviceDefinition
 */

import { handleCreateServiceDefinition } from '../../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleUpdateServiceDefinition } from '../../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

import { HighTester } from '../helpers/testers/HighTester';
import { getTimeout } from '../helpers/configHelpers';

// Wrapper for delete since there's no handler for deleteServiceDefinition
async function deleteServiceDefinitionWrapper(context: HandlerContext, args: any): Promise<any> {
  try {
    const client = new CrudClient(context.connection);
    await client.deleteServiceDefinition(
      { serviceDefinitionName: args.service_definition_name },
      args.transport_request
    );
    return {
      isError: false,
      content: [{ type: 'text', text: 'Service definition deleted successfully' }]
    };
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: error?.message || String(error) }]
    };
  }
}

describe('ServiceDefinition High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_service_definition',
      'builder_service_definition',
      'service-high',
      {
        create: handleCreateServiceDefinition,
        update: handleUpdateServiceDefinition,
        delete: deleteServiceDefinitionWrapper
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

  it('should test all ServiceDefinition high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});
