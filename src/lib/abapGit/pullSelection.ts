/**
 * A cloud pull's selection (`overwrite`): the objects the caller names, by
 * type and name, matched against the modified-objects read (R6) and handed
 * back as R6 answered them — every field unchanged, in R6's lists.
 *
 * What SAP does with it (Code, read on the cloud 2026-11-23):
 * - The job recomputes the list when it runs (`CL_ABAPGIT_BG_ACTION_PULL->
 *   execute`: `deserialize_checks` L113) and marks an entry `Y` when the
 *   selection holds its **name** — by name alone, in each list (L124 for
 *   the overwrite list, L139 for the package warnings) — every other `N`
 *   (L123–152). A change made between R6 and the job is matched the same
 *   way, unseen by this check.
 * - The import drops an `N` entry only when it is changed locally or held by
 *   another package (`CL_ABAPGIT_OBJECTS->warning_overwrite_adjust` L1791,
 *   `warning_package_adjust`): an entry changed only in the remote is
 *   always imported, selected or not.
 *
 * So a selected name R6 lists under another type too is refused: SAP would
 * take both. adt-clients' live suite measured the selective pull in this
 * form (`pull.req.v1`, its ERRATA, 2026-11-22). Duplicates in `overwrite`
 * are refused before any connection (`admission.ts`, step 2a).
 */

import type {
  IAbapGitModifiedObject,
  IAbapGitPullSelection,
} from '@mcp-abap-adt/interfaces-adt';
import { ServerRefusal } from '../auth/serverRefusal';
import type { OverwriteArgument } from './arguments';

const same = (a: OverwriteArgument, b: OverwriteArgument): boolean =>
  a.type === b.type && a.name === b.name;

/**
 * The selection: R6's entries `overwrite` names, as R6 answered them.
 * Refused when `overwrite` names an object R6 lists in neither list, or a
 * name R6 lists under another type too.
 */
export function pullSelection(
  modified: IAbapGitPullSelection,
  overwrite: readonly OverwriteArgument[],
): IAbapGitPullSelection {
  const named = (entry: IAbapGitModifiedObject) =>
    overwrite.some((object) => same(object, entry));
  const listed = [
    ...modified.overwriteObjects,
    ...modified.packageWarningObjects,
  ];
  for (const object of overwrite) {
    if (!listed.some((entry) => same(object, entry))) {
      throw new ServerRefusal('abapgit_overwrite_not_listed');
    }
    if (
      listed.some(
        (entry) => entry.name === object.name && entry.type !== object.type,
      )
    ) {
      throw new ServerRefusal('abapgit_overwrite_ambiguous');
    }
  }
  return {
    overwriteObjects: modified.overwriteObjects.filter(named),
    packageWarningObjects: modified.packageWarningObjects.filter(named),
  };
}
