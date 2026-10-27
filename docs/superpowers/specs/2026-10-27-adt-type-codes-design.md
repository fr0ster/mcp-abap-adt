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
- **One meaning per code.** The test groups every code of every entry of every table, duplicates inside one table included. It asserts one kind per code.
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

**Where it runs.**

4. **In interfaces-adt's CI.**
   - The three releases' `typestructure` and `discovery` answers are committed in interfaces-adt's `tests/fixtures/`.
   - A Jest test, a dev dependency outside the published package, runs the first four conflict rules and the coverage.
   - It is wired into interfaces-adt's CI as its own step.
   - A conflict fails it. The coverage is asserted as a recorded list.
5. **In adt-clients' CI.**
   - The address rule needs `buildObjectUri`, so it runs in adt-clients.
   - It uses the recorded `urimapper` answers, and a test per API compares them.
6. **On a live system, on demand.**
   - It is an adt-clients live test that reads all inputs through the library.
   - The variant comes from the local test configuration. The system's identity is printed at run time and never committed.
   - It skips with a named reason when no live configuration is given. A failed read is a failure, not a skip.
   - With a write flag, which CI refuses, it scrubs the answers it read and writes them to one output directory named by configuration. It writes into no repository.
   - **Refreshing a release.** Each repository's README documents the step:
     - the server's corpus is the authoritative copy;
     - interfaces-adt keeps the `typestructure` and `discovery` answers, and adt-clients the `urimapper` answers;
     - interfaces-adt exports `ADT_RECORDED_ANSWERS`, each copy's corpus case name with its SHA-256;
     - every repository's test checks its own copies against that constant. The version is pinned by the interfaces-adt version it depends on, so no test reads another repository.
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
   - the conformance test with its fixtures, as a dev-only test;
   - the old unions removed.
2. **adt-strategies 0.16.0, adt-clients 38.0.0 and adt-clients-legacy 0.2.0.**
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
- No new API gets support. Coverage lists what is not served.
- No behaviour change for a correct code.
- No detection of the system type.
