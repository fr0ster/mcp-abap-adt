/**
 * The shared AMDP pair the debugger batch's AMDP gate stops in
 * (`shared_dependencies`: the class `ZMCP_SHR_DBG_AMDP`, the table function
 * `ZMCP_SHR_DBG_TF`), and whether the gate can run on this system.
 *
 * Pure: it reads answers already received and sends nothing. The database
 * system is the one the test config states (`environment.database_system`),
 * else the one SAP's own system information names (`DBSystem`), read only
 * when the config states none. The gate skips only on a known unsupported
 * system — a database system other than SAP HANA (`HDB`) — and names it and
 * where it came from. Anything else that keeps the gate from running fails
 * it: a system information it cannot read or that names no database system,
 * a shared object that is not active, a class without its breakpoint marker.
 */

/** The SQLScript line marker the AMDP gate sets its breakpoint on. */
export const AMDP_BREAKPOINT_MARKER = '-- BP:tf';

/** One read's answer: its HTTP status and, on `200`, its text. */
export interface FixtureRead {
  status: number | undefined;
  text: string;
}

/**
 * Where the gate learns the database system: the test config states it, or
 * SAP's system information was read.
 */
export type DatabaseSource =
  | { stated: string }
  | { systemInformation: FixtureRead };

/**
 * The database source: the stated system when there is one — `read` is then
 * never called — else SAP's system information, read by `read`.
 */
export async function databaseSource(
  stated: string | undefined,
  read: () => Promise<FixtureRead>,
): Promise<DatabaseSource> {
  return stated !== undefined
    ? { stated }
    : { systemInformation: await read() };
}

/** The database system a source names, or why it names none. */
function databaseOf(
  source: DatabaseSource,
): { database: string; from: string } | { fail: string } {
  if ('stated' in source) {
    return { database: source.stated, from: 'the test config states' };
  }
  const { systemInformation } = source;
  if (systemInformation.status !== 200) {
    return {
      fail: `SAP's system information could not be read (status ${systemInformation.status}): whether this system runs AMDP is unknown; the test config can state it (environment.database_system)`,
    };
  }
  const database = databaseSystemOf(systemInformation.text);
  if (database === undefined) {
    return {
      fail: "SAP's system information names no DBSystem: whether this system runs AMDP is unknown; the test config can state it (environment.database_system)",
    };
  }
  return { database, from: "SAP's system information names" };
}

export type AmdpGateVerdict =
  | { run: true; breakpointLine: number }
  | { run: false; skip: string }
  | { run: false; fail: string };

/**
 * The `DBSystem` entry of SAP's system information feed
 * (`/sap/bc/adt/system/information`, `application/atom+xml;type=feed`):
 * the title of the entry whose id is `DBSystem`. Plain string search.
 */
export function databaseSystemOf(feed: string): string | undefined {
  const id = '<atom:id>DBSystem</atom:id>';
  const at = feed.indexOf(id);
  if (at < 0) return undefined;
  const entryEnd = feed.indexOf('</atom:entry>', at);
  const open = '<atom:title>';
  const start = feed.indexOf(open, at);
  if (start < 0 || (entryEnd >= 0 && start > entryEnd)) return undefined;
  const end = feed.indexOf('</atom:title>', start);
  if (end < 0) return undefined;
  const value = feed.slice(start + open.length, end).trim();
  return value === '' ? undefined : value;
}

/** The 1-based line of the breakpoint marker in the class source, or 0. */
export function breakpointLineOf(classSource: string): number {
  return (
    classSource
      .split('\n')
      .findIndex((text) => text.includes(AMDP_BREAKPOINT_MARKER)) + 1
  );
}

/**
 * Whether the AMDP gate runs: on SAP HANA, with both shared objects active
 * and the class carrying its marker. The breakpoint line is taken from the
 * class source SAP answered — the one the debugger stops in.
 */
export function amdpGateVerdict(input: {
  database: DatabaseSource;
  className: string;
  classRead: FixtureRead;
  ddlName: string;
  ddlRead: FixtureRead;
}): AmdpGateVerdict {
  const { className, classRead, ddlName, ddlRead } = input;
  const known = databaseOf(input.database);
  if ('fail' in known) return { run: false, fail: known.fail };
  if (known.database !== 'HDB') {
    return {
      run: false,
      skip: `${known.from} the database system ${known.database}; an AMDP runs only on SAP HANA (HDB)`,
    };
  }
  for (const [what, read] of [
    [`CLASS ${className}`, classRead],
    [`DDLS ${ddlName}`, ddlRead],
  ] as Array<[string, FixtureRead]>) {
    if (read.status !== 200) {
      return {
        run: false,
        fail: `the shared ${what} has no active version (its read answered ${read.status}: ${read.text.slice(0, 300)}); run npm run shared:setup`,
      };
    }
  }
  const breakpointLine = breakpointLineOf(classRead.text);
  if (breakpointLine === 0) {
    return {
      run: false,
      fail: `the shared CLASS ${className} carries no "${AMDP_BREAKPOINT_MARKER}" line; run npm run shared:setup`,
    };
  }
  return { run: true, breakpointLine };
}
