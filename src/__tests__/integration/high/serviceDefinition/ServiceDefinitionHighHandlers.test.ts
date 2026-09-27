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

import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { handleCreateServiceDefinition } from '../../../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleUpdateServiceDefinition } from '../../../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { createAdtClient } from '../../../../lib/clients';
import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { getTimeout } from '../../helpers/configHelpers';
import { ensureSharedObjects } from '../../helpers/sharedObjects';
import { HighTester } from '../../helpers/testers/HighTester';

// Wrapper for delete since there's no handler for deleteServiceDefinition
async function deleteServiceDefinitionWrapper(
  context: HandlerContext,
  args: any,
): Promise<any> {
  try {
    const client = createAdtClient(context.connection);
    // The answer is read: since adt-clients 23 a refused delete answers
    // `ok: false` and throws nothing, so awaiting alone would have this wrapper
    // report "deleted successfully" over a service definition still on the
    // system — and `analyseDeletion` is what turns ADT's `del:isDeleted="false"`
    // (answered with HTTP 200) into that refusal in the first place.
    const deleted = await client.getServiceDefinition().delete(
      {
        serviceDefinitionName: args.service_definition_name,
        transportRequest: args.transport_request,
      },
      { analyse: analyseDeletion },
    );
    if (!deleted.ok) {
      throw new Error(deleted.getError().message);
    }
    return {
      isError: false,
      content: [
        { type: 'text', text: 'Service definition deleted successfully' },
      ],
    };
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: error?.message || String(error) }],
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
        delete: deleteServiceDefinitionWrapper,
      },
    );
    await tester.beforeAll();
    // Verify CDS view prerequisites (ZOK_C_CDS_TEST) exist before ServiceDefinition test
    await ensureSharedObjects(tester.getConnection());
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll();
  });

  beforeEach(async () => {
    await tester.beforeEach();
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should test all ServiceDefinition high-level handlers',
    async () => {
      await tester.run();
    },
    getTimeout('long'),
  );
});
