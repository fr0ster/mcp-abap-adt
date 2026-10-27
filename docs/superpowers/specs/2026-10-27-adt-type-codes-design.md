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
- **The system type cannot be detected.** A 7.40 system cannot be told from a newer one by `core/discovery`'s status, so the system type stays declared.

- **What a type in `typestructure` is.**
  - It is a workbench type of the system, not an ADT service.
  - 7.40 lists `DOMA/DD`, `DTEL/DE`, `TABL/DS`, `TABL/DT`, `TTYP/DA` and `XSLT/VT` with `CREATE`, but its ADT serves none of their resources (measured in #271, which is why the legacy getters refuse them).
  - So what the library can do with a type is the intersection of three things:
    - the type is listed;
    - ADT serves its resources (`discovery`);
    - the library implements it for that variant.
- **The `URI_TEMPLATE` is a properties address, not the object's resource** (measured 2026-10-27, read only, no redirect followed).
  - On S/4HANA 2025 and ABAP cloud, `GET /sap/bc/adt/vit/wb/object_type/<code>/object_name/<name>` answers 200 `application/vnd.sap.adt.basic.object.properties+xml`: `adtcore:mainObject` with the object's name, type and package, and no URI of its own.
  - For `FUGR/FF` and `PROG/I` the template carries a 40-blank field before `{name}`, and the answer resolves the object with that field blank.
  - On 7.40 the same GET answers 200 with an empty `text/html` body, as 7.40 answers any path it does not serve.
  - The resource addresses stay the library's: its address table is not derived from the template.

## 2. interfaces-adt: the library's types (constants and types only)

### 2.1 One entry per code the library serves, per variant

The library declares what it supports as `as const` entries. Each entry is the full description of one type for one variant:

```ts
export const ADT_TYPES_BASIS_740 = {
  'CLAS/OC': { kind: 'class', parent: null, nameMaxLength: 30, operations: ['read', 'lock', 'update', 'activate', 'check', 'delete', 'create'] },
  'FUGR/FF': { kind: 'function_module', parent: 'FUGR/F', nameMaxLength: 30, operations: ['read', 'lock', 'update', 'activate', 'check', 'delete', 'create'] },
  // … every code the library serves on 7.40, with the operations it serves there
} as const satisfies AdtTypeTable;
```

- **Three tables, one per variant:** `ADT_TYPES_ONPREM`, `ADT_TYPES_CLOUD` and `ADT_TYPES_BASIS_740`.
  - The consumer chooses the variant by its declared system type. Nothing detects it.
  - A table lists what the library serves on that variant, not everything the system lists. The legacy table holds no `DOMA/DD`, because 7.40's ADT does not serve it.
- **An entry holds:**
  - the kind, in the tools' one vocabulary of kinds;
  - the parent;
  - the name max length;
  - the operations the library performs for that type on that variant.

  The address of the type's resource is not here: it is logic, and lives in adt-clients (3.2).
- **Derived types:**
  - `AdtTypeCode` is every code of any table.
  - `AdtVariantCode<V>` is the codes of variant `V`.
  - `AdtCodeWith<V, Op>` is the codes of `V` that have operation `Op`.
  - `AdtObjectKind` is the kinds.
  - `AdtSourceTypeCode` is the codes with the `source` operation.
- **The tables are written by hand.** They are the library's declaration. The conformance check (4) proves they do not claim what a system does not allow.
- **What goes:**
  - `AdtObjectTypeLower`, `AdtObjectType`, `AdtSourceObjectTypeLower` and `AdtSourceObjectType` are removed.
  - `IObjectReference.type` becomes `AdtTypeCode`.
  - `tools/package-map.json` drops the old symbols and maps every new export.

### 2.2 Answered objects

`IAdtAnsweredObject` is one of two shapes:
- `{ type: AdtTypeCode }`;
- `{ unknownType: string }`.

The result contracts that carry objects read from an answer use it, so a code the library does not know reaches the consumer as it is.

## 3. adt-clients, adt-strategies, adt-clients-legacy

### 3.1 One client, parameterised by its variant

- **`AdtClient<V>`** is one class in adt-clients.
  - A getter is available only for a code in `AdtVariantCode<V>`. The method's `this` parameter requires it.
  - Each handler class is generic in the variant too. An operation method exists only for a code whose entry lists that operation.
  - A type with a parent requires the parent's name in its config.
  - A call the variant does not support does not compile.
- **Two entry points**, `AdtClientOnPrem` and `AdtClientCloud`, each fixing `V`. Neither holds behaviour.
  - `createAdtClient(connection, { variant })` answers the matching one.
  - It reads nothing and probes nothing.
- **adt-clients-legacy.** `AdtClientLegacy` extends `AdtClient<'basis740'>` and keeps its endpoint overrides. Its existing refusals (`absentOnLegacy`) stay for callers outside the type system.
- **How far the compiler reaches.** The compiler holds a caller that uses the library's classes. A consumer that composes its own client contract from interfaces-adt, as #216 has it, is held by that contract's own types. The server builds its contracts and schemas from the same tables (5).
- **#216's Part B comes first.** Factories answer their classes there, and this change builds on it.

### 3.2 The library's own maps

- **`buildObjectUri`** becomes a complete table over the codes with an address, typed per code.
  - A parent-addressed code requires its parent.
  - `FUNC` and every code of 1.1 go.
  - A code from outside the type system is looked up once where it enters.
- **The other maps.** These are typed against the tables:
  - `WHERE_USED_ALIASES`;
  - `objectWire`;
  - checkRun;
  - the legacy refusal maps;
  - the create and validation payloads.

### 3.3 The answer boundary (adt-strategies)

- A strategy that reads a code from an answer looks it up once, and answers `IAdtAnsweredObject`.
- Codes are extracted by XML context only:
  - `adtcore:type`;
  - `OBJECT_TYPE` text;
  - `type` attributes on elements that carry an object type;
  - the `type=` part of an ADT URI fragment, URL-decoded.
- The result types change. This is a breaking change of a 0.x package, so a minor (0.16.0) with a migration note.

## 4. The conformance check

A check reads what a system says and compares it with the library's tables. It is not run in the library at run time.

1. **It reads two answers:**
   - `typestructure`: the types, their parents, name lengths and capabilities;
   - `discovery`: the collections ADT serves.
2. **It reports conflicts.** For each entry of the variant's table, any of these is a conflict:
   - the system does not list the code;
   - its parent differs;
   - the library's name max length is longer than the system's;
   - the library lists `create` and the system's capabilities lack `CREATE`;
   - the entry's address belongs to a collection that `discovery` does not advertise.
3. **It reports coverage.** The system types that the table does not serve, with their labels and categories.
4. **It runs on the recorded releases in CI.**
   - The three `typestructure` and `discovery` answers of the corpus (1.2) are committed beside the tables in interfaces-adt's `tests/fixtures/`.
   - A Jest test there runs the check for each variant against its release.
   - A conflict fails the test. The coverage is asserted as a recorded list, so a change in either side is noticed.
5. **It runs on a live system on demand.**
   - It is a live test in adt-clients, which reads the two answers through the library.
   - It names the system it runs on, and skips with that reason elsewhere.
   - With a write flag, refused under CI, it adds the answers it read to the corpus, scrubbed like the rest of the corpus. A new release is then checked in CI too.
6. **It proves itself.** One deliberate break of a table entry makes the CI check fail. One break of a recorded answer does the same.

## 5. The mcp-abap-adt server

- **The process's declared system type chooses the variant.** This is as today: the HTTP and SSE launchers require a process-level type, and no request header changes it.
  - The variant picks the client.
  - It also picks the tool set's codes. The tool set is built at start, from the variant's table.
- **Per-operation subsets.** Each operation that takes a code declares its served codes, typed against the variant's table.
  - The schema enum, the description's list and the refusal's list are that subset.
  - So the model is offered what the library serves on that variant.
- **A code from outside.** A code in a tool argument is upper-cased once and checked against the operation's subset. That is the only runtime check on it.
- **The server's maps** (`TYPE_TO_FAMILY`, `READS`, packageEnumerator, `ADT_TYPE_BY_COMPACT_TYPE`, `VALID_TYPES`, the compact names) are typed against the tables.
  - `KIND_BY_TYPE` and its prefix fallback go.
  - The debugger's target labels (`CLAS`, `PROG`, `INCL`, `FUNC`) are the server's own union, mapped to `CLAS/OC`, `PROG/P`, `PROG/I` and `FUGR/FF`.

## 6. The literal scan

- **One Jest test per repository.** It uses the TypeScript compiler API and its type checker. It tokenises with plain code, not a regex.
- **The rule.** A code in production source passes only where its contextual type is `AdtTypeCode` or a subset of it. Both shapes are covered:
  - `XXXX/Y…`;
  - a bare code such as `AUTH` or `DEVC`.
- **Also allowed:**
  - in the tables;
  - in the server's debugger label union;
  - in tests and fixtures;
  - in a short committed allowlist of non-codes: MIME types and path pieces.
- **Comments and descriptions** are scanned too.
- **Load-bearing.** One deliberate break proves the rule.

## 7. Order and versions

1. **interfaces-adt 21.0.0** (major): the three tables, the derived types, `IAdtAnsweredObject`, and the conformance check with its fixtures. The old unions go.
2. **adt-strategies 0.16.0, adt-clients 38.0.0, adt-clients-legacy 0.2.0.**
   - Released once, carrying #216's Part B first and this part second.
   - The order inside the repository is strategies, then clients, then legacy.
   - Ranges: clients takes strategies `^0.16.0`; legacy takes clients `^38.0.0` as a peer.
   - A clean install from the registry follows.
3. **mcp-abap-adt 21.0.0.** Released once, carrying #216's Part C first and this part second.
4. **Docs.** Every package's README, docs and examples are updated. Each major or 0.x minor carries a migration note covering:
   - the removed unions;
   - the dropped codes;
   - the variants and entry points;
   - `type` / `unknownType`;
   - the conformance check and how to run it live.
5. **One PR per repository.** The goal, this spec and the plan live in #329.

## 8. Not in this work

- **No runtime check against the system.** No descriptor is read by the library, the client or the server.
- **No coverage tool for the model.** Left for later (owner).
- **No new object kind gets support.** Coverage lists what is not served; it does not serve it.
- **No behaviour change for a correct code.**
- **No detection of the system type.**
