/**
 * The root and child view entities a RAP suite owns.
 *
 * **Why a suite owns them at all.** A behavior definition must carry its root
 * entity's name — RAP gives no way to name it anything else — so a suite that
 * creates and deletes a BDEF cannot define it over a shared entity: the BDEF
 * would have to borrow that entity's `ZMCP_SHR_*` name, and a test that
 * creates and deletes an object under a shared name is a test that can lock a
 * shared name out. That is exactly what happened: one run left an ENQUEUE lock
 * on `ZMCP_SHR_I_BDFL`, and every later run of either BDEF suite was refused,
 * while nothing in ADT could release it.
 *
 * So each tier creates its own root view under `ZMCP_BLD_I_*` and deletes it in
 * cleanup. The tables underneath stay shared and are only read from.
 *
 * **One standalone view, not a root/child pair.** The first attempt gave each
 * tier a root composing a child and the child associating back — and neither
 * could then be deleted: ADT answers *"Used by 1 other DDIC object"* to both,
 * in both directions. Untangling them took rewriting both sources standalone,
 * activating them, and only then deleting. A fixture a suite cannot delete is a
 * fixture that accumulates, so the pair is gone and the BDEF defines behavior
 * for one entity.
 *
 * Three rules this module exists to keep, in the order they matter:
 *
 * 1. **Never reuse a name.** Each tier's views, BDEF and class are its own.
 * 2. **Ask before creating.** `assertNameAvailable` reads ADT's validation and
 *    refuses to continue when the name is taken, instead of finding out from a
 *    create that half-succeeds.
 * 3. **Every lock is released.** `writeViewSource` pairs its lock with an
 *    unlock and fails the test when the unlock is refused — an unreleased lock
 *    poisons every later run, and a warning does not say so.
 */

import { handleActivateObject } from '../../../handlers/common/low/handleActivateObject';
import { handleCreateDdl } from '../../../handlers/ddl/low/handleCreateDdl';
import { handleDeleteDdl } from '../../../handlers/ddl/low/handleDeleteDdl';
import { handleLockDdl } from '../../../handlers/ddl/low/handleLockDdl';
import { handleUnlockDdl } from '../../../handlers/ddl/low/handleUnlockDdl';
import { handleUpdateDdl } from '../../../handlers/ddl/low/handleUpdateDdl';
import { handleValidateDdl } from '../../../handlers/ddl/low/handleValidateDdl';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  extractErrorMessage,
  extractLockHandle,
  parseHandlerResponse,
} from './testHelpers';

/** What a handler answers, as these tests read it. */
interface HandlerAnswer {
  isError: boolean;
  content: { type: string; text: string }[];
}

export interface ViewFixture {
  name: string;
  description: string;
  source: string;
}

/**
 * Refuse to create anything under a name ADT does not report as free.
 *
 * `terseValidation` answers `{ admissible }`, and `admissible: false` is how a
 * name that already exists — or is locked, or is not allowed in this package —
 * arrives. A run that ignores it creates half an object and reports the trouble
 * three steps later, where it reads like something else.
 */
export async function assertNameAvailable(
  label: string,
  run: () => Promise<unknown>,
): Promise<void> {
  const answer = (await run()) as HandlerAnswer;
  if (answer?.isError) {
    throw new Error(
      `${label}: the name could not be validated: ${extractErrorMessage(answer)}`,
    );
  }
  const payload = parseHandlerResponse(answer) as {
    admissible?: boolean;
    message?: unknown;
  };
  if (payload?.admissible === false) {
    throw new Error(
      `${label}: the name is NOT available — ${JSON.stringify(payload.message ?? payload)}. ` +
        'Something was left behind by an earlier run, or the name belongs to another object.',
    );
  }
}

/**
 * Write a view's source under a lock of its own, and release it.
 *
 * The release is checked: `UnlockDdlLow` wants the `session_id` the lock
 * answered with — an empty one is refused — and a refused unlock leaves the
 * object locked with nothing said. Both outcomes are collected so a failed
 * write and an unreleased lock can be reported together; neither hides the
 * other.
 */
async function writeViewSource(
  context: HandlerContext,
  view: ViewFixture,
  transportRequest?: string,
): Promise<void> {
  const locked = (await handleLockDdl(context, {
    ddl_name: view.name,
  })) as HandlerAnswer;
  if (locked.isError) {
    throw new Error(`lock ${view.name}: ${extractErrorMessage(locked)}`);
  }
  const lockData = parseHandlerResponse(locked);
  const lockHandle = extractLockHandle(lockData);
  const sessionId = String(
    (lockData as { session_id?: unknown })?.session_id ?? '',
  );
  if (!sessionId) {
    throw new Error(
      `lock ${view.name} answered no session_id, so the lock it took cannot be released — refusing to write under it.`,
    );
  }

  const failures: string[] = [];
  try {
    const written = (await handleUpdateDdl(context, {
      ddl_name: view.name,
      ddl_source: view.source,
      lock_handle: lockHandle,
      ...(transportRequest && { transport_request: transportRequest }),
    })) as HandlerAnswer;
    if (written.isError) {
      failures.push(`write refused: ${extractErrorMessage(written)}`);
    }
  } catch (error: unknown) {
    failures.push(`write threw: ${(error as Error)?.message ?? String(error)}`);
  }
  try {
    const released = (await handleUnlockDdl(context, {
      ddl_name: view.name,
      lock_handle: lockHandle,
      session_id: sessionId,
    })) as HandlerAnswer;
    if (released.isError) {
      failures.push(
        `the lock was NOT released and stays on ${view.name}: ${extractErrorMessage(released)}`,
      );
    }
  } catch (error: unknown) {
    failures.push(
      `the lock was NOT released and stays on ${view.name}: ${(error as Error)?.message ?? String(error)}`,
    );
  }
  if (failures.length > 0) {
    throw new Error(`${view.name}: ${failures.join('; ')}`);
  }
}

/**
 * Create the view the BDEF is defined over, write its source and activate it.
 */
export async function createView(
  context: HandlerContext,
  view: ViewFixture,
  packageName: string,
  transportRequest: string | undefined,
  logger?: { info?: (message: string) => void },
): Promise<void> {
  await assertNameAvailable(`view ${view.name}`, () =>
    handleValidateDdl(context, {
      ddl_name: view.name,
      package_name: packageName,
      description: view.description,
    }),
  );

  logger?.info?.(`   * create view: ${view.name}`);
  const created = (await handleCreateDdl(context, {
    ddl_name: view.name,
    description: view.description,
    package_name: packageName,
    ...(transportRequest && { transport_request: transportRequest }),
  })) as HandlerAnswer;
  if (created.isError) {
    throw new Error(
      `create view ${view.name}: ${extractErrorMessage(created)}`,
    );
  }
  await writeViewSource(context, view, transportRequest);
  logger?.info?.(`   + view ${view.name} created with its source`);

  logger?.info?.(`   * activate view: ${view.name}`);
  const activated = (await handleActivateObject(context, {
    objects: [{ name: view.name.toUpperCase(), type: 'DDLS/DF' }],
  })) as HandlerAnswer;
  if (activated.isError) {
    throw new Error(
      `activate view ${view.name}: ${extractErrorMessage(activated)}`,
    );
  }
  // **`isError: false` is not "activated".** ADT answers an activation with
  // `200` whether or not it did anything, and the projection says which it was:
  // `activated: true` when the server stated it, `activation_not_stated` when
  // the answer carried an inactive-objects list instead. Reading only `isError`
  // logged "activated" over a view that was still inactive, and the next step —
  // the BDEF's own validation — was what noticed, with *"The referenced STOB
  // object … does not exist"*.
  const verdict = parseHandlerResponse(activated) as {
    activated?: boolean;
    activation_not_stated?: boolean;
  };
  if (verdict?.activated !== true) {
    throw new Error(
      `activate view ${view.name}: the server did not state an activation — ${JSON.stringify(verdict).substring(0, 600)}`,
    );
  }
  logger?.info?.(`   + view ${view.name} activated`);
}

/**
 * Delete the view in cleanup. Returns what could not be deleted rather than
 * throwing, so a caller can report every leftover at once.
 */
export async function deleteView(
  context: HandlerContext,
  view: ViewFixture,
  transportRequest: string | undefined,
  logger?: { info?: (message: string) => void; error?: (m: string) => void },
): Promise<string[]> {
  try {
    const deleted = (await handleDeleteDdl(context, {
      ddl_name: view.name,
      ...(transportRequest && { transport_request: transportRequest }),
    })) as HandlerAnswer;
    if (deleted.isError) {
      const detail = extractErrorMessage(deleted);
      // A view the run never got as far as creating is not a leftover.
      if (/does not exist|not found|404/i.test(detail)) {
        logger?.info?.(`view ${view.name} was not there`);
        return [];
      }
      logger?.error?.(`Delete view ${view.name} refused: ${detail}`);
      return [`view ${view.name}: ${detail}`];
    }
    logger?.info?.(`Deleted view ${view.name}`);
    return [];
  } catch (error: unknown) {
    const message = (error as Error)?.message ?? String(error);
    if (/does not exist|not found|404/i.test(message)) return [];
    logger?.error?.(`Delete view ${view.name} threw: ${message}`);
    return [`view ${view.name}: ${message}`];
  }
}
