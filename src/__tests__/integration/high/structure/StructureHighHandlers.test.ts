/**
 * Integration tests for Structure High-Level Handlers
 *
 * Tests all high-level handlers for Structure module:
 * - CreateStructure (high-level) - handles validate, create, lock, check, unlock, activate
 * - UpdateStructure (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/structure
 */

import { handleCreateStructure } from '../../../../handlers/structure/high/handleCreateStructure';
import { handleUpdateStructure } from '../../../../handlers/structure/high/handleUpdateStructure';
import { handleDeleteStructure } from '../../../../handlers/structure/low/handleDeleteStructure';

import { HighTester } from '../../helpers/testers/HighTester';
import { getTimeout } from '../../helpers/configHelpers';

describe('Structure High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_structure',
      'builder_structure',
      'structure-high',
      {
        create: handleCreateStructure,
        update: handleUpdateStructure,
        delete: handleDeleteStructure
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

  it('should test all Structure high-level handlers', async () => {
    await tester.run();
  }, getTimeout('long'));
});
