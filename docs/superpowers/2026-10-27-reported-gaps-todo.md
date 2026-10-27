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
