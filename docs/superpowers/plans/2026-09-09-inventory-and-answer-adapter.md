# Inventory and the answer adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the stage-1 inventory the design makes a precondition, and build the
adapter every handler will eventually answer through — without moving a single handler
onto it.

**Architecture:** Two independent pieces, in this order. The inventory is a document:
every tool's current inputs, outputs, transformation and error decision, plus the terse
projection proposed for it and every field that would be dropped. The adapter is one
file with no callers yet: it turns an `IAdtResponse` into an MCP result, owns the
exception boundary, and never lets a defect of ours wear a server's `origin`.

**Tech Stack:** TypeScript (strict, CommonJS), Jest with ts-jest, Biome,
`@mcp-abap-adt/adt-clients` 18, `@mcp-abap-adt/interfaces` 39.

**Spec:** `docs/superpowers/specs/2026-09-08-result-error-strategies-design.md`
(approved 2026-09-09).

**Why no handler migration here.** An earlier draft of this plan put a handler group
first, on the premise that a source reader's output is just the source and would
therefore not change. That is false: `ReadClass` answers
`{ success, class_name, version, source_code, metadata }`, and the others answer their
own envelope. Worse, two of them earn their envelope — `ReadProgram` reads the metadata
to reject a `PROG/I` with `invalid_object_type` rather than a misleading
`{ success: true, source_code: null }`, and `ReadFunctionModule` checks that the module
belongs to the group it was asked about. A mechanical move to an identity projection
would have deleted both guarantees and changed every reader's output before the table
that is supposed to authorise such changes existed. So: the table first, every handler
after, in plans written from it.

## Global Constraints

- All repository artifacts — code, comments, commit messages, docs — in **English**.
- Branch from `main`, named `feat/answer-adapter`. Never commit to `main` directly;
  specs and plans are the exception and are already there.
- Stack: `@mcp-abap-adt/adt-clients@^18.0.1`, `@mcp-abap-adt/interfaces@^39.0.1`,
  `@mcp-abap-adt/connection@^8.0.1`, `@mcp-abap-adt/logger@^0.3.1`.
- `npm ls @mcp-abap-adt/interfaces` must print **one** version for the core chain.
  Two structurally identical copies do not compare equal in TypeScript.
- Biome: single quotes, semicolons, 2-space indent. `npm run lint` before every commit.
- After every step that changes code:
  `npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1; grep -c 'TS1128\|TS1005' /tmp/tsc.log`
  must print `0`. A sudden drop in the total error count usually means a parse failure
  stopped the compiler — see `docs/development/TROUBLESHOOTING.md`.
- **The whole-repository typecheck will not be clean during this plan, and that is
  expected.** Task 2 raises the dependency stack, and every handler still speaks the old
  contract; the migration plans bring the count back to zero. Record the total after
  Task 2 so a later task can tell whether it made things worse.
- **Therefore commits from Task 2 onward use `git commit --no-verify`.**
  `.husky/pre-commit` runs `npx lint-staged`, then `npm run build`, and `build` is
  `biome check --write --diagnostic-level=error src && npx tsc -p tsconfig.json` — a
  whole-repository typecheck. From the moment the stack goes up it exits non-zero, so
  the hook would block every remaining commit in this plan. Skipping it is deliberate and
  temporary; the last migration plan restores a clean build and the hook with it. Task 1
  commits normally, before the stack moves.
- Skipping the hook removes two checks, so each of those steps runs them by hand: the
  `npx biome check --write` already in every commit step, and this scoped gate in place
  of the full typecheck:
  ```bash
  npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1
  grep -c 'src/lib/answer.ts' /tmp/tsc.log   # must print 0
  grep -c 'TS1128\|TS1005' /tmp/tsc.log      # must print 0
  ```
  It greps for `src/lib/answer.ts` and nothing else, because `tsconfig.json` excludes
  `src/__tests__` — a test file's path never appears in that log, and a gate naming one
  would pass whatever the tests did. The tests are typechecked by ts-jest instead, which
  transforms them against `tsconfig.test.json` with diagnostics on, so a type error in a
  test **fails the jest run**. Running the suite is the test-side gate; there is no other.
- Unit tests need no SAP system, but `npx jest` is not offline. `package.json` sets
  `globalSetup` to `src/__tests__/integration/globalSetup.ts`, which runs for **every**
  jest invocation, unit runs included. Without `tests/test-config.yaml` it returns
  immediately and never throws. With one, it opens a session for the configured
  destination and prints `[globalSetup] Session ready for "<dest>"`. If that turns into
  an interactive browser OAuth prompt, **stop and ask the user** rather than letting a
  browser flow fire unannounced; auth failure is not fatal — globalSetup catches and
  continues.
- **No handler is modified by this plan.** A task that finds itself editing
  `src/handlers/` has gone outside its scope.

---

### Task 1a: The enumeration

The inventory is two jobs with different shapes, and they are two tasks. This one is
mechanical: the scripts decide every cell in it, and a reviewer checks it by re-running
them. Task 1b is 362 handler reads and no script can do it.

**Files:**
- Create: `scripts/list-tools.ts` — enumeration and the six-mode visibility sets
- Create: `scripts/tool-provenance.ts` — the three-tier name-to-file map
- Create: `docs/superpowers/specs/2026-09-09-tool-inventory-rows.md` — the skeleton

The scripts are committed, not scratch: every number in the inventory comes out of them, a
reviewer who cannot re-run them cannot check the table, and they are what keeps it
refreshable after handlers move. Keep them next to the probes already in `scripts/`, in
the same shape.

**Interfaces:**
- Consumes: nothing. This task reads `main` and writes two scripts and one document.
- Produces: `2026-09-09-tool-inventory-rows.md` — one row per **(tool, group)** pair with
  the four columns a script can fill, plus the six-mode matrix and the findings named in
  Step 1. Task 1b adds columns to these rows and adds no rows.

- [ ] **Step 0: Create the branch**

Nothing else in this plan does, and the constraint above forbids committing to `main`.

```bash
git checkout main && git pull --ff-only
git checkout -b feat/answer-adapter
git branch --show-current   # must print feat/answer-adapter
```

One branch carries all five tasks. Task 1 writes only a document and scripts, but it is
the reason the later tasks look the way they do, and splitting it off would put the table
and the code that follows from it in different histories.

- [ ] **Step 1: Enumerate the tools, not the files**

A file is not a tool. `src/handlers/common/high/objectVersionTools.ts` has no
`TOOL_DEFINITION` of its own: `buildObjectVersionTools()` walks `VERSIONED_TYPES` and
generates three tools for each of the nine types — Versions, VersionSource, VersionDiff.
Counting files would give it one unreadable row and lose all twenty-seven contracts, and
any other factory added since would vanish the same way.

And one `HandlerExporter` run is not the answer either. Its constructor
(`src/lib/handlers/HandlerExporter.ts:104-122`) turns read-only, high, low, system and
search on unless switched off, but leaves **compact off unless explicitly asked for**
(`includeCompact === true`). That default is a combination the server never runs:
`validateExposition` (`src/lib/config/validateExposition.ts`) rejects `high` together with
`low`, and rejects `compact` alongside anything at all. So a single default run would miss
every compact tool, and would report a read-only surface the default exposition does not
actually show.

Enumerate **per group**, and keep the group on the row:

```ts
// scripts/list-tools.ts — write it, run it, keep it
import type { HandlerContext } from '../src/handlers/interfaces.js';
import {
  CompactHandlersGroup,
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../src/lib/handlers/groups/index.js';

// Groups only read `connection` when a handler runs; listing never runs one.
const ctx = { connection: null, logger: undefined } as unknown as HandlerContext;

const groups = {
  // Default arguments on purpose: an empty overriding set and NoDedupStrategy,
  // so this is the full read-only surface before any exposition hides part of it.
  readonly: new ReadOnlyHandlersGroup(ctx),
  high: new HighLevelHandlersGroup(ctx),
  low: new LowLevelHandlersGroup(ctx),
  compact: new CompactHandlersGroup(ctx),
  system: new SystemHandlersGroup(ctx),
  search: new SearchHandlersGroup(ctx),
};

const rows = Object.entries(groups).flatMap(([group, instance]) =>
  instance.getHandlers().map((entry) => ({
    group,
    name: entry.toolDefinition.name,
    schema: entry.toolDefinition.inputSchema,
  })),
);

console.log(JSON.stringify(rows, null, 2));
```

```bash
npx tsx scripts/list-tools.ts > /tmp/tools.json
node -e "const r=require('/tmp/tools.json');
console.log('rows', r.length, '/ distinct names', new Set(r.map(x=>x.name)).size);
const by={}; for (const x of r) (by[x.name] ||= []).push(x.group);
console.log('names carried by more than one group:');
for (const [n,g] of Object.entries(by)) if (g.length>1) console.log(' ', n, g.join('+'));"
```

Run on `main` while writing this plan, that prints **362 rows, 362 distinct names**, and
no name carried by more than one group. Two things follow. The first is the count: 362
registered tools against 327 files with a `TOOL_DEFINITION`, and the difference is the
factories. The second is that the groups partition the names today — so if this ever
prints a name in two groups, that is a finding to write up before continuing, not a
duplicate to collapse.

Read `src/lib/handlers/interfaces.ts` and `src/lib/handlers/groups/index.ts` before
running and use what they actually expose — today `IHandlerGroup.getHandlers()` returning
`HandlerEntry { toolDefinition, handler }` — rather than trusting this snippet's names.

All three snippets in this step were compiled against the repository's own `tsconfig.json`
(`strict: true`, `module: node16`) and run on `main`; every number quoted below is
their output, not an estimate. Still read the two files above before running — if the
group API has moved since, fix the snippet rather than working around it.

**One row per (tool, group) pair, not per name.** Even with the names partitioned, the
group is what decides whether a row is reachable, so it belongs on the row rather than in
a heading.

`HandlerEntry` carries no file, and grepping for the tool name does not recover one:
twenty-seven names exist only as strings built inside `buildObjectVersionTools()`, and
fourteen more are invented in the group file, where `HighLevelHandlersGroup` spreads a
low-level definition and overrides its name —
`{ ...ActivateDomain_Tool, name: 'ActivateDomain' }` at
`src/lib/handlers/groups/HighLevelHandlersGroup.ts:552-560`, whose handler lives in
`src/handlers/domain/low/handleActivateDomain.ts` under the name `ActivateDomainLow`. A
name grep leaves the first group unmatched and points the second at the group file.

Resolve provenance from the modules instead, in three tiers, and fail loudly rather than
leaving a blank cell:

```ts
// scripts/tool-provenance.ts — joins to the rows from list-tools.ts by name
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

const isToolDef = (v: unknown): v is { name: string } =>
  !!v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' &&
  'inputSchema' in (v as object);

const provenance = new Map<string, Set<string>>();
const add = (name: string, file: string) => {
  const at = provenance.get(name) ?? new Set<string>();
  at.add(file);
  provenance.set(name, at);
};

for (const file of walk('src/handlers')) {
  let mod: Record<string, unknown>;
  try { mod = require(`../${file}`) as Record<string, unknown>; } catch { continue; }

  for (const value of Object.values(mod)) {
    // Tier 1: an exported TOOL_DEFINITION, or an exported array of definitions/entries.
    if (isToolDef(value)) { add(value.name, file); continue; }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isToolDef(item)) add(item.name, file);
        else if (item && isToolDef((item as { toolDefinition?: unknown }).toolDefinition)) {
          add(((item as { toolDefinition: { name: string } }).toolDefinition).name, file);
        }
      }
      continue;
    }
    // Tier 2: a zero-argument build* factory. Call it and take the names it produces —
    // this is the only way to attribute a generated name to the file that generates it.
    if (typeof value === 'function' && value.length === 0 && /^build/.test(value.name)) {
      try {
        const out = (value as () => unknown)();
        if (Array.isArray(out)) {
          for (const item of out) {
            const td = (item as { toolDefinition?: unknown })?.toolDefinition;
            if (isToolDef(td)) add(td.name, file);
          }
        }
      } catch { /* not a tool factory; ignore */ }
    }
  }
}

for (const [name, files] of provenance) {
  if (files.size > 1) console.error('AMBIGUOUS', name, [...files].join(', '));
}
console.log(JSON.stringify([...provenance].map(([name, f]) => ({ name, files: [...f] })), null, 2));
```

Run on `main`, tiers 1 and 2 resolve **348 of the 362 rows** with no name claimed by two
files, including all twenty-seven from `objectVersionTools.ts`. The remaining fourteen are
exactly the high-level renames, and they are tier 3:

```
ActivateDomain, ActivateDataElement, ActivateTable, ActivateStructure, ActivateDdl,
ActivateClass, ActivateInterface, ActivateProgram, ActivateFunctionModule,
ActivateFunctionGroup, ActivateBehaviorDefinition, ActivateMetadataExtension,
ActivateServiceDefinition, ActivateServiceBinding
```

For those, grep the group file for `name: '<ToolName>'`, read the `...X_Tool` it spreads,
follow that import, and record **two** paths in the row: the group file, which owns the
name and the description the model reads, and the handler file, which owns the behaviour.
They matter separately here — the same handler is also registered in the low group under
its own name, so a migration touching the handler changes two rows, while one touching the
description changes one. If a run leaves any row outside these three tiers, stop and
extend the script; a blank file cell is a row nobody can migrate.

The launcher never exposes all of that at once, and the inventory must say what each
exposition actually shows. `src/server/launcher.ts:203-241` builds high, low or compact
first, collects their tool names into `overridingToolNames`, then constructs
`ReadOnlyHandlersGroup(ctx, overridingToolNames, new ReadVsGetDedupStrategy())` — so a
read-only handler paired with an exposed one is **suppressed, not merged**. Note also that
the launcher adds `SystemHandlersGroup` only when the exposition includes `readonly`,
while `SearchHandlersGroup` is always added.

**Cover every exposition the server accepts, not a chosen few.** `HandlerSet` is
`'readonly' | 'high' | 'low' | 'compact'` (`src/lib/config/IServerConfig.ts:22`) and
`validateExposition` rejects exactly two things: `compact` with anything else, and `high`
together with `low`. That leaves six supported modes, and standalone `high` and `low` are
among them — they get no system and no read-only group at all, which no three-mode sample
would have shown:

```ts
// append to scripts/list-tools.ts
import { ReadVsGetDedupStrategy } from '../src/lib/handlers/groups/strategies/index.js';

type GroupKey = keyof typeof groups;

// Annotated rather than inferred: without this the array widens to string[][] and
// groups[e] indexes an object with no index signature, which strict mode rejects.
const EXPOSITIONS: ReadonlyArray<readonly GroupKey[]> = [
  ['readonly'],
  ['high'],
  ['low'],
  ['readonly', 'high'], // the default
  ['readonly', 'low'],
  ['compact'],
];

// Mirrors launcher.ts:203-241: overriding groups first, then a read-only group that has
// seen their names, system only alongside readonly, search always.
for (const exposition of EXPOSITIONS) {
  const overriding = exposition.filter((e) => e !== 'readonly');
  const overridingNames = new Set<string>(
    overriding.flatMap((e) => groups[e].getHandlers().map((h) => h.toolDefinition.name)),
  );

  const visible: { group: GroupKey; name: string }[] = [];
  const take = (group: GroupKey, entries: { toolDefinition: { name: string } }[]) => {
    for (const e of entries) visible.push({ group, name: e.toolDefinition.name });
  };

  if (exposition.includes('readonly')) {
    take('readonly',
      new ReadOnlyHandlersGroup(ctx, overridingNames, new ReadVsGetDedupStrategy()).getHandlers());
    take('system', groups.system.getHandlers());
  }
  for (const e of overriding) take(e, groups[e].getHandlers());
  take('search', groups.search.getHandlers());

  console.error(exposition.join(','), visible.length);
  // Write `visible` out per mode: the "visible in" column is built from these six sets.
}
```

Run on `main` while writing this plan, the six modes come out as:

| exposition | tools | composition |
|---|---|---|
| `readonly` | 68 | readonly 34/34 + system 30 + search 4 |
| `high` | 160 | high 156 + search 4 |
| `low` | 120 | low 116 + search 4 |
| `readonly,high` *(default)* | 206 | readonly 16/34 + system 30 + high 156 + search 4 |
| `readonly,low` | 184 | readonly 34/34 + system 30 + low 116 + search 4 |
| `compact` | 26 | compact 22 + search 4 |

Read this as a coverage statement, not a summary. A read-only tool is withheld for two
different reasons and the inventory must not blur them: under `readonly,high` **eighteen
of the thirty-four are suppressed by the dedup strategy**, because `high` exposes their
`Get<X>` counterpart; under `high`, `low` and `compact` the read-only group is never
constructed, so all thirty-four are absent along with all thirty system tools. Only
`search` is in every mode. A row visible in no mode at all is a finding to write up.

Three edges belong in the inventory as findings rather than as rows:

- `validateExposition([])` does not throw, and `config.exposition` of `[]` is truthy, so
  an empty exposition survives `launcher.ts:204` and starts a server exposing the four
  search tools and nothing else.
- The CLI help (`src/lib/config/ServerConfigManager.ts:239-245`) advertises
  `--exposition=readonly,high,low (all handlers)`, which `validateExposition` rejects.
  The help is wrong; record it, do not act on it here.
- `EmbeddableMcpServer` is a second entry point with different rules
  (`src/server/EmbeddableMcpServer.ts:53-59, 185-220`): its exposition vocabulary also
  takes `'system'` and `'search'` as explicit opt-ins, it never calls
  `validateExposition`, and its `readOnlyDedupStrategy` may be omitted, in which case
  `overridingToolNames` stays empty and nothing is suppressed. The matrix above describes
  the launcher. Note per row where the embeddable path would differ; do not enumerate its
  combinations, since it accepts ones the CLI rejects.

The file count — `grep -rl 'TOOL_DEFINITION' src/handlers --include='*.ts' | wc -l`, 327
today — is **not** a lower bound to check the enumeration against, and an earlier draft of
this plan was wrong to use it as one: factories push the tool count above the file count
(362 against 327), files whose tools no group registers push it below, and the two do not
cancel. Use it for one thing only — listing files whose tool names appear in no group,
which is a finding about dead handlers rather than a check on the enumeration.

- [ ] **Step 2: Write the skeleton**

`docs/superpowers/specs/2026-09-09-tool-inventory-rows.md`. One row per (tool, group)
pair — 362 of them — and only the columns the scripts decide:

| column | what goes in it |
|---|---|
| tool | the `name` from the enumeration |
| group | readonly, high, low, compact, system, search |
| implementation files | from `scripts/tool-provenance.ts` — tier 1 or 2 gives one path; a tier-3 high-level rename gives **two**, the group file that owns the name and description and the handler file that owns the behaviour, and both go in the cell |
| visible in | which of the **six** supported expositions expose this row — `readonly`, `high`, `low`, `readonly,high`, `readonly,low`, `compact` — taken from the six sets the second snippet writes out, not from the summary table. A row visible in none of them is a finding, not a row to migrate silently |
| current inputs | every property of `inputSchema`, and which are required |

Leave the other eight columns out of this document entirely — Task 1b adds them. Do not
guess at them, and do not add a placeholder column: an empty cell in a committed table
reads as "checked, nothing there".

Above the table, put what the runs produced:

- the six-mode matrix, as counts and composition;
- the three edge findings from Step 1 — the empty exposition, the CLI help that advertises
  a combination `validateExposition` rejects, and `EmbeddableMcpServer`'s different rules;
- any name a group registers that the provenance tiers could not place, and any file with a
  `TOOL_DEFINITION` whose tools no group registers. Both lists should be empty on `main`
  today; if either is not, say so rather than dropping the rows.

State the totals in the same place: 362 rows, 362 distinct names, 348 placed by tiers 1-2,
14 by tier 3. If a run disagrees with a number in this plan, the run is right and the
disagreement goes in the document — the plan was measured on `main` on 2026-09-09.

- [ ] **Step 3: Commit**

Name the files. `npm run lint` covers `src/` only, so the new scripts are formatted by
hand — but **only the ones this task wrote**. `biome check --write scripts/` would
reformat six probe scripts that already live there and have never been linted
(`list-dumps.ts` and `list-traces.ts` carry format diagnostics today), and
`git add scripts/` would sweep them, plus anything else untracked, into a commit that
claims to hold inventory artifacts.

```bash
npx biome check --write scripts/list-tools.ts scripts/tool-provenance.ts

git add docs/superpowers/specs/2026-09-09-tool-inventory-rows.md \
        scripts/list-tools.ts scripts/tool-provenance.ts

git status --short scripts/   # read it: anything unstaged here is a file this task
                              # did not write. Leave it alone; do not add it.
git commit -m "docs(spec): enumerate the tools, one row per (tool, group)

362 registered tools across six handler groups, with the file that implements
each and the expositions that expose it. 348 rows are placed by an exported
definition or by calling a build* factory; the other 14 are high-level renames,
where the group file owns the name and a low-level file owns the behaviour, and
both paths are in the row.

The two scripts ship with the table. Every count in it is their output, and a
table nobody can re-derive is a table nobody can check.

Columns that need a handler read — output, transformation, error decision,
guarantees, and the proposed projection — are Task 1b's, and are absent rather
than blank."

git status --short scripts/list-tools.ts scripts/tool-provenance.ts 2>/dev/null
# Empty: the files this task wrote are committed. Anything else still listed by
# `git status --short scripts/` belongs to someone else and stays untouched.
```

---

### Task 1b: The inventory

**Files:**
- Create: `docs/superpowers/specs/2026-09-09-tool-inventory.md`
- Create: `scripts/probe-package-contents.ts` — only if Step 2 finds no existing probe
- Read: `docs/superpowers/specs/2026-09-09-tool-inventory-rows.md` (from Task 1a)

**Interfaces:**
- Consumes: the skeleton from Task 1a — 362 rows, each with tool, group, implementation
  files, visible in, and current inputs.
- Produces: the compatibility table every later plan is written from. Nothing downstream
  may drop a field or an input that does not appear in it.

Carry every skeleton row across unchanged and add the eight columns below. **Do not
re-derive the rows** — if a row looks wrong, that is a finding about Task 1a's scripts,
and it goes in the document rather than being silently corrected here.

- [ ] **Step 1: Fill the remaining columns, one group at a time**

| column | what goes in it |
|---|---|
| current default output | the exact object the handler returns today, field by field |
| transformation today | how it turns the ADT answer into that output — name the parser it calls, or "returns the document" |
| error decision today | what it treats as a failure — an HTTP status, a thrown error, a field in the document |
| guarantees | any check the handler performs beyond reading, quoted from its own comment where it has one |
| new inputs | after `detail` is added and any removed parameter is gone |
| new terse projection | the fields terse will carry |
| dropped | every field in "current default output" absent from "new terse projection" |
| justification | why each dropped field may go |

The rule for the last two, from the spec: a field the caller needs to make the next call
— an object name it did not already have, a transport number it must quote — stays in
`terse`; a field that only describes what just happened moves to `full`.

The **guarantees** column is not decoration. Two known entries, and the inventory must
find the rest:

- `src/handlers/program/readonly/handleReadProgram.ts` reads the metadata to reject
  anything that is not `PROG/P`, answering `invalid_object_type` — explicitly so that a
  caller does not receive `{ success: true, source_code: null }` and read it as a
  permission problem.
- `src/handlers/function_module/readonly/handleReadFunctionModule.ts` checks that the
  module belongs to the function group it was asked about.

A guarantee that depends on a field is a reason that field stays, or a reason the
guarantee moves somewhere it still holds. Either is a decision, and it goes in the row.

**Work group by group and commit after each**, in this order: system and search (34), then
readonly (34), then compact (22), then high (156), then low (116). Each commit is
`docs(spec): tool inventory — <group>`, and the document says at the top which groups are
filled. 362 rows do not fit one sitting, and a half-finished table in the working tree is
lost work; a half-finished table in git is a starting point. Do not summarise a group
you have not read handler by handler — a row asserting an output nobody checked is worse
than a missing row, because the migration plans will trust it.

- [ ] **Step 2: Record the traversal bound**

For `GetPackageTree`, `GetPackageContents` and `GetObjectsList`, run each against a real
package on the trial system and record how many objects and how many round trips a full
walk costs:

```bash
npx tsx scripts/probe-transport-list.ts --env trial.env   # pattern for a probe script
```

If no probe covers package contents, write `scripts/probe-package-contents.ts` in the
same shape and commit it in Step 3. Where a name is carried by more than one group,
measure the one the default exposition exposes. Fix the safety bound from the measurement
and write both the number and the measurement down. This is the one number the design
deliberately left to the inventory.

This step talks to a real SAP system. If the session needs an interactive browser login,
**stop and ask the user** rather than letting a browser flow fire unannounced.

- [ ] **Step 3: Commit**

```bash
npx biome check --write scripts/probe-package-contents.ts   # only if Step 2 wrote it

git add docs/superpowers/specs/2026-09-09-tool-inventory.md
git add scripts/probe-package-contents.ts                   # only if Step 2 wrote it
git commit -m "docs(spec): the stage-1 tool inventory

Every row from the enumeration, with what the handler returns today, how it
transforms the ADT answer, how it decides an error, and what it guarantees
beyond reading. Then the proposed terse projection and every field that would be
dropped, each with its justification.

The guarantees column exists because two readers earn their envelopes —
ReadProgram rejects a PROG/I by reading the metadata, ReadFunctionModule checks
the module belongs to its group — and a migration that did not know that would
delete both.

Includes the traversal bound, measured rather than guessed."
```

- [ ] **Step 4: Stop and ask for review**

The design makes this table a precondition: no handler moves until it is reviewed. Post
the table and wait. Do not begin any migration plan on your own authority. Tasks 2-5 build
the adapter and touch no handler, so they may proceed while the table is in review.

---

### Task 2: Raise the dependency stack

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/connectionFactory.ts` (cherry-picked)

**Interfaces:**
- Consumes: nothing.
- Produces: `createAbapConnection(config, logger?, sessionId?, tokenRefresher?): IAbapConnection`
  from `src/lib/connectionFactory.ts`, which is what the rest of the repository already
  imports; and the `IAdtResponse` shape Tasks 3-5 are written against.

The repository is on adt-clients 10, interfaces 13 and connection 1 today. The adapter
cannot be written against those: `IAdtResponse` has a different shape there, with no
`ok` and no `getResult()`. connection 8 also removed `createAbapConnection`, so nothing
compiles until the local factory is in place.

- [ ] **Step 1: Install the stack**

```bash
npm install @mcp-abap-adt/adt-clients@^18.0.1 @mcp-abap-adt/interfaces@^39.0.1 \
            @mcp-abap-adt/connection@^8.0.1 @mcp-abap-adt/logger@^0.3.1
```

The lockfile will show **adt-clients 18.0.2** — that is the current publish and the caret
allows it. Do not pin it back to 18.0.1.

If npm answers `ERESOLVE`, it will be the auth packages, which depend on an older
`interfaces`. **Do not add an `overrides` block and do not pass `--force`.** Overrides
are the crutch this repository has a standing rule against: the fix is a direct-dependency
bump or an in-range resolution, and if neither works the auth packages need a release
first. Record what npm said and stop — that is a finding for the user, not a decision for
this task.

- [ ] **Step 2: Verify one interfaces copy in the core chain**

```bash
npm ls @mcp-abap-adt/interfaces
```

Expected: `adt-clients`, `connection`, `logger` and the top level all show `39.0.1`, three
of them `deduped`. The auth packages carry their own older copies; that is known and does
not affect the core chain. If any of the four shows a different version, stop — two
structurally identical types do not compare equal, and the errors read as impossible.

- [ ] **Step 3: Take the connection factory from the reference branch**

```bash
git checkout chore/bump-current-stack -- src/lib/connectionFactory.ts
```

Read it before continuing. It is the one place in the server that decides which system is
being dialled, because connection 8 removed the factory that used to guess: cloud takes
`AdtCloudConnector` with `TokenAuthProvider`, on-prem takes `AdtOnPremConnector` with a
provider per auth type, RFC takes `RfcTransport`, and kerberos is refused by name because
6.0 removed it without a replacement.

- [ ] **Step 4: Record where the compiler stands**

```bash
npx tsc --noEmit -p tsconfig.json > /tmp/tsc-after-bump.log 2>&1
grep -c 'error TS' /tmp/tsc-after-bump.log      # expect several hundred; write it down
grep -c 'TS1128\|TS1005' /tmp/tsc-after-bump.log # must print 0
```

Hundreds of errors are the expected state: every handler still speaks the old contract.
Put the number in the commit message so a later task can tell whether it made things
worse.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/lib/connectionFactory.ts
git add package.json package-lock.json src/lib/connectionFactory.ts
git commit --no-verify -m "chore(deps): raise the stack to adt-clients 18, interfaces 39, connection 8

The adapter cannot be written against interfaces 13: IAdtResponse has no ok and
no getResult() there. connection 8 removed createAbapConnection, so the local
factory comes across from the reference branch — it is the one place that states
which system is dialled, which the library now requires of its caller.

The repository does not typecheck after this and is not meant to: every handler
still speaks the old contract, and the migration plans bring it back to zero.
Errors after this commit: <N>.

Committed with --no-verify: .husky/pre-commit runs npm run build, which
typechecks the whole repository, and from here it cannot pass. Biome ran by
hand above."
```

---

### Task 3: The adapter's success half

**Files:**
- Create: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerSuccess.test.ts`

**Interfaces:**
- Consumes: `IAdtResponse`, `IAdtError` from `@mcp-abap-adt/interfaces`.
- Produces:
  - `type AnswerDetail = 'terse' | 'full' | 'raw'`
  - `interface AnswerContext { tool: string; detail: AnswerDetail }`
  - `interface McpResult { isError: boolean; content: Array<{ type: 'text'; text: string }> }`
  - `function return_answer<T>(answer: IAdtResponse<T, IAdtError>, project: (value: T) => unknown, ctx: AnswerContext): McpResult`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/answerSuccess.test.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { return_answer } from '../../lib/answer';

function success<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

const ctx = { tool: 'GetClass', detail: 'terse' as const };

describe('return_answer — success', () => {
  it('passes a string projection through verbatim', () => {
    const result = return_answer(success('CLASS zcl_x.'), (v) => v, ctx);

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('CLASS zcl_x.');
  });

  it('serialises anything else as indented JSON', () => {
    const result = return_answer(success({ a: 1 }), (v) => v, ctx);

    expect(result.content[0].text).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('treats an undefined projection as a failure, never as SUCCESS', () => {
    const result = return_answer(success('anything'), () => undefined, ctx);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('projection_failed');
    expect(payload.tool).toBe('GetClass');
    expect(payload.detail).toBe('terse');
    expect(payload.origin).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/answerSuccess.test.ts`
Expected: FAIL — `Cannot find module '../../lib/answer'`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/answer.ts
/**
 * How a handler answers.
 *
 * adt-clients 18 hands back `IAdtResponse`, whose two type parameters are the two
 * injected strategies. Turning either half into an MCP result is this file's job, and
 * only this file's: a handler that did it itself would repeat four lines per tool and
 * throw away everything the error contract carries.
 *
 * See docs/superpowers/specs/2026-09-08-result-error-strategies-design.md.
 */
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';

export type AnswerDetail = 'terse' | 'full' | 'raw';

export interface AnswerContext {
  /** The tool's own name, so a local failure can say where it happened. */
  tool: string;
  detail: AnswerDetail;
}

export interface McpResult {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

function text(value: string, isError = false): McpResult {
  return { isError, content: [{ type: 'text', text: value }] };
}

function json(payload: unknown, isError = false): McpResult {
  return text(JSON.stringify(payload, null, 2), isError);
}

/**
 * A failure of our own reading, which never borrows an `AdtFailureOrigin`:
 * `connection` and `refusal` are both claims about the server, and neither is true
 * when the defect is in this process.
 */
function local(kind: string, ctx: AnswerContext, message: string): McpResult {
  return json({ error: kind, tool: ctx.tool, detail: ctx.detail, message }, true);
}

export function return_answer<T>(
  answer: IAdtResponse<T, IAdtError>,
  project: (value: T) => unknown,
  ctx: AnswerContext,
): McpResult {
  if (!answer.ok) {
    throw new Error('return_answer: failure half not implemented yet');
  }

  const projected = project(answer.getResult().value);

  if (projected === undefined) {
    return local(
      'projection_failed',
      ctx,
      `the ${ctx.detail} projection produced no value for ${ctx.tool}`,
    );
  }

  return typeof projected === 'string' ? text(projected) : json(projected);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/__tests__/unit/answerSuccess.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/lib/answer.ts src/__tests__/unit/answerSuccess.test.ts
npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1
grep -c 'src/lib/answer.ts' /tmp/tsc.log   # must print 0
git add src/lib/answer.ts src/__tests__/unit/answerSuccess.test.ts
git commit --no-verify -m "feat(answer): the adapter's success half

A string projection goes back verbatim, so source and raw stay themselves;
anything else is indented JSON. An undefined projection is a failure on the
local path, never SUCCESS: the adapter cannot tell a write with nothing to add
from a read that found nothing, and reading the second as success is the
masking defect this repository has removed three times."
```

---

### Task 4: The adapter's failure half

**Files:**
- Modify: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerFailure.test.ts`

**Interfaces:**
- Consumes: `return_answer`, `AnswerContext`, `McpResult` from Task 3.
- Produces: the failure payload shape — `{ message, origin, code?, adt_type?, namespace?, request?, messages?, raw_body? }`,
  where `request` is `{ method?, url? }` rebuilt field by field rather than the object
  the strategy supplied.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/answerFailure.test.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { return_answer } from '../../lib/answer';

function failure(
  error: Partial<IAdtError> & { messages?: unknown },
): IAdtResponse<never, IAdtError> {
  return {
    ok: false,
    getResult: () => {
      throw new Error('not a success');
    },
    getError: () => error,
  } as unknown as IAdtResponse<never, IAdtError>;
}

const project = (v: unknown) => v;

describe('return_answer — failure', () => {
  it('keeps the allowlist and omits what the strategy did not fill', () => {
    const result = return_answer(
      failure({ message: 'Object is locked', origin: 'refusal', code: 'LOCK_FAILED' }),
      project,
      { tool: 'UpdateClass', detail: 'terse' },
    );

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      message: 'Object is locked',
      origin: 'refusal',
      code: 'LOCK_FAILED',
    });
  });

  it('carries the server classification and the request when present', () => {
    const result = return_answer(
      failure({
        message: 'No authorization',
        origin: 'refusal',
        adtType: 'CLAS/OC',
        namespace: '/SAP/',
        request: { method: 'POST', url: '/sap/bc/adt/oo/classes' },
      }),
      project,
      { tool: 'CreateClass', detail: 'terse' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.adt_type).toBe('CLAS/OC');
    expect(payload.namespace).toBe('/SAP/');
    expect(payload.request).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/oo/classes',
    });
  });

  it('copies method and url out of request and drops everything else', () => {
    const result = return_answer(
      failure({
        message: 'No authorization',
        origin: 'refusal',
        request: {
          method: 'POST',
          url: '/sap/bc/adt/oo/classes',
          headers: { authorization: 'Bearer secret-token', cookie: 'SAP_SESSIONID=x' },
          data: '<class/>',
        } as never,
      }),
      project,
      { tool: 'CreateClass', detail: 'raw' },
    );

    // Not on the object, and not anywhere in the text either: a nested leak that
    // toEqual would catch on request alone could still ride out on another field.
    expect(JSON.parse(result.content[0].text).request).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/oo/classes',
    });
    expect(result.content[0].text).not.toContain('Bearer');
    expect(result.content[0].text).not.toContain('SAP_SESSIONID');
  });

  it('omits request entirely when it carries neither method nor url', () => {
    const result = return_answer(
      failure({
        message: 'boom',
        origin: 'connection',
        request: { headers: { authorization: 'Bearer secret-token' } } as never,
      }),
      project,
      { tool: 'GetClass', detail: 'terse' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.request).toBeUndefined();
    expect(result.content[0].text).not.toContain('Bearer');
  });

  it('never serialises the response object', () => {
    const circular: Record<string, unknown> = { headers: { cookie: 'secret' } };
    circular.self = circular;

    const result = return_answer(
      failure({ message: 'boom', origin: 'connection', response: circular as never }),
      project,
      { tool: 'GetClass', detail: 'terse' },
    );

    expect(result.content[0].text).not.toContain('cookie');
    expect(JSON.parse(result.content[0].text).response).toBeUndefined();
  });

  it('includes raw_body only at detail raw and only for a string body', () => {
    const error = {
      message: 'boom',
      origin: 'refusal' as const,
      response: { data: '<exc:exception/>' } as never,
    };

    const raw = return_answer(failure(error), project, {
      tool: 'GetClass',
      detail: 'raw',
    });
    expect(JSON.parse(raw.content[0].text).raw_body).toBe('<exc:exception/>');

    const terse = return_answer(failure(error), project, {
      tool: 'GetClass',
      detail: 'terse',
    });
    expect(JSON.parse(terse.content[0].text).raw_body).toBeUndefined();

    const parsed = return_answer(
      failure({
        message: 'boom',
        origin: 'refusal',
        response: { data: { a: 1 } } as never,
      }),
      project,
      { tool: 'GetClass', detail: 'raw' },
    );
    expect(JSON.parse(parsed.content[0].text).raw_body).toBeUndefined();
  });

  it('passes messages through when the strategy supplied them', () => {
    const result = return_answer(
      failure({
        message: 'Check found errors',
        origin: 'refusal',
        messages: [{ type: 'E', text: 'Syntax error in line 3' }],
      }),
      project,
      { tool: 'CheckClass', detail: 'terse' },
    );

    expect(JSON.parse(result.content[0].text).messages).toEqual([
      { type: 'E', text: 'Syntax error in line 3' },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/answerFailure.test.ts`
Expected: FAIL — `return_answer: failure half not implemented yet`.

- [ ] **Step 3: Add the allowlist and replace the failure branch**

Add above `return_answer` in `src/lib/answer.ts`:

```ts
/** What an error strategy may add beyond `IAdtError`; see the spec's Errors section. */
interface MessageCarrier {
  messages?: ReadonlyArray<{ type: string; text: string }>;
}

/**
 * The allowlist. `response` is never serialised: it holds headers, cookies and possibly
 * circular references, and its body is reachable as `raw_body` at `detail: 'raw'`.
 */
function failurePayload(
  error: IAdtError & MessageCarrier,
  ctx: AnswerContext,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    message: error.message,
    origin: error.origin,
  };

  if (error.code !== undefined) payload.code = error.code;
  if (error.adtType !== undefined) payload.adt_type = error.adtType;
  if (error.namespace !== undefined) payload.namespace = error.namespace;
  // Two fields, copied by name — not the object. The contract types `request` as
  // `{ method?, url? }`, but a type is not a filter: TypeScript accepts a wider object
  // structurally, and a strategy that puts its transport config here would send
  // headers, an Authorization bearer and cookies straight to the model. This is the
  // same leak `response` is kept out of the payload for.
  const method = error.request?.method;
  const url = error.request?.url;
  if (typeof method === 'string' || typeof url === 'string') {
    const request: Record<string, string> = {};
    if (typeof method === 'string') request.method = method;
    if (typeof url === 'string') request.url = url;
    payload.request = request;
  }
  if (error.messages !== undefined) payload.messages = error.messages;

  const body = (error.response as { data?: unknown } | undefined)?.data;
  if (ctx.detail === 'raw' && typeof body === 'string') {
    payload.raw_body = body;
  }

  return payload;
}
```

and replace the `if (!answer.ok)` branch inside `return_answer` with:

```ts
  if (!answer.ok) {
    return json(
      failurePayload(answer.getError() as IAdtError & MessageCarrier, ctx),
      true,
    );
  }
```

- [ ] **Step 4: Run both adapter suites**

Run: `npx jest src/__tests__/unit/answerSuccess.test.ts src/__tests__/unit/answerFailure.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/lib/answer.ts src/__tests__/unit/answerFailure.test.ts
npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1
grep -c 'src/lib/answer.ts' /tmp/tsc.log   # must print 0
git add src/lib/answer.ts src/__tests__/unit/answerFailure.test.ts
git commit --no-verify -m "feat(answer): the failure half, as an allowlist

message and origin always; code, adt_type, namespace, request and messages when
the strategy filled them. The response object is never serialised — headers,
cookies, possibly circular — and its body appears only as raw_body, only at
detail: 'raw', and only when it is a string.

request gets the same treatment one level down: method and url are copied by
name, never the object. The contract types it as { method?, url? }, but a type
is not a filter — a strategy handing over its transport config would put an
Authorization bearer and cookies in front of the model through a field that
looks safe."
```

---

### Task 5: The exception boundary

**Files:**
- Modify: `src/lib/answer.ts`
- Test: `src/__tests__/unit/answerBoundary.test.ts`

**Interfaces:**
- Consumes: `return_answer`, `AnswerContext`, `McpResult` from Tasks 3-4.
- Produces: `function answer<T>(ctx: AnswerContext, call: () => Promise<IAdtResponse<T, IAdtError>>, project: (value: T) => unknown): Promise<McpResult>` — the single entry point every handler will use.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/answerBoundary.test.ts
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../lib/answer';

function success<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

const ctx = { tool: 'GetClass', detail: 'full' as const };

describe('answer — the boundary covers the whole pipeline', () => {
  it('adapts a normal answer', async () => {
    const result = await answer(ctx, async () => success('source'), (v) => v);

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('source');
  });

  it('names a throw from the client member client_threw', async () => {
    const result = await answer(
      ctx,
      async () => {
        throw new Error('unsupported operation');
      },
      (v) => v,
    );

    const payload = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toBe('unsupported operation');
    expect(payload.origin).toBeUndefined();
  });

  it('names a throw from anything after the call adapter_threw', async () => {
    const result = await answer(ctx, async () => success('source'), () => {
      throw new Error('unexpected shape');
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('adapter_threw');
    expect(payload.message).toBe('unexpected shape');
    expect(payload.origin).toBeUndefined();
  });

  it('names a throw from reading the failure adapter_threw too', async () => {
    const exploding = {
      ok: false,
      getResult: () => {
        throw new Error('not a success');
      },
      getError: () => {
        throw new Error('the strategy could not build its error');
      },
    } as unknown as IAdtResponse<string, IAdtError>;

    const result = await answer(ctx, async () => exploding, (v) => v);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('adapter_threw');
    expect(payload.message).toBe('the strategy could not build its error');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/__tests__/unit/answerBoundary.test.ts`
Expected: FAIL — `answer is not a function`.

- [ ] **Step 3: Add the boundary**

Append to `src/lib/answer.ts`:

```ts
function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * The single entry point a handler uses.
 *
 * `IAdtResponse` covers what the server said; it does not cover a throw. adt-clients
 * throws from more than its readings — argument validation, unsupported-operation
 * checks, its own invariants — and our projection can throw on a shape it did not
 * expect. Both are caught here and named apart, and neither borrows an
 * `AdtFailureOrigin`: a parser defect reported as an expired session sends a caller to
 * reauthenticate over a bug in this process.
 */
export async function answer<T>(
  ctx: AnswerContext,
  call: () => Promise<IAdtResponse<T, IAdtError>>,
  project: (value: T) => unknown,
): Promise<McpResult> {
  let response: IAdtResponse<T, IAdtError>;
  try {
    response = await call();
  } catch (thrown) {
    return local('client_threw', ctx, messageOf(thrown));
  }

  try {
    return return_answer(response, project, ctx);
  } catch (thrown) {
    // Deliberately broader than the projection. This catch also covers getError(),
    // building the failure payload and serialising it — everything the adapter does
    // after the call returns. Naming it projection_threw would point a reader at the
    // projection for a defect that may be in any of them.
    return local('adapter_threw', ctx, messageOf(thrown));
  }
}
```

- [ ] **Step 4: Run all three adapter suites**

Run: `npx jest src/__tests__/unit/answer`
Expected: PASS, 14 tests.

- [ ] **Step 5: Confirm no handler was touched**

```bash
git status --short src/handlers   # must print nothing
```

- [ ] **Step 6: Lint and commit**

```bash
npx biome check --write src/lib/answer.ts src/__tests__/unit/answerBoundary.test.ts
npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1
grep -c 'src/lib/answer.ts' /tmp/tsc.log   # must print 0
git add src/lib/answer.ts src/__tests__/unit/answerBoundary.test.ts
git commit --no-verify -m "feat(answer): an exception boundary over the whole pipeline

A handler will have no try. adt-clients throws from more than its readings, and
a projection can throw on a shape it did not expect; both are caught and named
apart — client_threw for the call, adapter_threw for everything after it — with
no origin, because connection and refusal are claims about the server and
neither is true here. The second name is deliberately broad: that catch covers
the projection, reading the failure and serialising it, and pointing a reader at
the projection for a defect in any of them would send them to the wrong code.

Nothing calls this yet: handlers move in the plans written from the inventory."
```

---

## What this plan does not contain

Every handler. The adapter lands unused on purpose: which fields a terse projection
carries, and which of today's outputs may be dropped, is what Task 1's table decides, and
the design makes that table's review a precondition. The migration plans — one per group,
written from the table — come next, and each carries the guarantees the inventory found
rather than assuming a handler only reads.

`src/lib/connectionFactory.ts` is cherry-picked from `chore/bump-current-stack` as
infrastructure in Task 2, since nothing compiles against connection 8 without it.
