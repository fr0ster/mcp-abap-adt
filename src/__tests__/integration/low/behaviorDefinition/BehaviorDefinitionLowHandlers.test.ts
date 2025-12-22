/**
 * Integration tests for BehaviorDefinition Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorDefinition
 */

import { handleActivateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
import { handleCreateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleCreateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import { handleLockBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import { handleUnlockBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleValidateBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
import { getTimeout } from '../../helpers/configHelpers';
import { LowTester } from '../../helpers/testers/LowTester';

describe('BehaviorDefinition Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_behavior_definition_low',
      'full_workflow',
      'bdef-low',
      {
        validate: handleValidateBehaviorDefinition,
        create: handleCreateBehaviorDefinition,
        lock: handleLockBehaviorDefinition,
        update: handleUpdateBehaviorDefinition,
        unlock: handleUnlockBehaviorDefinition,
        activate: handleActivateBehaviorDefinition,
        delete: handleDeleteBehaviorDefinition,
      },
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

  it(
    'should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate',
    async () => {
      await tester.run();
    },
    getTimeout('long'),
  );
});
