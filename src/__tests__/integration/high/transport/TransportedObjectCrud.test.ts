import * as z from 'zod';
/**
 * Integration test: CRUD on objects assigned to a transport request
 *
 * Reproduces the issue from GitHub #11: editing objects in unreleased
 * transports fails on legacy systems (and possibly on-prem).
 *
 * Scenario:
 *   0. CreateTransport: a workbench request of the test's own
 *   1. Create a class of the run's own name in the transportable package,
 *      recorded on that request
 *   2. Update the class source code (activated)
 *   3. Read the class source (GetClass)
 *   4. Read the class metadata (GetClass part metadata)
 *   5. Delete the class
 *   6. GetClass again: the class is gone
 *
 * The request's transport target is `create_transported_object.target_system`:
 * on premise it is required (CreateTransport without one creates the request
 * with target LOCAL, and SAP refuses to record the package's class on it —
 * 403 CTS_WBO_API 048, measured), and the case skips naming the key without
 * it; on the cloud it is optional (LOCAL is accepted there, measured).
 *
 * The request is never released and never deleted: it stays in the system
 * (the deleted class's entry stays on it, so every run takes a fresh class
 * name). The configured `environment.default_transport` is not used.
 *
 * The package is `environment.default_package`, which must be the system's
 * transportable development package (on premise ZAC_TEST_PKG, on the cloud
 * ZADT_BLD_PKG03), checked before anything is created; on another system
 * kind the case skips and says why.
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { handleCreateClass } from '../../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/high/handleDeleteClass';
import { handleGetClass } from '../../../../handlers/class/high/handleGetClass';
import { handleUpdateClass } from '../../../../handlers/class/high/handleUpdateClass';
import { handleCreateTransport } from '../../../../handlers/transport/high/handleCreateTransport';
import {
  configuredSystemKind,
  loadTestConfig,
  loadTestEnv,
  resolvePackageName,
} from '../../helpers/configHelpers';
import { NO_KIND_STATED } from '../../helpers/configuredSystemKind';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { skipRunningTest } from '../../helpers/runningTest';
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
import { createHandlerContext, handlerAnswer } from '../../helpers/testHelpers';

/** The transportable development package of each system kind it runs on. */
const TRANSPORTABLE: Readonly<Record<'onprem' | 'cloud', string>> = {
  onprem: 'ZAC_TEST_PKG',
  cloud: 'ZADT_BLD_PKG03',
};

/** The run's own class: a deleted class's entry stays on its request. */
const CLASS_NAME = `ZMCP_BLD_TR${randomBytes(2).toString('hex').toUpperCase()}`;

describe('Transported Object CRUD (GitHub #11)', () => {
  const logger = createTestLogger('transport-crud');

  let connection:
    | Awaited<ReturnType<typeof createTestConnectionAndSession>>['connection']
    | undefined;
  /** The request the test created; never released, never deleted. */
  let transportRequest = '';
  let packageName = '';
  /** The request's transport target; `undefined` sends none. */
  let targetSystem: string | undefined;
  /** The class while it may exist; emptied once deleted. */
  let className = '';
  /** Why the case skips: no system kind stated, or one it does not run on. */
  let skipReason = 'the test config was not read';

  before(async () => {
    await loadTestEnv();

    const systemType = configuredSystemKind();
    if (systemType === undefined) {
      skipReason = NO_KIND_STATED;
      return;
    }
    if (systemType !== 'onprem' && systemType !== 'cloud') {
      skipReason = `no transportable package is known for a ${systemType} system`;
      return;
    }
    logger?.info(`System type: ${systemType}`);

    const target =
      loadTestConfig().create_transported_object?.target_system?.trim() ?? '';
    if (systemType === 'onprem' && target === '') {
      skipReason =
        'create_transported_object.target_system is not set: on premise the request needs the transport target of the package';
      return;
    }
    targetSystem = target === '' ? undefined : target;

    // The package guard, before anything is created.
    const accepted = TRANSPORTABLE[systemType];
    if (resolvePackageName().trim().toUpperCase() !== accepted) {
      throw new Error(`the package is not ${accepted}: nothing is created`);
    }
    packageName = accepted;

    const result = await createTestConnectionAndSession();
    connection = result.connection;
  });

  after(async () => {
    if (className && connection) {
      logger?.info(`Cleanup: deleting class ${className}`);
      try {
        const ctx = createHandlerContext({ connection, logger });
        await handleDeleteClass(ctx, {
          class_name: className,
          transport_request: transportRequest,
        });
        logger?.success(`Cleanup: class ${className} deleted`);
      } catch (e) {
        logger?.warn(
          `Cleanup class delete failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  });

  it('should CRUD a class in a transportable package', async () => {
    if (connection === undefined) {
      skipRunningTest(skipReason);
      return;
    }

    // Step 0: a request of the test's own (never the configured one)
    logger?.info("Step 0: Creating a workbench request of the test's own");
    const requestResponse = await handleCreateTransport(
      createHandlerContext({ connection, logger }),
      {
        transport_type: 'workbench',
        description: 'MCP test: transported object CRUD (GitHub #11)',
        target_system: targetSystem,
      },
    );
    assert.equal(
      requestResponse.isError,
      false,
      JSON.stringify(requestResponse.content),
    );
    transportRequest = handlerAnswer(
      requestResponse,
      z.looseObject({ transport_number: z.string().min(1) }),
    ).transport_number;
    logger?.success(`Step 0: request ${transportRequest} created`);

    // Step 1: Create class in transportable package, recorded on the request
    className = CLASS_NAME;
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

    assert.equal(
      createResponse.isError,
      false,
      JSON.stringify(createResponse.content),
    );
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

    assert.equal(
      updateResponse.isError,
      false,
      JSON.stringify(updateResponse.content),
    );
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

    assert.equal(
      getResponse.isError,
      false,
      JSON.stringify(getResponse.content),
    );
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

    assert.equal(
      readResponse.isError,
      false,
      JSON.stringify(readResponse.content),
    );
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

    assert.equal(
      deleteResponse.isError,
      false,
      JSON.stringify(deleteResponse.content),
    );
    logger?.success('Step 5: DeleteClass succeeded');
    className = ''; // Prevent double-delete in after

    // Step 6: read back absent
    const goneResponse = await handleGetClass(
      createHandlerContext({ connection, logger }),
      { class_name: CLASS_NAME },
    );
    assert.equal(
      goneResponse.isError,
      true,
      `${CLASS_NAME} still reads after DeleteClass`,
    );
    logger?.success(`Step 6: ${CLASS_NAME} reads absent`);
  });
});
