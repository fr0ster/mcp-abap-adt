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

## Open questions for the brainstorm
1. **Licence.** `core` is AGPL-3.0-only because it is a network service; anything
   with a transport in it follows. A `compact` that depends on `core` inherits
   that; one that only re-exports handlers could be Apache-2.0 like `lib`. This
   has to be decided before the first publish, not after.
2. **The command.** A bin of its own (`mcp-abap-adt-compact`), or `core`'s bin
   with the exposition defaulted by the package that installed it? A third bin
   goes into `binSmoke.test.ts` either way.
3. **Registry metadata.** `server.json` describes one server. Does the compact
   variant get its own entry, or a documented flag on the existing one?
4. **Release mechanics.** `publish-all.sh` gains a third entry and the release
   checklist a third version to keep in step — the same drift that has bitten
   `server.json` before.

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
- [ ] **The package**, per the shape decided: manifest, licence file, bin,
      `publish-all.sh`, `server.json`, release checklist, and `binSmoke.test.ts`
      extended to the new bin.
- [ ] **Docs**: README's Dependencies and Licensing sections, the tool docs
      generator (does it need a compact-only page?), and a migration note if
      anything about `core` changes.

## Related

- #238 — the shared-object polygon: a compact cycle needs fixtures, and the
  answer there decides whether this suite creates its own.
- 13.0.1 / `binSmoke.test.ts` — the check a third bin must join.
