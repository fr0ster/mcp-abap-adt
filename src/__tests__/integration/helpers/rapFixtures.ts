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
import { handleGetInactiveObjects } from '../../../handlers/system/readonly/handleGetInactiveObjects';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  delay,
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
  // Same confirmation as the group activation below: the answer says what the
  // server stated, `GetInactiveObjects` says what is true, and activation is
  // asynchronous. Reading only `isError` here logged "activated" over a view
  // that was still inactive, and the BDEF's validation was what noticed, with
  // *"The referenced STOB object … does not exist"*.
  await activateAndConfirm(
    context,
    [{ name: view.name, type: 'DDLS/DF' }],
    logger,
  );
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

/** One object as an activation names it. */
export interface ActivationTarget {
  name: string;
  type: string;
}

/**
 * Which of these objects the system still lists as inactive.
 *
 * `GetInactiveObjects` is the member for it, and this is the second request the
 * activation projection tells a caller to make: the activation document says
 * what the server stated, and only a read of the system says what is true.
 */
export async function stillInactive(
  context: HandlerContext,
  targets: ActivationTarget[],
): Promise<string[]> {
  const answer = (await handleGetInactiveObjects(context, {})) as HandlerAnswer;
  if (answer.isError) {
    throw new Error(
      `could not read the inactive objects: ${extractErrorMessage(answer)}`,
    );
  }
  const payload = parseHandlerResponse(answer) as {
    objects?: { name?: string; type?: string }[];
  };
  const listed = new Set(
    (payload?.objects ?? []).map((o) => String(o?.name ?? '').toUpperCase()),
  );
  return targets
    .map((t) => t.name.toUpperCase())
    .filter((name) => listed.has(name));
}

/**
 * Activate these objects together, and then confirm from the system that they
 * are active.
 *
 * **Two reasons the answer alone will not do.** The group endpoint reports that
 * the request was accepted — for several objects it answers an
 * `ioc:inactiveObjects` list rather than a checklist with a verdict, so
 * `isError: false` says nothing about either object having activated; and
 * activation is asynchronous, so even a stated success can be ahead of the
 * system. A suite that logs "group activation completed" off that answer passes
 * green over a failed activation, which is the defect this exists to close.
 *
 * So: refuse an answer carrying error messages, then poll `GetInactiveObjects`
 * until neither object is listed. The poll is what makes this a measurement
 * rather than a hope.
 */
export async function activateAndConfirm(
  context: HandlerContext,
  targets: ActivationTarget[],
  logger?: { info?: (message: string) => void; warn?: (m: string) => void },
  attempts = 8,
  waitMs = 2000,
): Promise<void> {
  const label = targets.map((t) => t.name).join(' + ');
  const activation = (await handleActivateObject(context, {
    objects: targets.map((t) => ({ name: t.name.toUpperCase(), type: t.type })),
  })) as HandlerAnswer;
  if (activation.isError) {
    throw new Error(`activate ${label}: ${extractErrorMessage(activation)}`);
  }
  const verdict = parseHandlerResponse(activation) as {
    activated?: boolean;
    activation_not_stated?: boolean;
    messages?: { type?: string; text?: string }[];
  };
  const refusals = (verdict?.messages ?? []).filter((m) =>
    /^[EAX]$/i.test(String(m?.type ?? '')),
  );
  if (refusals.length > 0) {
    throw new Error(
      `activate ${label}: ${JSON.stringify(refusals).substring(0, 600)}`,
    );
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const inactive = await stillInactive(context, targets);
    if (inactive.length === 0) {
      logger?.info?.(
        `   + activation confirmed: ${label} are not in the inactive list`,
      );
      return;
    }
    if (attempt === attempts) {
      throw new Error(
        `activate ${label}: still inactive after ${attempts} reads over ${((attempts - 1) * waitMs) / 1000}s — ${inactive.join(', ')}. The activation answered ${JSON.stringify(verdict).substring(0, 400)}`,
      );
    }
    logger?.warn?.(
      `   … ${inactive.join(', ')} still inactive, reading again (${attempt}/${attempts - 1})`,
    );
    await delay(waitMs);
  }
}
