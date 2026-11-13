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

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import * as z from 'zod';
import {
  TOOL_DEFINITION as CreateServiceBindingTool,
  handleCreateServiceBinding,
} from '../../../../handlers/service_binding/high/handleCreateServiceBinding';
import {
  TOOL_DEFINITION as DeleteServiceBindingTool,
  handleDeleteServiceBinding,
} from '../../../../handlers/service_binding/high/handleDeleteServiceBinding';
import { handleActivateServiceBinding } from '../../../../handlers/service_binding/low/handleActivateServiceBinding';
import {
  defineTool,
  type HandlerContext,
} from '../../../../lib/handlers/interfaces';

import { ensureSharedObjects } from '../../helpers/sharedObjects';
import { HighTester } from '../../helpers/testers/HighTester';

/**
 * Wrapper: ActivateServiceBinding as "update" step for HighTester.
 * HighTester calls update(context, args) where args has service_binding_name.
 */
const ACTIVATE_AS_UPDATE = {
  name: 'ActivateAsUpdate',
  description: 'Activates the service binding the update step names.',
  inputSchema: z.object({ service_binding_name: z.string() }),
};

async function activateAsUpdate(
  context: HandlerContext,
  args: z.output<typeof ACTIVATE_AS_UPDATE.inputSchema>,
) {
  return handleActivateServiceBinding(context, {
    name: args.service_binding_name,
  });
}

describe('ServiceBinding High-Level Handlers Integration', () => {
  let tester: HighTester;

  before(async () => {
    tester = new HighTester(
      'create_service_binding',
      'builder_service_binding',
      'srvb-high',
      {
        create: defineTool(
          CreateServiceBindingTool,
          handleCreateServiceBinding,
        ),
        update: defineTool(ACTIVATE_AS_UPDATE, activateAsUpdate),
        delete: defineTool(
          DeleteServiceBindingTool,
          handleDeleteServiceBinding,
        ),
      },
    );
    await tester.beforeAll();
    await ensureSharedObjects(tester.getConnection()!);
  });

  after(async () => {
    await tester.afterAll();
  });

  beforeEach(async () => {
    await tester.beforeEach();
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it('should test all ServiceBinding high-level handlers', async () => {
    await tester.run();
  });
});
