/**
 * Integration tests for BehaviorDefinition High-Level Handlers
 *
 * Tests all high-level handlers for BehaviorDefinition module:
 * - CreateBehaviorDefinition (high-level) - handles create, lock, check, unlock, activate
 * - UpdateBehaviorDefinition (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorDefinition
 */

import { handleCreateBehaviorDefinition } from '../../../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';

import { HighTester } from '../../helpers/testers/HighTester';
import { getTimeout } from '../../helpers/configHelpers';

describe('BehaviorDefinition High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_behavior_definition_low',
      'full_workflow',
      'bdef-high',
      {
        create: handleCreateBehaviorDefinition,
        update: handleUpdateBehaviorDefinition,
        delete: handleDeleteBehaviorDefinition
      }
    );
    await tester.beforeAll();
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

  it('should test all BehaviorDefinition high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});
