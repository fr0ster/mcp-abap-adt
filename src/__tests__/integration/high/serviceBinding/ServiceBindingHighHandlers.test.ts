/**
 * Integration tests for ServiceBinding High-Level Handlers
 *
 * Tests: CreateServiceBinding (with binding_variant), ActivateServiceBinding, DeleteServiceBinding
 *
 * Prerequisites: Shared objects must exist (npm run shared:setup),
 * including ZMCP_SHR_SRVD01 service definition.
 *
 * Run: npm test -- --testPathPattern=integration/high/serviceBinding
 */

import { handleCreateServiceBinding } from '../../../../handlers/service_binding/high/handleCreateServiceBinding';
import { handleDeleteServiceBinding } from '../../../../handlers/service_binding/high/handleDeleteServiceBinding';
import { handleActivateServiceBinding } from '../../../../handlers/service_binding/low/handleActivateServiceBinding';
import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { getTimeout } from '../../helpers/configHelpers';
import { ensureSharedObjects } from '../../helpers/sharedObjects';
import { HighTester } from '../../helpers/testers/HighTester';

/**
 * Wrapper: ActivateServiceBinding as "update" step for HighTester.
 * HighTester calls update(context, args) where args has service_binding_name.
 */
async function activateAsUpdate(
  context: HandlerContext,
  args: any,
): Promise<any> {
  return handleActivateServiceBinding(context, {
    name: args.service_binding_name,
  });
}

describe('ServiceBinding High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_service_binding',
      'builder_service_binding',
      'srvb-high',
      {
        create: handleCreateServiceBinding,
        update: activateAsUpdate,
        delete: handleDeleteServiceBinding,
      },
    );
    await tester.beforeAll();
    await ensureSharedObjects(tester.getConnection()!);
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
    'should test all ServiceBinding high-level handlers',
    async () => {
      await tester.run();
    },
    getTimeout('long'),
  );
});
