/**
 * Integration tests for Interface Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/interface
 */

import { handleValidateInterface } from '../../../handlers/interface/low/handleValidateInterface';
import { handleCreateInterface } from '../../../handlers/interface/low/handleCreateInterface';
import { handleLockInterface } from '../../../handlers/interface/low/handleLockInterface';
import { handleUpdateInterface } from '../../../handlers/interface/low/handleUpdateInterface';
import { handleUnlockInterface } from '../../../handlers/interface/low/handleUnlockInterface';
import { handleActivateInterface } from '../../../handlers/interface/low/handleActivateInterface';
import { handleDeleteInterface } from '../../../handlers/interface/low/handleDeleteInterface';

import { LowTester } from '../helpers/testers/LowTester';
import { getTimeout } from '../helpers/configHelpers';

describe('Interface Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_interface_low',
      'full_workflow',
      'interface-low',
      {
        validate: handleValidateInterface,
        create: handleCreateInterface,
        lock: handleLockInterface,
        update: handleUpdateInterface,
        unlock: handleUnlockInterface,
        activate: handleActivateInterface,
        delete: handleDeleteInterface
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
