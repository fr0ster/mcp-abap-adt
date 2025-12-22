/**
 * Integration tests for Class Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/class
 */

import { handleActivateClass } from '../../../../handlers/class/low/handleActivateClass';
import { handleCreateClass } from '../../../../handlers/class/low/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/low/handleDeleteClass';
import { handleLockClass } from '../../../../handlers/class/low/handleLockClass';
import { handleUnlockClass } from '../../../../handlers/class/low/handleUnlockClass';
import { handleUpdateClass } from '../../../../handlers/class/low/handleUpdateClass';
import { handleValidateClass } from '../../../../handlers/class/low/handleValidateClass';
import { getTimeout } from '../../helpers/configHelpers';
import { LowTester } from '../../helpers/testers/LowTester';

describe('Class Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester('create_class_low', 'full_workflow', 'class-low', {
      validate: handleValidateClass,
      create: handleCreateClass,
      lock: handleLockClass,
      update: handleUpdateClass,
      unlock: handleUnlockClass,
      activate: handleActivateClass,
      delete: handleDeleteClass,
    });
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
