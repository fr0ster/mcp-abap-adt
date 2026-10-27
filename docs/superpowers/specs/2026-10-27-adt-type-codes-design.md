# Spec: ADT object type codes, release variants and the system descriptor

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
| `GET …/objecttypes` (quick-search names) | 386 items | 373 | 404 |
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

## 2. interfaces-adt: constants and types only

### 2.1 The release descriptions

Each release has one `as const` constant, generated from its recorded `typestructure`:
- `ADT_RELEASE_S4_2025`;
- `ADT_RELEASE_ABAP_CLOUD`;
- `ADT_RELEASE_BASIS_740`.

```ts
export const ADT_RELEASE_BASIS_740 = {
  'CLAS/OC': { label: 'Class', category: 'source_library', parent: null, nameMaxLength: 30,
               capabilities: ['CREATE', 'EXECUTE', 'PROFILE'] },
  'FUGR/FF': { label: 'Function Module', category: 'source_library', parent: 'FUGR/F', nameMaxLength: 30,
               capabilities: [] },
  // … every type the release lists
} as const satisfies AdtReleaseDescription;
```

- **What it holds.** What the release says about each type:
  - label and category;
  - parent and name max length;
  - capabilities;
  - scopes, where the release has them.
- **What it leaves out: user authorizations.** They belong to whoever asked, not to the release (2.4).
- **How the constants are generated.** The three `typestructure` answers are committed in interfaces-adt too, under its own `tests/fixtures/`. A test there writes the constants from them in a write mode, which CI refuses. In a normal run, the same test fails when the committed constants differ from the answers. There is no generator script.
- **The derived types:**
  - `AdtTypeCode`: every code any release lists;
  - `AdtVariantCode<V>`: the codes of one variant;
  - `AdtCodeWith<V, A>`: the codes of variant `V` that have action `A`.

### 2.2 The variants: three shipped descriptors, or the consumer's own

The consumer picks one of the three shipped descriptors, or makes its own. Nothing detects the system.

| Shipped descriptor | For | Built from |
|---|---|---|
| `ADT_SYSTEM_ONPREM` | on-premise | `ADT_RELEASE_S4_2025` |
| `ADT_SYSTEM_CLOUD` | cloud | `ADT_RELEASE_ABAP_CLOUD` |
| `ADT_SYSTEM_BASIS_740` | legacy, 7.40 | `ADT_RELEASE_BASIS_740` |

- The three are data: `as const` constants of the `IAdtSystemDescriptor` shape (2.4), in interfaces-adt.
- **The consumer's own descriptor** is any value of that shape. For example:
  - one read from a live system through a reader (3.4);
  - one generated from another release's recorded answers;
  - one narrowed by hand to what the consumer allows.

  Its own literal type is its variant, so the compiler checks against it as it does for the shipped ones.

The on-premise description is the one recorded release, S/4HANA 2025. An older on-premise release may lack a type it lists. That case belongs to the descriptor (2.4), not to the compiler.

### 2.3 The narrow registry

The registry holds what no release says: which kind a code is in the tools' vocabulary, and which codes the library serves.

```ts
export const ADT_OBJECT_KINDS = {
  'CLAS/OC': 'class',
  'FUGR/FF': 'function_module',
  'TTYP/DA': 'table_type',
  // … one entry per code the library serves
} as const satisfies Partial<Record<AdtTypeCode, string>>;

export type AdtServedTypeCode = keyof typeof ADT_OBJECT_KINDS;
export type AdtObjectKind = (typeof ADT_OBJECT_KINDS)[AdtServedTypeCode];
```

- **Only release codes.** A served code must be a release code, so `satisfies` refuses an invented one. 1.1's codes cannot be entered.
- **Two named subsets**, each checked by `satisfies`:
  - `AdtAddressableTypeCode`: the served codes the library builds a URI for;
  - `AdtSourceTypeCode`: the served codes whose source it reads.
- **Coverage.** A release description minus the served codes. It is computed from constants, so it is a type and a test, not a request.
- **What is removed.**
  - `AdtObjectTypeLower`, `AdtObjectType`, `AdtSourceObjectTypeLower` and `AdtSourceObjectType` go.
  - `IObjectReference.type` becomes `AdtTypeCode`; it is an input contract.
  - `tools/package-map.json` drops the old symbols and maps every new export.

### 2.4 The system descriptor contract

`IAdtSystemDescriptor` is the shape every descriptor has, shipped or the consumer's.
- **The types it lists**, each with:
  - parent;
  - name max length;
  - capabilities;
  - scopes, where known;
  - the user's authorizations, where known.
- **A shipped descriptor** states no user authorizations: they belong to whoever asked.
- **A live descriptor** states them where its system does.

- **Unknown and forbidden are distinct types:** `type Stated<T> = { stated: true; value: T } | { stated: false }`. A 7.40 descriptor's user authorizations are `{ stated: false }`, never an empty list.
- **The reader.** `IAdtSystemDescriptorReader.read(): Promise<IAdtSystemDescriptor>` reads the descriptor once. A malformed or missing answer is the reader's error, not an empty descriptor.

### 2.5 Answered objects

`IAdtAnsweredObject` is `{ type: AdtTypeCode }` or `{ unknownType: string }`. The result contracts that carry objects read from an answer use it. A code that no release lists reaches the consumer as it is.

## 3. adt-clients, adt-strategies, adt-clients-legacy

### 3.1 One client, parameterised by its variant

- **`AdtClient<V>`** is one class in adt-clients, generic in its variant.
  - A getter is available only when the variant lists its code. Its `this` parameter requires the code in `AdtVariantCode<V>`.
  - Each handler class is generic in the variant too. Its `create` requires the code to have `CREATE` in `V`.
  - A call the variant does not support does not compile.
- **Two entry points in adt-clients:**
  - `AdtClientOnPrem` (`AdtClient<'onprem'>`);
  - `AdtClientCloud` (`AdtClient<'cloud'>`).

  Each only fixes `V`. Neither holds behaviour.
- **`createAdtClient(connection, descriptor)`** answers `AdtClient<V>`, with `V` taken from the descriptor's type. The consumer declares the system by the descriptor it passes. The function reads nothing and probes nothing.
- **adt-clients-legacy.** `AdtClientLegacy` extends `AdtClient<'basis740'>`.
  - It keeps its endpoint overrides.
  - Its existing refusals (`absentOnLegacy`) stay, for callers outside the type system. A typed caller can no longer reach them.
- **#216 comes first.** #216's Part B (factories answer their classes) lands first, and the variant gating builds on it.

### 3.2 The library's own maps

- **`buildObjectUri`.**
  - It becomes a complete table over `AdtAddressableTypeCode`.
  - Its input is typed per code: a parent-addressed code (`FUGR/FF`, `FUGR/I`) requires its parent.
  - `FUNC` and every code of 1.1 go.
  - A code from outside the type system is looked up once, where it enters.
- **The other maps.** `WHERE_USED_ALIASES`, `objectWire`, checkRun, the legacy refusal maps, and the create and validation payloads are typed against the registry and the release descriptions.
- **Comments** name only release codes.

### 3.3 The answer boundary (adt-strategies)

- A strategy that reads a code from an answer looks it up once in `AdtTypeCode`, and answers `IAdtAnsweredObject`.
- **Where codes are read.** By XML context only:
  - the `adtcore:type` attribute;
  - `OBJECT_TYPE` text;
  - `type` attributes on elements that carry an object type;
  - the `type=` part of an ADT URI fragment, URL-decoded.
- **Version.** The result types change. That is a breaking change of a 0.x package, so a minor (0.16.0), with a migration note.

### 3.4 The descriptor at an object's creation; the live reader

- **The client holds the descriptor it was created from.** A handler's `create` checks it as the last step before any request. It never checks on every request, and nothing else consults the descriptor at run time.
- **With a shipped descriptor** the check reads release data, and no request is made for it. With a live descriptor it is the paranoid mode: the consumer read the system once, before creating the client.
- **What `create` checks:**
  - the code is on this system;
  - its `CREATE` capability is present;
  - the name fits `nameMaxLength`;
  - the user's `CREATE` authorization, where the descriptor states it. Where it is not stated, as on 7.40, that check is skipped.
- **A refusal.** A failed check is answered as a refusal, with no request. It names what the system said.
- **The live readers** are one way to make the consumer's own descriptor.
  - adt-clients ships the modern reader.
  - adt-clients-legacy ships `AdtSystemDescriptorReaderLegacy`. It extends the modern reader and overrides only what 7.40 answers differently: no authorizations, no scopes. Its constructor is one `super(...)` call.

## 4. The mcp-abap-adt server

- **The destination's declared system type chooses the shipped descriptor.**
  - That descriptor chooses the client and the tool set's codes.
  - On stdio the tool set is built at start. On HTTP and SSE it is built per instance, from the request's declared type.
- **Per-operation subsets.**
  - Each operation that takes a code declares its served subset, typed against the registry.
  - The schema enum, the description's code list and the refusal's list are that subset intersected with the variant's codes, at build time.
  - So the model is offered what the release lists and the library serves.
- **A code from outside.** A code in a tool argument is upper-cased once and checked against that intersection. No other runtime check is made on it.
- **The paranoid mode** is a server option, off by default. When it is on, the server reads a live descriptor once, for the session's destination and user, and creates the client from it instead of the shipped one.
- **The server's maps.** `TYPE_TO_FAMILY`, `READS`, packageEnumerator, `ADT_TYPE_BY_COMPACT_TYPE`, `VALID_TYPES` and the compact names are typed against the registry.
  - `KIND_BY_TYPE` and its prefix fallback go.
  - The debugger's target labels (`CLAS`, `PROG`, `INCL`, `FUNC`) are the server's own union, mapped to `CLAS/OC`, `PROG/P`, `PROG/I` and `FUGR/FF`.

## 5. Evidence

1. **The corpus is the source.** The release descriptions are generated from recorded answers (2.1). The corpus guard keeps those answers free of system names, ids, hosts, clients and users.
2. **The registry.**
   - `satisfies` proves that every served code is a release code.
   - A test asserts the coverage per variant, so a change in a recorded release is noticed.
3. **The answer tests.** The strategies run against the corpus. Every code extracted from a response body is in `AdtTypeCode` or is answered as `unknownType`, and a test shows the second case.
4. **The paranoid-mode tests.**
   - Each reader runs on its release's recorded `typestructure`, and the descriptor is asserted field by field.
   - The legacy descriptor's authorizations are asserted as `{ stated: false }`.
5. **Release coverage.** A new on-premise release is supported by recording its answers and generating its constant. No code is written by hand.

## 6. The literal scan

- **One Jest test per repository.** It uses the TypeScript compiler API and its type checker, and it tokenises with plain code, not a regex.
- **What passes.** A code in production source passes only where the type checker gives the literal a contextual type of `AdtTypeCode` or one of its subsets. That covers both shapes:
  - a slashed code, `XXXX/Y…`;
  - a bare release code, such as `AUTH` or `DEVC`.
- **Where a literal is also allowed:**
  - the generated release constants and the registry;
  - the server's debugger label union;
  - tests and fixtures;
  - a short committed allowlist of non-codes: MIME types and path pieces.
- **Comments and descriptions** are scanned too. A code named there must be a release code.
- **The rule is load-bearing.** One deliberate break proves it.

## 7. Order and versions

1. **interfaces-adt 21.0.0**, a major:
   - the release constants, with their fixtures and their test;
   - the registry and the variants;
   - the descriptor contracts and `IAdtAnsweredObject`;
   - the old unions removed.
2. **adt-strategies 0.16.0, adt-clients 38.0.0, adt-clients-legacy 0.2.0.**
   - They are released once, carrying #216's Part B first and this part second.
   - Inside the repository the order is strategies, then clients, then legacy.
   - The ranges are `^0.16.0` and `^38.0.0`; legacy takes clients as a peer.
   - A clean install from the registry follows the publish.
3. **mcp-abap-adt 21.0.0.** Released once, carrying #216's Part C first and this part second.
4. **Docs.** Every package's README, docs and examples are updated. Each major or 0.x minor carries a migration note:
   - the removed unions;
   - the dropped codes;
   - the variants and the new entry points;
   - `type` / `unknownType`;
   - the paranoid mode.
5. **One PR per repository.** The goal, this spec and the plan live in #329.

## 8. Not in this work

- **A coverage tool for the model.** Later (owner).
- **Support for new object kinds.** Coverage lists what is not served; it does not serve it.
- **A check on every request.** The descriptor is checked at an object's creation only.
- **Any behaviour change for a correct code.**
- **Detection of the system type.**
