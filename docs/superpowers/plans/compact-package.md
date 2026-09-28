# A compact variant: its own package, its own command, its own tests

**Status: TODO, open for brainstorming.** Nothing below is decided. The open
questions are marked and are the point of the discussion, not leftovers.

## What is asked

1. **A test variant through the compact tools.** Today nothing exercises them
   against a system.
2. **A command that serves only the compact tools.**
3. **A third package**, so the family is `lib` / `core` / `compact` and a user can
   install the compact variant on its own.

## What already exists, measured

- **22 compact tools** (`scripts/list-tools.ts`, group `compact`, of 370 total):
  `HandlerCreate`, `HandlerGet`, `HandlerUpdate`, `HandlerDelete`,
  `HandlerValidate`, `HandlerActivate`, `HandlerLock`, `HandlerUnlock`,
  `HandlerCheckRun`, `HandlerUnitTestRun/Status/Result`,
  `HandlerCdsUnitTestStatus/Result`, `HandlerProfileRun/List/View`,
  `HandlerDumpList/View`, `HandlerServiceBindingListTypes/Validate`,
  `HandlerTransportCreate`.
- **The exposition already selects them alone.** `--exposition=compact`
  (`ServerConfigManager`, `launcher.ts:236` → `CompactHandlersGroup`), and
  `validateExposition` refuses to combine `compact` with any other set. So
  "a command that serves only the compact tools" exists as a flag today; what does
  not exist is a package whose *default* is that, and a bin that needs no flag.
- **The facade is a router.** `object_type` → `compactRouterMap` → the same
  high-tier handler, arguments passed straight through. `HandlerUpdate` alone
  declares 38 properties.
- **Unit cover, and its limit.** `compactSchemaCompleteness` (259 assertions)
  reads every routed handler's real `TOOL_DEFINITION.inputSchema.required` and
  fails if a required argument is missing from the compact schema;
  `compactActivateTypes`, `compactProgramIsOnprem`, `compactDdlSchema`,
  `toolSurface`/`detailSurface` freeze the 22. All green. None of them issues a
  request: they prove the argument NAMES line up, not that a route reaches the
  handler it claims, that a value lands in the right field, or that the answer is
  read.
- **Two packages today**: `@mcp-abap-adt/lib` (Apache-2.0, repo root) and
  `@mcp-abap-adt/core` (AGPL-3.0-only, `server/`). `scripts/publish-all.sh` walks
  `.` then `./server`; `server.json` points the MCP registry at `core`.

## Why the gap matters

Compact is the surface an LLM uses when context is tight, so it is the most likely
real call path — and it is the one path with no live evidence. Two specific risks:

- **The route is unverified.** `object_type: 'ddl'` in `HandlerUpdate` reaching
  `handleUpdateDdl` rather than a neighbour is asserted nowhere.
- **Field mapping is unverified.** `source_code` / `ddl_source` / `ddl_code` /
  `test_class_code` / `implementation_code` all live on one schema; which one a
  given `object_type` needs is router knowledge with no test behind it.
- And every defect this release found was in what a handler does with the
  *answer*. Compact calls the same handlers, so it inherits the fixes — except
  `HandlerActivate`, which routes into the `handleActivateObject` group path that
  13.0.0 rewrote to read an activation run's results, and that has never run
  through compact on a system.

## Decided in the brainstorm: what compact IS

**Compact is a different decomposition of the same surface, not a subset of it.**
The axis is the OPERATION; the object moves into the parameters. Where the
object-oriented surface has `CreateClass`, `CreateDomain`, `CreateDdl` and so on,
compact has one `HandlerCreate` with `object_type`. (Stated by the user
2026-09-28.)

Three things follow, and they settle the first two questions this plan opened
with:

1. **A smaller surface, not a smaller install.** `HandlerCreate` routes into
   *every* create handler and `HandlerUpdate` into every update, so the facade
   needs essentially all of `lib` by construction. "Install the compact variant
   and carry less code" is not reachable by adding a package, and splitting `lib`
   would not help a facade that needs every part of it. The saving is in the TOOL
   LIST — 22 schemas instead of 370 in an LLM's context — not in bytes on disk.

2. **Which is why `validateExposition` forbids mixing.** Not caution: a
   consequence. Two decompositions of one operation in one tool list would offer
   two ways to create a class with no way to choose between them. Compact
   REPLACES high/low rather than joining them.

3. **So the test axis is the operation, not the object.** An object-oriented suite
   walks one object through its lifecycle. Compact's risk lives in the router, so
   its suite is a matrix of **operation × `object_type`**: for each operation, for
   each type, assert (a) the route reached the intended handler, (b) the value
   landed in the field that type expects — `source_code` / `ddl_source` /
   `ddl_code` / `test_class_code` all sit on one schema — and (c) the answer is not
   empty. That is precisely what `compactSchemaCompleteness` cannot see: it
   compares argument NAMES and never learns where a route goes.

## Decided: split compact by capability, and every bin is AGPL

**Two compact packages, not one: `compact-readonly` and `compact-modify`.** The
line is whether an operation changes the system. (Both decisions stated by the
user 2026-09-28.)

This is the one thing that makes a compact package a genuinely smaller install as
well as a smaller surface — a read-only facade does not need a single write
handler — and the stronger argument is not size at all: **an agent given
`compact-readonly` cannot change the system.** Capability is enforced by what is
installed, not by a flag someone can pass.

The 22, classified:

**Non-modifying (13)** — `HandlerGet`, `HandlerValidate` (asks whether a name is
admissible), `HandlerCheckRun` (a syntax check), `HandlerUnitTestStatus`,
`HandlerUnitTestResult`, `HandlerCdsUnitTestStatus`, `HandlerCdsUnitTestResult`,
`HandlerProfileList`, `HandlerProfileView`, `HandlerDumpList`, `HandlerDumpView`,
`HandlerServiceBindingListTypes`, `HandlerServiceBindingValidate`.

**Modifying or executing (9)** — `HandlerCreate`, `HandlerUpdate`,
`HandlerDelete`, `HandlerActivate`, `HandlerTransportCreate`, `HandlerLock`,
`HandlerUnlock` (a lock is an enqueue: it changes state and blocks other users),
`HandlerUnitTestRun` and `HandlerProfileRun` (both **execute ABAP** — they change
no repository object but they run code and leave traces, which is not something a
read-only surface may offer).

**The bin is NOT split.** Locally the server gives every access; the separation is
the CONSUMER's to make. (Corrected by the user 2026-09-28, against the conclusion
one paragraph earlier in this plan's history.) So:

- `mcp-abap-adt` stays one command with `--exposition` as it is. No new bin, no new
  `server.json` entry, no registry question at all.
- `compact-readonly` and `compact-modify` are **library packages a consumer
  imports** to build its own tool list — the thing cloud-llm-hub needs when it
  decides what to put in front of an LLM. Capability is chosen by what the consumer
  imports, and enforced by the fact that the read-only package does not carry the
  write handlers.

**Licence follows from that, and not the way this plan first concluded.** The rule
is the user's: *every package that ships a bin is AGPL-3.0-only.* These two ship no
bin and no transport, so they are **Apache-2.0 like `lib`** — the earlier line
here, which made them AGPL, was reasoning from a bin they will not have. `core`
stays AGPL-3.0-only as the one package with a transport in it.

**And the work this exposes is in `lib`, not in the new packages.** Today
`CompactHandlersGroup` imports all 22 compact handlers, and each of those imports
the high-tier handlers it routes to — so a `compact-readonly` that imports the
group gets the write handlers with it. For the split to mean anything the router
has to come apart along the same line: a read-only group importing read-only
routes only. That is the actual task; the two manifests are the easy part.

## Decided: the five packages

`lib` stays what it is; the compact tools MOVE OUT of it into two new library
packages, and a new bin-bearing package serves the compact facade. (Stated by the
user 2026-09-28.)

| package | carries | bin | licence |
|---|---|---|---|
| `@mcp-abap-adt/lib` | handlers, registries, embeddable — **minus** the compact tools | no | Apache-2.0 |
| `@mcp-abap-adt/compact-readonly` | the 13 non-modifying compact tools | no | Apache-2.0 |
| `@mcp-abap-adt/compact-modify` | the 9 modifying or executing compact tools | no | Apache-2.0 |
| `@mcp-abap-adt/core` | transports, launcher, `mcp-abap-adt` | yes | AGPL-3.0-only |
| `@mcp-abap-adt/compact` | the compact server and its bin | yes | AGPL-3.0-only |

So the bin is split by DECOMPOSITION — object-oriented in `core`, operation-oriented
in `compact` — and never by capability: locally each command gives every access, and
choosing read-only is the consumer's act of importing `compact-readonly` rather than
a flag or a second binary.

### What this makes breaking, and for whom

- **Moving the compact tools out of `lib` is a major for `lib`.** Anything importing
  them from `@mcp-abap-adt/lib/handlers` stops finding them; the two new packages
  are where they live. That is 14.0.0 with a migration note naming the new import
  path per tool.
- **`core` currently owns `--exposition=compact`** (`launcher.ts:236` →
  `CompactHandlersGroup`, which would no longer be in `lib`). Two ways out, and this
  is the one open question of the new shape:
  1. `core` depends on the two compact libraries and keeps `--exposition=compact`,
     so nothing a user runs today changes and `compact` is a convenience package
     whose bin defaults to that exposition;
  2. `core` drops `compact` from its expositions and the facade is only reachable
     through the new package — a second breaking change, in the CLI this time, and
     `validateExposition`'s rule about compact-alone becomes moot in `core`.

  (1) keeps every existing invocation working and costs `core` a dependency on two
  Apache-2.0 libraries. (2) is cleaner as a boundary and breaks a documented flag.
  Recommendation: **(1)** — the flag is documented in `ServerConfigManager`'s help
  and in the YAML config, and breaking it buys nothing a dependency does not.

## Open questions for the brainstorm
1. **`core`'s `--exposition=compact`**: keep it via a dependency, or drop it —
   see the two options above.
2. **Release mechanics.** `publish-all.sh` gains two more entries and the release
   checklist three more versions to keep in step — the same drift that has bitten
   `server.json` before. Lockstep versions for all five packages, or independent?
   Lockstep is the recommendation: the compact packages are a decomposition of the
   same `lib`, and independent versions would create combinations nobody has run.

## Done: the capability split, inside `lib`

**The real work named in this plan is finished, and it turned out smaller than the
plan feared.** The router was ONE map, `object_type → { create, get, update,
delete } → high-tier handler`, and only 4 of the 22 compact tools imported it
(`HandlerGet`, `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`). So the line of
the split is a COLUMN of that map, not a rewrite of 22 tools. Measured while
splitting: 22 read handlers, 61 write handlers, **zero overlap**.

- `compactRoutes.ts` — the handler and map types plus `dispatchCompact`, and no
  handler import at all, so both halves share the "no `object_type`" and
  "unsupported operation" answers without sharing a graph.
- `compactReadRoutes.ts` — the `get` column, `compactReadRouterMap`,
  `routeCompactRead`.
- `compactWriteRoutes.ts` — `create`/`update`/`delete`, `compactWriteRouterMap`,
  `routeCompactWrite`.
- `compactRouter.ts` is **gone**. A merged façade would have re-linked both graphs
  for anything that imported it, which is exactly the coupling the split exists to
  remove; the union is asserted in a test instead.
- `CompactReadOnlyHandlersGroup` (13 tools) and `CompactModifyHandlersGroup` (9),
  both exported from `lib/handlers/groups`; `CompactHandlersGroup` now composes the
  two, so `--exposition=compact` serves the same 22 in the same order.

**Two tests hold it, and each was verified to fail when it should.**
`compactCapabilitySplit.test.ts` walks the transitive IMPORTS from each group's
file and asserts the read-only graph reaches `compactReadRoutes` and never
`compactWriteRoutes`, no `handleCreate*`/`handleUpdate*`/`handleDelete*`, and no
`handleLock*`/`handleUnlock*`/`handleActivate*` — proving the capability of what is
imported rather than of what a list enumerates. It also asserts the modifying graph
DOES reach the write routes, so a split that merely lost them fails too, and that
the walker resolves a real graph, since a resolver finding nothing would make every
other assertion pass. `compactRouter.test.ts` checks that the union of the halves is
exactly `COMPACT_CRUD_MATRIX` — splitting a map adds one new way to be wrong, a
route that lands in neither file — and that each half carries only its own
operations.

This is releasable on its own: no package moved, no manifest changed, no public
export removed. What remains below needs the packaging decisions and, because a
consumer installs from npm rather than a local link, a publish between the phases.

## Tasks, once the questions above are answered

- [ ] Decide the four questions left and write the decision down (here, then in
      `CLAUDE.md` if it changes how the repo is built). The package's shape is
      settled: a compact package is the operation-oriented server over the same
      `lib`, so it depends on what `core` depends on and differs in its default
      exposition and its tool list.
- [ ] **Integration suite through the compact facade, as a matrix.** For each
      operation (`create`, `get`, `update`, `check`, `activate`, `validate`,
      `lock`/`unlock`, `delete`), for each `object_type` the router accepts: the
      route reaches the intended handler, the source field that type expects is the
      one that carries the value, and the answer is not empty. A mode in
      `test-config.yaml` or a suite of its own — which depends on issue #238,
      because a compact cycle needs objects of its own.
- [ ] **`HandlerActivate` through compact, on a system**, including the group path
      that reads the activation run's results.
- [x] **Split the compact router along the capability line** so a read-only group
      imports no write route — done, see the section above.
- [ ] **The two library packages**: manifests, `LICENSE` (Apache-2.0, both — no
      bin), `publish-all.sh`, the release checklist.
- [ ] **The `compact` package**: manifest, `LICENSE` (AGPL-3.0-only), `COPYING`,
      its bin, `server.json` (a second registry entry — a different tool list is a
      different server to a client), `publish-all.sh`, and `binSmoke.test.ts`
      extended to its bin.
- [ ] **`lib` 14.0.0 and its migration note**: which tool moved to which package,
      per tool.
- [ ] **What a consumer imports**, named explicitly: the two packages' entry points
      answer a handler registry, and the shape has to be the one cloud-llm-hub can
      use directly rather than something it has to adapt.
- [ ] **Docs**: README's Dependencies and Licensing sections, the tool docs
      generator (does it need a compact-only page?), and a migration note if
      anything about `core` changes.

## Related

- #238 — the shared-object polygon: a compact cycle needs fixtures, and the
  answer there decides whether this suite creates its own.
- 13.0.1 / `binSmoke.test.ts` — the check a third bin must join.
