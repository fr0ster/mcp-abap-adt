/**
 * The abapGit live suite's pull: the run interface's source, the remote
 * change, what R6 lists and with which action, and a succeeded job.
 *
 * **What R6 lists** (cloud, Code read on the cloud 2026-11-23). Its
 * overwrite entries are `CL_ABAPGIT_OBJECTS_CHECK=>warning_overwrite_find`
 * (L140–210) over the file status: every object with any change, its
 * action from `lstate`/`rstate` — `' M'` changed only in the remote is
 * `update` (2), `'M '`/`'MM'` changed locally is `overwrite` (3), adds,
 * deletes and package moves their own (`IF_ABAPGIT_OBJECTS=>
 * c_deserialize_action`); only an unchanged object is left out. R6's
 * resource answers each with that action (`CL_ABAPGIT_RES_PULL_MOD_OBJS->
 * get_all_modified_objects`).
 *
 * **What a pull imports.** Without a selection (`repo.v3`) the handler
 * hands the job every R6 entry (`CL_ABAPGIT_RES_REPO_PULL->post`
 * L234–240); with one (`pull.req.v1`, `overwrite`) only the selected
 * entries (L230–233). The job sets every entry it was not handed to `N`
 * (`CL_ABAPGIT_BG_ACTION_PULL->execute` L123–152), and the import drops an
 * `N` overwrite entry when it is changed locally (`CL_ABAPGIT_OBJECTS->
 * warning_overwrite_find` L1841–1844: `lstate` set; `warning_overwrite_adjust`
 * L1791), every `N` package warning (`warning_package_adjust` L1858–1897),
 * and deletes only `Y` entries (`CL_ABAPGIT_BG_ACTION_PULL->
 * delete_unnecessary_objects` L39–72): only a remote-only add or update is
 * imported unselected, a local change only when selected. The run's interface is activated
 * before its push, so the first remote change is listed `update` and the
 * pull imports it; the later local change makes it `overwrite`, and a pull
 * selecting it overwrites it.
 *
 * The change replaces a constant's value inside the interface, as
 * adt-clients' suite does, never a line after `ENDINTERFACE`.
 */

/** The run interface's source, its one constant holding `marker`. */
export function interfaceSource(name: string, marker: string): string {
  return `INTERFACE ${name.toLowerCase()}\n  PUBLIC.\n  CONSTANTS c_marker TYPE string VALUE '${marker}'.\nENDINTERFACE.\n`;
}

/** `text` with the quoted `from` replaced by the quoted `to`; refused when `text` does not hold it. */
export function swapMarker(text: string, from: string, to: string): string {
  const quoted = `'${from}'`;
  if (!text.includes(quoted)) {
    throw new Error(`the remote file does not hold ${quoted}`);
  }
  return text.replace(quoted, `'${to}'`);
}

const entries = (value: unknown, key: string): readonly unknown[] => {
  const field =
    typeof value === 'object' && value !== null
      ? Reflect.get(value, key)
      : undefined;
  return Array.isArray(field) ? field : [];
};

/** The actions R6's overwrite entries named `name` carry. */
export function actionsOf(facts: unknown, name: string): number[] {
  return entries(facts, 'overwriteObjects').flatMap((entry) => {
    const read = (key: string) =>
      typeof entry === 'object' && entry !== null
        ? Reflect.get(entry, key)
        : undefined;
    const action = read('action');
    return typeof action === 'number' && read('name') === name ? [action] : [];
  });
}

/** `overwrite` for R6's overwrite entries named `name`: type and name as R6 answered them. */
export function overwriteOf(
  facts: unknown,
  name: string,
): { type: string; name: string }[] {
  return entries(facts, 'overwriteObjects').flatMap((entry) => {
    const read = (key: string) =>
      typeof entry === 'object' && entry !== null
        ? Reflect.get(entry, key)
        : undefined;
    const type = read('type');
    return typeof type === 'string' && read('name') === name
      ? [{ type, name }]
      : [];
  });
}

/** R1's run statuses a job succeeds with (`IF_ABAPGIT_APP_LOG=>c_run_status`). */
const SUCCEEDED: readonly string[] = ['S', 'W'];

/** Whether R1's `runStatus` says the job succeeded. */
export function succeeded(status: string | undefined): boolean {
  return status !== undefined && SUCCEEDED.includes(status);
}
