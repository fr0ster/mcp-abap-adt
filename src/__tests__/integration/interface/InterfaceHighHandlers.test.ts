/**
 * Integration tests for Interface High-Level Handlers
 *
 * Tests all high-level handlers for Interface module:
 * - CreateInterface (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateInterface (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/interface
 */

import { handleCreateInterface } from '../../../handlers/interface/high/handleCreateInterface';
import { handleUpdateInterface } from '../../../handlers/interface/high/handleUpdateInterface';
import { handleDeleteInterface } from '../../../handlers/interface/low/handleDeleteInterface';

import { HighTester } from '../helpers/testers/HighTester';
import { getTimeout } from '../helpers/configHelpers';

describe('Interface High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_interface',
      'builder_interface',
      'interface-high',
      {
        create: handleCreateInterface,
        update: handleUpdateInterface,
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

  it('should test all Interface high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});
