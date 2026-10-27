# To do: an external comparison with an ARC-1 fork, for ATC remediation

A team compared mcp-abap-adt (main, 20.1.0) with their fork of ARC-1, for one use: fixing ATC
findings. Their account was read from the README, the docs and the source; the server was not run
on a SAP system. Every claim below is theirs and **unverified**. The first step for each is to
check it against the code. Then the owner decides whether it is in scope.

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
- [ ] No guard against overwriting someone else's change (their `ifUnchanged`).
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
- [ ] License: they say the README states AGPL-3.0 while `package.json` says Apache-2.0. Check this
      first; it is a fact, not a design question.
- [ ] Majors 17–20 shipped in under two weeks, with breaking changes (`--exposition` removed).
- [ ] One main author; CI runs on an ADT mock, not a real system.

### What they credit
- Version history and diffs, where-used, source search, ABAP Unit, debugger and profiler, batch
  mode, cleanup of stuck sessions with lock release.
- They would have to forbid the debugger and program runs for their use.

## How this PR works

- This draft PR carries the analysis and the fixes the owner accepts, through every review cycle.
- Each claim gets one of three verdicts in this file: **true** (with file:line), **false** (with
  file:line), or **partly** (what is there and what is not).
- Each true gap goes to the owner as in scope or out. Only accepted ones become a spec and a plan here.
- Delete this file once the work it lists is done or cancelled.
