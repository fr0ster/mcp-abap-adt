/**
 * Integration tests for FunctionModule Low-Level Handlers
 *
 * Tests the complete workflow using LowTester:
 * Validate → Create → Lock → Update → Unlock → Activate
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/functionModule
 */

import { handleValidateFunctionModule } from '../../../handlers/function/low/handleValidateFunctionModule';
import { handleCreateFunctionModule } from '../../../handlers/function/low/handleCreateFunctionModule';
import { handleLockFunctionModule } from '../../../handlers/function/low/handleLockFunctionModule';
import { handleUpdateFunctionModule } from '../../../handlers/function/low/handleUpdateFunctionModule';
import { handleUnlockFunctionModule } from '../../../handlers/function/low/handleUnlockFunctionModule';
import { handleActivateFunctionModule } from '../../../handlers/function/low/handleActivateFunctionModule';
import { handleDeleteFunctionModule } from '../../../handlers/function/low/handleDeleteFunctionModule';

import { LowTester } from '../helpers/testers/LowTester';
import { getTimeout } from '../helpers/configHelpers';

describe('FunctionModule Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'create_function_module_low',
      'full_workflow',
      'functionmodule-low',
      {
        validate: handleValidateFunctionModule,
        create: handleCreateFunctionModule,
        lock: handleLockFunctionModule,
        update: handleUpdateFunctionModule,
        unlock: handleUnlockFunctionModule,
        activate: handleActivateFunctionModule,
        delete: handleDeleteFunctionModule
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
