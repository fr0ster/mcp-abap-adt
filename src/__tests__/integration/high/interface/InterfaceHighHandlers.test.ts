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

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import {
  TOOL_DEFINITION as CreateInterfaceTool,
  handleCreateInterface,
} from '../../../../handlers/interface/high/handleCreateInterface';
import {
  TOOL_DEFINITION as DeleteInterfaceTool,
  handleDeleteInterface,
} from '../../../../handlers/interface/high/handleDeleteInterface';
import {
  handleUpdateInterface,
  TOOL_DEFINITION as UpdateInterfaceTool,
} from '../../../../handlers/interface/high/handleUpdateInterface';

import { defineTool } from '../../../../lib/handlers/interfaces';
import { HighTester } from '../../helpers/testers/HighTester';

describe('Interface High-Level Handlers Integration', () => {
  let tester: HighTester;

  before(async () => {
    tester = new HighTester(
      'create_interface',
      'builder_interface',
      'interface-high',
      {
        create: defineTool(CreateInterfaceTool, handleCreateInterface),
        update: defineTool(UpdateInterfaceTool, handleUpdateInterface),
        delete: defineTool(DeleteInterfaceTool, handleDeleteInterface),
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

  it('should test all Interface high-level handlers', async () => {
    await tester.run();
  });
});
