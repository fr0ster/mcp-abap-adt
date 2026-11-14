/**
 * Integration tests for Domain High-Level Handlers
 *
 * Tests high-level handlers that manage the complete workflow internally:
 * CreateDomain (high-level) - handles lock, create, check, unlock, activate
 * UpdateDomain (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/domain
 */

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import {
  TOOL_DEFINITION as CreateDomainTool,
  handleCreateDomain,
} from '../../../../handlers/domain/high/handleCreateDomain';
import {
  TOOL_DEFINITION as DeleteDomainTool,
  handleDeleteDomain,
} from '../../../../handlers/domain/high/handleDeleteDomain';
import {
  handleUpdateDomain,
  TOOL_DEFINITION as UpdateDomainTool,
} from '../../../../handlers/domain/high/handleUpdateDomain';

import { defineTool } from '../../../../lib/handlers/interfaces';
import { HighTester } from '../../helpers/testers/HighTester';

describe('Domain High-Level Handlers Integration', () => {
  let tester: HighTester;

  before(async () => {
    tester = new HighTester('create_domain', 'builder_domain', 'domain-high', {
      create: defineTool(CreateDomainTool, handleCreateDomain),
      update: defineTool(UpdateDomainTool, handleUpdateDomain),
      delete: defineTool(DeleteDomainTool, handleDeleteDomain),
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

  it('should test all Domain high-level handlers', async () => {
    await tester.run();
  });
});
