import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tsxCommand } from '../helpers/platform';

/**
 * **The long tools on the approved list gain `timeout` (19.0.0).** The
 * user approved them tool by tool (`tools/long-handlers.json`); each may
 * gain `timeout` and nothing else for it. `GetIncludesList` and
 * `GetStructuresList` already declared one (per request, in ms) — the name
 * stays, its meaning is now the call's (seconds, on the wait only).
 */
const LONG_TOOLS = new Set(
  (
    JSON.parse(
      readFileSync(
        join(__dirname, '../../../tools/long-handlers.json'),
        'utf8',
      ),
    ) as Array<{ tool: string }>
  ).map((entry) => entry.tool),
);

/**
 * The tool surface is a contract with callers who never read this repository.
 *
 * `detail` is the one addition the adt-clients 19 migration may make; anything
 * else moving is a regression, and this is where it is caught.
 *
 * `scripts/list-tools.ts` answers a FLAT ARRAY of
 * `{ group, name, inputs, available_in }`, where `inputs` is a formatted
 * string — `"table_name*, max_rows"`, with `*` marking required and the
 * sentinel `"(none)"` for a tool that takes nothing — and `available_in` is
 * a sorted, comma-joined list of SAP environments, or the sentinel
 * `"(everywhere)"` for a tool that declares none. Not an object keyed by
 * group, and not a `params` array: a test written against either would fail
 * on an unchanged surface and the ratchet would be useless from the first
 * task onward.
 *
 * **`available_in` is checked here too, and was not always.** The parameter
 * comparison below only ever read `inputs` — a tool that gained or lost an
 * environment passed it silently, unless a `legacyExposure`/`legacyThrows`
 * ledger elsewhere happened to name that exact tool. Two earlier tasks
 * recorded the gap without closing it; this file is the ratchet, so this is
 * where it closes: a changed `available_in`, in either direction, fails the
 * same way an added or removed parameter does.
 */
describe('the MCP tool surface', () => {
  type Row = {
    group: string;
    name: string;
    inputs: string;
    available_in: string;
  };

  const read = (rows: Row[]) =>
    new Map(rows.map((r) => [`${r.group}/${r.name}`, r.inputs]));
  const availability = (rows: Row[]) =>
    new Map(rows.map((r) => [`${r.group}/${r.name}`, r.available_in]));
  const parameters = (inputs: string) =>
    inputs === '(none)' ? [] : inputs.split(', ');

  const frozen: Row[] = JSON.parse(
    readFileSync(
      join(__dirname, '../../../tests/fixtures/tools/surface.json'),
      'utf8',
    ),
  );

  const current: Row[] = JSON.parse(
    execFileSync(
      ...tsxCommand([
        '--tsconfig',
        'tsconfig.test.json',
        'scripts/list-tools.ts',
      ]),
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      },
    ),
  );

  it('enumerates the whole surface, so the assertions below are not vacuous', () => {
    // A run that listed nothing would satisfy every comparison that follows.
    // 19.0.0: the 112 low tools left the surface, and their rows the
    // fixture — 264 remain.
    expect(frozen.length).toBeGreaterThan(250);
    expect(current.length).toBe(frozen.length);
  });

  it('has the same tools in the same groups', () => {
    expect([...read(current).keys()].sort()).toEqual(
      [...read(frozen).keys()].sort(),
    );
  });

  it('changes no parameter except by adding detail', () => {
    const now = read(current);
    for (const [tool, before] of read(frozen)) {
      const after = now.get(tool);
      if (after === before) continue;

      const had = parameters(before);
      const has = parameters(after ?? '(none)');

      // Nothing may leave, and what may arrive is `detail` — optional, so it
      // carries no `*` — or, on the two DDLX check tools, `version`.
      //
      // **Why that second exception exists.** The DDLX checkruns endpoint
      // does not fall back to the version that exists: an activated
      // extension answers `notProcessed` when asked for `inactive`, which is
      // what the shipped default asked for, so from these two tools an
      // activated extension could not be checked at all (#178, eseuve). A
      // parameter was the only way to say which one — measured on trial and
      // captured in `check-ddlx-active-version` /
      // `check-ddlx-inactive-version`.
      //
      // **Third exception: two compact runtime tools closed real coverage
      // gaps against the readonly surface.** `HandlerProfileView` only ever returned the raw trace payload
      // (`handleRuntimeGetProfilerTraceData`) — the dedicated analysis
      // endpoint (`handleRuntimeAnalyzeProfilerTrace`, totals + top-ranked
      // entries) had no compact tool at all, so `mode` (raw|analyze, default
      // raw) and `top` (analyze's row limit) were added. `HandlerDumpList`
      // hardcoded `feed_type: 'dumps'` into `handleRuntimeListFeeds`, which
      // also serves `system_messages` and `gateway_errors` — two more feed
      // types compact could not reach — so `feed_type` (default 'dumps') was
      // added instead of new tool names.
      //
      // **Fourth exception: `CreateTransportTask` gained `task_type`.** A task
      // `newtask` creates is Unclassified, and on premise the first
      // `addobject` onto it is refused (`SCTS_ADT_MSG 009` / TK127, measured
      // on premise 2026-09-25) until `changetasktype` gives it a type. The tool
      // now types the task itself, `S` by default; the parameter is how a
      // caller asks for Repair (`R`) or leaves it Unclassified (`X`).
      //
      // **Sixth exception: six check tools gained `version`** — CheckDomain,
      // CheckDataElement, CheckBehaviorDefinition, CheckProgram,
      // CheckFunctionGroup and CheckInterface.
      // They could only ask about the inactive version, and an object that
      // is only active has none: SAP answered "Error while importing object
      // … from the database" for the shared domain and data element (an on-premise system,
      // 2026-09-25). Every other DDIC check already took a version.
      //
      // **Fifth exception: seven low-tier writes gained `transport_request`.**
      // They had none, so a caller's request number was dropped and the write
      // went out without `corrNr` — refused on premise with "Parameter corrNr
      // could not be found." (SADT_RESOURCE 017, on premise 2026-09-25). Every other
      // low-tier write already carried it.
      // **One relaxation, and it is a relaxation rather than a loss.**
      // `CheckPackage`/`CheckPackageLow` required `super_package` and never sent
      // it: the guard refused the call before any request, so a package with no
      // parent — `super_package: ""`, which is what a top-level package has —
      // could not be checked at all. Measured on a BTP trial 2026-09-28: the
      // suite's own `ZMCP_SHR_PKG` answered `isError: true` with nothing on the
      // wire while the other nine check tools passed. The parameter is still
      // accepted, so no caller's request becomes invalid; it only stopped being
      // mandatory. `super_package*` therefore leaves and `super_package`
      // arrives, which is this one pair and nothing else.
      const MAY_RELAX_REQUIRED: Record<string, string> = {
        'high/CheckPackage': 'super_package',
        'low/CheckPackageLow': 'super_package',
      };
      const relaxed = MAY_RELAX_REQUIRED[tool];
      // **19.0.0, several objects per call (spec §11, owner-approved).** A
      // tool that took one root object takes several, read in the same
      // envelopes: the list argument arrives beside the single one, exactly
      // one of them given (the handler checks it), so the single one stops
      // being required. Each pair below is that move and nothing else.
      const LIST_ARGUMENTS: Record<
        string,
        { relaxed: string[]; added: string[] }
      > = {
        'readonly/GetPackageContents': {
          relaxed: ['package_name'],
          added: ['package_names'],
        },
        'system/GetPackageTree': {
          relaxed: ['package_name'],
          added: ['package_names'],
        },
        'search/GetObjectsList': {
          relaxed: ['parent_name', 'parent_tech_name', 'parent_type'],
          added: ['objects'],
        },
        'system/GetObjectInfo': {
          relaxed: ['parent_type', 'parent_name'],
          added: ['objects'],
        },
        'readonly/GetIncludesList': {
          relaxed: ['object_name', 'object_type'],
          added: ['objects'],
        },
        'readonly/GetStructuresList': {
          relaxed: ['structure_name'],
          added: ['structure_names'],
        },
        'readonly/GetEnhancements': {
          relaxed: ['object_name', 'object_type'],
          added: ['objects'],
        },
        'system/GetWhereUsed': {
          relaxed: ['object_name', 'object_type'],
          added: ['objects'],
        },
      };
      const listed = LIST_ARGUMENTS[tool];
      const listRelaxed = (p: string) =>
        listed?.relaxed.some((name) => p === `${name}*` || p === name) === true;
      // **One tightening, decided by the user (2026-10-11).** The two ABAP
      // debugger starts require at least one breakpoint (`minItems: 1`), as the
      // compact start already did: a model may start a run and forget the
      // breakpoints, and a listener with none of its own catches nothing it
      // asked for. `breakpoints` leaves and `breakpoints*` arrives, which is this
      // one pair per tool and nothing else. It lands in the 18.0.0 major.
      const MAY_TIGHTEN_REQUIRED: Record<string, string> = {
        'debug/DebugStartListener': 'breakpoints',
        'debug/DebugTakeOverListener': 'breakpoints',
      };
      const tightened = MAY_TIGHTEN_REQUIRED[tool];
      // **19.0.0, internal batches (spec §11).** A parallelism knob the
      // batched version makes meaningless is removed: `SearchSource`'s
      // `concurrency`, and nothing else.
      const REMOVED: Record<string, string[]> = {
        'search/SearchSource': ['concurrency'],
      };
      const removed = REMOVED[tool] ?? [];
      expect({
        tool,
        lost: had.filter(
          (p) =>
            !has.includes(p) &&
            !removed.includes(p) &&
            p !== `${relaxed ?? '\u0000'}*` &&
            p !== tightened &&
            !(listRelaxed(p) && has.includes(p.replace(/\*$/, ''))),
        ),
      }).toEqual({
        tool,
        lost: [],
      });
      const MAY_GAIN_VERSION = new Set([
        'high/CheckMetadataExtension',
        'low/CheckMetadataExtensionLow',
      ]);
      const EXTRA_ALLOWED_ADDITIONS: Record<string, string[]> = {
        // Background runs (19.0.0): the run tools take `background`, optional,
        // no default — without it a run waits as before.
        'system/RuntimeRunClass': ['background'],
        'system/RuntimeRunProgram': ['background'],
        'compact/HandlerProfileView': ['mode', 'top'],
        'compact/HandlerDumpList': ['feed_type'],
        // Issue #261: the dumps feed filters on the attributes its descriptor
        // declares; the user filter was the only one reachable before.
        // 19.0.0, several feeds per call (spec §11): `feed_types` beside
        // `feed_type`, which was never required.
        'system/RuntimeListFeeds': [
          'runtime_error',
          'exception',
          'object_name',
          'package',
          'component',
          'feed_types',
        ],
        'high/CreateTransportTask': ['task_type'],
        // 19.1.0 (#300): reading each leaf's metadata for its description is
        // the caller's choice, `include_descriptions` (default false), as in
        // GetPackageContents and GetPackageTree.
        'system/GetObjectInfo': ['include_descriptions'],
        // 19.0.0: SearchSource's cursor, `start_at` (from `next_start_at`), optional.
        'search/SearchSource': ['start_at'],
        // 19.0.0: one Get<Type> per type; a type with a source reads one
        // part per call, `part` (source | metadata, default source), optional.
        'high/GetClass': ['part'],
        'high/GetInterface': ['part'],
        'high/GetProgram': ['part'],
        'high/GetTable': ['part'],
        'high/GetStructure': ['part'],
        'high/GetDdl': ['part'],
        'high/GetServiceDefinition': ['part'],
        'high/GetServiceBinding': ['part'],
        'high/GetBehaviorDefinition': ['part'],
        'high/GetBehaviorImplementation': ['part'],
        'high/GetMetadataExtension': ['part'],
        'high/GetFunctionModule': ['part'],
        'low/UpdateClassLow': ['transport_request'],
        'low/UpdateClassTestClassesLow': ['transport_request'],
        'low/UpdateDdlLow': ['transport_request'],
        'low/UpdateMetadataExtensionLow': ['transport_request'],
        'low/UpdateInterfaceLow': ['transport_request'],
        'low/UpdateStructureLow': ['transport_request'],
        'low/UpdateProgramLow': ['transport_request'],
        'high/CheckDomain': ['version'],
        'low/CheckDomainLow': ['version'],
        'high/CheckDataElement': ['version'],
        'low/CheckDataElementLow': ['version'],
        'high/CheckBehaviorDefinition': ['version'],
        'low/CheckBdefLow': ['version'],
        'high/CheckProgram': ['version'],
        'low/CheckProgramLow': ['version'],
        'high/CheckFunctionGroup': ['version'],
        'low/CheckFunctionGroupLow': ['version'],
        'high/CheckInterface': ['version'],
        'low/CheckInterfaceLow': ['version'],
        // The eighth of the same family, found while reviewing the other
        // seven: `core/package/update.ts` appends `&corrNr=` when a transport
        // is given and `IPackageConfig` declares `transportRequest`, but the
        // schema never offered one — so a transportable package could not be
        // updated through this tool at all.
        'low/UpdatePackageLow': ['transport_request'],
        // adt-clients 29 (fr0ster/mcp-abap-adt-clients#217): the two ABAP debugger
        // starts take whose requests are caught, the debugging mode and the
        // debugger settings. All three optional.
        'debug/DebugStartListener': [
          'request_user',
          'debugging_mode',
          'settings',
        ],
        'debug/DebugTakeOverListener': [
          'request_user',
          'debugging_mode',
          'settings',
        ],
      };
      const isLong = LONG_TOOLS.has(tool.slice(tool.indexOf('/') + 1));
      const gainsTimeout = isLong && !had.includes('timeout');
      const added = has.filter(
        (p) =>
          !had.includes(p) &&
          p !== relaxed &&
          p !== `${tightened}*` &&
          !(listRelaxed(p) && had.includes(`${p}*`)) &&
          !(gainsTimeout && p === 'timeout'),
      );
      // A long tool whose only change is its `timeout` (gained, or moved
      // first in the list) gained nothing else.
      if (isLong && added.length === 0) continue;
      expect({ tool, added: [...added].sort() }).toEqual({
        tool,
        added: [
          ...(listed !== undefined
            ? [...listed.added, ...(EXTRA_ALLOWED_ADDITIONS[tool] ?? [])]
            : MAY_GAIN_VERSION.has(tool)
              ? ['version']
              : relaxed !== undefined
                ? []
                : (EXTRA_ALLOWED_ADDITIONS[tool] ?? ['detail'])),
        ].sort(),
      });
    }
  });

  /**
   * The snapshot moved once, deliberately, and this is what it moved by.
   *
   * Every tool that declared `legacy` stopped: support for legacy systems
   * (BASIS < 7.50) is parked on `parked/legacy-support` until it can be tried
   * against a live one. Nothing in this repository ever was — the environment
   * was declared on 142 tools, and `available_in` naming an environment
   * nobody had verified is a claim rather than a fact.
   *
   * The refreeze was checked rather than trusted: `inputs` had to match the
   * old snapshot row for row, and each `available_in` had to equal the old
   * one with `legacy` removed and nothing else. A tool that had quietly
   * gained or lost anything else would have stopped the refreeze.
   */
  /**
   * The second deliberate move: three tools arrived.
   *
   * ATC was in `@mcp-abap-adt/adt-clients` 19 and exposed by nothing here —
   * `AdtRuntimeClient.getAtc()` with the variant, the worklist, the run, its
   * status and its findings, and no `src/handlers/atc` to reach them. The
   * refreeze was checked rather than trusted: every existing row had to match
   * the old snapshot exactly, in `inputs` and in `available_in`, and the only
   * difference allowed was these three names appearing. A tool that had
   * quietly gained or lost anything else would have stopped it.
   */
  /**
   * **The third deliberate move: `DebugSetSettings` arrived** with the debugger
   * on adt-clients 29 — the settings at the current stop. Every other row was
   * checked unchanged.
   */
  /**
   * **The fourth deliberate move: two tools left (19.0.0).** The deprecated
   * `RuntimeRunClassWithProfiling` and `RuntimeRunProgramWithProfiling` are
   * deleted, as the user decided with the long-tool list (2026-10-13):
   * `RuntimeRunClass` / `RuntimeRunProgram` with `profile=true` and the
   * profiler tools do what they did. Their rows left the snapshot; every
   * other row was checked unchanged.
   */
  /**
   * **The fifth deliberate move: `SearchSource` is available on cloud too
   * (19.0.0).** It scans what the package walk and the source reads answer,
   * and both answered on an SAP BTP ABAP trial (2026-10-21); its row's
   * `available_in` moved from `onprem` to `cloud, onprem`, every other row
   * was checked unchanged.
   */
  it('adds tools only deliberately', () => {
    const arrived = [...read(current).keys()].filter(
      (tool) => !read(frozen).has(tool),
    );
    expect(arrived).toEqual([]);
  });

  it('no tool declares legacy', () => {
    expect(current.filter((r) => /legacy/.test(r.available_in))).toEqual([]);
  });

  it('changes no tool availability', () => {
    const now = availability(current);
    for (const [tool, before] of availability(frozen)) {
      expect({ tool, available_in: now.get(tool) }).toEqual({
        tool,
        available_in: before,
      });
    }
  });
});
