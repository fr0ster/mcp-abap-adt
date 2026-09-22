/**
 * Integration test: the five PR227 transport-object tools, end to end
 * (GitHub #221)
 *
 * AddTransportObject, CreateTransportTask, RemoveTransportObject,
 * ReadTransportActionLog and ReadTransportObjects only had schema-level unit
 * coverage before this file — nothing exercised them against a live SAP
 * system. This reproduces the same reattach/detach cycle that closed #221
 * (a deleted object's CTS entry blocking the same name from being created
 * again), on a fresh task under the pinned request so nothing here disturbs
 * shared test state.
 *
 * Scenario:
 *   1. CreateTransportTask under the pinned request, owned by the test user
 *   2. Create a program on the REQUEST (not the task — see the note below),
 *      then UpdateProgram to give it source
 *   2b. AddTransportObject — move the entry onto the task just created
 *   3. ReadTransportObjects — find its entry, capture `position`
 *   4. RemoveTransportObject — detach it
 *   5. ReadTransportObjects again — confirm the entry is actually gone (a
 *      200 from step 4 is not proof; the tool's own doc says so)
 *   6. AddTransportObject — reattach it (this is the operation
 *      AddTransportObject's own doc describes: "the way back from
 *      RemoveTransportObject, which leaves the object in no request at all")
 *   7. ReadTransportObjects again — confirm it is back
 *   8. ReadTransportActionLog — confirm the task's log recorded activity
 *
 * **`transport_number`/`transport_request` value by call — request or task:**
 *
 * The rule is: name the REQUEST everywhere, except the one call whose job
 * is to move an entry onto a specific TASK — `AddTransportObject` is the
 * only place a task number is the point of the call, not an
 * afterthought. Everything else addresses wherever the object actually is
 * at that moment, which starts as the request and becomes the task the
 * instant `AddTransportObject` succeeds.
 *
 *   - CreateTransportTask   `transport_number`  → REQUEST (`parentTransport`) — creates the task under it
 *   - CreateProgram         `transport_request` → REQUEST (`parentTransport`) — an object is born on the request
 *   - UpdateProgram         `transport_request` → REQUEST (`parentTransport`) — still there, not yet moved
 *   - AddTransportObject (step 2b) `transport_number` → TASK (`taskNumber`) — THE move: request → task
 *   - ReadTransportObjects (steps 3, 5, 7) `transport_number` → TASK (`taskNumber`) — the entry lives there now
 *   - RemoveTransportObject (step 4) `transport_number` → TASK (`taskNumber`) — same reason
 *   - AddTransportObject (step 6)   `transport_number` → TASK (`taskNumber`) — re-attaching to the same task
 *   - ReadTransportActionLog (step 8) `transport_number` → TASK (`taskNumber`)
 *   - DeleteProgram (cleanup)       `transport_request` → TASK (`taskNumber`) — where step 2b left it
 *
 * **Why a PROGRAM, not a CLASS.** An earlier version of this test used a
 * class and hit a real, reproducible SAP quirk: a class is not one CTS
 * entry, it is several (the class itself, R3TR CLAS, plus its definition
 * include, LIMU CLSD, and others), which made an already-confusing debugging
 * session harder to reason about. A program is a single R3TR PROG entry
 * with no split sub-objects.
 *
 * **Why step 2 creates on the REQUEST, and only step 2b names the task.**
 * A create/update's `transport_request` is always the REQUEST — the task is
 * what `AddTransportObject`/`RemoveTransportObject` address, to move an
 * object's entry onto (or off of) one, and there is nothing yet to move at
 * create time. An earlier version of this test passed the freshly created
 * TASK number straight to `CreateProgram`/`UpdateProgram` instead, on the
 * reasoning that the entry should land exactly where the test controls it.
 * `CreateProgram` answered `SUCCESS` for that every time — the object really
 * was created — but the very next `UpdateProgram`, addressing the same task
 * corrNr, reproducibly refused with `CTS_WBO_API 020`: *"Object R3TR PROG
 * <name> is already locked in request <parent>"*. Passing the request at
 * create/update time and moving the entry with `AddTransportObject`
 * afterward, as this version does, is the convention `AddTransportObject`'s
 * own doc already describes ("attach an EXISTING object to a transport
 * task") — an object is created on a request, then moved onto a task, never
 * created onto a task directly.
 *
 * **Status: step 2b itself is not yet passing.** With create/update correctly
 * on the request, `AddTransportObject(taskNumber, ...)` right afterward still
 * answers `400 SCTS_ADT_MSG 009` / `TK127`, the same garbled "is not a task"
 * text, even though `CreateTransportTask` minted `taskNumber` moments earlier
 * and nothing else has touched it since. Under active investigation; not yet
 * a settled finding the way the request-vs-task rule above is.
 *
 * **Why step 2 is immediately followed by an UpdateProgram, matching
 * TransportedObjectCrud.test.ts's own proven create-then-update pattern.**
 * Also measured live: a plain create leaves the object under a real SAP
 * ENQUEUE lock — SAP's own EU510 message says so plainly ("This object is
 * currently being edited ... (by an ENQUEUE lock)"), the same lock class
 * SE80/Eclipse ADT leaves on any freshly created Workbench object until an
 * editing session closes it out. A test that creates and then moves
 * straight on to other tools orphans that lock the moment the process
 * exits — SM12 was needed more than once to clear it by hand while this
 * test was being written, including once from a call that itself returned
 * a clean refusal (AddTransportObject's 400) rather than crashing — SAP's
 * own `useraction=addobject`/`removeobject` handlers appear to take the
 * same ENQUEUE lock before they validate the request, and do not release
 * it on that validation failing. That specific gap is now closed at the
 * source: `isMutatingToolName` in `src/lib/criticalSection.ts` did not
 * recognize `AddTransportObject`/`RemoveTransportObject` as mutating tools
 * (its regex only matched `Create`/`Update`/`Delete`), so neither tool got
 * the critical-section protection that keeps a slow request from being
 * abandoned mid-flight and orphaning the lock it took. Fixed alongside this
 * test. UpdateProgram's own lock/write/unlock cycle is still what reliably
 * closes a create's lock out in the ordinary case, which is why every other
 * CRUD-style integration test in this repository already does a create
 * followed by an update rather than a bare create.
 *
 * Cleanup: delete the test program, then delete the task itself (ADT accepts
 * deleting a request/task only while empty — adt-clients's AdtRequest.delete
 * doc) so nothing accumulates on the pinned request across runs.
 *
 * Prerequisites (test-config.yaml `environment`):
 *   - default_transport: an existing, unreleased request (pinned — see #221)
 *   - default_package: a transportable package
 *   - SAP_USERNAME must be set in the configured env file — CreateTransportTask
 *     requires a target_user and the server will not choose one
 *
 * Run: npm test -- --testPathPattern=TransportObjectToolsCrud
 */

import { handleCreateProgram } from '../../../../handlers/program/high/handleCreateProgram';
import { handleDeleteProgram } from '../../../../handlers/program/high/handleDeleteProgram';
import { handleUpdateProgram } from '../../../../handlers/program/high/handleUpdateProgram';
import { handleAddTransportObject } from '../../../../handlers/transport/high/handleAddTransportObject';
import { handleCreateTransportTask } from '../../../../handlers/transport/high/handleCreateTransportTask';
import { handleRemoveTransportObject } from '../../../../handlers/transport/high/handleRemoveTransportObject';
import { handleReadTransportActionLog } from '../../../../handlers/transport/readonly/handleReadTransportActionLog';
import { handleReadTransportObjects } from '../../../../handlers/transport/readonly/handleReadTransportObjects';
import { createAdtClient } from '../../../../lib/clients';
import {
  getOperationDelay,
  getTimeout,
  loadTestConfig,
  loadTestEnv,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import {
  OBJECT_URIS,
  releaseObjectLockIfHeld,
  sapIsConfigured,
  systemUserName,
} from '../../helpers/objectLocks';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../../helpers/sessionHelpers';
import {
  createHandlerContext,
  delay,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

/** Asserts a handler response is not an error, logging its content first if it is. */
function expectOk(
  response: any,
  label: string,
  logger: ReturnType<typeof createTestLogger>,
) {
  if (response.isError) {
    logger?.warn(`${label} FAILED: ${JSON.stringify(response.content)}`);
  }
  expect(response.isError).toBe(false);
}

describe('Transport object tools end to end (GitHub #221, PR227)', () => {
  const logger = createTestLogger('transport-object-tools');

  let connection: any;
  let session: SessionInfo;
  let parentTransport = '';
  let packageName = '';
  let targetUser = '';
  // Unique per run: reusing a fixed name across repeated local runs is what
  // produced this file's own #221-shaped incident — a deleted object's CTS
  // entry stayed attached to the pinned request/task, and creating the same
  // name again under a different task was refused (CTS_WBO_API 020) until
  // detached by hand with RemoveTransportObject. A fresh name each run avoids
  // colliding with that history instead of relying on cleanup being perfect.
  const programName = `ZMCP_BLD_TR${Date.now().toString(36).toUpperCase().slice(-6)}`;
  let taskNumber = '';
  let testEnabled = false;
  let skipReason = '';

  beforeAll(async () => {
    await loadTestEnv();

    const config = loadTestConfig();
    parentTransport = String(
      config?.environment?.default_transport || '',
    ).trim();
    packageName = String(config?.environment?.default_package || '').trim();

    // **A skip that reads as a pass is the failure this block is about.**
    //
    // This warned and returned for a missing transport, package or user, and
    // jest printed `1 passed` for a run that had done nothing. Measured on a
    // cloud session, where the suite is structurally unable to run at all —
    // step 2 creates a PROGRAM and ABAP Cloud has none — it reported green.
    //
    // Three cases, and they are not the same thing:
    //
    //  1. **No system.** A legitimate skip, and the only one.
    //  2. **A system that keeps no transports.** `default_transport: ""` is a
    //     supported setup, documented in the template for `$TMP` and local
    //     packages — this suite simply does not apply there. A skip too, but
    //     one that says which system it met rather than listing fields.
    //  3. **A system that transports, and a suite that cannot name an owner.**
    //     That is a fault: `CreateTransportTask` will not guess a user, the
    //     server resolves an empty owner and refuses, and quietly skipping
    //     would hide a real gap behind the same green as case 1.
    //
    // Every skip is logged with ⏭️ and its reason, because the run says
    // `passed` either way and the log is the only place the difference
    // survives.
    if (!sapIsConfigured()) {
      skipReason = 'no SAP_URL — there is no system to run against';
      logger?.warn(`⏭️ SKIPPED — ${skipReason}`);
      return;
    }

    if (!parentTransport || !packageName) {
      skipReason =
        `this system keeps no transport for the suite to work in ` +
        `(default_transport="${parentTransport}", default_package="${packageName}") ` +
        "— a local-package setup, where a request's object list has nothing to hold";
      logger?.warn(`⏭️ SKIPPED — ${skipReason}`);
      return;
    }

    const result = await createTestConnectionAndSession();
    connection = result.connection;
    session = result.session;

    // The owner the task will belong to. `SAP_USERNAME` is the configured
    // answer and wins where it is set; a JWT session has none, so the system
    // is asked — `/sap/bc/adt/core/http/systeminformation` is a cloud
    // endpoint and answers nothing on-premise, which is exactly the gap it
    // fills. Without this the suite skipped invisibly on every cloud run.
    targetUser = String(process.env.SAP_USERNAME || '').trim();
    if (!targetUser) {
      targetUser = (await systemUserName(connection, logger)) ?? '';
    }
    if (!targetUser) {
      throw new Error(
        'this system transports, but no user could be named for the task: ' +
          'SAP_USERNAME is unset and systeminformation answered none. ' +
          'CreateTransportTask will not guess one — the server resolves an ' +
          'empty owner and refuses — so this is a fault, not a skip.',
      );
    }

    logger?.info(
      `Parent transport: ${parentTransport}, package: ${packageName}, user: ${targetUser}`,
    );
    testEnabled = true;
  }, getTimeout('long'));

  afterAll(async () => {
    if (!testEnabled || !connection) return;

    if (programName) {
      try {
        // Release before deleting, the way `LowTester`'s own cleanup does:
        // a delete aimed at a locked object is refused, and that refusal was
        // being logged and accepted — the object stayed, and so did the lock.
        await releaseObjectLockIfHeld(
          connection,
          OBJECT_URIS.program(programName),
          programName,
          logger,
        );
        const ctx = createHandlerContext({ connection, logger });
        const deleteResponse = await handleDeleteProgram(ctx, {
          program_name: programName,
          transport_request: taskNumber || parentTransport,
        });
        // `handleDeleteProgram` answers `{isError, content}` on an ADT-level
        // refusal — it does not throw — so a bare `await` inside this
        // try/catch does not notice a refusal (a stale enqueue lock still
        // held, for instance). Checking `isError` here is what a previous
        // version of this test skipped, which is why it once logged a false
        // "deleted" while the object was still stuck locked on SAP's side.
        if (deleteResponse.isError) {
          logger?.warn(
            `Cleanup: program ${programName} delete refused — ${JSON.stringify(deleteResponse.content)}`,
          );
        } else {
          logger?.success(`Cleanup: program ${programName} deleted`);
        }
      } catch (e: any) {
        logger?.warn(`Cleanup program delete failed: ${e.message}`);
      }
    }

    if (taskNumber) {
      try {
        // **Detaching comes before deleting, and this suite of all suites
        // should know it.** Deleting the program does not empty the task: the
        // object-directory entry stays, deliberately, so that transporting
        // the task deletes the object in the target system too — which is
        // the whole premise of #221 and of the tools under test here. A task
        // that still holds an entry is not deletable, so the old cleanup
        // logged "may not be empty" and left it, and every run added one
        // more.
        //
        // So the cleanup uses the tool it exists to test: read what the task
        // holds, detach each entry, read again to see it gone, and only then
        // ask for the task. `accepted` from a removal is not evidence — the
        // re-read is, exactly as the scenario above asserts it.
        const readCtx = createHandlerContext({ connection, logger });
        const held = parseHandlerResponse(
          await handleReadTransportObjects(readCtx, {
            transport_number: taskNumber,
          }),
        );
        for (const entry of held?.objects ?? []) {
          if (!entry?.position) {
            logger?.warn(
              `Cleanup: ${entry?.name} is listed without a position — cannot detach it`,
            );
            continue;
          }
          await handleRemoveTransportObject(
            createHandlerContext({ connection, logger }),
            {
              transport_number: taskNumber,
              object_name: entry.name,
              object_type: entry.type,
              position: entry.position,
              ...(entry.pgmid ? { pgmid: entry.pgmid } : {}),
            },
          );
          logger?.info(`Cleanup: detached ${entry.type} ${entry.name}`);
        }

        const left = parseHandlerResponse(
          await handleReadTransportObjects(
            createHandlerContext({ connection, logger }),
            { transport_number: taskNumber },
          ),
        );
        if ((left?.count ?? 0) > 0) {
          logger?.warn(
            `Cleanup: task ${taskNumber} still holds ${left.count} entr(y|ies) — not deleting it, left for manual review`,
          );
          return;
        }

        const deleted = await createAdtClient(connection, logger)
          .getRequest()
          .delete({ transportNumber: taskNumber } as any);
        if (deleted.ok) {
          logger?.success(`Cleanup: task ${taskNumber} deleted`);
        } else {
          logger?.warn(
            `Cleanup: task ${taskNumber} is empty but was not deleted — ${deleted.getError().message}`,
          );
        }
      } catch (e: any) {
        logger?.warn(`Cleanup task delete failed: ${e.message}`);
      }
    }
  }, getTimeout('long'));

  it(
    'creates a task, adds/removes/re-adds an object, and confirms via log + re-reads',
    async () => {
      if (!testEnabled) {
        // The only reason to be here is the one `beforeAll` allows: no SAP.
        // Everything else threw there, which is why this needs no second
        // list of conditions.
        logger?.warn(`⏭️ SKIPPED — ${skipReason || 'no system'}`);
        return;
      }

      // **Everything below runs inside a `finally` that drops the lock.**
      //
      // `expectOk` throws on a refusal, and there is a window where a throw
      // leaves a real ENQUEUE lock behind: `CreateProgram` takes one (SAP's
      // own EU510 says so) and `UpdateProgram`'s lock/write/unlock is what
      // closes it. A failure between them — or in any later step — used to
      // end the run with the object stuck, and `afterAll`'s delete then met
      // that lock and logged its own refusal. SM12 by hand was the rest of
      // the procedure.
      //
      // Releasing costs two requests and only acts when a lock is actually
      // held, so a passing run pays nothing.
      try {
        // Step 1: task under the pinned request
        logger?.info(
          `Step 1: CreateTransportTask under ${parentTransport} for ${targetUser}`,
        );
        const taskCtx = createHandlerContext({ connection, logger });
        const taskResponse = await handleCreateTransportTask(taskCtx, {
          transport_number: parentTransport,
          target_user: targetUser,
        });

        expectOk(taskResponse, 'Step 1 CreateTransportTask', logger);
        const taskData = parseHandlerResponse(taskResponse);
        expect(taskData.success).toBe(true);
        expect(taskData.task_number).toBeTruthy();
        taskNumber = taskData.task_number;
        logger?.success(`Step 1: task ${taskNumber} created`);

        await delay(getOperationDelay('create'));

        // Step 2: create a program on the REQUEST, not the task.
        //
        // A plain create/edit always takes the REQUEST as its corrNr — the
        // task is what AddTransportObject/RemoveTransportObject address
        // afterward, to move an object's entry onto (or off of) one. The
        // object does not exist yet at create time, so there is nothing yet
        // to add to a task; the request is the only thing to name.
        logger?.info(
          `Step 2: creating program ${programName} on request ${parentTransport}`,
        );
        const createCtx = createHandlerContext({ connection, logger });
        const createResponse = await handleCreateProgram(createCtx, {
          program_name: programName,
          package_name: packageName,
          transport_request: parentTransport,
          description: 'MCP test program for transport-object-tools (#221)',
        });

        expectOk(createResponse, 'Step 2 CreateProgram', logger);
        expect(createResponse.content[0]?.text).toBe('SUCCESS');
        logger?.success(
          `Step 2: program ${programName} created on ${parentTransport}`,
        );

        await delay(getOperationDelay('create'));

        // Step 2a: set source via UpdateProgram, same request. Its
        // lock/write/unlock cycle is what closes out the ENQUEUE lock
        // CreateProgram leaves behind (see the file header). Skipping this
        // orphaned SM12 entries more than once while this test was being
        // written.
        logger?.info(`Step 2a: UpdateProgram — closing out the create lock`);
        const updateCtx = createHandlerContext({ connection, logger });
        const updateResponse = await handleUpdateProgram(updateCtx, {
          program_name: programName,
          transport_request: parentTransport,
          source_code: `REPORT ${programName.toLowerCase()}.`,
        });
        expectOk(updateResponse, 'Step 2a UpdateProgram', logger);
        logger?.success('Step 2a: UpdateProgram succeeded, lock closed out');

        await delay(getOperationDelay('update'));

        // Step 2b: AddTransportObject — move the entry onto the task. This
        // is the tool's own documented purpose: "attach an EXISTING object
        // to a transport task" — the object exists now (steps 2-2a), and it
        // currently sits wherever the request put it, not yet on our task.
        logger?.info(
          `Step 2b: AddTransportObject — moving entry onto ${taskNumber}`,
        );
        const firstAddCtx = createHandlerContext({ connection, logger });
        const firstAddResponse = await handleAddTransportObject(firstAddCtx, {
          transport_number: taskNumber,
          object_name: programName,
          object_type: 'PROG',
        });
        expectOk(firstAddResponse, 'Step 2b AddTransportObject', logger);
        const firstAddData = parseHandlerResponse(firstAddResponse);
        expect(firstAddData.accepted).toBe(true);
        logger?.success('Step 2b: AddTransportObject accepted');

        await delay(getOperationDelay('update'));

        // Step 3: ReadTransportObjects — find the entry, capture its position
        logger?.info('Step 3: ReadTransportObjects — locating the entry');
        const readCtx1 = createHandlerContext({ connection, logger });
        const readResponse1 = await handleReadTransportObjects(readCtx1, {
          transport_number: taskNumber,
        });

        expectOk(readResponse1, 'Step 3 ReadTransportObjects', logger);
        const readData1 = parseHandlerResponse(readResponse1);
        expect(readData1.success).toBe(true);
        const entry1 = readData1.objects.find(
          (o: any) => o.name === programName && o.type === 'PROG',
        );
        expect(entry1).toBeDefined();
        expect(entry1.position).toBeTruthy();
        const position = entry1.position as string;
        logger?.success(`Step 3: found entry at position ${position}`);

        // Step 4: RemoveTransportObject
        logger?.info(`Step 4: RemoveTransportObject at position ${position}`);
        const removeCtx = createHandlerContext({ connection, logger });
        const removeResponse = await handleRemoveTransportObject(removeCtx, {
          transport_number: taskNumber,
          object_name: programName,
          object_type: 'PROG',
          position,
        });

        expectOk(removeResponse, 'Step 4 RemoveTransportObject', logger);
        const removeData = parseHandlerResponse(removeResponse);
        expect(removeData.accepted).toBe(true);
        logger?.success('Step 4: RemoveTransportObject accepted');

        await delay(getOperationDelay('update'));

        // Step 5: re-read — the tool's own doc says a 200 above is not proof
        logger?.info('Step 5: ReadTransportObjects — confirming removal');
        const readCtx2 = createHandlerContext({ connection, logger });
        const readResponse2 = await handleReadTransportObjects(readCtx2, {
          transport_number: taskNumber,
        });

        expectOk(readResponse2, 'Step 5 ReadTransportObjects', logger);
        const readData2 = parseHandlerResponse(readResponse2);
        const entry2 = readData2.objects.find(
          (o: any) => o.name === programName && o.type === 'PROG',
        );
        expect(entry2).toBeUndefined();
        logger?.success('Step 5: entry confirmed removed');

        // Step 6: AddTransportObject — reattach it
        logger?.info('Step 6: AddTransportObject — reattaching');
        const addCtx = createHandlerContext({ connection, logger });
        const addResponse = await handleAddTransportObject(addCtx, {
          transport_number: taskNumber,
          object_name: programName,
          object_type: 'PROG',
        });

        expectOk(addResponse, 'Step 6 AddTransportObject', logger);
        const addData = parseHandlerResponse(addResponse);
        expect(addData.accepted).toBe(true);
        logger?.success('Step 6: AddTransportObject accepted');

        await delay(getOperationDelay('update'));

        // Step 7: re-read — confirm it is back
        logger?.info('Step 7: ReadTransportObjects — confirming re-attachment');
        const readCtx3 = createHandlerContext({ connection, logger });
        const readResponse3 = await handleReadTransportObjects(readCtx3, {
          transport_number: taskNumber,
        });

        expectOk(readResponse3, 'Step 7 ReadTransportObjects', logger);
        const readData3 = parseHandlerResponse(readResponse3);
        const entry3 = readData3.objects.find(
          (o: any) => o.name === programName && o.type === 'PROG',
        );
        expect(entry3).toBeDefined();
        logger?.success('Step 7: entry confirmed back on the task');

        // Step 8: ReadTransportActionLog — confirm the task recorded activity
        logger?.info('Step 8: ReadTransportActionLog');
        const logCtx = createHandlerContext({ connection, logger });
        const logResponse = await handleReadTransportActionLog(logCtx, {
          transport_number: taskNumber,
        });

        expectOk(logResponse, 'Step 8 ReadTransportActionLog', logger);
        const logData = parseHandlerResponse(logResponse);
        expect(logData.success).toBe(true);
        expect(logData.count).toBeGreaterThan(0);
        expect(Array.isArray(logData.entries)).toBe(true);
        logger?.success(
          `Step 8: action log has ${logData.count} entr${logData.count === 1 ? 'y' : 'ies'}`,
        );
      } finally {
        await releaseObjectLockIfHeld(
          connection,
          OBJECT_URIS.program(programName),
          programName,
          logger,
        );
      }
    },
    getTimeout('long'),
  );
});
