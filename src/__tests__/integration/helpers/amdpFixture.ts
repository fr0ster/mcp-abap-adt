/**
 * The shared AMDP pair the debugger batch's AMDP gate stops in
 * (`shared_dependencies`: the class `ZMCP_SHR_DBG_AMDP`, the table function
 * `ZMCP_SHR_DBG_TF`), and whether the gate can run on this system.
 *
 * Pure: it reads answers already received and sends nothing. The gate skips
 * only on a verified unsupported system — SAP's own system information names
 * a database system other than SAP HANA (`DBSystem` not `HDB`) — and names
 * it. Anything else that keeps the gate from running fails it: a system
 * information it cannot read, a shared object that is not active, a class
 * without its breakpoint marker.
 */

/** The SQLScript line marker the AMDP gate sets its breakpoint on. */
export const AMDP_BREAKPOINT_MARKER = '-- BP:tf';

/** One read's answer: its HTTP status and, on `200`, its text. */
export interface FixtureRead {
  status: number | undefined;
  text: string;
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
  systemInformation: FixtureRead;
  className: string;
  classRead: FixtureRead;
  ddlName: string;
  ddlRead: FixtureRead;
}): AmdpGateVerdict {
  const { systemInformation, className, classRead, ddlName, ddlRead } = input;
  if (systemInformation.status !== 200) {
    return {
      run: false,
      fail: `SAP's system information could not be read (status ${systemInformation.status}): whether this system runs AMDP is unknown`,
    };
  }
  const database = databaseSystemOf(systemInformation.text);
  if (database === undefined) {
    return {
      run: false,
      fail: "SAP's system information names no DBSystem: whether this system runs AMDP is unknown",
    };
  }
  if (database !== 'HDB') {
    return {
      run: false,
      skip: `SAP's system information names the database system ${database}; an AMDP runs only on SAP HANA (HDB)`,
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
