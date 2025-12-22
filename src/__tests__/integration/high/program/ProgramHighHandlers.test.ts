/**
 * Integration tests for Program High-Level Handlers
 *
 * Tests all high-level handlers for Program module:
 * - CreateProgram (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateProgram (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/program
 */

import { handleCreateProgram } from '../../../../handlers/program/high/handleCreateProgram';
import { handleUpdateProgram } from '../../../../handlers/program/high/handleUpdateProgram';
import { handleDeleteProgram } from '../../../../handlers/program/low/handleDeleteProgram';
import { getTimeout, isCloudConnection } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { HighTester } from '../../helpers/testers/HighTester';

describe('Program High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_program',
      'builder_program',
      'program-high',
      {
        create: handleCreateProgram,
        update: handleUpdateProgram,
        delete: handleDeleteProgram,
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
    'should test all Program high-level handlers',
    async () => {
      // Skip test on cloud - programs are not available on cloud systems
      if (isCloudConnection()) {
        const logger = createTestLogger('program-high');
        logger?.info(
          '⏭️  Skipping test: Programs are not available on cloud systems',
        );
        return;
      }
      await tester.run();
    },
    getTimeout('long'),
  );
});
