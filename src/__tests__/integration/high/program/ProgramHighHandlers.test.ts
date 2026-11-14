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

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import {
  TOOL_DEFINITION as CreateProgramTool,
  handleCreateProgram,
} from '../../../../handlers/program/high/handleCreateProgram';
import {
  TOOL_DEFINITION as DeleteProgramTool,
  handleDeleteProgram,
} from '../../../../handlers/program/high/handleDeleteProgram';
import {
  handleUpdateProgram,
  TOOL_DEFINITION as UpdateProgramTool,
} from '../../../../handlers/program/high/handleUpdateProgram';

import { defineTool } from '../../../../lib/handlers/interfaces';
import { HighTester } from '../../helpers/testers/HighTester';

describe('Program High-Level Handlers Integration', () => {
  let tester: HighTester;

  before(async () => {
    tester = new HighTester(
      'create_program',
      'builder_program',
      'program-high',
      {
        create: defineTool(CreateProgramTool, handleCreateProgram),
        update: defineTool(UpdateProgramTool, handleUpdateProgram),
        delete: defineTool(DeleteProgramTool, handleDeleteProgram),
      },
    );
    await tester.beforeAll();
  });

  after(async () => {
    await tester.afterAll();
  });

  beforeEach(async () => {
    await tester.beforeEach();
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it('should test all Program high-level handlers', async () => {
    await tester.run();
  });
});
