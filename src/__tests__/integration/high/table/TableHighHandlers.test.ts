/**
 * Integration tests for Table High-Level Handlers
 *
 * Tests all high-level handlers for Table module:
 * - CreateTable (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateTable (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/table
 */

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import {
  TOOL_DEFINITION as CreateTableTool,
  handleCreateTable,
} from '../../../../handlers/table/high/handleCreateTable';
import {
  TOOL_DEFINITION as DeleteTableTool,
  handleDeleteTable,
} from '../../../../handlers/table/high/handleDeleteTable';
import {
  handleUpdateTable,
  TOOL_DEFINITION as UpdateTableTool,
} from '../../../../handlers/table/high/handleUpdateTable';

import { defineTool } from '../../../../lib/handlers/interfaces';
import { HighTester } from '../../helpers/testers/HighTester';

describe('Table High-Level Handlers Integration', () => {
  let tester: HighTester;

  before(async () => {
    tester = new HighTester('create_table', 'builder_table', 'table-high', {
      create: defineTool(CreateTableTool, handleCreateTable),
      update: defineTool(UpdateTableTool, handleUpdateTable),
      delete: defineTool(DeleteTableTool, handleDeleteTable),
    });
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

  it('should test all Table high-level handlers', async () => {
    await tester.run();
  });
});
