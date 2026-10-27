# To do: reported gaps in mcp-abap-adt — check each, fix what is ours

A user evaluated mcp-abap-adt 20.1.0 (main) for one job: fixing ATC findings with an LLM. They
read the README, the docs and the source; they did not run the server on a SAP system. Their list
below is a list of **our** possible problems. Each item is checked against the code first —
**true** (file:line), **false** (file:line) or **partly** (what is there, what is not) — and each
true one goes to the owner: fix, or out of scope.

## Claims, by area

### ATC
- [ ] `RunATC` takes `check_variant`, but PROG is not listed among its object types.
- [ ] A finding carries only line, priority and the check and message titles. Column, `checkId`,
      `messageId`, documentation link, exemption and the location (include, function module, class
      include) are only in `detail: 'raw'`.
- [ ] A past run is read only by `worklist_id`, not by the Display ID shown in SAP GUI.
- [ ] Package runs: subpackages are not documented. They continue after a timeout.
- [ ] Findings go straight into the context, capped by `max_findings`. There is no export to a file
      with a summary in the answer.
- [ ] No documentation of an ATC check.

### Sources and writes
- [ ] No reading a source into a file, and no writing from a file. The whole source travels in the call.
- [ ] No guard against overwriting someone else's change (an `ifUnchanged`-style write).
- [ ] No write of a program include (INCL) or a table type (TTYP).
- [ ] No main programs of an include, and no activation context.

### Activation
- [ ] No guard against activating other users' drafts, and no list of what was really activated.
      Preaudit exists only for group activation, and the inactive-objects list is not parsed.

### Restrictions
- [ ] No restriction of writes to `Z*` / `$TMP` and to allowed object types.
- [ ] No deny list for single tools or actions; only the full build or the read-only build.
- [ ] `GetSqlQuery` and `GetTableContents` are in the read-only build too. Their point:
      business data must not reach the model.
      Owner's rules to weigh: [readonly means no code change], [give capabilities, the user chooses].

### Risks they name
- [x] License: they read the README's AGPL-3.0 against `package.json`'s Apache-2.0. **False as a
      contradiction**: every package declares its own licence and ships the matching LICENSE file —
      `@mcp-abap-adt/lib` (root `package.json:199`, `LICENSE`) and the extension packages
      (`compact-modify`, `compact-readonly-entries`, `responsible-rules`, `background-runs-memory`)
      Apache-2.0; every server package (`server`, `http`, `sse`, `compact*`, `*-ro`,
      `server-runtime`) AGPL-3.0-only (each `package.json` and `LICENSE`); the README's table
      (`README.md:109-122`) states the split and why. Open: whether the table lists every package.
- [ ] Majors 17–20 shipped in under two weeks, with breaking changes (`--exposition` removed).
- [ ] One main author; CI runs on an ADT mock, not a real system.

### What they found strong
- Version history and diffs, where-used, source search, ABAP Unit, debugger and profiler, batch
  mode, cleanup of stuck sessions with lock release.
- They would have to forbid the debugger and program runs for their use.

## How this PR works

- This draft PR carries the checks and the fixes the owner accepts, through every review cycle.
- Accepted fixes get a spec and a plan here, as usual.
- Delete this file once the work it lists is done or cancelled.

## Verdicts (checked in code, 20.1.0; no SAP run)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | RunATC: no PROG | **true** | `handleRunATC.ts:50-58` allows 7 types (class, interface, function_group, package, ddl_source, table, behavior_definition), enforced by the zod schema; adt-clients also takes program, program_include, function_include, class_include (`IAtcRun` `AtcObjectType`); the handler says "not offered yet" (`:91-93`, MIGRATION-17.0 `:59-60`) |
| 2 | Finding fields | **partly** | parsed: object, type, line, location URI, priority, check and message titles (`atcFindings.ts:35-50,124-131`); the column is in `#start=L,C` and dropped (`:98`); checkId, checkClass, messageId, doc link, exemption, quickfix, itemid raw only; `full` = `terse` (`handleGetATCFindings.ts:68-70`); exempted findings absent even raw (adt-clients `includeExemptedFindings=false`) |
| 3 | Past run by Display ID | **true** | only `worklist_id` / `run_id`; no list, no lookup; adt-clients has none either |
| 4 | Package: subpackages, long runs | **true** | nothing documented; one inclusive objectSet, no subpackage flag; whether SAP includes subpackages is not known from code (measure) |
| 5 | Findings into context, `max_findings` | **partly** | `max_findings` caps what SAP records (`maximumVerdicts`), not what GetATCFindings returns (no paging, no filter); counts are answered; no file |
| 6 | ATC check documentation | **true** | no tool, no adt-clients endpoint; the link only in raw |
| 7 | Source to/from file | **true** | sources inline only (e.g. `handleUpdateProgram.ts:39-66`) |
| 8 | Only-if-unchanged guard | **true** | no ETag / If-Match / version / hash anywhere; only SAP's lock |
| 9 | INCL / TTYP writes | **true (server)** | no tool; adt-clients has both (`getInclude()`, `getTableType()` with full CRUD) |
| 10 | Include main programs, activation context | **partly** | no tool; GetEnhancements reads `contextRef` internally (`handleGetEnhancements.ts:334-358`); activate takes no context; `uri` carried, never read (`handleActivateObject.ts:328-342`) |
| 11 | Activation guards, what was activated | **partly** | no guard on others' drafts; group activation echoes the request (`handleActivateObject.ts:409-430`); "preaudit group-only" false — single activation always sends `preauditRequested=true`, and our own description says otherwise (`:128-132`, misleading); inactive list is parsed (`projections.ts:109-160`, GetInactiveObjects) but without owner |
| 12 | Z*/$TMP, type restriction | **true** | no option anywhere |
| 13 | Per-tool / action deny | **true (binaries)** | the binary fixes the set; an embedder can pick groups or a registry in code (`EmbeddableMcpServer.ts:99-109`); -ro keeps RuntimeRunClass / RuntimeRunProgram |
| 14 | SQL / table contents in -ro | **true, all six** | core-ro, http-ro, sse-ro (`toolSet.ts:336-339`); compact-*-ro `HandlerGetData` (rows or any `sql_query`) |
| 15 | Majors 17–20 < 2 weeks | **partly** | 17.0.0 10-05 → 20.0.0 10-22 = 17 days; `--exposition` removed in 19.0.0 |
| 16 | One author; CI on a mock | **partly** | one author true; CI runs no real system, but unit tests replay recorded real ADT answers; integration and live suites run outside CI |

Found beside the list:
- The three ATC tools are only in the full core set (`HighLevelHandlersGroup.ts:598-611`, `toolSet.ts:293`). Each description says "[read-only]", yet no read-only build serves them, and no compact build has an ATC route.
- `ActivateObjects` names TTYP in its description (`handleActivateObjects.ts:33`), but `TYPE_TO_FAMILY` maps `ttyp/st` to the structure family (`handleActivateObject.ts:186`). This needs checking.
