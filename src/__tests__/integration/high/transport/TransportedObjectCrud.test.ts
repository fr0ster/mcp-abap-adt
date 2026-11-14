import * as z from 'zod';
/**
 * Integration test: CRUD on objects assigned to a transport request
 *
 * Reproduces the issue from GitHub #11: editing objects in unreleased
 * transports fails on legacy systems (and possibly on-prem).
 *
 * Scenario:
 *   1. Create a class in a transportable package (recorded to transport)
 *   2. Read the class (GetClass part source, then part metadata)
 *   3. Update the class source code
 *   4. Delete the class
 *
 * Prerequisites in test-config.yaml section `create_transported_object`:
 *   - transport_request: an existing unreleased transport
 *   - package_name: a transportable package (not $TMP)
 *   - class_name: test class name (default ZMCP_BLD_TRCLS)
 *
 * Run: npm test -- --testPathPattern=TransportedObjectCrud
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { handleCreateClass } from '../../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/high/handleDeleteClass';
import { handleGetClass } from '../../../../handlers/class/high/handleGetClass';
import { handleUpdateClass } from '../../../../handlers/class/high/handleUpdateClass';
import {
  configuredSystemKind,
  loadTestConfig,
  loadTestEnv,
} from '../../helpers/configHelpers';
import { NO_KIND_STATED } from '../../helpers/configuredSystemKind';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { skipRunningTest } from '../../helpers/runningTest';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../../helpers/sessionHelpers';
import {
  createHandlerContext,
  handlerAnswer,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('Transported Object CRUD (GitHub #11)', () => {
  const logger = createTestLogger('transport-crud');

  let connection: any;
  let session: SessionInfo;
  let transportRequest: string;
  let packageName: string;
  let className: string;
  let testEnabled = false;

  before(async () => {
    await loadTestEnv();

    const systemType = configuredSystemKind();
    if (systemType === undefined) {
      logger?.warn(`No system kind stated, the case skips: ${NO_KIND_STATED}`);
      return;
    }
    logger?.info(`System type: ${systemType}`);

    const config = loadTestConfig();
    const section = config?.create_transported_object;

    if (!section || section.enabled === false) {
      logger?.warn('create_transported_object is disabled in config');
      return;
    }

    if (!section.transport_request) {
      logger?.warn(
        'No transport_request in create_transported_object — skipping',
      );
      return;
    }

    if (!section.package_name) {
      logger?.warn('No package_name in create_transported_object — skipping');
      return;
    }

    transportRequest = String(section.transport_request).trim();
    packageName = String(section.package_name).trim();
    className = String(section.class_name || 'ZMCP_BLD_TRCLS').trim();

    logger?.info(
      `Transport: ${transportRequest}, Package: ${packageName}, Class: ${className}`,
    );

    const result = await createTestConnectionAndSession();
    connection = result.connection;
    session = result.session;
    testEnabled = true;
  });

  after(async () => {
    if (testEnabled && className && connection) {
      logger?.info(`Cleanup: deleting class ${className}`);
      try {
        const ctx = createHandlerContext({ connection, logger });
        await handleDeleteClass(ctx, {
          class_name: className,
          transport_request: transportRequest,
        });
        logger?.success(`Cleanup: class ${className} deleted`);
      } catch (e: any) {
        logger?.warn(`Cleanup class delete failed: ${e.message}`);
      }
    }
  });

  it('should CRUD a class in a transportable package', async () => {
    if (!testEnabled) {
      skipRunningTest('test not enabled or missing config');
      return;
    }

    // Step 1: Create class in transportable package
    logger?.info(
      `Step 1: Creating class ${className} in ${packageName}, TR ${transportRequest}`,
    );
    const createCtx = createHandlerContext({ connection, logger });
    const createResponse = await handleCreateClass(createCtx, {
      class_name: className,
      package_name: packageName,
      transport_request: transportRequest,
      description: 'MCP test class in transport (GitHub #11)',
    });

    assert.equal(createResponse.isError, false);
    // CreateClass's terse projection is `terseWrite`: on success it answers
    // the literal text "SUCCESS", not a JSON object — `success` no longer
    // exists to read (CHANGELOG Unreleased: "Terse writes answer the
    // literal string `SUCCESS` ... uniformly across every write tool"; see
    // projections.ts `terseWrite`).
    assert.equal(createResponse.content[0]?.text, 'SUCCESS');
    logger?.success(`Step 1: Class ${className} created`);

    // Step 2: Update the class source code (the critical operation — GitHub #11).
    // Before the reads, as adt-clients' class suite does: a class just
    // created has no version to read yet. Over RFC — one ABAP session for the
    // run — a read in the creating session answered 400 SADT_RESOURCE 007
    // "wrong input data" (on premise, 2026-09-26); after the first write it reads.
    logger?.info(`Step 2: Updating class source (TR: ${transportRequest})`);
    const updateCtx = createHandlerContext({ connection, logger });
    const newSource = `CLASS ${className} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD run.
    " Updated by MCP transport CRUD test
  ENDMETHOD.
ENDCLASS.`;

    // Activated, so the reads below see what was written: UpdateClass
    // leaves the source inactive unless asked, and the active version of a
    // class never activated is the generated shell.
    const updateResponse = await handleUpdateClass(updateCtx, {
      class_name: className,
      source_code: newSource,
      transport_request: transportRequest,
      activate: true,
    });

    assert.equal(updateResponse.isError, false);
    // UpdateClass's terse projection is `terseWrite` too — same literal
    // "SUCCESS" text, no `success` field (projections.ts `terseWrite`).
    assert.equal(updateResponse.content[0]?.text, 'SUCCESS');
    logger?.success('Step 2: UpdateClass in transport succeeded');

    // Step 3: Read the class (high-level GetClass)
    logger?.info('Step 3: Reading class via GetClass');
    const getCtx = createHandlerContext({ connection, logger });
    const getResponse = await handleGetClass(getCtx, {
      class_name: className,
    });

    assert.equal(getResponse.isError, false);
    const getData = handlerAnswer(
      getResponse,
      z.looseObject({ source: z.unknown(), success: z.unknown() }),
    );
    assert.equal(getData.success, true);
    // The source the update wrote, not the shell the create made.
    assert.ok(
      String(getData.source).includes('Updated by MCP transport CRUD test'),
    );
    logger?.success('Step 3: GetClass succeeded');

    // Step 4: Read the metadata (GetClass part metadata)
    logger?.info('Step 4: Reading class metadata via GetClass part metadata');
    const readCtx = createHandlerContext({ connection, logger });
    const readResponse = await handleGetClass(readCtx, {
      class_name: className,
      part: 'metadata',
    });

    assert.equal(readResponse.isError, false);
    const readData = handlerAnswer(
      readResponse,
      z.looseObject({ metadata: z.unknown(), success: z.unknown() }),
    );
    assert.equal(readData.success, true);
    assert.ok(readData.metadata !== undefined);
    logger?.success('Step 4: GetClass part metadata succeeded');

    // Step 5: Delete the class
    logger?.info(`Step 5: Deleting class ${className}`);
    const deleteCtx = createHandlerContext({ connection, logger });
    const deleteResponse = await handleDeleteClass(deleteCtx, {
      class_name: className,
      transport_request: transportRequest,
    });

    assert.equal(deleteResponse.isError, false);
    logger?.success('Step 5: DeleteClass succeeded');
    className = ''; // Prevent double-delete in afterAll
  });
});
