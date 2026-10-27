# Plan: ADT object type codes — the library's types, release variants and the conformance check

**Goal:** [`2026-10-27-adt-type-codes-goal.md`](../2026-10-27-adt-type-codes-goal.md)
**Spec:** [`2026-10-27-adt-type-codes-design.md`](../specs/2026-10-27-adt-type-codes-design.md)

The work spans three repositories, each with its own PR. This plan's documents live in #329. The dependencies fix the order (spec §7):
1. interfaces-adt;
2. the recorded answers, in adt-clients' PR;
3. adt-strategies, adt-clients and adt-clients-legacy, released once, after #216's Part B;
4. the server, released once, after #216's Part C.

## Global constraints

- **No run-time check against a system.** The compiler holds code to the tables, and the conformance check holds the tables to the systems.
- **No untyped code literals.** Production code has no code literal unless its contextual type is the tables'.
- **No behaviour change for a correct code.**
- **Dependencies.**
  - Every dependency comes from the npm registry.
  - Workspace siblings may be linked until release.
  - npm regenerates the lockfiles.
  - Commands run as npm scripts, never `npx`.
- **Breakage is found by the compiler:** `build`, `test:check` and each repository's CI steps.
- **Versions.** A major for each package whose types change. A 0.x package gets a minor instead. Every version carries a migration note.
- **Live runs.**
  - They run on a system of each release, as the test user only, with the realm checked first.
  - Any credential refusal stops everything.
  - They touch only our own objects and never release a request.
- **Committed files** name no SAP system, system id, host, client, transport number or user name. The releases are named by platform.
- **CLAUDE.md and SCOPE.md** change only with the owner's approval of the text.

## Review focus

1. **A correct call still works.** Every request a served API sends today is unchanged. The existing unit suites pass with type edits only. A live pass confirms it (S9).
2. **A call the variant does not serve does not compile.** This covers getters, operations, legacy overrides and a missing parent, each with a `@ts-expect-error` (C3).
3. **The conformance check carries its rules.** A deliberate break of a table entry fails it, and so does a break of a recorded answer. This holds for every rule, the address rule included (C6).
4. **An unknown code from ADT is not lost.** It reaches the consumer as `unknownType` at every parser (C5).
5. **What the model is offered works.** Each schema and each refusal list comes from the variant's projections. Every offered code reaches a served path (S3, S9).

---

## Part M: the recorded answers (mcp-abap-adt-clients, in Part C's PR)

The conformance check runs in adt-clients, so its recorded answers live in adt-clients' corpus (`packages/adt-clients/corpus/adt`). The server's `system-description-*` records stay as the evidence of `docs/architecture/SYSTEM_DESCRIPTION.md`.

### Task M1: the answers the check reads

- **Copy** the three releases' `typestructure` and `discovery` exchanges, body and sidecar, from the server's corpus (`37d4aafe`), byte for byte.
- **Record**, on S/4HANA 2025 and ABAP cloud, for one sample object of every API the library serves there:
  - the `URI_TEMPLATE` address's `GET`;
  - the `GET /sap/bc/adt/vit/urimapper?uri=<template address>` answer;
  - the sample's own metadata document (`GET <object URI>`). On 7.40, the same for the APIs the legacy package serves.
- **Sample objects** are our own (`ZMCP_ATC_SAMPLES`, the shared test objects) or a system object, read only.
- **How** the recording is done:
  - in the corpus format;
  - with a temporary hand-run recorder that is never committed and is deleted after;
  - scrubbed as the corpus README says.
- **Verify:**
  - adt-clients' corpus guard passes;
  - every API with a served address has its `urimapper` answer, or is listed as having no sample.

## Part I: interfaces-adt (mcp-abap-adt-interfaces, its own PR, 21.0.0)

### Task I0: what each variant really serves

- **The inventory.** Inventory, API by API and code by code, what the library serves today on each variant.
  - A member counts only if it sends a request and is covered by a unit test of its request shape.
  - A refusal stub is not served: `absentOnLegacy`, `noDeletionCheck`, `legacyMeasuredRefusal`, `noTransportResource` and the like. Neither is a member that always answers a refusal.
- **Where it goes.** Attach the inventory to the PR description as a table: variant × API × code × operation, each cell served or refused, with the member and test that prove it. It is the input of I1.
- **Verify.** Every refusal stub in the three packages appears as "refused" in the inventory.

### Task I1: the tables

- **The three tables.** Write `ADT_TYPES_ONPREM`, `ADT_TYPES_CLOUD` and `ADT_TYPES_BASIS_740`, keyed by API.
  - Each entry holds a kind, a collection and one or more codes.
  - Each code holds its parent API, name length, operations and evidence (spec 2.1).
- **Where the content comes from.** The I0 inventory, cell for cell. The collections come from today's addresses.
- **Verify.** A test asserts each table against the inventory's recorded form: every served cell is an operation of its entry, and no refused cell is one.
- **Vocabulary and derived types.** The closed operation vocabulary. Then `AdtApi<V>`, `AdtTypeCode`, `AdtOperation`, `AdtApiWith<V, Op>`, `AdtObjectKind` and `AdtSourceTypeCode`, derived from the tables.

### Task I2: the contracts

- Add `IAdtAnsweredObject`.
- `IObjectReference.type` becomes `AdtTypeCode`.
- Reshape the configs and references that require a parent (spec 2.3).
- Remove `AdtObjectTypeLower`, `AdtObjectType`, `AdtSourceObjectTypeLower` and `AdtSourceObjectType`, together with their uses in interfaces-adt.
- Update `tools/package-map.json`.
- **Verify.** Type checks: a function module config without its group fails with `@ts-expect-error`, and one with it compiles. `check:surface` lists every new export.

### Task I3: type checks

- **Type checks** under `src/__typechecks__/`:
  - a typed map over the codes compiles;
  - each code of spec 1.1 fails with `@ts-expect-error`.

### Task I4: docs and release

- README, docs, and a CHANGELOG 21.0.0 entry with a migration note.
- **Verify:** `npm run check` passes. interfaces-adt holds no test and no fixture beyond `src/__typechecks__`.
- Open the PR and run the Codex review. The owner merges and publishes.

## Part C: adt-strategies, adt-clients, adt-clients-legacy (mcp-abap-adt-clients, its own PR)

### Task C1: the base

- **Start on #216's Part B**, on its branch or on main once merged. 38.0.0 and 0.2.0 are released once, carrying both.
- **Dependency.** Move `@mcp-abap-adt/interfaces-adt` to `^21.0.0` from the registry. Regenerate the lockfile.
- **Verify:**
  - the lockfile has no link but the workspace siblings;
  - `test:check` lists the compile errors the removed unions cause. That list is the work of C2–C5, and nothing is silenced.

### Task C2: addresses and maps from the tables

- **Addresses.** `buildObjectUri` builds from the entry's `collection`, and from the parent's address where there is one. Irregular addresses stay as typed exceptions, each naming its corpus case.
- **Removed codes.** `FUNC` and every code of spec 1.1 go.
- **Typed maps.** `WHERE_USED_ALIASES`, `objectWire`, checkRun, the legacy refusal maps, and the create and validation payloads are typed against the tables.
- **New member.** Add `getUtils().getTypeStructure()`.
- **Verify:** the request-shape tests show every payload and address unchanged.

### Task C2a: measure source and metadata, read and update

- **What.** For class, interface, program, function module and DDL source first, then every other CRUD API in I0. On S/4HANA 2025, and on 7.40 for the APIs the legacy package serves, measure:
  - how ADT answers a read of the source and a read of the metadata;
  - what it accepts for an update of each: method, URI, `Content-Type`, the lock and `corrNr`.
- **On which objects.** On new objects created for the measurement in `$TMP`, named `ZMCP_MD_*` on S/4HANA 2025 and `ZLG7_MD_*` on 7.40. They are deleted after the measurement.
- **The record.** It goes to adt-clients' corpus, in the corpus format, scrubbed.
- **Verify.** Every API of the five has a recorded answer for all four operations, or the refusal that proves an operation is not served.

### Task C2b: implement them

- **Members.** For each measured type, `updateMetadata(config, metadataXml)`, and a source or metadata read where one was missing, sending exactly what C2a recorded. A metadata update sends the consumer's whole XML as it is: no field is built or merged by the library. Each member has a request-shape unit test.
- **Legacy.** The legacy package overrides only where 7.40 answers differently, and refuses without a request where 7.40 does not serve it.
- **Tables.** The tables in interfaces-adt gain the operations, released as 21.1.0 (a minor) before C3 uses them.
- **Live cycle.** Read metadata, change the description, write, read back and compare, restore. Run it per type on a system of each release in S9.
- **Verify.** Build and every unit suite are green, and the request-shape tests match the C2a records.

### Task C3: the variant client and its gates

- **The client.** `AdtClient<V>`, generic. Its factories are gated by `AdtApi<V>`, and its operation members by the entry's operations.
- **Entry points.** `AdtClientOnPrem`, `AdtClientCloud`, and `createAdtClient(connection, { variant })`.
- **Legacy.**
  - `AdtClientLegacy extends AdtClient<'basis740'>`.
  - Every override keeps the base's gate.
  - The legacy handlers are fixed to `'basis740'`.
- **Per-code gates inside one API.** An operation whose entry differs by code (an enhancement's `read`/`source` only for `ENHO/XHH`) takes the code in its argument's type, so that the gate follows it.
- **Negative compile checks** (review focus 2). One `@ts-expect-error` each for:
  - a factory the variant lacks;
  - an operation the API lacks;
  - an operation one code of the API lacks, with the code that has it compiling;
  - the same through a legacy override;
  - a missing parent.
- **Verify:** the negative compile checks fail as expected and the positive ones compile. The full green gate is at the end of C5, because C2–C5 are one migration.

### Task C4: the overlap with #216

- Where #216's Part B and this part touch the same lines, the spec of the change that owns the line decides.
- **Verify:** no conflict marker is left, and `test:check` lists no error that comes from a merge.

### Task C5: the answer boundary (adt-strategies)

- Every strategy that reads a code from an answer looks it up once and answers `IAdtAnsweredObject`.
- One unit test per strategy, with a recorded answer and with an unknown code (review focus 4).
- adt-strategies goes to 0.16.0, with a migration note.
- **Verify, for C2–C5 together:** build, `test:check` and every package's unit suite are green.

### Task C6: the conformance check, in CI and live

- **The check, per variant**, for the tables imported from interfaces-adt and the recorded answers of M1:
  - the code is listed;
  - the parent;
  - the name length;
  - the collection is advertised in `discovery`;
  - on a newer release, the address `buildObjectUri` builds for the sample equals the `urimapper` answer;
  - `EXECUTE` and `PROFILE` strictly;
  - `create` without `CREATE` is listed apart;
  - a type that lists `CREATE` but has no `create` in its entry goes into the coverage;
  - `source` in an entry if and only if the sample's metadata document has a `rel=…/source` link typed `text/plain` or untyped;
  - `updateMetadata`'s media type among the collection's `app:accept`, where the release advertises any;
  - the coverage is asserted as a recorded list.
- **One meaning per code.** Group every code of every entry of every table, duplicates inside a table included, and assert one kind per code.
- **Verify the check bites** (review focus 3). One negative fixture per conflict rule and per capability rule. Each is a minimal answer or table entry that makes its own rule fail.
- **The live check.**
  - It reads `typestructure`, `discovery` and `urimapper` through the library, and runs the same check for the configured variant.
  - The system's identity is printed at run time and never committed.
  - With no live configuration, it skips with a named reason. A failed read is a failure.
  - With a write flag, which CI refuses, it scrubs the answers and writes them to an output directory the configuration names.
- **Refreshing a release.** adt-clients' README documents how to add the output to its corpus. Nothing else lists the recorded answers.

### Task C7: versions, ranges, scan, docs

- **Versions and ranges.**
  - strategies 0.16.0, clients 38.0.0, legacy 0.2.0;
  - clients takes strategies `^0.16.0`;
  - legacy takes clients `^38.0.0` as a peer and dev dependency.
- **The literal scan** (spec 6) over `packages/*/src`:
  - one Jest test using the TypeScript compiler API and its type checker;
  - a literal passes only with a contextual type of `AdtTypeCode` or a subset of it;
  - the spec's exceptions, as a committed allowlist;
  - prose checked against the tables.

  Tests cover a typed literal that passes, an untyped one that fails, a valid prose mention and an invalid one.
- **Docs.** The README and docs of all three packages, the examples, and the migration notes.
- **Verify before the review:** every CI step is green (lint, build, `test:check`, every unit suite, `check:packed`, `check:publish`).
- **Release.** Run the Codex review. The owner merges and publishes in order. Then do a clean install of all three from the registry, outside the repository.

## Part S: the server (#329, mcp-abap-adt 21.0.0)

### Task S1: dependencies and #216's Part C

- Move interfaces-adt to `^21.0.0`, adt-clients to `^38.0.0` and adt-strategies to `^0.16.0`, all from the registry.
- #216's Part C lands first. Its client contract is composed per variant from the tables.
- **Verify:**
  - negative compile checks through the server's own contract: a factory the variant lacks and an operation the API lacks each fail with `@ts-expect-error`;
  - build and `test:check` are green before S2.

### Task S2: the variant and the tool set

- **The variant.** The process's declared system type picks it, as today.
- **Inspection.** A stdio start with no destination requires the variant to be named. Without it, the start is refused, naming the flag.
- **The tool set** is built from the variant's table, for the object-oriented groups and the compact entries alike.
- **Verify:**
  - one unit test per variant asserts the tool-surface fixtures;
  - the inspection start without a variant is refused.

### Task S3: per-operation projections

- **Two typed projections per operation:** the accepted ADT codes and the accepted friendly names.
- **Where they are used.** The schema enum, the description list and the refusal list each use the projection of the argument they describe.
- **Regenerate** the tool docs and the tool-surface fixtures, and check the tool-search set.
- **Verify** (review focus 5): a unit test walks every projection and proves that each value reaches a served path.

### Task S4: the boundary and the maps

- **The boundary.** A code argument is upper-cased once and checked against the accepted codes. A friendly-name argument is checked against the accepted names.
- **Typed maps.** `TYPE_TO_FAMILY`, `READS`, packageEnumerator, `ADT_TYPE_BY_COMPACT_TYPE`, `VALID_TYPES` and the compact names are typed against the tables.
- **Removed.** `KIND_BY_TYPE` and its prefix fallback go.
- **The debugger's labels** become one union, mapped to their codes.
- **Pinning tests.** The tests that pinned `doma/dm` and `bdef/bd` pin the served codes instead.
- **Verify:**
  - for every operation family, a unit test with a valid code, a wrong code and a friendly name, each answered as its projection says;
  - `KIND_BY_TYPE` is gone, which a grep shows.

### Task S5: the literal scan

- The same scan as C7, with the same mechanics, exceptions and four tests, over `src` and every package directory, descriptions included.
- interfaces-adt has no scan: its only code literals are the tables, which the scan allows.

### Task S6: the five defects, re-checked

- Re-run the review of the five PR #329 defects on top of the tables.
- **Verify:** no finding is left open.

### Task S7: docs and release notes

- The CHANGELOG `[Unreleased]` entries go under the major heading, with a migration note on:
  - the variant;
  - the inspection flag;
  - the codes each operation accepts;
  - the dropped codes;
  - `unknownType` in answers.
- Update the tool docs, the user guide and the package READMEs.
- **Verify.** `npm run docs:tools` leaves the committed tool docs unchanged. The CHANGELOG names every changed tool argument.

### Task S9: live

Run on a system of each release, with the realm checked first, as the test user, on our own objects only:
- **RunATC** over a program, a program include, a function include and a class include in `ZMCP_ATC_SAMPLES`, with variant `ZRS_S4HANA_READINESS_2023`, compared against a package run.
- **One call per offered code** of every operation's projection, through the full and the compact tools, on our own objects.
- **The live conformance check** (C6) for each release.

Each answer is read for success, not only for its status.

**Verify:** every CI step is green (lint, build, `test:check`, `npm test`). Then the Codex review. Then the owner's word on merge.

## Closing

Before the server's 21.0.0 is tagged, delete from `docs/superpowers/`:
- the goal;
- this plan;
- the spec;
- the reported-gaps to-do and the fix brief.

What they still owe goes into #329's description first.
