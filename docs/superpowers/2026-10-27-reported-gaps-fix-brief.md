# Brief: fix the reported defects (PR #329)

Worktree: /home/okyslytsia/prj/mcp-abap-adt/.worktrees/arc1-comparison (branch fix/reported-gaps).
The checked verdicts are in `docs/superpowers/2026-10-27-reported-gaps-todo.md`; read its
"Verdicts" table first. The owner ruled: fix the defects below, nothing else. Everything else on
the list is discussed later.

## The five defects

1. **RunATC object types** (`src/handlers/atc/high/handleRunATC.ts`). The `objects[].type` enum
   allows 7 values. adt-clients (`AtcObjectType` in
   `@mcp-abap-adt/interfaces-adt` `runtime/IAtcRun`) also runs ATC on `program`,
   `program_include`, `function_include` (needs `functionGroup`) and `class_include` (needs
   `includeKind`: `definitions` | `implementations` | `macros` | `testclasses`).
   - Accept those four.
   - Add the parameters each needs to the object schema, named in this server's style
     (`function_group`, `include_kind`).
   - Pass them through as the library's types declare. Type the mapping against `AtcObjectType`
     and the library's object type, so the compiler checks it; no hand-written duplicate union.
   - Program and program include are on-premise only (`IAtcRun` says so). Find how this server
     states "[onprem only]" elsewhere and do the same in the schema text.
   - Remove the "not offered yet" note (`:91-93`).
   - The tool description lists the accepted types and the required extra fields.
2. **ATC finding fields** (`src/lib/strategies/atcFindings.ts`, `handleGetATCFindings.ts`).
   Parse and answer, per finding:
   - the column from the location fragment (`#start=LINE,COLUMN`), beside the line;
   - `checkId`, `checkClass`, `messageId`;
   - the documentation link (the finding's `atom:link` to `/sap/bc/adt/documentation/atc/...`) as
     its URI;
   - the exemption fields the document carries (`exemptionApproval`, `exemptionKind`);
   - whether quick fixes exist (read what `quickfixInfo` / the quick fixes look like in the recorded
     fixtures).
   `detail: 'terse'` stays what it is today. `detail: 'full'` adds those fields; today it answers the
   same as terse (`:68-70`). Use only what the recorded fixtures in `tests/fixtures/adt/atc-*`
   show. A field absent from every fixture is not invented: list it in your report. Note that
   exempted findings themselves are not fetched: adt-clients hard-codes
   `includeExemptedFindings=false`. That is a library matter; only list it.
3. **ATC tools in the read-only builds.** `RunATC`, `GetATCRunStatus` and `GetATCFindings` say
   "[read-only]" but are registered only in the full core set (`HighLevelHandlersGroup.ts:598-611`,
   `toolSet.ts:293`).
   - Serve them in `fullReadOnlyToolSet` (`src/lib/toolSet.ts`), so core-ro, http-ro and sse-ro have
     them, the way the other read-only tools are grouped.
   - Do not add ATC to any compact build. That is a separate decision.
   - Update the tool-set tests and every doc page that lists the read-only builds' tools.
4. **The preaudit description** (`src/handlers/common/low/handleActivateObject.ts:128-132`). It says
   the single-object path "has no preaudit parameter at all". It has no parameter, but it always sends
   `preauditRequested=true` (adt-clients `utils/activationUtils` `activateObjectInSession`). Make the
   description say what is sent.
5. **The table type's activation type code** (`handleActivateObject.ts:186`). `TYPE_TO_FAMILY` maps
   `'ttyp/st'` to `structure`. ADT's table type is `TTYP/DA` (see
   `src/__tests__/unit/getTypeInfo.test.ts:80`), and a structure is `TABL/DS`.
   - Find what `ttyp/st` was meant to be: git log/blame, and the structure family's own code.
   - Fix the map so each real code reaches its family. A table type has no family here, so it goes
     to group activation, as the module doc comment says for unnamed codes.
   - `ActivateObjects` names TTYP in its description (`handleActivateObjects.ts:33`); make sure what
     it says is true after the fix.
   - Add a unit test per code.

## Tests and docs

- TDD: a failing unit test first for each defect, then the fix.
- Use the recorded ADT fixtures (`tests/fixtures/adt/`) and the existing test patterns.
- When a test is meant to protect a rule, break the rule once, watch the test go red, and restore it.
- Docs:
  - the tool docs (`docs/user-guide/AVAILABLE_TOOLS*.md` and whatever lists the -ro tool sets);
  - one CHANGELOG `[Unreleased]` entry per defect, under the right heading (Added / Fixed). Never
    edit a released entry.
- Run CI's steps locally: `npm run lint:check`, `npm run test:check` (or whatever `ci.yml`
  runs), `npm run build`, `npm test`.
  - `npm test` must not reach a SAP system. Check `package.json`'s test script and its ignore
    patterns before running it.
  - If anything would hit a live system, stop and report.
- First `npm ci --ignore-scripts` in the worktree; it has no `node_modules`.

## Rules

- No live SAP requests, no integration or live tests. The controller runs those.
- npm scripts only. Never call `npx` or `node_modules/.bin`.
- Don't edit the lockfile by hand. Don't change any dependency.
- Do not edit CLAUDE.md.
- Static types first: no runtime check the compiler can do.
- Tool descriptions are functional only: what it does, its parameters, its result. No "does not".
- No subagents. Do not push.
- One commit per defect, each ending with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013FwzVzuPQdYVh3bHZmipzj

## Report

Write the report to
/tmp/claude-1000/-home-okyslytsia-prj-mcp-abap-adt-auth-providers/45cadf6b-c51e-4279-b008-585c7d322d82/scratchpad/gaps-fix-report.md.
If you cannot write it, return it as text. Return the status, the commits, one line of test results
and your concerns.
