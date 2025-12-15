/**
 * Integration tests for Program Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/program
 */

import { handleValidateProgram } from '../../../handlers/program/low/handleValidateProgram';
import { handleCreateProgram } from '../../../handlers/program/low/handleCreateProgram';
import { handleLockProgram } from '../../../handlers/program/low/handleLockProgram';
import { handleUpdateProgram } from '../../../handlers/program/low/handleUpdateProgram';
import { handleUnlockProgram } from '../../../handlers/program/low/handleUnlockProgram';
import { handleActivateProgram } from '../../../handlers/program/low/handleActivateProgram';
import { handleDeleteProgram } from '../../../handlers/program/low/handleDeleteProgram';

import { LowTester } from '../helpers/testers/LowTester';
import { getTimeout } from '../helpers/configHelpers';

describe('Program Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_program_low',
      'full_workflow',
      'program-low',
      {
        validate: handleValidateProgram,
        create: handleCreateProgram,
        lock: handleLockProgram,
        update: handleUpdateProgram,
        unlock: handleUnlockProgram,
        activate: handleActivateProgram,
        delete: handleDeleteProgram
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
