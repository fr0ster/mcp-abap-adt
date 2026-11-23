/**
 * The abapGit live suite's pull: the run interface's source, the remote
 * change, what R6 lists as changed locally, and a succeeded job.
 *
 * **What a pull imports.** The server's pull sends no selection (repo.v3).
 * The cloud pull job sets the decision of every R6 overwrite entry the
 * selection does not name to `N` (`CL_ABAPGIT_BG_ACTION_PULL->execute`
 * L123–136; Code, read on the cloud 2026-11-23), and an `N` entry is not
 * imported, logged `S` "not imported; no import requested"
 * (`CL_ABAPGIT_OBJECTS->warning_overwrite_adjust`). R6's overwrite entries
 * are the objects changed locally since the last push
 * (`warning_overwrite_find`: `lstate` set). So the run's interface is
 * written and activated before its push, and the change is the remote's
 * only: R6 must not list it, and the pull imports it — as adt-clients'
 * suite measured for a remote-only change (its ERRATA, 2026-11-22).
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

/** R1's run statuses a job succeeds with (`IF_ABAPGIT_APP_LOG=>c_run_status`). */
const SUCCEEDED: readonly string[] = ['S', 'W'];

/** Whether R1's `runStatus` says the job succeeded. */
export function succeeded(status: string | undefined): boolean {
  return status !== undefined && SUCCEEDED.includes(status);
}
