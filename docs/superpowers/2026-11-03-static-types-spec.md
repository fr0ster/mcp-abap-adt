# Spec: static types in the server's production code

Goal: `2026-11-03-static-types-goal.md`. This spec decides what the goal left open.

## 1. What the code shows (Measured, `main` at 23.1.0)

- **Implicit `any` is allowed.** `noImplicitAny: false` in the root `tsconfig.json` and in the
  server-runtime, server, http, sse, responsible-rules and background-runs-memory configs. Every
  unannotated parameter is an `any` that no grep counts.
- **Express has no types.** express 5 ships none, and `@types/express` is not installed, so the
  exported `RouteHandler` and `IHttpApplication` are `any`.
- **Tool arguments are untyped.**
  - Each `TOOL_DEFINITION.inputSchema` is a JSON Schema literal, 325 of them.
  - At registration `jsonSchemaToZod` turns each into a zod shape built at run time. The SDK
    validates with it, but it can type nothing.
  - `ContextHandler.args` is `any`.
  - A typed path exists (`defineTool` with `ArgsOf`), used by 6 of 13 groups. It compiles only
    because `args` is `any`.
  - The others write `(args: any) =>` or cast `args as TArgs`.
  - A handler's call form is chosen at run time by `handler.length`, with the group's context
    swapped around the call.
- **The compact routes skip validation.** The 45 `as unknown as CompactHandler` and the
  `as never` in `handleUpdateUnderLock` and `handleHandlerGet` hand the model's arguments to
  typed handlers. Nothing checks them against the target tool's own schema. This is a defect
  the casts hide.
- **No published package needs a change.**
  - `IAdtResponse` is `IAdtSuccess<T> | IAdtFailure<E>` with every part exported. The casts come
    from hand-built stubs and from `if (!a.ok) return a` written before narrowing worked.
  - `CheckedDeletable` is the server's own type.
  - `IAnalyse<any>` becomes `IAnalyse`.
  - `IAdtVersionable<any, …>` is fixed by a closure that binds its config.
  - `ILogger` already takes `unknown`; every logger `any` is the server's own.
  - `makeAdtRequest` is on `IAbapConnection`.
- **Dead code the types expose.** `canRefreshToken`, which exists in no connection version, and
  `__debugId`, which is never set, guard debug branches that cannot run.
- **XML is read through `any`.** fast-xml-parser's `parse()` answers `any`, and most readers
  navigate it so. The shared `parseStructure()` already answers `unknown`.
- **The lint covers little.** One `biome.json` warns on `noExplicitAny`. The build lints `src`
  only. Biome 2.5.15 has `nursery/noUnsafeTypeAssertion`: every assertion except `as const`.

## 2. Tool arguments: zod is the type and the check

- **Schema.** Each `TOOL_DEFINITION.inputSchema` becomes a zod object schema (zod 4 is already
  a dependency). The handler's arguments are `z.output<typeof inputSchema>`. The descriptions
  move into the schema (`.describe`).
- **Gone.** `ArgsOf`, `jsonSchemaToZod`, `shapeOf` and `typeOf` are removed. No second mapping
  of the same schema can drift.
- **One entry type.** `defineTool(definition, handler)` answers a `HandlerEntry` whose
  `call(context, args)` closure holds the handler's type. A registry is `HandlerEntry[]` with no
  cast.
  - Every entry is built so.
  - `ArgsOnlyHandler`, `isArgsOnly`, `callInItsForm` and the context swapping are removed.
  - A group passes its context at the call.
- **One validation.** The entry registers itself on the SDK with its zod schema, so the SDK
  validates once and its callback's arguments are typed `z.output`.
  - The state handle, `background` and `timeout` become zod edits (`.extend`, `.omit`) of the
    entry's schema.
  - The plan's first step proves in a typecheck that the edited schema's output still reaches
    the handler typed.
  - If TypeScript cannot prove it, the closure parses the arguments again with the entry's own
    schema instead. That doubles the parse, and the plan measures its cost on the batch
    timing test.
- **Lists and docs.** `tools/list`, the variant projections, the docs generator and
  `tool-search.json` read the JSON Schema from zod (`z.toJSONSchema`). A test checks that every
  tool's listed schema stays as it is today, compared with a fixture captured before the change.
  A difference is a defect of the migration, unless it is one of §4's fixes or the
  owner-approved optional `with_long_polling` of `HandlerGet` (§8; plan C2d).

## 3. Compact routes

- **Each route is the target tool's entry.** A compact read or part route is
  `entry.call` of the tool it serves, so the arguments are validated against that tool's
  schema.
- **The compact write handlers** (`handleCreateOnly`, `handleUpdateUnderLock`,
  `handleDeleteOnly`) take the compact tool's own typed arguments, and each per-type branch calls
  the target's `call`.
- **This changes answers.** A wrong-typed argument that reaches a handler today is refused with
  the schema's words, and an undeclared key is dropped — except by the create tools (compact
  `HandlerCreate` and every full `Create*` tool), whose schemas are strict (the owner,
  2026-11-05): an argument a create schema does not declare is refused before any request, the
  refusal naming it as not an argument of the tool. Every such change is a fix, with a
  test of the refused case. Before the change, the plan lists every target handler that reads a
  key its own schema does not declare (`object_type` for example), and declares each one.

## 4. The rest of the code

- **`IAdtResponse` values.** Plain typed literals (`{ ok: true, value }`, `{ ok: false,
  error }`), and narrowing after `ok`. The cleanup side-channel is the server's own error type,
  `IAdtError & { step?, cleanup?, operation? }`, passed as `TError`.
- **XML and JSON.** One reader module (`src/lib/xml/tree.ts`) over `unknown`, with these
  helpers:
  - `isElement`, `elements`, `child`, `text`, `attr`.

  Every reader goes through it.
  - Its type predicates are the one allowed form of runtime check here: data from outside the
    type system, each predicate's body checking what it claims, and each tested on the
    documents in the corpus.
  - `Array.isArray` and `Object.entries` are read through it, never directly on `unknown`.
- **Errors.** `catch (error)` is `unknown`, read through the existing failure readers.
- **Logger.** The server's logger types take `unknown` as `ILogger` does.
- **Express.** `@types/express` 5 joins the dependencies of each package whose published `.d.ts`
  imports express types. `RouteHandler` and `IHttpApplication` take the real types.
- **Index reads.** An `arr[i] as T` becomes a typed tuple (`Promise.all` of a tuple) or a
  checked read. No-op assertions are dropped.
- **`@ts-expect-error`.** Both, in `handleDescribeByList.ts`, go with the typing of their
  values.
- **Dead code.** The `canRefreshToken` and `__debugId` branches are deleted.

## 5. The gate

- **TypeScript.** `noImplicitAny` comes back on (removed from every `tsconfig`, so `strict`
  governs).
- **Biome.** For every production directory of every package, and for `scripts`:
  - `noExplicitAny`, `noImplicitAnyLet` and `noUnsafeTypeAssertion` are errors;
  - Biome is pinned exactly, because the last rule is a nursery one;
  - `lint:check` and the build's check cover the same directories.
- **A Jest source scan,** modelled on `src/__tests__/unit/sources/` (`noChainInstanceof`). Over
  the TypeScript program of each package's production code, it refuses:
  - every type assertion but `as const`;
  - every `any`;
  - every non-null `!`;
  - every `@ts-ignore`, `@ts-expect-error` and `biome-ignore`.

  It has no allow-list. Fixtures prove each refusal. The scan is what makes `as unknown as`
  fail the build, since `tsc` cannot.
- Tests stay outside both, until their own task.

## 6. Semver and order

- **24.0.0 for every package.** They are versioned together. Exported types change:
  - `ToolDefinition.inputSchema`;
  - the handler and entry types and `defineTool`;
  - `IHandlersRegistry.registerTool`;
  - the removal of `callInItsForm`, `isArgsOnly` and `InGroupContext`;
  - typed `args` on the exported handlers;
  - `RouteHandler` and `IHttpApplication`.
- `MIGRATION-24.0.md` says what an embedder on 23.x changes:
  - a tool definition's schema is zod;
  - a handler takes `(context, args)`;
  - `registerTool` takes an entry.
- No other package of ours changes, so nothing is published before this.
- Order inside the PR, each step green before the next:
  1. the schema and entry types;
  2. the groups;
  3. compact;
  4. the rest by directory;
  5. the gate last. It must then pass with no exception.

## 7. Tests

- Every existing test passes unchanged, except a test of a §3 refusal, which is new, and the
  changes §8 names.
- **Before and after:**
  - the listed-schema fixture (§2);
  - the surface fixtures;
  - the tool counts.
- Live runs on premise and cloud: the existing read-only and CRUD integration suites, once, at
  the end. §8 widens this run to every handler.

## 8. Test coverage of every handler

**The owner's rule (binding):**
- Every handler, full and compact, is covered by unit tests that pin its requests and by
  permanent live integration tests.
- This change touched nearly every handler: static types, typed arguments, the new
  registration API. So the gaps are closed here, before 24.0.0.

**The scope is measured** (inventory at `77ada8e0`): 315 tools, 274 full and 41 compact.

| Set | Pinned | Member | Invoked only | Generic only | None |
| --- | --- | --- | --- | --- | --- |
| full | 141 | 97 | 6 | 30 | 0 |
| compact | 28 | 2 | 1 | 6 | 4 |

- The live suites reach 167 full tools and 12 compact ones.
- Further gaps:
  - a delete runs live only as a cleanup lambda;
  - `UpdateServiceBinding` and `DeleteServiceDefinition` are never called live as tools;
  - compact runs live only in hard mode, in cases the template disables;
  - the compact tools have gaps per `object_type`.

### What counts

- **Coverage key.** Each key needs a pin and a live case. A key is one of these:
  - a served tool's name;
  - for a tool whose listed schema has an `object_type`, `part`, `operation` or `action` enum,
    the tool and one value of each such enum it declares (`HandlerLock#CLASS`,
    `GetClass#source`, `HandlerDebugStep#stepInto`, `HandlerBatch#begin`) — the owner's decision
    for `operation` and `action` (plan, O11);
  - for `HandlerGet`, the tool, an `object_type` and a `part`, as the handler's own route tables
    serve them (`compactReadRoutes`, `compactPartRoutes`; not the product of the two enums);
  - for `HandlerGet`'s typeless parts, the tool and the part with `-` for the type
    (`HandlerGet#-#object_structure`): the address parts `object_structure`, `node_structure`,
    `virtual_folders` and the run parts `activation_status`, `activation_results`, which
    `handleHandlerGet` routes before any `object_type` is read.

  **The key is derived from the call, never from a label.** A pin row's key is read from its
  `tool` and from the `object_type` / `part` inside its `args` literal; a live key from
  `liveCall`'s tool argument and the same fields of its `args` literal. A row has no separate
  `object_type` or `part` field that could disagree with what it sends.

  A key requires a system kind when a binary of that variant lists it: `onprem` means the
  on-premise system, `cloud` the BTP trial system. A tool that declares no `available_in` is
  listed by both variants.
- **Pinned.** A pinned case does all of this:
  - It runs real adt-clients code on the parity stand-in: `recordingConnection`, or `adtStandIn`
    for a tool that opens connections of its own (the debugger listener, long sessions, leftover
    sessions, background runs, the batch envelope).
  - It calls the tool where its call is dispatched. For most tools that is its registered
    entry, found by name in the variant's entries (`entry.call(context, args)`), so the schema
    parse is part of the case. The background dispatch, the batch, the debugger, the long
    sessions and the leftover sessions are dispatched by the server
    (`src/embeddable/BaseMcpServer.ts`, the background branch of its call dispatch), not by the
    entry; their cases run through an in-process server on an in-memory MCP transport, as the
    existing suites of those tools do, with the state they need (an open batch, a listener, a
    run) made by earlier calls of the same case and its handles read from those answers.
  - A schema refusal is asserted as `entry.call` throws it (`invalidArgumentsWords`,
    `src/lib/handlers/interfaces.ts`), not as an answer, together with zero recorded requests.
    Such a refusal pin is supplemental: it never stands for its key, which still needs a
    successful pin.
  - **The recorded request is kept whole.** Every wire field of the stand's record — method,
    path and query, every header, body — reaches the pinned shape unchanged. Fields the stand
    adds about itself and that never went over the wire (`StandInRequest.session`, the ABAP
    session label of `adtStandIn`) are excluded by name; nothing else is dropped.
  - **A tool that sends nothing is pinned as such.** `BatchBegin`, `BatchAnswers`, the
    background-run get, list and discard (full and compact) answer from server state only. Their
    row states `expected: 'none'` and the case asserts zero recorded requests **and** that the
    tool ran: its answer carries the tool's own result (the handle, the run list, the discard
    outcome). A row that records nothing because the tool never ran fails.
  - It asserts the whole recorded request list: order, count, and per request the method, the
    URL with its query, the headers adt-clients set (as the connection records them) and the
    body (`undefined` when none).
  - It asserts the answer: not an error, except in a refusal case.
  - Where onprem and cloud take different code, it has one case per variant.
- **The expected requests.** The literals come from running the code on the stand-in. They are
  reviewed in the diff against the corpus and the ADT contract. There is no freezing harness.
- **Live.** A live case is a permanent Jest test under `src/__tests__/integration/` that calls
  the tool by name through `liveCall`:
  - in soft mode, the registered entry's `call` on the live connection;
  - in hard mode, the MCP tool.

  The call is in an `it`/`test` body, never in a hook or a cleanup lambda. The case asserts the
  operation itself:
  - a write is read back;
  - an activation is seen in the inactive-objects list or the activation result;
  - a run's result is read;
  - **a delete is asserted** by its contract, on the object it deleted:
    - an object a delete removes: `expectAbsent(read)` reads that object afterwards and expects
      "not found";
    - a delete that empties a part and keeps its object — `DeleteLocalDefinitions`,
      `DeleteLocalMacros`, `DeleteLocalTypes`, `DeleteLocalTestClass` (each writes its class
      include empty under the class's lock) and `DeleteUnitTest` (writes the test include empty
      and activates; the class stays), per their handlers: `expectCleared(read)` reads the
      part back and expects it empty, while the object still reads. Every other delete in
      the inventory removes its object.
    The read names the same object (and part) as the delete's `args`; the guard compares the
    two literals.
  - **The call is awaited and executes.** `liveCall` is awaited in the test body; a live key is
    recorded as covered only after the enclosing test has passed all its assertions (the run
    report is written from the test's result, not from the call).

  Each case states where it runs (`liveSuite(systems, title, body)`). It runs on the on-premise
  system and the BTP trial system wherever the key requires them, and elsewhere skips naming
  its reason.

### Safety of every live run

- **Realm check before any logon.** An unauthenticated `GET` of the ADT discovery must answer
  `401`.
  - On premise, the `WWW-Authenticate` realm must equal `environment.expected_realm`. That key
    is empty in the template, and empty refuses the run.
  - On the cloud, the session's JWT `exp` must lie in the future. It is decoded locally, with no
    request.
  - A mismatch stops the run before `globalSetup` logs on.
- **Each SAP user on its own connection.** The debugger's second user comes from
  `second_user_env` and is never shared.
- **Delete only what the test created.**
  - Each name is read before its create. A name that exists fails the case, with nothing
    created or deleted.
  - Cleanup deletes only names recorded after a successful create.
- **Never:** SM12 (a lock left behind is a failure, and the session's logoff releases it), and
  never release a transport.
- **Transport requests** (the owner's decision). A case of a tool that creates a request or a
  task (`CreateTransport`, `CreateTransportTask`, and the compact `HandlerTransportCreate`,
  `HandlerCreate#TRANSPORT`) creates its own, records its number, and its cleanup deletes it —
  only that number, empty and unreleased — then asserts it absent. The delete path is measured
  live first (plan C2a). Every other transport case works on one request named in the config;
  no request is created for it, except the move, which needs a second request (TR 717) and
  uses one the test created.
- **Debugger cases** stop their listener and log off their session in `afterAll`.
- **Any credential refusal stops everything.** A refusal is a call that **ends** refused —
  after the connection's own renewal and resend failed or was impossible; a renewal that
  succeeds is not one. It is detected wherever a request can go: in
  `globalSetup` (a refusal there is fatal; today it is logged and the run goes on), at every
  connection creation, and at every sending boundary the helpers own **after** the connection
  exists — a tool call (`liveCall`), a read (name-free reads, read-backs, absence checks), a
  cleanup request, the debugger and session helpers. The first refusal at any of them latches
  a run marker; every later request of the run refuses before it is sent, and the run fails.
- **Where objects go.**
  - On premise: `$TMP`.
  - On the cloud: the configured development package (`environment.default_package`). The
    cloud has no `$TMP`.
  - Names follow the template's `ZMCP_BLD_*` convention.
  - No committed file names a system, a system id, a transport number or a user.

### Acceptance

1. Every key is pinned, and live on every system kind it requires.
2. **The guard test** keeps it so: `src/__tests__/unit/coverage/coverageLedger.test.ts`, part of
   `npm test`.
   - **What it compares.** The committed ledger, `tests/fixtures/tools/coverage-ledger.json`,
     maps each key to `{ unit: <file>, live: { onprem?: <file>, cloud?: <file> } }`. It is
     checked against the tools the binaries serve: `tools/list` of every binary and variant,
     gathered as the listed-schema test gathers it.
   - **Why it cannot pass by accident:**
     - The served list is first asserted against `listed-schemas.json`'s `schemas`: the same 315
       tool names, and for each tool exactly the binaries and variants its `listedBy` names. An
       empty or partial list, or a tool served by another binary set, fails.
     - The ledger's keys equal the required keys exactly. A missing row fails, and so does a
       row of an unserved tool.
     - Each key's `live` systems equal its required kinds exactly.
     - Files are read with the TypeScript compiler API, never matched as text.
   - **The unit file** is one the default unit command runs (Jest's own discovery of the root
     configuration: `testMatch`, minus `testPathIgnorePatterns`), and must hold a
     `pinCases([...])` call **in executable Jest scope**: a
     statement of the module's top level or of a `describe` callback the module calls at
     collection — never inside a function nothing calls, and never skipped (`describe.skip`,
     `xdescribe`, `it.skip`, `test.skip`, `xit`, `xtest`, `.todo`, or any skipped enclosing
     suite; no `.only` in the file). The same holds for `liveSuite` and `liveCall`.
     - a two-dimension tool's key is one of its declared table (`HandlerGet`'s routes,
       `HandlerUpdate`'s legal parts); no enum product;
     - one element's `tool` is a string literal, and its `args` an object literal whose
       `object_type` / `part` / `operation` / `action` (when present) are string literals;
       together they equal the key;
     - an element with `refusal` (its `expected` the literal `'nothing-sent'`) does not count
       for its key;
     - the whole recorded request is the literal: the inputs that would vary it (the clock,
       random ids and bytes, the stand's port) are fixed per case and restored after, never
       removed from the record, and every pin records twice and compares the two byte for
       byte;
     - its `expected` is a non-empty array literal, or the literal `'none'` for a tool the
       spec names as sending nothing;
     - each request in it is an object literal of exactly `method`, `url`, `headers` and `body`,
       with `url` a string literal.
   - **The live file** lies under `src/__tests__/integration/` and holds a
     `liveCall('<tool>', { … })`:
     - its tool and its `args` literal give the key, as for a pin;
     - it is the operand of an `await` that is a statement (or initialiser) of the test
       callback's own body — not inside a nested function, an un-awaited promise or a callback
       that is never invoked;
     - its nearest enclosing Jest call is `it` or `test`;
     - it sits inside a `liveSuite` whose first argument is an array literal naming the system;
     - for a delete key, the same body awaits `expectAbsent` / `expectCleared` after it, with
       the same object (and part) literals in its read as in the delete's `args`.
   - **No orphans.** A `pinCases` row or `liveCall` in a scanned file whose key the ledger
     lacks fails.
   - **At run time** `pinCases` refuses a tool the variant does not serve, and an empty
     `expected`.
   - **Each check is load-bearing.** One fixture per refusal under `__fixtures__/coverage/`
     proves it, among them: a pin whose `tool` or `args` disagree with its ledger key (a
     relabelled pin); a `liveCall` not awaited; a `liveCall` inside a callback the test never
     invokes; an absence check on another object than the one deleted; a `'none'` row of a tool
     that sends; a `'none'` case whose tool never ran; a `pinCases` call inside a function
     nothing calls (a dormant registration); a key covered only by a refusal pin.
3. **The live run proves the ledger.**
   - A key's outcome is Jest's completed test-case result (a reporter's `onTestCaseResult`,
     after the test's hooks and `expect.assertions`), never the test's own hook. The
     integration run's `globalTeardown` compares the keys that ran and passed on that
     system with the keys the ledger requires there. The run report is written outside the
     repository.
   - A required key that was skipped or failed fails the run, so a missing config section
     cannot pass as a skip.
   - **This completeness check is mandatory only for the full acceptance run** (plan step 18).
     A targeted run of one family (an npm-script-controlled run of its files, during C3–C16)
     reports its own keys and fails on its own keys only; it does not require the whole ledger.
   - The run's exit status is Jest's own: nothing in the pipeline masks it.
4. **A defect is fixed here.** A defect a pin or a live case shows is fixed in this PR, with a
   test that fails first (the goal's first invariant), and gets a CHANGELOG line. Tests alone
   change no user-visible behaviour and touch neither CHANGELOG nor MIGRATION.
5. **Two owner-approved changes** come with the stage and are the only other exceptions to
   "every answer stays as it is": a group activation waits for its run on long polling, with
   no attempt limit or interval (plan C2c, a behaviour fix: CHANGELOG); and `HandlerGet` takes
   an optional `with_long_polling` for `activation_status` (plan C2d, an added optional
   parameter: CHANGELOG, MIGRATION as an addition, the listed-schema fixture updated for that
   key alone). Everything else stays identical.

## 9. Defect fixes

The independent test campaign on 23.1.0 and its check against the 24.0.0 code found defects
that are ours (the server or adt-clients). The owner decided they are fixed in this change,
after the system-kind work (plan C2e) and before the coverage families (plan C3–C16), so the
families pin the fixed behaviour. Where the code reading and the live measurement on the
on-premise system disagree, the live measurement holds.

### Rules (the owner's, binding)

- **SAP's answers are read by key, never by words.** An answer or error is analysed only by
  its T100 key (message class and number) and its type. Neither a regex nor a substring is
  applied to its text. Where SAP gives no key, the structured verdict decides, and SAP's
  text is relayed as it is.
- **One XML module (owner, plan D19).** Only `src/lib/xml/` imports the parser; it validates
  before parsing, so a truncated or malformed answer is refused. Its options are fixed in
  named profiles inside it (the structured readings' profiles, and the ordered round trip's,
  which keeps entities as written).
- **XML is parsed by a library.** That means fast-xml-parser through the existing
  `parseStructure`, or adt-clients' structured readings. There are no hand-rolled parsers.
- **No regular expression in production code.** This covers every package's `src`, plus
  `scripts/` and `tools/`. Names and arguments are read by plain string code. The guard
  (`noRegexOverInput.test.ts`) covers all of it, with no allowlist.
- **What SAP does itself is not re-implemented.** The regex ABAP parsers `GetAbapAST`,
  `GetAbapSemanticAnalysis` and `GetAbapSystemSymbols` are removed. In their place comes an
  outline tool backed by SAP: the object structure Eclipse's Outline reads. It is measured
  first, and its client call goes into adt-clients (one endpoint, one method).

### What changes

**Removed: the deletion check's prose heuristic** (#1, #11).
- SAP's deletion check words an existing function module, function include or inactive
  service definition "… does not exist" (W) while stating `isDeletable="true"`.
- The server read those words as "absent" and never sent the delete. Measured on premise:
  nothing was deleted, and the answer still said success.
- After the fix, when the check permits, the delete is sent and its answer is relayed. A case
  that must be named is named by its T100 key through the delete's analyse strategy (e.g.
  `SWB_TOOL 029`).
- The same mechanism caused the inactive-`DeleteServiceBinding` no-op, which is fixed with it.

**Other prose checks become key checks.** These are:
- `utils.ts`' `isAlreadyCheckedError`, `isAlreadyExistsError` and the validation response
  reading;
- `logger.ts`' "does already exist";
- `handleCreateFunctionGroup`'s "has not been created";
- the dump's `/termination/` relation, which is matched by its exact relation instead.

**Fixes in our server:**
- **#2.** The function-module tools check the module's group from its metadata
  (`adtcore:containerRef`, one GET).
- **#3.** `GetUnitTestResult` long-polls only a running run.
- **#4.** Held locks are tracked on stdio too; an unlock with a handle the instance did not
  issue is refused before anything is sent.
- **#5.** The compact debug end ends the batch answers.
- **#6.** The package walk de-duplicates; `GetPackageContents` refuses an unknown package.
- **#12.** The message-class deletes relay SAP's answer.
- **#16.** `GetTransport`'s counts are fixed.
- **#17.** The description of `CreateFunctionGroup`'s `activate` is fixed.
- **#18.** `DeleteServiceBinding` names the binding in its answer.
- **#24.** A version list's 404 is read by its exception type and answers "not found".
- **Owner decisions of 2026-11-05:** compact `HandlerGet` takes the source range
  (`start_line`, `end_line`) and a part `outline` for the types `GetObjectOutline` serves
  (plan D20); a range with any part but `source` is refused before any request; the
  profiling and dumps explorer moves to adt-clients 43 (D21); service-binding facts' exposed
  entities and every include `GetStructuresList` lists — anonymous, named and appends
  (`extend type`) — read SAP's element info (adt-clients 43.1.0, adt-strategies 0.20.0), and
  `GetStructuresList` lists all of them, a changed answer recorded in MIGRATION; it loses
  `version` (element info answers only the active structure, measured; an inactive structure
  is read through the source read with `version: inactive`); only
  `GetIncludesList`'s tree stays on a plain scanner (D22).
- **SearchSource rework (owner, 2026-11-07, plan D23):** every source-bearing object SAP
  lists is scanned through the existing readers; no `VIEW*` name skip; no object dropped
  silently (for object reads superseded by DO17 below); one read per source; a functional description — that is D23a, which needs no
  SAP. D23b (owner, 2026-11-07) holds the following:
  - **Masks are resolved completely.** A package mask is resolved by the repository quick
    search, its `maxResults` doubled until the answer holds fewer packages than `maxResults`.
    Measured on both systems: the quick search has no cap up to `maxResults` 100 000 and
    answers no "more" marker; `*` alone answers every package in seconds. A mask SAP refuses
    is skipped with no entry (DO17). The sequential and the
    batched paths resolve alike: the batched path repeats its search phase until every mask
    is resolved, and a search not yet answered never counts as a short answer. (This replaces the
    earlier idea of splitting a mask into disjoint parts.)
  - **What a mask is.** `*` and `?` are the wildcards (`?` one character, `*` zero or more);
    `+`, `_`, `%` and `#` are literal characters of a package name. An entry holding neither
    `*` nor `?` is an exact package name. Today `+` counts as a wildcard and `?` does not;
    that is fixed.
  - **The line match is a strategy.** Today it is hard-wired (`scanLines`,
    `src/lib/search-source/lineScanner.ts`: a case-insensitive substring per line, with
    `query2`, `exclude` and `exclude_comments`). It becomes a typed strategy the orchestrator
    takes explicitly, with no default inside the orchestrator; the shipped strategy keeps
    today's behaviour, and the handler wires it.
  - **Only hits are answered.** A hit names the object (type, name, package, include), the
    line number and the line's text (`snippet`, up to 255 characters). An object without a
    hit is left out of the answer: `emit_no_hits` and the `no_hits` field are removed.
  - **What cannot be read is skipped (owner, DO17).** The answer is `results` plus counters,
    with no `failures` list. A source or object that cannot be read is skipped — no entry, no
    count; a readable source of the same object is still searched and its hits kept. The
    package-level outcomes follow the same rule: a mask search SAP refuses, a named package
    that does not exist (its root refused or `404`) are skipped with no entry. A refused level
    of a walk (a type node or a subpackage, its `404` included) excludes only that branch —
    the node and everything under it; the package's other nodes, subpackages and objects are
    walked and searched (owner, DO19; today it ends the package's whole walk). The other
    walking tools keep their answer. The counters count only what was done: `scanned.packages` the
    packages walked, `scanned.objects` the objects read (at least one source read),
    `scanned.sources` the sources read, and `scanned.objects_with_hits`;
    `truncated.by_object_cap` stays. A credential refusal still ends the call. This
    supersedes D23a's failure contract; MIGRATION-24.0 (unreleased) says `failures` is
    removed.
  - **A function module is its own object (owner, DO18).** A function group and each of its
    function modules are separate scan objects. A hit in a module names the module: its type
    is the ADT code `FUGR/FF` (measured on premise: the quick search's `adtcore:type` and the
    group's node structure name a module so), its name, its package and `function_group_name` (which `GetFunctionModule` and
    compact `HandlerGet` `FUNCTION_MODULE` require), with no `include`; a hit in the group's
    own includes is the group's, with `include`. The counters count the group and each module
    apart, and each has its own `max_hits_per_object` allowance and capped flag. Every hit carries what its read tool needs; no object is nested under another.
  - **What a failed read leads to (owner, DO22).** A failed source read, mask search or
    package / level walk goes first through a fixed classification in our code, once per
    failed read, at the place it arises (a mask, a package root, a walk level, a
    function-group structure read, a source read); its outcome travels unchanged through the
    outer layers, and a cached or replayed read reuses it. Only a SAP answer goes on to the
    SAP-answer strategy (the consumer's or the shipped one), which answers skip, end the call
    or throw; the shipped one skips, as DO17 / DO19 say. A defect of our own is never
    swallowed (today every non-credential throw is skipped). Shapes are read by structure only (owner, closed and amended:
    library defects are raised, SAP's answers go to the strategy): a failure is a SAP answer
    when it carries a `response` with an integer HTTP status, whatever its `origin` (answered,
    carried, or a raw transport failure), or is an `IAdtError` of `origin: 'refusal'`; a SAP
    answer goes to the strategy (shipped: skip). Everything else — no response (unreachable
    host, network, DNS), a library defect, our defect, a primitive — is thrown. `origin` alone
    does not decide: adt-clients 43 answers a SAP `4xx` / `5xx` exception document as `origin:
    'connection'` with its `response` (Measured). A batch envelope failure is thrown, except
    the outer `404` of `isNoBatchEndpoint`, which is no failure (the sequential fallback); a
    credential refusal ends the call. Precedence: credential / server refusal end → envelope
    failure throws → a SAP answer goes to the strategy → anything else throws. A live check of
    a real SAP `404`'s shape, on premise and on ABAP Cloud, is owed. An envelope's
    failure is decided in the phase, before the client builds the parts' answers from it, so
    no part of a failed envelope is skipped as its own; an answered failure is normalised to
    a carried one first, so an answered `401` ends the call.
  - **The SAP-answer strategy is the consumer's (owner, DO22).** Only SAP answers (a
    `response` with an integer status, or `origin: 'refusal'`) reach it, with their place
    (mask, package, level, structure, source); it answers skip, end the call or throw. Library
    and server defects and no-answer failures are always thrown, credential and server
    refusals always end the call, and envelope failures are always thrown — none reaches the
    consumer. The embedder passes it in `EmbeddableMcpServer`'s options, carried to the
    handler in its context like `backgroundRuns`; the binaries' launchers pass the shipped one
    (skip). An absent option stays absent through the server and every context; the
    handler's `?? shipped` is the one default, so a context no host fills (a `HandlerExporter`
    entry's without its option, a plain group's, an optionless `EmbeddableMcpServer`'s) gets
    the shipped one there. Which wins when an embedder's context field and the
    `HandlerExporter` option are both present is open for the owner. Its contract and the shipped strategy are exported from
    `@mcp-abap-adt/lib/embeddable`. The line-match strategy is the consumer's the same way (owner,
    DO24): the same option path, the handler's default `substringLineMatch` (today's match),
    its contract and the shipped strategy exported from `@mcp-abap-adt/lib/embeddable`.
  - **The caller sets how much the answer holds (owner, DO23).** Three optional controls; with
    none, every hit with line and snippet. `answer`: `objects` (each object and include with
    hits, `function_group_name` for a `FUGR/FF` hit, and the number of hits answered),
    `lines` (plus line numbers) or `snippets` (plus the line text; the default).
    `max_hits_per_object` limits each object. `max_hits` limits the whole answer's hits,
    counted after the per-object limit: when reached, the scan stops reading further sources
    and targets (on the batched path at the next chunk) and `truncated.by_max_hits` is set when something remains;
    `scanned.*` report what was done until the stop.
  - **No paging; no user-facing limit (owner, DO20).** The mask quick search's `maxResults` is
    internal — the doubling answers every package — and no argument limits packages or
    objects. `max_objects`, `start_at`, `next_start_at`, `total_targets` and
    `truncated.by_max_objects` are removed: one run reads every target, unless the caller gives `max_hits` and it is reached (in the background by
    default, D24) and keeps only the hits; a call that still sends `max_objects` or
    `start_at` has them dropped. `max_hits_per_object` stays, optional, with no default
    (today 100): absent, no limit; given, per object. `truncated.by_object_cap` and
    `scanned.*` stay.
    `SearchSource` is not a strict tool (only the create tools are, MIGRATION-24.0), so a call
    that still sends `emit_no_hits` has it dropped, as D24's removed `timeout` is; MIGRATION
    says to drop it.
  - **SAP's text search is later work, not in 24.0.0.** It answers `SRIS_SEARCH 006` ("Source
    Search is not supported") on both systems (Measured); on premise its business function is
    off. The scan stays the one path until a system offers it.
  - **Package walks stay uncapped (owner: packages are found quickly).** Known limit, no
    change planned: on ABAP Cloud a walk of 12 packages took about 130 s, and walk envelopes
    of about 1 000 parts and more failed with an outer `500` after about 600 s (Measured);
    that the 600 s is a limit outside the server is an Inference — its source is not measured.
  - `time_budget_ms` and `timeout` stay removed (DO11, D24).
- **Long tools (owner, 2026-11-07, plan D24):** no server-side deadline remains — `timeout` is
  removed from every listed long tool (`SearchSource`'s `time_budget_ms` and `timeout` were already
  removed in D23a); every
  long tool runs on its own ABAP session, `SearchSource` included; `background` defaults to
  `true` on every long tool (a call answers a `run_handle` at once; `background: false`
  answers in the call) — a breaking change in MIGRATION; the code-running tools keep their
  own `background` default; `DiscardBackgroundRun` cancels a running read run by logging off
  its session — the run's one connection held by the instance, `cancelled` final, recorded
  through the store's existing `finish` (a running code run is still refused) — and the run
  answers gain `cancelled`. A finished read run's answer is removed once `GetBackgroundRun` answers it (code
  runs are kept until discarded); with no background-run strategy a long tool runs
  synchronously; `HandlerGet`'s run-reading parts (unit-test results, activation status and
  results) stay synchronous and take no `background`. `time_budget_ms` / `timeout` were removed in D23a (`91ee9d14`); D24 only runs the
  regression check. Once Get answers a finished or cancelled read, that read is gone: a lost
  Get response cannot be recovered, List no longer shows it, and the read is started again.
- **Compact `HandlerSystem` (owner, 2026-11-07, plan D25, DO21):** one compact tool with a
  required `action`, each action calling exactly one full-set tool's entry, so that tool's
  schema parses its arguments: `search_source` (`SearchSource` as D23b leaves it — compact has
  no source search today), `search_object` (`SearchObject`), `where_used` (`GetWhereUsed`),
  `package_tree` (`GetPackageTree`), `transports` (`ListTransports`), `atc_findings`
  (`GetATCFindings`), `atc_results` (`ListATCResults`) and `atc_result` (`GetATCResult`):
  eight actions, one full tool each, picked by the `action` constant alone — nothing is
  inferred from which arguments a call carries (owner). Each action takes exactly its full
  tool's arguments, named and typed as there: one flat schema with a per-action takes table
  (the compact pattern; a discriminated union on `action` is no `z.ZodObject`, which every
  tool definition's schema is — measured by code), the call parsed by the target entry's own
  schema. A missing required argument is refused per action in the target's words before
  anything is sent; a wrong-typed or ill-valued argument is refused before dispatch by the
  SDK's validation of the listed schema, in `HandlerSystem`'s name. An argument of another
  action is dropped like any undeclared key on a non-strict tool when it has that action's
  type; a wrong-typed one is refused by the same listed-schema validation, in
  `HandlerSystem`'s name, like any malformed argument, and the listing keeps its types (owner,
  plan D25-Q3, option A); MIGRATION-24.0 says so. `HandlerSearch` and `HandlerWhereUsed` are removed,
  with no duplicate; MIGRATION-24.0 and CHANGELOG map their calls to `search_object` and
  `where_used` (`where_used` takes `GetWhereUsed`'s arguments and answers every reference: the
  compact `max_results` cut goes). `HandlerSystem` is a long tool under D24's rules (on
  `LONG_TOOLS` and `tools/long-handlers.json`, `background` default `true`, its own ABAP
  session, read by `HandlerBackgroundRunGet`, cancelled by `HandlerBackgroundRunDiscard`; with
  no strategy it answers in the call and lists no `background`). It is read-only and served by
  every compact binary, the `-ro` ones included; the exporter serves no compact tool and is
  unaffected (it keeps the full counterparts). `HandlerDumpList`,
  `HandlerProfileView` and `HandlerGetData` stay as they are. D25 follows D23b. Measured by
  code: no compact tool serves `GetObjectsList`, `GetStructuresList`, `GetIncludesList`,
  `GetObjectInfo` or `DescribeByList` (`HandlerGet`'s `node_structure` reads one node level,
  `main_programs` an include's main programs; neither is one of them); adding them is the
  owner's later call, not D25's.
- **Verified doubts (owner-approved):** `GetIncludesList` fails for an unknown root
  program (nested includes stay absent); `MemorySnapshotList` always answers
  `{ snapshots }` (a contract change); `GetBehaviorImplementation` and `HandlerGet`
  `BEHAVIOR_IMPLEMENTATION` gain the part `implementations`; the descriptions of
  `MoveTransportObjects` and the profiler's `statements` say what SAP does.
- **Removed, not fixed (#14, #15):** SAP ignores `class:abstract` and
  `program:programType` on create (measured); `abstract` (CreateClass) and `program_type`
  (CreateProgram, HandlerCreate PROGRAM) are removed — a MIGRATION entry.
- **Doubts the owner listed:** `GetServiceBinding`'s json format; the profiler's `top` of 0
  or less is refused.

**Fixes in adt-clients**, a major release in a cross-repository cycle (with adt-strategies'
`readObjectOutline`), released before the families pin those requests:
- #8: every attribute value written into a create body is XML-escaped;
- #348: a create's language is written and sent as the `sap-language` header, or neither
  when none is given (no `'EN'` default);
- #22: no `description=undefined` in the validation parameters;
- #9: `CheckTable`'s source is sent;
- `CreateTransport` `customizing` sends type `W`, not `T`;
- the profiler's auto-drill-down threshold is sent as given;
- the outline method.

**Owner decisions (2026-11-04)**, listed in the plan's D stage:
- the source reads take an optional line range (`start_line`, `end_line`), cut by the server
  after its one GET — ADT serves no part of a source (measured on premise);
- the source scans kept in `GetIncludesList`, `GetStructuresList` and the service-binding
  facts are SAP-backed where SAP states the reading, otherwise a plain line scanner;
- `CreateServiceDefinition`'s description stops promising a template;
- the message-class reads around create and update are added;
- `GetAdtTypes`' `validate_type` and the `GetObjectNodeFromCache` tool are removed;
- `HandlerGetData` refuses `object_name` together with `sql_query`;
- the outline tool is `GetObjectOutline`;
- the prose guard recognises SAP-derived values by type and flow, with no allowlist.

### What is SAP's and stays

These are SAP's answers, relayed as they are:
- #7 — an ATC run status for a malformed id;
- #19, #20, #21;
- #23 — the deletion check's own text, relayed faithfully;
- #4's release on a bogus handle within one session;
- #25 — `content_uri` comes from the object's version list and is read as given (the
  owner's decision); the version tools' contracts do not change;
- #12's `201` on a duplicate or unknown package. The read after the create is ours, and is
  added.

### Acceptance

- Every fix starts with a test that fails first.
- Where requests change, they are pinned by literal, and the coverage stage's pins are
  written on the fixed code.
- A live case exists wherever §8 requires one.
- The listed-schema and surface fixtures change only by the removals, the additions and the
  contract fixes this section names, each visible in the diff.
- CHANGELOG (24.0.0) records each fix. MIGRATION-24.0 records each contract change: the
  three removed tools with their replacements, the outline tool, `HandlerSearch` and
  `HandlerWhereUsed` with the `HandlerSystem` action that replaces each call (D25), and any
  argument that is now refused.
- The ledger (§8) drops the removed tools' keys and adds the outline tool's and
  `HandlerSystem`'s, one per `action` value.
