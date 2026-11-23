/**
 * A cloud pull's selection (`overwrite`): the objects the caller names, by
 * type and name, matched against the modified-objects read (R6) and handed
 * back as R6 answered them — every field unchanged, in R6's lists.
 *
 * Without a selection SAP's cloud pull handler hands its job every R6 entry
 * (`CL_ABAPGIT_RES_REPO_PULL->post` L234–240); with one, only the selected
 * entries (L230–233), and the job leaves every other entry unimported
 * (`CL_ABAPGIT_BG_ACTION_PULL->execute` L123–152). Code, read on the cloud
 * 2026-11-23. adt-clients' live suite measured the selective
 * pull in this form (`pull.req.v1`, its ERRATA, 2026-11-22).
 */

import type {
  IAbapGitModifiedObject,
  IAbapGitPullSelection,
} from '@mcp-abap-adt/interfaces-adt';
import { ServerRefusal } from '../auth/serverRefusal';
import type { OverwriteArgument } from './arguments';

const same = (a: OverwriteArgument, b: OverwriteArgument): boolean =>
  a.type === b.type && a.name === b.name;

/** Refused when `overwrite` names one object twice. */
export function assertEachOnce(overwrite: readonly OverwriteArgument[]): void {
  overwrite.forEach((object, at) => {
    if (overwrite.findIndex((other) => same(other, object)) !== at) {
      throw new ServerRefusal('abapgit_overwrite_duplicate');
    }
  });
}

/**
 * The selection: R6's entries `overwrite` names, as R6 answered them.
 * Refused when `overwrite` names an object R6 lists in neither list.
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
  }
  return {
    overwriteObjects: modified.overwriteObjects.filter(named),
    packageWarningObjects: modified.packageWarningObjects.filter(named),
  };
}
