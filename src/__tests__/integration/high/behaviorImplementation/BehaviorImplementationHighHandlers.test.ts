/**
 * Integration tests for BehaviorImplementation High-Level Handlers
 *
 * Tests all high-level handlers for BehaviorImplementation module:
 * - CreateBehaviorImplementation (high-level) - handles create, lock, update main source, update implementations, unlock, activate
 * - UpdateBehaviorImplementation (high-level) - handles validate, lock, update main source, update implementations, check, unlock, activate
 * - DeleteClass (low-level) - handles delete
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorImplementation
 */

import { handleCreateBehaviorImplementation } from '../../../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleDeleteClass } from '../../../../handlers/class/low/handleDeleteClass';
import {
  getEnabledTestCase,
  getSharedObject,
  getTimeout,
  resolvePackageName,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import { HighTester } from '../../helpers/testers/HighTester';
import {
  callTool,
  createHardModeClient,
  isHardModeEnabled,
} from '../../helpers/testers/hardMode';

async function manageBdefPrerequisite(
  action: 'create' | 'delete',
): Promise<void> {
  if (!isHardModeEnabled()) return;
  const implTestCase = getEnabledTestCase(
    'create_behavior_implementation',
    'builder_behavior_implementation',
  );
  if (!implTestCase) return;
  const bdefName: string | undefined = implTestCase.params?.behavior_definition;
  if (!bdefName) return;
  const packageName = resolvePackageName(implTestCase);
  const transportRequest = resolveTransportRequest(implTestCase);

  // Source code for the prerequisite BDEF — taken from shared_objects config
  const sharedBdef = getSharedObject('behavior_definition_prerequisite');
  const sourceCode: string | undefined = sharedBdef?.source_code;

  const mcp = await createHardModeClient();
  try {
    if (action === 'create') {
      await callTool(mcp.client, mcp.toolNames, ['CreateBehaviorDefinition'], {
        name: bdefName,
        root_entity: bdefName,
        package_name: packageName,
        implementation_type: 'Managed',
        description: `Prerequisite BDEF for BehaviorImplementation tests`,
        ...(sourceCode && { source_code: sourceCode }),
        ...(transportRequest && { transport_request: transportRequest }),
      });
    } else {
      await callTool(
        mcp.client,
        mcp.toolNames,
        ['DeleteBehaviorDefinition', 'DeleteBehaviorDefinitionLow'],
        {
          behavior_definition_name: bdefName,
          ...(transportRequest && { transport_request: transportRequest }),
        },
      );
    }
  } catch {
    // create: already exists — OK; delete: not found — OK
  } finally {
    await mcp.close();
  }
}

describe('BehaviorImplementation High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_behavior_implementation',
      'builder_behavior_implementation',
      'bimpl-high',
      {
        create: handleCreateBehaviorImplementation,
        update: handleUpdateBehaviorImplementation,
        delete: handleDeleteClass,
      },
    );
    await tester.beforeAll();
    await manageBdefPrerequisite('create');
  }, getTimeout('long'));

  afterAll(async () => {
    await manageBdefPrerequisite('delete');
    await tester.afterAll();
  });

  beforeEach(async () => {
    await tester.beforeEach();
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should test all BehaviorImplementation high-level handlers',
    async () => {
      await tester.run();
    },
    getTimeout('long'),
  );
});
