# Spec: ADT object type codes — the library's types, release variants and the conformance check

Answers [`2026-10-27-adt-type-codes-goal.md`](../2026-10-27-adt-type-codes-goal.md).

Releases are named by platform, never by system:
- **S/4HANA 2025 on-premise**;
- **ABAP cloud**, measured on the BTP trial;
- **SAP_BASIS 7.40 SP04**.

## 1. What there is today

### 1.1 The code's own maps (read 2026-10-27)

| Repository | Revision read |
|---|---|
| mcp-abap-adt | `d3ae5efd` |
| adt-clients | `7a4499bb` |
| interfaces-adt | `4b96593` |

- **Our maps.** There are about a dozen hand-written maps, and each has its own vocabulary.
  - interfaces-adt: `AdtObjectTypeLower`, `AdtSourceObjectTypeLower`.
  - adt-clients: `buildObjectUri`, `WHERE_USED_ALIASES`, `objectWire`, checkRun's `getObjectUri`, the create and validation payloads.
  - adt-clients-legacy: its refusal maps.
  - adt-strategies: `results/utils.ts`.
  - The server:
    - `TYPE_TO_FAMILY`, `KIND_BY_TYPE`, `READS`;
    - the debugger's aliases, packageEnumerator;
    - `ADT_TYPE_BY_COMPACT_TYPE`, `VALID_TYPES`;
    - GetIncludesList, GetEnhancements;
    - the tool descriptions.
- **Codes no release lists** (1.2), and what the releases list for that object instead:

  | Code in our maps | What the releases list |
  |---|---|
  | `INTF/IF` | `INTF/OI` |
  | `STRU/DT`, `STRU/DS` | `TABL/DS` |
  | `TTYP/DF`, `TTYP/TT`, `TTYP/ST` | `TTYP/DA` |
  | `DOMA/DM` | `DOMA/DD` |
  | `BDEF/BD` | `BDEF/BDO` |
  | `BIMP/BIM`, `BIMP/`, `BIMPL/` | `CLAS/OC` |
  | `FUGR/FC` | — |
  | `SCGR` | `SCGR/3G` |
  | `DSFD/DSF`, `DSFI/DSF`, `SUSO/O` (comments) | `DSFD/SCF`, `DSFI/SFI`, `AUTH` |

- **`FUNC` means two things.**
  - adt-clients' `buildObjectUri` reads it as a function group.
  - The server's debugger reads it as a function module.
  - In the releases' quick-search names, `FUNC` is the function module, `FUGR/FF`.
- **Codes we offer that our own path refuses:**
  - GetWhereUsed offers `intf/if` and `stru/dt`;
  - ActivateObjects offers bare `ENHO`;
  - GetIncludesList's enum refuses `FUGR/F`;
  - `objectWire` throws on `TABL/DS`, and lacks `INTF/OI` as a source type;
  - `buildObjectUri` lacks `TTYP/DA`.

### 1.2 What the releases say about themselves (measured 2026-10-27)

The full answers are in the server corpus `tests/fixtures/adt/`, in the cases `system-description-s4-2025`, `-abap-cloud` and `-basis-740`. `docs/architecture/SYSTEM_DESCRIPTION.md` documents them.

| Request | S/4HANA 2025 | ABAP cloud | 7.40 SP04 |
|---|---|---|---|
| `GET core/discovery` | 200 | 200 | 200, empty body (Eclipse's log shows 404) |
| `GET compatibility/graph` (features) | 207 nodes | 207 nodes, identical | 182 nodes |
| `GET discovery` (endpoints) | 831 collections | 947 | 125, no `app:accept` |
| `GET …/objecttypes` (quick-search names) | 386 items | 373 items | 404 Not Found, no list |
| `POST repository/typestructure` (object types) | 721 types | 708 | 464 |

- **Overlap of types between releases:**

  | Types | Count |
  |---|---|
  | on all three | 439 |
  | on both newer releases | 686 |
  | only on S/4HANA 2025 | 32 |
  | only on ABAP cloud | 22 |
  | only on 7.40 | 22 |

  No code means two things across the releases. None of 1.1's codes is listed.
- **Each type carries:**
  - `OBJECT_TYPE`, `OBJECT_TYPE_LABEL`;
  - `CATEGORY`, `CATEGORY_LABEL`;
  - `URI_TEMPLATE`, `PARENT_OBJECT_TYPE`;
  - `OBJNAME_MAXLENGTH`;
  - `CAPABILITIES` (`SEU_ACTION`s).

  The newer releases add `OBJECT_TYPE_LABEL_PLURAL`, `USER_AUTHORIZATIONS` and `SCOPES`.
- **Capabilities.**
  - 7.40: `CREATE`, `EXECUTE`, `PROFILE`.
  - The newer releases add `INDEX_UPD` and `KTD_DOCU`.
- **User authorizations.** They hold only `CREATE`: on 608 types on S/4HANA 2025, on 238 on ABAP cloud. They belong to the user who asked.
- **The system type is not told apart by `core/discovery`.** Its status is 200 on all three releases (7.40 answers an empty body), so the system type stays declared.
- **Capabilities are the operations a type offers, and `CREATE`'s absence is not a refusal.**
  - `EXECUTE` and `PROFILE` are listed on all three releases exactly for `CLAS/OC`, `PROG/P` and `FUGR/FF`. Those are the types the library runs and profiles.
  - `CREATE` is listed for the classic types. It is absent for types ADT creates through their own collection:
    - on 7.40, `DDLS/DF` lists no capability, and ADT created a DDL there (`201`, record B4, step `d1-create`);
    - on the newer releases, `DDLS/DF`, `BDEF/BDO`, `SRVD/SRV`, `SRVB/SVB` and `DDLX/EX` list no `CREATE`.
  - On the newer releases, 97 and 111 discovery collections carry a category term equal to a type's code without its slash, the same token as the `URI_TEMPLATE`'s. 86 and 99 of those types list no `CREATE`. On 7.40 no category term is a type code.
  - Inference, not measured: `CREATE` marks creation by the generic workbench path, and wbobj-framework types are created through their own collection.
- **A type in `typestructure` is a workbench type, not an ADT service.** 7.40 lists `DOMA/DD`, `DTEL/DE`, `TABL/DS`, `TABL/DT`, `TTYP/DA` and `XSLT/VT`, but its ADT serves none of their resources (measured in #271). What the library does with a type is the library's declaration (2.1), checked against the system (4).

### 1.3 The system's own address of an object (measured 2026-10-27, read only)

- **The template.** Every `URI_TEMPLATE` on the three releases has one placeholder, `{name}`. It has the form `/sap/bc/adt/vit/wb/object_type/<code without slash>/object_name/{name}`. For `FUGR/FF`, `FUGR/I` and `PROG/I` the template carries a 40-blank field before `{name}`. This is template padding, not a parent: `PROG/I`'s `PARENT_OBJECT_TYPE` is empty on all three releases. The parented types are `FUGR/FF` and `FUGR/I`.
- **The collections.** Discovery on the two newer releases advertises the template's collection as "Basic Object Properties" (`…/vit/wb/object_type/{type}/object_name/{name}`). It also advertises `/sap/bc/adt/vit/urimapper{?uri}`. 7.40's discovery advertises neither.
- **`GET` of a template address.** On S/4HANA 2025 it answers `application/vnd.sap.adt.basic.object.properties+xml`: the object's name, type and package, and no resource address.
- **`GET /sap/bc/adt/vit/urimapper?uri=<template address>`.** On S/4HANA 2025 it answers `adtcore:objectReference` with the object's resource address and type:

  | Template address | `adtcore:uri` |
  |---|---|
  | `…/clasoc/object_name/<class>` | `/sap/bc/adt/oo/classes/<class>` |
  | `…/fugrff/object_name/<40 blanks><module>` | `/sap/bc/adt/functions/groups/<group>/fmodules/<module>`, with the group found by the system |
  | `…/progi/object_name/<40 blanks><include>` | `/sap/bc/adt/programs/includes/<include>` |

- These answers are recorded into the corpus with the rest (plan, Part M).

## 2. interfaces-adt: the library's types (constants and types only)

### 2.1 One entry per API the library offers, per variant

The library declares what it supports as `as const` tables, one per variant:
- `ADT_TYPES_ONPREM`;
- `ADT_TYPES_CLOUD`;
- `ADT_TYPES_BASIS_740`.

They are keyed by the **API**, the client's factory, not by the code.
- One code can serve two APIs. A structure and an append structure share `TABL/DS`, and a class and a behavior implementation share `CLAS/OC`.
- One API can serve several codes, each with its own operations. `getEnhancement()` serves `ENHO/XHH`, `ENHO/XHB` and `ENHS/XSB`, and only `ENHO/XHH` reads source.
- So an entry is an API with one or more **codes**, and the per-code facts sit under each code.

```ts
export const ADT_TYPES_BASIS_740 = {
  class: { kind: 'class', collection: '/sap/bc/adt/oo/classes', codes: {
    'CLAS/OC': { parent: null, nameMaxLength: 30,
                 operations: ['create', 'read', 'readMetadata', 'source', 'lock', 'unlock', 'update',
                              'activate', 'check', 'validate', 'versions', 'delete'],
                 evidence: 'system-description-basis-740--07-typestructure' } } },
  functionModule: { kind: 'function_module', collection: '/sap/bc/adt/functions/groups', codes: {
    'FUGR/FF': { parent: 'functionGroup', nameMaxLength: 30, /* … */ } } },
  // … every API the library serves on 7.40; no `domain`, `table`, `behaviorImplementation` …
} as const satisfies AdtApiTable;
```

- **An entry holds**, for the API:
  - **the kind**, in the tools' one vocabulary;
  - **the ADT collection its resource lives in.** A parent-addressed API names its parent's collection.
  - **its codes.** For each code:
    - **the parent API**;
    - **the name max length**;
    - **the operations the library performs there.** They come from one closed vocabulary: create, read, readMetadata, source, lock, unlock, update, activate, check, validate, versions, deletionCheck, delete, run, and the like. Each operation corresponds to a class member.
  - **its evidence**: the corpus case that shows the code on this release.
- **Written by hand.** The tables are the library's declaration, and the conformance check (4) proves them against the systems.
- **Derived types:**
  - `AdtApi<V>`: the APIs of a variant;
  - `AdtTypeCode`: every code of any table;
  - `AdtOperation`;
  - `AdtApiWith<V, Op>`;
  - `AdtObjectKind`;
  - `AdtSourceTypeCode`: the codes whose API has `source`.
- **One meaning per code.** A test in adt-clients groups every code of every entry of every table, duplicates inside one table included. It asserts one kind per code.
- **What goes:**
  - `AdtObjectTypeLower`, `AdtObjectType`, `AdtSourceObjectTypeLower` and `AdtSourceObjectType` are removed;
  - `IObjectReference.type` becomes `AdtTypeCode`;
  - `tools/package-map.json` is updated.

### 2.2 Answered objects

`IAdtAnsweredObject` is `{ type: AdtTypeCode }` or `{ unknownType: string }`. Every result contract that carries objects read from an answer uses it.

### 2.3 Parents in the contracts

A config or object reference for an API with a parent requires the parent's name in its type. The function module's config, the function include's, and the object references of the group utilities are reshaped so that the parent is required where the table says so. A `Partial<…>` that drops it is not used for those.

## 3. adt-clients, adt-strategies, adt-clients-legacy

### 3.1 One client, parameterised by its variant

- **`AdtClient<V>`**:
  - A factory is callable only for an API of `V`. Its `this` parameter requires it.
  - Each handler class is generic in `V`. An operation member is callable only when the API's entry lists that operation.
- **Entry points and creation.**
  - Two entry points, `AdtClientOnPrem` and `AdtClientCloud`, each fix `V`.
  - `createAdtClient(connection, { variant })` answers one of them. It reads nothing and probes nothing.
- **Legacy.**
  - `AdtClientLegacy` extends `AdtClient<'basis740'>`.
  - Every override keeps the same `this` gate as its base. The legacy handler classes it returns are fixed to `'basis740'`.
  - `absentOnLegacy` stays only for callers outside the type system.
- **Negative compile checks**, each with `@ts-expect-error`, cover:
  - a factory the variant lacks;
  - an operation the API lacks;
  - the same call through a legacy override;
  - an API with a parent called without the parent.
- **#216's Part B lands first.**

### 3.2 Addresses from the tables

- **`buildObjectUri`** builds an object's address from its API's `collection`, and the parent's address where the table names a parent. Its own hand-written list of addresses goes. What does not follow the collection rule stays as typed exceptions, each with its corpus case.
- **`FUNC` and the codes of 1.1 go.** So does every map that held them: `WHERE_USED_ALIASES`, `objectWire`, checkRun, the legacy refusal maps, and the payloads are typed against the tables.
- **A new member, `getUtils().getTypeStructure()`**, reads `typestructure`, so the live check can use the library.

### 3.3 The answer boundary (adt-strategies)

- A strategy that reads a code from an answer looks it up once and answers `IAdtAnsweredObject`.
- Codes are extracted by XML context: `adtcore:type`, `OBJECT_TYPE` text, the object-type `type` attributes, and the URL-decoded `type=` of an ADT URI fragment.
- adt-strategies 0.16.0 is a breaking 0.x minor, with a migration note.

### 3.4 Source and metadata, read and update, for every CRUD API

- **The rule.** Every API that the library offers CRUD for reads and updates what the object has: its source (`source`, `update`) where it has one, and its metadata (`readMetadata`, `updateMetadata`) where it has metadata. Today `updateMetadata` is missing for most objects that have both, so a description or a program's attributes cannot be changed (I0).
- **Where the knowledge comes from.** Which objects have a source and which have metadata is the library's knowledge, recorded in the tables. The system-level answers do not state it (1.2):
  - `typestructure`'s `CATEGORY` does not follow it;
  - discovery's `/source/main` templates cover only some collections.
- **The object's own metadata document states it** (measured on the recorded corpus). Each document carries `atom:link rel="http://www.sap.com/adt/relations/source"` links:
  - a link typed `text/plain`, or untyped, means a source exists, and its `href` says where. Class, function group, structure and DDL have one, and a class lists its includes.
  - only `text/html` means there is no source, just a rendered view. Data element and package are like this.
- **The metadata type.** The type of the metadata document a collection accepts is advertised by `discovery` as `app:accept`, for example `application/vnd.sap.adt.oo.classes.v4+xml` for classes. On 7.40, discovery advertises no `app:accept`, and its documents' links are measured in C2a.
- **What a consumer passes** (owner):
  - **A source update** takes the new source text.
  - **A metadata update** takes the whole new metadata XML.
  - So the consumer reads the current metadata, changes what it needs in that document, and passes the new XML back.
  - The library neither builds nor merges metadata fields. It sends the consumer's document as it is, under the caller's lock, with the type's metadata media type. The server's tools follow the same read–modify–write.
- **How each update is sent.** Each `updateMetadata` sends what ADT accepts for that type, measured before it is written. The library writes nothing it has not measured.
- **Order.** Class, interface, program, function module and DDL source come first, then every other CRUD API.
- **Per variant.**
  - On 7.40, the legacy package serves `updateMetadata` only where 7.40 measured it. Elsewhere it refuses without a request.
  - The tables gain the operation per variant. interfaces-adt ships them as a minor (21.1.0): new values in the tables, no contract change.
- **Proof.** Every `updateMetadata` has:
  - a request-shape unit test;
  - a live cycle: read metadata → change the description → write → read back and compare → restore.

### 3.5 ABAP Unit runs: what a run names, from the registry

**Why.** The library starts an ABAP Unit run only through four runners (class, program, function group, function module). Each runner fixes its own `osl:object type`, and the member that takes any type is `protected`. A consumer therefore cannot run the tests of anything else that ABAP Unit runs: a CDS view's assigned tests, a package, a class include. Typing the runners' parameter from their four callers would cut what the endpoint accepts. The type must instead name what the endpoint accepts (owner).

**What the systems say** (measured 2026-10-29 on S/4HANA 2025 and ABAP cloud, with identical results; on our own objects in local packages, deleted afterwards):

- **`GET /sap/bc/adt/abapunit/metadata`** (`application/vnd.sap.adt.abapunit.metadata.result.v1+xml`) lists 23 `supportedTypeFeatures`. Each entry has a `globalWorkbenchType` and three flags: `ownTests`, `assignedTests` and `coverage`. The 23 codes are:
  - classes: `CLAS/OC`, `CLAS/OCI`, `CLAS/OCP`, `CLAS/OCL`, `CLAS/OLD`;
  - programs: `PROG/P`, `PROG/I`, `PROG/PL`, `PROG/PLM`;
  - function groups: `FUGR/F`, `FUGR/FF`, `FUGR/I`, `FUGR/PL`, `FUGR/PLM`;
  - containers: `DEVC/K`, `RQRQ/RQ`;
  - assigned tests only: `DDLS/DF`, `DCLS/DL`, `BDEF/BDO`, `SRVB/SVB`, `XSLT/VT`, `TABL/DT`, `CMPT`.

  It also answers `clientSetup maxRiskLevel` and `executionDenied` for the client and for the user. 7.40 has no such endpoint.
- **`POST /sap/bc/adt/abapunit/runs` with `osl:flatObjectSet`** names one object by name and `osl:object type`. These types ran the object's tests:
  - `CLAS`, `CLAS/OC` and `CLAS/OCL` (class);
  - `PROG` and `PROG/P` (report);
  - `FUGR` and `FUGR/F` (function group);
  - `FUNC` (function module).

  `FUGR/FF`, which metadata lists, answered an **empty** result for a module.
- **CDS assigned tests.** A view's assigned tests are local test classes marked `"! @testing <view>`; the plain name worked, and `DDLS:<view>` did not link. They ran with `DDLS/DF` and with `DDLS`, but only when the run's scope sets `foreignTests="true"`. With own tests only, the result was empty.
- **A package** ran its tests only as `osl:packageSet` with `<osl:package name includeSubpackages>`, alone or inside `osl:unionSet`. `osl:object type="DEVC/K"` and `type="DEVC"` answered empty.
- **A type the endpoint does not run is not refused.** The start answers `201`, and the result is an empty `<aunit:runResult/>`. Only the compiler can catch a wrong type.
- **`/sap/bc/adt/abapunit/testruns`** (the synchronous runner, and the only one on 7.40) names objects by ADT URI, not by type.

**The registry entry** (interfaces-adt, constants and types only):

- **Run object types.** `ABAP_UNIT_RUN_TYPES` holds every `osl:object type` value measured to run tests. Each value carries:
  - what it runs: own tests, or assigned tests, and with them the scope it needs (`foreignTests`);
  - its evidence: recorded, or the metadata answer only.

  The 23 codes of `/abapunit/metadata` are entered with evidence "metadata", unless a run measured them otherwise; `FUGR/FF` is entered as "metadata lists it, a run answered empty". The type a run takes is the union of every value in the constant, so it narrows nothing the endpoint was measured to accept.
- **Run targets.** A run names either an object, `{ kind: 'object', name, type }`, or a package, `{ kind: 'package', name, includeSubpackages }`. The two are a discriminated union, so a package cannot be named as an object type.
- **The runner contract.** It covers a run by target and a run by ADT URIs (`testruns`). The scope, risk level and duration options stay the consumer's.

**adt-clients.**

- **A public generic runner** implements the contract on `/runs` (object and package targets) and on `/testruns` (URIs). The request body is the one measured above.
- **The four runners stay** and keep the types they send today (`CLAS`, `PROG`, `FUGR`, `FUNC`), now typed by the registry's union. No request changes.
- **The literal scan** has no ABAP Unit exception left: the literals are typed by the registry.
- **The metadata answers** of both releases go into the corpus (`corpus/adt/abapunit/`). The conformance check asserts:
  - every metadata code is in `ABAP_UNIT_RUN_TYPES`;
  - every registry value marked "metadata" is in the recorded answer of its release.
- **Proof.**
  - Request-shape unit tests for each target kind.
  - Live cycles on S/4HANA 2025 and ABAP cloud: a class run by `CLAS/OC`, a CDS view's assigned test by `DDLS/DF` with `foreignTests`, and a package run.
- **7.40.** The legacy package keeps `testruns` (URIs). It serves no `/runs` target and refuses it without a request.

**Versions.**

- interfaces-adt takes the constant, the types and the contract as a minor: new members, nothing removed.
- adt-clients ships the generic runner in 38.0.0.
- The server's tool for it is Part S's, after the spec's review.

## 4. The conformance check

**What it reads, and what it reports.**
1. **Inputs:**
   - `typestructure`;
   - `discovery`;
   - for newer releases, one `urimapper` answer per API for a sample object.
2. **Conflicts.** It reports each of these for each entry of the variant's table:
   - the code is not listed;
   - the parent API's code is not the listed `PARENT_OBJECT_TYPE` (an empty element is read as no parent);
   - `nameMaxLength` exceeds the listed `OBJNAME_MAXLENGTH`;
   - `collection` is not advertised in `discovery`;
   - on a newer release, the address `buildObjectUri` builds for the sample differs from the system's `urimapper` answer for the same object.
3. **Coverage.** It reports the system's types that no entry serves, with their labels.
3a. **Source and metadata** (3.4). For the sample object of each API, the recorded metadata document is read:
   - an entry with `source` (or a source `update`) needs a `rel=…/source` link typed `text/plain` or untyped;
   - an entry without `source` must have no such link;
   - the media type the library sends for `updateMetadata` must be among the collection's `app:accept` in `discovery`, on releases that advertise `app:accept`.
   A mismatch is a conflict.

**Where it runs.** Only in adt-clients. interfaces-adt holds no code, so it holds no test and no fixture either, beyond the compile-time checks of `src/__typechecks__`.

4. **In adt-clients' CI.**
   - The three releases' `typestructure`, `discovery` and `urimapper` answers are recorded in adt-clients' corpus.
   - A test runs every conflict rule, the capability rules and the coverage against them, for the tables imported from interfaces-adt.
   - A conflict fails the test. The coverage is asserted as a recorded list.
5. **On a live system, on demand.**
   - An adt-clients live test reads the same endpoints through the library and runs the same check.
   - The variant comes from the local test configuration. The system's identity is printed at run time and never committed.
   - It skips with a named reason when no live configuration is given. A failed read is a failure.
   - With a write flag, which CI refuses, it scrubs the answers and writes them to an output directory named by configuration. From there they are added to adt-clients' corpus, a step its README documents.
   - Nothing lists the recorded answers elsewhere. What a system says is read from the endpoint, live or recorded.
6. **The server's records.** The server's `system-description-*` answers stay as the evidence of `docs/architecture/SYSTEM_DESCRIPTION.md`. Nothing checks against them.
7. **Load-bearing.** One deliberate break of a table entry, and one of a recorded answer, each fail the check.

**Capabilities.**
- An entry with `run` whose type lacks `EXECUTE`, or with profiling whose type lacks `PROFILE`, is a conflict.
- An entry with `create` whose type lacks `CREATE` is not a conflict. It is listed apart in the report, because ADT creates these types through their own collection (1.2).
- A type listing `CREATE` that no entry creates goes into the coverage.

The operations themselves are proved by the library's own unit and live tests, as today.

## 5. The mcp-abap-adt server

- **The variant.**
  - The process's declared system type chooses the variant, as today: HTTP and SSE require it at the process level.
  - A stdio start without a destination (inspection) builds the tool set too. So it requires the variant to be named, and is refused naming the flag otherwise. It never picks one.
- **The tool set** is built from the variant's table: object-oriented groups and compact entries alike.
  - Each operation has two projections of the variant's table, and both are typed:
    - **the accepted ADT codes**: the codes whose entry lists the operation;
    - **the accepted friendly names**: the API aliases and kinds the tool takes.
  - A schema enum, a description list and a refusal list use the projection of the argument they describe.
- **The boundary.** A code argument is upper-cased once and checked against the accepted codes. A friendly-name argument is checked against the accepted names.
- **The server's maps** are typed against the tables, and `KIND_BY_TYPE` with its prefix fallback goes. The debugger's labels are the server's own union.
- **The server's client contract** (#216's Part C) is composed per variant from the same tables, so that its own contract keeps the gates.

## 6. The literal scan

- **One Jest test per repository**, using the TypeScript compiler API and its type checker. It tokenises with plain code.
- **Code.** A code in production source passes only where its contextual type is `AdtTypeCode` or a subset of it. That covers both `XXXX/Y…` and bare codes. Also allowed:
  - the tables;
  - the server's debugger label union;
  - tests and fixtures;
  - a short committed allowlist of non-codes.
- **Prose.** A code named in a comment or in a tool description must be a code of the tables. Generated descriptions interpolate typed values. A test covers both a valid mention and an invalid one.
- **Load-bearing.** One deliberate break proves it.

## 7. Order and versions

1. **interfaces-adt 21.0.0** (major):
   - the three tables and the derived types;
   - `IAdtAnsweredObject`;
   - the reshaped parent contracts;
   - the old unions removed.
2. **adt-strategies 0.16.0, adt-clients 38.0.0 and adt-clients-legacy 0.2.0.**
   - adt-clients carries the conformance check, its recorded answers and the one-meaning test.
   - They are released once, with #216's Part B first.
   - The repository's order is strategies, then clients, then legacy, with the ranges `^0.16.0` and `^38.0.0`; legacy takes clients as a peer.
   - A clean install from the registry follows.
3. **mcp-abap-adt 21.0.0.** Released once, with #216's Part C first.
4. **Docs and migration notes** in every package:
   - the removed unions;
   - the dropped codes;
   - the variants and entry points;
   - the parent requirement;
   - `type` / `unknownType`;
   - how to run the live check.
5. **One PR per repository.** The goal, this spec and the plan live in #329.

## 8. Not in this work

- No runtime check against the system.
- No coverage tool for the model (later, owner).
- No new API gets support. Coverage lists what is not served. The one exception is the generic ABAP Unit runner of 3.5 (owner, 2026-10-29).
- No behaviour change for a correct code.
- No detection of the system type.
