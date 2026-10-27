# Spec: one registry of ADT object type codes

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

## 2. The registry (interfaces-adt)

1. **A new module, `adt/AdtObjectTypes.ts`**, holds one `const` object, keyed by the code as ADT writes it (`'CLAS/OC'`), and the types derived from it. It contains no function.

   ```ts
   export const ADT_OBJECT_TYPES = {
     'CLAS/OC': { kind: 'class', objectDirectory: 'CLAS', evidence: 'recorded', source: 'server-corpus' },
     'FUGR/FF': { kind: 'function_module', objectDirectory: 'FUGR', evidence: 'recorded', source: 'server-corpus', under: 'FUGR/F' },
     'CMPT': { kind: 'code_composer_template', objectDirectory: 'CMPT', evidence: 'discovery', source: 'clients-discovery' },
     'SRVB/SVB': { kind: 'service_binding', objectDirectory: 'SRVB', evidence: 'unmeasured' },
     // …
   } as const satisfies Readonly<Record<string, AdtObjectTypeEntry>>;

   export type AdtTypeCode = keyof typeof ADT_OBJECT_TYPES;
   export type AdtObjectKind = (typeof ADT_OBJECT_TYPES)[AdtTypeCode]['kind'];
   export type AdtObjectDirectoryType = (typeof ADT_OBJECT_TYPES)[AdtTypeCode]['objectDirectory'];
   ```

   - `kind` is the one closed list of object kinds, in lower snake case (`class`, `function_module`, `table_type`, …).
   - `objectDirectory` is the R3TR type (`CLAS`, `TTYP`). ATC answers it bare, as recorded, and tools accept it as input.
   - `under` names the parent's code for an object addressed under its group (`FUGR/FF`, `FUGR/I`).
   - `evidence` is `'recorded' | 'discovery' | 'unmeasured'`, and with it `source`: which committed document proves the code.
     - `server-corpus`: the server's `tests/fixtures/adt/`.
     - `clients-discovery`: adt-clients' `docs/discovery/`.
     The allowed pairs are typed:
     - `recorded` with `server-corpus`;
     - `discovery` with `clients-discovery`;
     - `unmeasured` with no `source`.
     Section 5 makes both true.
2. **Entries.**
   - One per code that section 1's evidence shows, and one per code the stack must address but nobody has measured, marked `unmeasured`.
   - No wrong code from section 1 is entered. `FUNC` is not entered.
   - Sub-object codes that only appear inside answers (`CLAS/OM`, `CLAS/I`, `PROG/PS`, …) are entered with their kind, so a parser can type what it reads.
3. **What it replaces.**
   - `AdtObjectTypeLower`, `AdtObjectType`, `AdtSourceObjectTypeLower` and `AdtSourceObjectType` go (a major).
   - The source-reading contracts (`IAdtUtilities`, which today take `AdtSourceObjectType`) take `AdtSourceTypeCode`: an explicit, named subset of `AdtTypeCode`. It is the contract of what a source read accepts, checked by `satisfies readonly AdtTypeCode[]`.
   - `tools/package-map.json` drops the old symbols and maps every new export, so `check-surface` covers them.
   - What a consumer passes where they stood is an `AdtTypeCode`, an `AdtObjectKind`, or an `AdtObjectDirectoryType`, as the member's contract states.
   - `IObjectReference.type` becomes `AdtTypeCode`. It is an input contract: what a caller passes.
   - What an answer carries is a separate contract, `IAdtAnsweredObject`: `type: AdtTypeCode`, or `unknownType: string` when the code is not in the registry. Exactly one of the two is present, a union the compiler checks.
   - The result contracts that today reuse `IObjectReference` for answered objects (`IInactiveObjectsResponse.objects`, …) take `IAdtAnsweredObject`. An unknown inactive object survives as it is.
4. **The server's debugger target labels** (`CLAS`, `PROG`, `INCL`, `FUNC`) are the stack's own vocabulary for a breakpoint target, not ADT type codes.
   - The debugger contract takes a source URI (`IAbapDebugger`).
   - The labels stay in the server, as a closed union mapped to registry codes: `FUNC` to `FUGR/FF`, `INCL` to `PROG/I`.
   - No SAP claim is made for them.

## 3. adt-clients, adt-strategies, adt-clients-legacy

1. **`buildObjectUri` becomes a complete table** typed `{ [C in AdtTypeCode]: address | 'not-addressable' }`.
   - A code added to the registry does not compile until adt-clients decides how it is addressed.
   - `under` codes take the parent name.
   - Bare R3TR types are accepted through `objectDirectory`, derived from the registry.
   - `FUNC` goes, and so does every wrong code.
   - It keeps its one boundary check for a code from outside the type system: upper-case it once, then look it up in the registry.
2. **The other maps** become `Partial<Record<AdtTypeCode, …>>` or are keyed by `AdtObjectKind`:
   - `WHERE_USED_ALIASES` becomes kind → code;
   - `objectWire`;
   - checkRun's `getObjectUri`;
   - the legacy package's two refusal maps.
3. **Payloads and validation.**
   - The create payloads' `adtcore:type` and the validation `objtype` are written from the registry.
   - The validation `objtype` without a slash (`ttypda`) is derived from the code, not written by hand.
4. **Comments** name the code the code uses (`DSFD/SCF`, `DSFI/SFI`, `AUTH`). A code in a comment is allowed by the scan and must be a registry code (6).
5. **The ADT-answer boundary is in adt-strategies.** A strategy that reads a code out of an answer looks it up in the registry once.
   - A known code is answered as `type: AdtTypeCode`.
   - An unknown code is answered as it is, through `IAdtAnsweredObject` (2.3): `type` absent and `unknownType: string` present. It is never cast, never dropped and never guessed into a kind.
   - The result types change: today their fields are `string` (`results/utils.ts`). A consumer reads `type` or `unknownType`. This is a breaking change of a 0.x package, so a minor (owner's rule) with a migration note.
6. **Tests.**
   - The literal scan (section 6) runs over `packages/*/src`.
   - A unit test per address proves the table.
   - The old wrong codes fail to compile, which a `@ts-expect-error` proves.

## 4. The mcp-abap-adt server

1. **Every server map is typed against the registry:**
   - `TYPE_TO_FAMILY` becomes `Partial<Record<AdtTypeCode, ActivationFamily>>`, and its friendly half comes from `AdtObjectKind`;
   - `KIND_BY_TYPE` is replaced by the registry's `kind`, and its prefix fallback goes (so `PROG/I` is no longer read as a program);
   - `READS`, the packageEnumerator map and `ADT_TYPE_BY_COMPACT_TYPE`;
   - `VALID_TYPES` and the compact names, as a typed map `Record<CompactObjectType, AdtObjectKind>`.
2. **What reaches the model.** Registry membership is not acceptance.
   - Each operation that takes a code declares the subset it accepts, as a named `readonly AdtTypeCode[]` (or kinds) beside its handler. Examples: GetIncludesList's four parent kinds; GetWhereUsed's codes with a `buildObjectUri` address; ActivateObjects' codes that a family or group activation addresses.
   - The schema enum, the code list in the description and the refusal's list of accepted codes all derive from that subset. Its codes are checked against the library's address table by type.
   - A description's example names only a code its path accepts.
   - The preaudit list built in PR #329 is derived the same way.
3. **The debugger** maps its target labels through the server's own label union (2.4).
   - `GetAbapSystemSymbols`' output label `FUNC` for a function module stays a label: it is the debugger's vocabulary, typed so.
4. **The boundary.** A code in a tool argument is upper-cased once and checked against the operation's subset. When it is not there, it is refused with that subset's list. That is the only runtime check for an argument; an answer's codes are checked in adt-strategies (3.5).
5. **Tests.**
   - The literal scan (section 6) runs over `src` and every package directory.
   - The evidence test (section 5) runs over `tests/fixtures/adt/`.
   - The tests pinning `doma/dm` and `bdef/bd` are replaced by tests pinning the recorded codes.

## 5. Evidence

1. **The evidence test lives in the server**, beside the largest corpus (`tests/fixtures/adt/`).
   - Codes are extracted from **response bodies only** (`*.body.*`, never the request sidecars), by XML context, with the XML parser the repositories already use:
     - the `adtcore:type` attribute;
     - the text of `OBJECT_TYPE` elements;
     - the `type` attribute only on the elements that carry an object type;
     - the `type=` part of an ADT URI fragment, URL-decoded (`#type=CLAS%2FOM;name=…`).
   - For every entry marked `recorded` with source `server-corpus`, that extraction finds the code.
   - adt-clients has the same test for source `clients-discovery`: the `<nameditem:data>` entries of `docs/discovery/`.
   - Each repository checks only the entries naming its own source, so no test reaches across repositories.
   - The reverse direction also holds: every code the extraction finds is in the registry, so a newly recorded code is noticed.
2. **Measuring.** Each code proven only outside the repositories, and each `unmeasured` code the stack addresses, is measured on E19 (or E77 for 7.40 only), as the test user:
   - the read of one object of that kind, its metadata and, where the kind has one, its node structure;
   - the answer added to the server's corpus, in the corpus's own format and naming.
   Today that is the codes listed at the end of section 1, and `PROG/I`, `SRVB/SVB`, `VIEW/DV`, `AUTH`, `SCGR`.
   - The ATC samples copied into `ZMCP_ATC_SAMPLES` provide programs, program includes and function group includes.
   - A code that cannot be measured stays `unmeasured`, and the docs say so.
3. **A committed answer names no SAP system, system id, transport number or user name.** These are replaced as the corpus already does. The test that guards the corpus checks this for the new files.
4. **The debugger's target labels** need no SAP evidence (2.4). Their mapping to codes is a unit test.

## 6. The literal scan

- One Jest test per repository: adt-clients for `packages/*/src`, and the server for `src` and the package directories.
- It walks every string literal, template piece and JSDoc comment with the TypeScript compiler API. It tokenises with plain code, not a regex.
- **Production code writes no untyped code literal.** A token of the shape `XXXX/Y…`, or one equal to a registry `objectDirectory` (bare `CLAS`, `AUTH`, `SCGR`, `CMPT`, …), fails the test in production source. It is allowed only:
  - where the type checker gives the literal a contextual type that is `AdtTypeCode`, `AdtObjectDirectoryType` or a subset of them, so that the compiler has proven membership. Examples: a key in a `Record<AdtTypeCode, …>`, an argument typed `AdtTypeCode`, `ADT_OBJECT_TYPES['TTYP/DA']`. The scan asks the type checker, not a pattern;
  - in the registry module itself;
  - in the server's debugger label union (2.4);
  - in tests and fixtures, where a wrong code is still written to prove it is refused;
  - as an entry of a short committed allowlist of non-codes: MIME types such as `text/html`, path pieces.
- A production consumer writes a code only where it is typed as one. A plain `string` holding a code fails.
- **Comments** may name codes, and each named code must be a registry code. A wrong code in a comment fails the test.
- Descriptions are scanned too, so a wrong code, or any written-out code, in a tool description fails the test. Descriptions are built from the subsets (4.2).
- The rule is proven load-bearing by one deliberate break.

## 7. Order and versions

1. **interfaces-adt 21.0.0** (major: the old unions go) is published first.
2. **adt-clients 38.0.0 and adt-clients-legacy 0.2.0.**
   - These versions are also the ones #216 Part B (PR #272) plans, so the two changes ship in the same major, in this order: #216's B tasks, then this registry.
   - adt-strategies 0.16.0. Its result types change (3.5): a breaking change of a 0.x package, so a minor, with a migration note.
   - Inside the repository the publish order stays strategies, then clients, then legacy. adt-clients depends on strategies `^0.16.0`. The legacy package's peer and dev range move to adt-clients `^38.0.0`.
   - After publishing: a clean install from the registry, outside the repository, of all three.
3. **mcp-abap-adt 21.0.0.** Its `[Unreleased]` entry is already a major. It goes on interfaces-adt 21 and adt-clients 38.
4. **Docs.** Every package's README, docs and examples are updated. Each major or 0.x minor carries a migration note naming the removed unions, the dropped wrong codes and aliases, the narrowed arguments, and the `type` / `unknownType` split.
5. **One PR per repository; the goal, this spec and the plan live in #329.**
   - The server's part rides in #329 beside the five defects.
   - Every dependency resolves on the npm registry before the next repository builds on it.

## 8. Not in this work

- **No new object kind gets support.** A kind that is entered as `unmeasured` gets no new tool.
- **No rename of a tool parameter.** A parameter that took a code still takes one, now a checked code.
- **No behaviour change for a correct code.** Every request a correct code sends today, it still sends.
