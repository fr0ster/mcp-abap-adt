/**
 * The abapGit live suite's pull: the run interface's source, the remote
 * change, what R6 lists as changed locally, and a succeeded job.
 *
 * **What a pull imports** (cloud, Code read on the cloud 2026-11-23).
 * Without a selection (`repo.v3`) the handler hands the job every object
 * R6 lists at submit time (`CL_ABAPGIT_RES_REPO_PULL->post` L234–240,
 * `get_all_modified_objects`); with one (`pull.req.v1`, `overwrite`) only
 * the selected entries (L230–233). The job sets every R6 entry it was not
 * handed to `N`, not imported (`CL_ABAPGIT_BG_ACTION_PULL->execute`
 * L123–152). R6's overwrite entries are the objects changed locally since
 * the last push (`CL_ABAPGIT_OBJECTS->warning_overwrite_find`: `lstate`
 * set); a change made only in the remote is imported either way. The run's
 * interface is written and activated before its push, so the first remote
 * change is the remote's only and R6 does not list it; the later local
 * change makes R6 list it, and a pull selecting it overwrites it.
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

/** The names R6's facts list as overwrite entries: the objects changed locally. */
export function overwrittenNames(facts: unknown): string[] {
  return entries(facts, 'overwriteObjects').flatMap((entry) => {
    const name =
      typeof entry === 'object' && entry !== null
        ? Reflect.get(entry, 'name')
        : undefined;
    return typeof name === 'string' ? [name] : [];
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
