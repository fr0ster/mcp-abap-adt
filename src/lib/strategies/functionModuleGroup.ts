/**
 * A function module addressed through a function group: the group checked
 * against the module's own metadata before anything else is sent (#2).
 *
 * SAP ignores the group segment of a function module's address: a read,
 * a lock, a write and an unlock through `/functions/groups/<B>/fmodules/<M>`
 * reach the module `M` whichever group `B` names (measured on premise,
 * 2026-11-04: the module of group A read, locked, written and unlocked
 * through group B's address). The one place SAP states the group holding
 * the module is the metadata document's `adtcore:containerRef` — the lock
 * result, the source and the write's answer name none. So every path that
 * addresses an existing module through a group reads that document first
 * (one `GET`) and goes on only when its `adtcore:containerRef` names the
 * group the caller gave.
 *
 * **What the check answers.**
 * - The group matches: the metadata read, so a path whose answer is that
 *   document (`GetFunctionModule`, part `metadata`) answers it without a
 *   second request.
 * - The group differs, or the document names no group: a refusal of ours
 *   (`origin: 'refusal'`, code {@link FUNCTION_GROUP_MISMATCH}, step
 *   {@link GROUP_CHECK_STEP}) naming the group SAP states; nothing else is
 *   sent.
 * - The metadata read failed: SAP's answer as it came, with the step and
 *   SAP's T100 key, and nothing else is sent. A module that does not exist
 *   is answered so: its metadata read answers `404`
 *   `ExceptionResourceNotFound` keyed `FL 110`, whatever group the address
 *   names (measured on premise, 2026-11-05) — SAP's refusal, never a group
 *   mismatch, and not reworded. The `500` keyed `SY 530` a missing module's
 *   *source* read answers on premise is not met: the check reads the
 *   metadata before any source.
 *
 * The check reads the working area (`version=workingArea`, measured on
 * premise to answer a module that exists only inactive): a module saved and
 * not yet activated is checked like an active one. A read at a version the
 * caller names (`GetFunctionModule`) checks at that version, so every read
 * it sends states the version asked. A group that does not
 * exist is no exception: SAP answers the module's metadata through it, and
 * the group it states differs (measured).
 */

import type {
  IAdtError,
  IAdtFailure,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from '../adtClientContract';
import type { AdtCodes } from '../adtProjections';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import type { ReadVersion } from '../handlers/readVersion';
import {
  attr,
  child,
  childAt,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../xml/tree';
import { readFunctionModuleMetadata } from './metadataReads';
import { type AdtReading, parseStructure } from './reading';
import { withStep } from './step';
import { failed, type StepError, type StepResponse } from './stepResponse';

/** The step a group check's failure arose at. */
export const GROUP_CHECK_STEP = 'check function group';

/** The code of the refusal: the module is not in the group given. */
export const FUNCTION_GROUP_MISMATCH = 'FUNCTION_GROUP_MISMATCH';

/** The version the check reads when the read is not the answer itself. */
const CHECKED_VERSION: ReadVersion = 'workingArea';

/**
 * The name of the group the metadata document states: the root
 * `fmodule:abapFunctionModule`'s `adtcore:containerRef`'s `adtcore:name`,
 * upper-cased; `undefined` when the document states none.
 */
export function statedGroupOf(document: string): string | undefined {
  const root = child(parseStructure(document), 'fmodule:abapFunctionModule');
  const name = attr(childAt(root, 'adtcore:containerRef', '@'), 'adtcore:name');
  return name === undefined || name === '' ? undefined : name.toUpperCase();
}

/** The refusal of a module addressed through a group that does not hold it. */
function mismatch(
  group: string,
  module: string,
  stated: string | undefined,
): IAdtError {
  return {
    origin: 'refusal',
    code: FUNCTION_GROUP_MISMATCH,
    message:
      stated === undefined
        ? `The metadata of function module ${module} names no function group, so function group ${group} cannot be confirmed to hold it; nothing else was sent.`
        : `Function module ${module} is in function group ${stated}, not in ${group}; nothing else was sent.`,
  };
}

/**
 * The group check on `client`: one metadata read of `module` through
 * `group` at `version` (the working area unless the read is the answer),
 * answered as the module comment says.
 */
export async function checkFunctionModuleGroupOn(
  client: IServerAdtClient,
  group: string,
  module: string,
  version: ReadVersion = CHECKED_VERSION,
): Promise<StepResponse<AdtReading<string>>> {
  const functionGroupName = group.trim().toUpperCase();
  const functionModuleName = module.trim().toUpperCase();
  return inGroupStated(
    await readFunctionModuleMetadata(
      client,
      { functionModuleName, functionGroupName },
      version,
    ),
    functionGroupName,
    functionModuleName,
  );
}

/**
 * The verdict on a metadata read of `module` sent through `group`
 * (`readFunctionModuleMetadata`): the read itself when its document names
 * `group`, the refusal when it names another or none, SAP's failure as it
 * came — each failure with {@link GROUP_CHECK_STEP}.
 */
export function inGroupStated(
  read: IAdtResponse<AdtReading<string>, IAdtError>,
  group: string,
  module: string,
): StepResponse<AdtReading<string>> {
  const functionGroupName = group.trim().toUpperCase();
  const functionModuleName = module.trim().toUpperCase();
  if (!read.ok) {
    return failed(withStep(read.getError(), GROUP_CHECK_STEP), 'groupCheck');
  }
  const stated = statedGroupOf(read.getResult().value.raw);
  if (stated !== functionGroupName) {
    return failed(
      withStep(
        mismatch(functionGroupName, functionModuleName, stated),
        GROUP_CHECK_STEP,
      ),
      'groupCheck',
    );
  }
  return read;
}

/** The group check on the context's client (`checkFunctionModuleGroupOn`). */
export function checkFunctionModuleGroup(
  context: HandlerContext,
  group: string,
  module: string,
  version?: ReadVersion,
): Promise<StepResponse<AdtReading<string>>> {
  return checkFunctionModuleGroupOn(
    createAdtClient(context.connection, context.logger),
    group,
    module,
    version,
  );
}

/**
 * `then`, sent only after the group check on `client` passed (at `version`
 * when the path reads at one, else the working area): the check's failure
 * as it is otherwise.
 */
export async function inCheckedGroupOn<T>(
  client: IServerAdtClient,
  group: string,
  module: string,
  then: () => Promise<IAdtResponse<T, IAdtError>>,
  version?: ReadVersion,
): Promise<IAdtResponse<T, IAdtError>> {
  const checked = await checkFunctionModuleGroupOn(
    client,
    group,
    module,
    version,
  );
  if (!checked.ok) return checked;
  return then();
}

/** `then`, after the group check on the context's client (`inCheckedGroupOn`). */
export function inCheckedGroup<T>(
  context: HandlerContext,
  group: string,
  module: string,
  then: () => Promise<IAdtResponse<T, IAdtError>>,
): Promise<IAdtResponse<T, IAdtError>> {
  return inCheckedGroupOn(
    createAdtClient(context.connection, context.logger),
    group,
    module,
    then,
  );
}

/** The code of a function module reference in a group activation. */
const MODULE_CODE: AdtCodes<'FUGR/FF'> = 'FUGR/FF';

/** A reference of a group activation or list: its code, name and parent. */
export interface ModuleReference {
  readonly type: string;
  readonly name: string;
  readonly parentName?: string;
}

/**
 * The group check of every function module reference among `references`
 * (each naming its group in `parentName`), one metadata read each, in their
 * order: the first failure, after which nothing more is read; `undefined`
 * when every module is in the group its reference names.
 */
export async function checkModuleReferences(
  context: HandlerContext,
  references: readonly ModuleReference[],
): Promise<IAdtFailure<StepError> | undefined> {
  for (const reference of references) {
    if (reference.type !== MODULE_CODE || reference.parentName === undefined) {
      continue;
    }
    const checked = await checkFunctionModuleGroup(
      context,
      reference.parentName,
      reference.name,
    );
    if (!checked.ok) return checked;
  }
  return undefined;
}
