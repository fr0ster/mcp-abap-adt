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
import { getTimeout } from '../../helpers/configHelpers';
import { HighTester } from '../../helpers/testers/HighTester';

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
    'should test all BehaviorImplementation high-level handlers',
    async () => {
      await tester.run();
    },
    getTimeout('long'),
  );
});
