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

import { after, afterEach, before, beforeEach, it } from 'node:test';
import {
  TOOL_DEFINITION as CreateStructureTool,
  handleCreateStructure,
} from '../../../../handlers/structure/high/handleCreateStructure';
import {
  TOOL_DEFINITION as DeleteStructureTool,
  handleDeleteStructure,
} from '../../../../handlers/structure/high/handleDeleteStructure';
import {
  handleUpdateStructure,
  TOOL_DEFINITION as UpdateStructureTool,
} from '../../../../handlers/structure/high/handleUpdateStructure';

import { defineTool } from '../../../../lib/handlers/interfaces';
import { servedSuite } from '../../helpers/servedHere';
import { HighTester } from '../../helpers/testers/HighTester';

/**
 * This file's `describe`: the suite runs where the configured system serves
 * every tool it calls, and skips naming the first it does not serve.
 */
const describe = servedSuite([
  'CreateStructure',
  'DeleteStructure',
  'UpdateStructure',
]);

describe('Structure High-Level Handlers Integration', () => {
  let tester: HighTester;

  before(async () => {
    tester = new HighTester(
      'create_structure',
      'builder_structure',
      'structure-high',
      {
        create: defineTool(CreateStructureTool, handleCreateStructure),
        update: defineTool(UpdateStructureTool, handleUpdateStructure),
        delete: defineTool(DeleteStructureTool, handleDeleteStructure),
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

  it('should test all Structure high-level handlers', async () => {
    await tester.run();
  });
});
