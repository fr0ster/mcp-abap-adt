# Spec: one registry of ADT object type codes, and the system descriptor

Answers [`2026-10-27-adt-type-codes-goal.md`](../2026-10-27-adt-type-codes-goal.md).

## 1. What there is today

Read from the code on 2026-10-27:

| Repository | Revision |
|---|---|
| mcp-abap-adt | `d3ae5efd` (the code; the branch has moved on by documents only) |
| adt-clients | `7a4499bb` |
| interfaces-adt | `4b96593` |

An audit of all three repositories found the facts below. The literal scan (section 6) re-derives every location, so this list does not have to stay complete:

- **About a dozen hand-written maps, each with its own vocabulary.**
  - interfaces-adt: `AdtObjectTypeLower`, `AdtSourceObjectTypeLower` (`adt/IAdtShared.ts`).
  - adt-clients: `buildObjectUri` (`utils/activationUtils.ts`), `WHERE_USED_ALIASES` (`core/shared/whereUsed.ts`), `objectWire`, checkRun's `getObjectUri`, the create and validation payloads, `ENHANCEMENT_TYPE_CODES`.
  - adt-clients-legacy: `METADATA_REFUSED`, `SOURCE_REFUSED`.
  - adt-strategies: `results/utils.ts`.
  - server: `TYPE_TO_FAMILY`, `KIND_BY_TYPE` (packageWalk), `READS` (metadataReads), the debugger's `ALIASES`, packageEnumerator's map, `ADT_TYPE_BY_COMPACT_TYPE` (compact-modify), `VALID_TYPES`, the GetIncludesList schema and `resolveParent`, GetEnhancements' switch, the tool descriptions.
- **Codes the maps carry that an answer shows to be wrong:**

  | Wrong code | What ADT answers |
  |---|---|
  | `INTF/IF` | `INTF/OI` |
  | `STRU/DT`, `STRU/DS` | `TABL/DS` |
  | `TTYP/DF`, `TTYP/TT`, `TTYP/ST` | `TTYP/DA` (`TTYP/ST` was in fact meant as a structure) |
  | `DOMA/DM` | `DOMA/DD` |
  | `BDEF/BD` | `BDEF/BDO` |
  | `BIMP/BIM`, `BIMP/`, `BIMPL/` | `CLAS/OC` (a behavior pool is a class) |
  | `DSFD/DSF`, `DSFI/DSF`, `SUSO/O` (comments) | `DSFD/SCF`, `DSFI/SFI`, `AUTH` |
  | `FUGR/FC` (an example) | no answer shows it |

- **One code, two meanings.** `FUNC` is a function group in `buildObjectUri` and a function module in the server's debugger and `GetAbapSystemSymbols`. No ADT answer shows `FUNC`.
- **Offers the path refuses.**
  - GetWhereUsed's description offers `intf/if` and `stru/dt`, and `buildObjectUri` throws on both.
  - ActivateObjects offers bare `ENHO`, which `buildObjectUri` refuses.
  - GetIncludesList's enum rejects `FUGR/F`, the recorded code, although its resolver reads it.
  - `objectWire.getObjectMetadataUri('TABL/DS')` throws.
  - `objectWire.supportsSourceCode` lacks `intf/oi`.
  - `buildObjectUri` and `KIND_BY_TYPE` lack `TTYP/DA`.
- **Codes the maps rely on that no answer shows:** `PROG/I`, `SRVB/SVB`, `VIEW/DV`, `AUTH`, `SCGR`. interfaces-adt calls `PROG/I` measured, but no record is on disk.
- **Evidence on disk:**
  - the server's corpus (`tests/fixtures/adt/`, recorded on the ABAP trial);
  - adt-clients' corpus (`packages/adt-clients/corpus/adt/`, a subset of the server's);
  - adt-clients' text-search object-type lists (`docs/discovery/`);
  - outside any repository: the 7.40 probe records and an E19 discovery dump.
  - The text-search lists hold `<nameditem:data>CODE</nameditem:data>` entries with descriptions. Among them are `INTF/OI`, `PROG/P`, `MSAG/N` and `XSLT/VT`, and codes no map knows: `CMPT`, `DDLA/ADF`, `DTDC/DF`, `FUGS/FX`, `WDYN/WQ`.
  - Several codes are proven only outside the repositories: `FUGR/I`, `TTYP/DA`, `DSFD/SCF`, `DSFI/SFI`, `FTG2/FT`, `ENHO/*`, `ENHS/*`.

### 1.1 What a system says about itself (measured 2026-10-27)

Eclipse ADT's logon sequence differs by system. These are the owner's logs, and the requests below were repeated by hand.

| Request | What it gives | E19 (S/4 2025) | trial (cloud) | E77 (7.40 SP04) |
|---|---|---|---|---|
| `GET /sap/bc/adt/core/discovery` | the short discovery of a newer system | 200 | not measured | **404**: Eclipse reads the system as old |
| `GET /sap/bc/adt/compatibility/graph` | backend capabilities: nodes by namespace, with their dependencies (`RIS:allObjectTypes`, `WBTYPEREGISTRY:fullTypeMetaData`, …) | 200, 207 nodes | not measured | 200, 182 nodes |
| `GET /sap/bc/adt/discovery` | **the endpoints**: collections, their Accept types, templates | 200, 401 KB | not measured | 200, 35 KB; collection names only, no type codes in it |
| `GET …/informationsystem/objecttypes?maxItemCount=…&name=*&data=usedByProvider` | quick-search names (`FUNC` = `FUGR/FF`, `REPO` = `PROG/P`, `INCL` = `PROG/I`, `STRU` = `TABL/DS`), `usedBy` providers, groups (`WGRP`) | 200, 386 items | 200, 373 items | 404 (not in its discovery; Eclipse does not ask) |
| `POST /sap/bc/adt/repository/typestructure`, Accept `application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.RepositoryTypeList`, no body | **every object type**: code, label, category, URI template, parent type, name max length, capabilities; on newer systems also the plural label, the user's authorizations and scopes | 200, 721 types | 200, 708 types | 200, 464 types |

- E77 and E19 share 442 codes, and no code means two things across them. 279 codes exist on E19 only (`BDEF/BDO`, `SRVB/SVB`, `DCLS/DL`, `ENHO/*`, …); 22 on E77 only.
- The trial and E19 share 686 codes; 22 are on the trial only (`SCO*`, `SIA*`, `DTIX/DF`, …) and 35 on E19 only (`EDO*`, `OT*`, `BCCH`, …).
- None of the wrong codes of section 1 is in any of these answers. `FUGR/FF` and `FUGR/I` carry `PARENT_OBJECT_TYPE` `FUGR/F`.
- `CAPABILITIES` are `SEU_ACTION`s: `CREATE`, `EXECUTE`, `PROFILE` on both; `INDEX_UPD`, `KTD_DOCU` on E19 only.
- `USER_AUTHORIZATIONS` and `SCOPES` (`AFF_OBJECT_HANDLER`, `AI_EXPLAIN`, `INFOSYSTEM`, …) exist on E19 only.
- `OBJNAME_MAXLENGTH` examples: class 30, program and include 40, function group 26, table 16, message class 20.

So `discovery` says **where** to go, `typestructure` says **which objects and what may be done with them**, and `compatibility/graph` says **which features** the backend has. Together they describe the system.

## 2. Two contracts in interfaces-adt (types and constants only)

### 2.1 The narrow registry: what the library knows

The registry holds only what no system tells: which kind of object a code is in the tools' vocabulary, and which library handler serves it.

```ts
export const ADT_OBJECT_TYPES = {
  'CLAS/OC': { kind: 'class', evidence: 'recorded' },
  'FUGR/FF': { kind: 'function_module', evidence: 'recorded' },
  'TTYP/DA': { kind: 'table_type', evidence: 'recorded' },
  // one entry per code the library serves or names
} as const satisfies Readonly<Record<string, AdtObjectTypeEntry>>;

export type AdtTypeCode = keyof typeof ADT_OBJECT_TYPES;
export type AdtObjectKind = (typeof ADT_OBJECT_TYPES)[AdtTypeCode]['kind'];
```

- `kind` is the one closed list of object kinds, in lower snake case.
- Labels, parents, name lengths and capabilities are **not** in the registry. A system says them (2.2).
- `evidence` is `'recorded'`: the code is in a committed `typestructure` answer of at least one system (section 5). No wrong code from section 1 is entered. `FUNC` is not a code.
- Sub-object codes that appear only inside answers (`CLAS/OM`, `CLAS/I`, `PROG/PS`, …) are entered with their kind when `typestructure` lists them, so a parser can type them.
- **What it replaces.**
  - `AdtObjectTypeLower`, `AdtObjectType`, `AdtSourceObjectTypeLower` and `AdtSourceObjectType` go (a major).
  - `IObjectReference.type` becomes `AdtTypeCode`. It is an input contract.
  - The source-reading contracts take `AdtSourceTypeCode`, a named subset of `AdtTypeCode`.
  - `tools/package-map.json` drops the old symbols and maps every new export.

### 2.2 The system descriptor: what one system can and cannot do

`IAdtSystemDescriptor` is a contract of data, read once from the system. It answers:

- **What may exist:** the system's object types, each with its code, label, category, parent type and name max length.
- **What may be done:** each type's capabilities. Where the system states them, also the current user's authorizations and the type's scopes.
- **Where to go:** the endpoints from `discovery` (collections, Accept types, templates) and the features from `compatibility/graph`.
- **What cannot be:** a code the system does not list; an action the type does not have.
- **Unknown is not forbidden.** A fact the system does not state is typed as unknown, distinct from "no". 7.40 states no user authorizations, so on 7.40 "may this user create" is unknown, never false.
- **Coverage:** which of the system's types and actions the library serves, derived from the registry (2.1). This includes the list of types the library does not serve.

Every field read from an answer is typed by what was read. A code the registry lacks stays in the descriptor as the system's own code (`unknownType`), never dropped and never guessed into a kind.

### 2.3 The reader

`IAdtSystemDescriptorReader.read()` returns an `IAdtSystemDescriptor`. It sends the requests its system type answers, once.

## 3. The readers and the library

1. **The consumer's declared system type picks the reader.** No reader detects the system: a 404 is an error, never "this is an old system".
   - **adt-clients, modern:** `core/discovery`, `compatibility/graph`, `discovery`, `objecttypes`, `typestructure`.
   - **adt-clients-legacy, 7.40:** `compatibility/graph`, `discovery`, `typestructure`.
     - The legacy reader overrides what 7.40 does not serve (`core/discovery`, `objecttypes`) with no request, as the legacy classes do for their endpoints.
     - Its descriptor leaves the fields 7.40 does not state as unknown.
2. **The descriptor is data.** A descriptor that has been read sends nothing. It is not refreshed on its own.
   - Whether it is cached across sessions is the consumer's choice, through its own reader.
3. **`createAdtClient()` reads nothing.** The descriptor is a separate, explicit step of the consumer. The handler classes do not consult it: their behaviour stays as it is, with the legacy overrides for 7.40's endpoints.
4. **The library's own maps use the registry.**
   - `buildObjectUri` becomes a complete table typed over `AdtTypeCode`.
   - `WHERE_USED_ALIASES`, `objectWire`, checkRun, the legacy refusal maps, and the create and validation payloads are typed against the registry.
   - `FUNC` and every wrong code go.
5. **The answer boundary is in adt-strategies.**
   - A strategy that reads a code from an answer looks it up once.
   - It answers `IAdtAnsweredObject`, either `type: AdtTypeCode` or `unknownType: string`.
   - The `typestructure` parser is a strategy too.
   - The result types change. That is a breaking change of a 0.x package, so a minor, with a migration note.

## 4. The mcp-abap-adt server

1. **The descriptor is read per session**, after the connector, with the reader of the destination's declared system type. Reading it is part of the session's start, so a failure reaches the model as its own error. It is never skipped silently.
2. **Checks at the boundary come from the descriptor.**
   - A code in a tool argument must be in the operation's subset (4.3) **and** on this system.
   - An object name longer than the type's `OBJNAME_MAXLENGTH` is refused before any request.
   - A create on a type without the `CREATE` capability is refused.
   - Where the descriptor states the user's authorization and it is "no", the create is refused. Where it is unknown (7.40), the create is not refused for that reason.
   - Each refusal names what the system said.
3. **Per-operation subsets.**
   - Each operation that takes a code declares the codes its path serves, as a named `readonly AdtTypeCode[]`.
   - The schema enum, the description's list and the refusal's list are derived from that subset, intersected with the descriptor at run time.
   - The static schema carries the subset; the refusal carries what this system has.
4. **The model can see the system.** A read-only tool answers the descriptor's coverage: the system's types, which ones the server can work with and which actions, and the types it cannot. It is in the full and the read-only builds. The compact builds need the owner's decision.
5. **The server's maps** (`TYPE_TO_FAMILY`, `READS`, packageEnumerator's map, `ADT_TYPE_BY_COMPACT_TYPE`, `VALID_TYPES`, the compact names) are typed against the registry.
   - `KIND_BY_TYPE` and its prefix fallback go.
   - The debugger's target labels (`CLAS`, `PROG`, `INCL`, `FUNC`) are the server's own union, mapped to registry codes.

## 5. Evidence

1. **Recorded answers.** `typestructure`, `discovery` and `compatibility/graph` from E19, E77 and the trial are recorded into the server's corpus. So is `objecttypes` from E19 and the trial, and `core/discovery` where it answers.
   - The answers are in the corpus's format, scrubbed of system, system id, transport number and user name.
   - The corpus guard checks all four.
2. **The registry test.**
   - Every registry code is in at least one recorded `typestructure`.
   - Every code a recorded `typestructure` lists is either in the registry or in an explicit "not served by the library" list, which is the coverage gap.
   - Both directions are checked.
3. **The descriptor tests.**
   - Each reader is run against the recorded answers of its system type.
   - The descriptor is asserted field by field.
   - The legacy descriptor's unknowns are asserted as unknown.
4. **Extraction of codes from other answers** keeps the rules of the earlier revision: response bodies only, by XML context, URI fragments decoded.

## 6. The literal scan

- One Jest test per repository: adt-clients for `packages/*/src`, and the server for `src` and the package directories.
- It walks every string literal, template piece and JSDoc comment with the TypeScript compiler API. It tokenises with plain code, not a regex.
- **Production code writes no untyped code literal.** A token of the shape `XXXX/Y…` fails the test in production source unless the type checker gives the literal a contextual type of `AdtTypeCode` or a subset of it. Examples: a key in a `Record<AdtTypeCode, …>`, or an argument typed `AdtTypeCode`.
- It is also allowed:
  - in the registry module;
  - in the server's debugger label union;
  - in tests and fixtures;
  - in a short committed allowlist of non-codes (MIME types, path pieces).
- **Comments** may name codes, and each must be a registry code.
- Descriptions are scanned too.
- The rule is proven load-bearing by one deliberate break.

## 7. Order and versions

1. **interfaces-adt 21.0.0** is published first. It is a major: the old unions go, and the registry, `IAdtAnsweredObject`, `IAdtSystemDescriptor` and its reader contract come in.
2. **adt-strategies 0.16.0, adt-clients 38.0.0, adt-clients-legacy 0.2.0** follow. They are released once, carrying #216's B tasks first and this part second.
   - The order inside the repository is strategies, then clients, then legacy.
   - adt-clients depends on strategies `^0.16.0`. Legacy takes `^38.0.0` as a peer and dev dependency.
   - After publishing, a clean install of all three from the registry, outside the repository, proves they install.
3. **mcp-abap-adt 21.0.0** comes last. It is released once, carrying #216's Part C first and this part second. Its dependencies are interfaces-adt `^21.0.0`, adt-clients `^38.0.0` and adt-strategies `^0.16.0`, all from the registry.
4. **Docs.** Every package's README, docs and examples are updated. Each major or 0.x minor carries a migration note:
   - the removed unions;
   - the dropped wrong codes;
   - `type` / `unknownType`;
   - the descriptor;
   - the new refusals at the server's boundary.
5. **One PR per repository.** The goal, this spec and the plan live in #329.

## 8. Not in this work

- **No new object kind gets support.** Coverage lists the types the library does not serve. It does not serve them.
- **No handler class consults the descriptor.** The checks are the consumer's, at its boundary.
- **No behaviour change for a correct code.** Every request a correct code sends today, it still sends.
- **No detection of the system type.** It stays declared.
