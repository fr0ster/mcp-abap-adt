/**
 * Integration tests for Structure Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/structure
 */

import { handleValidateStructure } from '../../../handlers/structure/low/handleValidateStructure';
import { handleCreateStructure } from '../../../handlers/structure/low/handleCreateStructure';
import { handleLockStructure } from '../../../handlers/structure/low/handleLockStructure';
import { handleUpdateStructure } from '../../../handlers/structure/low/handleUpdateStructure';
import { handleUnlockStructure } from '../../../handlers/structure/low/handleUnlockStructure';
import { handleActivateStructure } from '../../../handlers/structure/low/handleActivateStructure';
import { handleDeleteStructure } from '../../../handlers/structure/low/handleDeleteStructure';

import { LowTester } from '../helpers/testers/LowTester';
import { getTimeout } from '../helpers/configHelpers';

describe('Structure Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_structure_low',
      'full_workflow',
      'structure-low',
      {
        validate: handleValidateStructure,
        create: handleCreateStructure,
        lock: handleLockStructure,
        update: handleUpdateStructure,
        unlock: handleUnlockStructure,
        activate: handleActivateStructure,
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

  it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
    await tester.run();
  }, getTimeout('long'));
});
