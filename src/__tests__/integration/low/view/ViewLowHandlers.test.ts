/**
 * Integration tests for View Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/view
 */

import { handleValidateView } from '../../../../handlers/view/low/handleValidateView';
import { handleCreateView } from '../../../../handlers/view/low/handleCreateView';
import { handleLockView } from '../../../../handlers/view/low/handleLockView';
import { handleUpdateView } from '../../../../handlers/view/low/handleUpdateView';
import { handleUnlockView } from '../../../../handlers/view/low/handleUnlockView';
import { handleActivateView } from '../../../../handlers/view/low/handleActivateView';
import { handleDeleteView } from '../../../../handlers/view/low/handleDeleteView';

import { LowTester } from '../../helpers/testers/LowTester';
import { getTimeout } from '../../helpers/configHelpers';

describe('View Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_view_low',
      'full_workflow',
      'view-low',
      {
        validate: handleValidateView,
        create: handleCreateView,
        lock: handleLockView,
        update: handleUpdateView,
        unlock: handleUnlockView,
        activate: handleActivateView,
        delete: handleDeleteView
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

  it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
    await tester.run();
  }, getTimeout('long'));
});
