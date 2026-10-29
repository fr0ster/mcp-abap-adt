# Spec: a contract lives where it is accepted — the ADT client

Answers [`2026-10-24-client-contract-goal.md`](../2026-10-24-client-contract-goal.md) (#216).

A contract is either taken from the contract package or composed from that package's contracts.
Nowhere is one taken from an implementation package.

## 1. What there is today (measured in the code, 2026-10-24; measured again on main after #281, 2026-10-27)

Since #281 the repository is a private root around `packages/adt-clients`, `packages/adt-strategies`
and `packages/adt-clients-legacy`; every adt-clients path below is under `packages/adt-clients/`.
Measured again on this branch (main at #281's merge plus these documents) for Task B1.

- **Factories.** `src/clients/AdtClient.ts` has 35. Each has two overloads,
  `getX(): IXContract<typeof xDocuments>` and `getX<R extends IXResults>(results: R): IXContract<R>`,
  and one implementation, `getX<R …>(results: R = xDocuments …): AdtX<R>`.
- **Compositions.** The 35 `IXContract<R>` are declared in `AdtClient.ts`, from line 261.
  - They are built from atoms and config types that `@mcp-abap-adt/interfaces-adt` already exports.
  - The one local type they use is `IServiceBindingPublicationConfig`, a type alias
    (`core/service/types.ts:127`), identical to the one interfaces-adt 20.2.0 exports.
  - mcp-abap-adt imports none of them.
- **Result-set contracts.** `IXResults` live in each `core/<dir>/types.ts`.
  - Every slot is `readonly …: IResultStrategy<unknown>`, and `IResultStrategy` comes from
    interfaces-adt.
  - One is generic: `IMessageClassMessageResults<TRead, TWritten, TDeleted>`.
  - `getBehaviorImplementation` and the four `getLocal*` reuse `IClassResults`.
- **Default result sets.** The `xDocuments` are values built from `rawDocument` and `nothing`. Each
  is `satisfies IXResults` and has no annotation.
- **`createAdtClient()`** answers `Promise<AdtClient>` and probes nothing.
- **The legacy client.** `AdtClientLegacy` lives in `packages/adt-clients-legacy` (0.1.0, on
  `@mcp-abap-adt/adt-clients ^37.4.0`, `@mcp-abap-adt/interfaces-adt ^20.1.0`) and imports from
  `@mcp-abap-adt/adt-clients`. Seventeen of its files import client result-set contracts from there:
  `clients/AdtClientLegacy.ts` and sixteen under `core/` (the four `AdtLocal*Legacy` among them).
  Eleven of its
  getters re-declare the base's two overloads and import their compositions: `getFunctionInclude`,
  `getInclude`, `getMessageClass`, `getLocalTestClass`, `getLocalTypes`, `getLocalDefinitions`,
  `getLocalMacros` (answering their legacy classes) and `getTransformation`,
  `getScalarFunction`, `getScalarFunctionImplementation`, `getAppendStructure` (answering through
  `absentOnLegacy`). The root's `legacyStaysInLegacyClasses.test.ts` forbids `legacy` anywhere in
  the root's `src`, tests included; the package's `legacyClassesOnlyOverride.test.ts` allows the
  legacy class only overrides, getters, private helpers and a one-`super` constructor.
- **adt-strategies** names no result-set contract and does not import adt-clients.
- **Shape check.** The capability shape check (`src/__tests__/unit/capabilities/shape.ts`) reads
  each factory's no-argument return through the manifest, which types its factories as
  `(client: AdtClient) => unknown`. `factoryReturnsCoverClass.ts` imports three compositions.
- **mcp-abap-adt** (its main, 2026-10-27) types its clients as the class: `GuardedAdtClient extends
  AdtClient` in `src/lib/clients.ts`, whose `createAdtClient()` and `getAdtClient()` answer
  `AdtClient`; `ReturnType<typeof createAdtClient>` in `src/lib/strategies/metadataReads.ts` and in
  five handler files (`deletionTargets.ts`, `handleActivateObject.ts`, `handleUpdateUnderLock.ts`,
  `handleGetObjectInfo.ts`, `writeTests.ts`); `type AdtClient` in `resolveVersionedObject.ts`; and
  about 20 test files that import `AdtClient`. It declares `@mcp-abap-adt/interfaces-adt` `^20.1.0`
  and `@mcp-abap-adt/adt-clients` `^37.2.0` directly.

## 2. `@mcp-abap-adt/interfaces-adt`: the contracts adt-clients accepts (a minor: 20.1.0 → 20.2.0)

1. **The result-set contracts**, under their names, each in its object's `src/adt/IAdtX.ts` beside
   its config:
   - all 30 `IXResults` (35 factories; `IClassResults` serves six), each a `readonly` slot map of `IResultStrategy<unknown>`;
   - `IMessageClassMessageResults<TRead, TWritten, TDeleted>` keeps its generic parameters and
     their defaults;
   - `IClassResults` stays one interface, used by class, behavior implementation and the local
     includes.
2. **`IServiceBindingPublicationConfig`**, the parameter the service binding's update accepts.
3. Nothing else. No client contract and no composition: the client is accepted by a consumer, not
   by adt-clients. The atoms a consumer composes from (`IAdtCreatable`, `IAdtReadable`, …) are
   already here.
4. **Bookkeeping:**
   - every new symbol goes into `tools/package-map.json`;
   - a type-only check under `src/__typechecks__/` composes a client contract from this package's
     contracts alone, with no adt-clients import;
   - README and CHANGELOG entries.

## 3. adt-clients: implementations only (a major: 38.0.0)

1. **The compositions go.** `IClassContract<R>` and its 34 siblings are deleted.
   - Each factory has one signature, `getX<R extends IXResults = typeof xDocuments>(results?: R): AdtX<R>`,
     and answers its own class.
   - The class's public members are what the factory offers. They are the members today's
     compositions name, because every class already implements its atoms.
2. **The result-set contracts come from interfaces-adt.**
   - Each `core/<dir>/types.ts` imports its `IXResults` from there and deletes the local one.
   - `IServiceBindingPublicationConfig` is imported the same way.
   - adt-clients stops exporting these names, and the migration note says where they are now.
3. **The values stay.**
   - Every `xDocuments` stays, keeps `satisfies IXResults` against the imported contract, and
     stays unannotated, so `typeof xDocuments` keeps its narrow slots.
   - `rawDocument`, `nothing` and `LockFailure` stay.
4. **`createAdtClient()`** keeps answering `Promise<AdtClient>`. The legacy client is §3a.
5. **The shape check** keeps reading each factory's no-argument return, now the class.
   - `OffersAtom` compares the class's members with each atom, as it compares a composition
     today.
   - `factoryReturnsCoverClass.ts` reads the same factories' returns instead of the deleted
     compositions.
   - The runtime completeness test stays.
6. **A consumer-contract check.** A type-level test composes a contract only from interfaces-adt
   contracts, the way a consumer would (a few factories, a few atoms), and proves that `AdtClient`
   and a hand-written object satisfy it. This is the substitution the goal promises; the legacy
   half is §3a, since the root names no legacy class.
7. **No behaviour change.** No request or answer changes, and the unit suite passes unchanged
   apart from type imports.
8. **Docs.**
   - README, `CLIENT_API_REFERENCE.md` and the CHANGELOG.
   - The 38.0.0 migration note says:
     - the compositions are gone;
     - a consumer's contract is either taken from interfaces-adt or composed from its contracts;
     - the result-set contracts are imported from interfaces-adt.

## 3a. adt-clients-legacy: the getters answer classes (a minor of a 0.x package: 0.1.0 → 0.2.0)

1. **The dependencies.** `@mcp-abap-adt/adt-clients` moves to `^38.0.0`, from the registry, and
   `@mcp-abap-adt/interfaces-adt` to `^20.2.0`.
1a. **The result-set contracts come from interfaces-adt** here too: every file that imports one of
   the 30 client result-set contracts (or `IServiceBindingPublicationConfig`) from
   `@mcp-abap-adt/adt-clients` — seventeen files, `clients/AdtClientLegacy.ts` and sixteen under
   `core/` — imports it
   from `@mcp-abap-adt/interfaces-adt`. The executors' result contracts are not moved (§6).
2. **The eleven getters.** Each becomes one signature,
   `getX<R extends IXResults = typeof xDocuments>(results?: R): …`, answering its legacy class
   (`getFunctionInclude`, `getInclude`, `getMessageClass` and the four `getLocal*`) or the base
   class through `absentOnLegacy` (the other four). No composition is imported. Every other override stays.
3. **Still a subclass.** `AdtClientLegacy extends AdtClient`; each override is assignable to the
   base's factory; `legacyClassesOnlyOverride.test.ts` stays green.
4. **The consumer-contract check**, the legacy half of §3.6: the same kind of contract, composed from
   interfaces-adt alone, accepts `AdtClientLegacy`.
5. **No behaviour change**, as §3.7.
6. **Docs.** The package's README and CHANGELOG; the migration line says the getters answer classes
   and a consumer composes its contract from interfaces-adt.

## 4. mcp-abap-adt: the consumer defines its client contract (its next major, 21.0.0)

1. **Its contract.**
   - The server declares the client contract it accepts in `src/lib/` (the plan names the file).
   - It composes that contract **only from `@mcp-abap-adt/interfaces-adt` contracts**: atoms,
     result-set contracts and config types. It imports no type from adt-clients.
   - It lists only the factories the server calls. Each factory answers the atoms whose members
     the server calls, over the result-set contract it is given.
   - Its factory signatures are generic over the result set, like the library's, so
     `resultsFor(…)` sets flow through unchanged.
2. **Typed against it.**
   - `src/lib/clients.ts`: the server's `createAdtClient()` and `getAdtClient()` answer that
     contract.
   - `resolveVersionedObject.ts`, the handlers that alias the client type, and the test fixtures
     are typed against it.
   - `GuardedAdtClient extends AdtClient` stays: it is the implementation the server chooses, and
     the one place the server names an adt-clients class.
3. **The compiler is the check.** Assigning `GuardedAdtClient` to the contract proves the
   implementation satisfies it. A call to anything the contract does not name fails to compile;
   either it is added to the contract or the call goes.
4. **Dependencies.**
   - `@mcp-abap-adt/interfaces-adt` moves to `^20.2.0` and adt-clients to `^38.0.0`, both resolved
     from the registry.
   - The lockfile is regenerated by npm.
   - The server is built after a clean install from the registry.
5. **The CHANGELOG** entry goes into the [Unreleased] major, which already carries breaking
   changes.

## 5. Order and versions

1. PR #281 (adt-clients 37.4.0 and adt-clients-legacy 0.1.0, the legacy package) merges and is
   released first, and this branch rebases onto it.
2. interfaces-adt 20.2.0 is published.
3. adt-clients 38.0.0 is published, on `@mcp-abap-adt/interfaces-adt ^20.2.0` from the registry.
4. adt-clients-legacy 0.2.0 is published, on `@mcp-abap-adt/adt-clients ^38.0.0` from the registry.
5. mcp-abap-adt 21.0.0 is built on both from the registry: its own contract, with its handlers
   typed against it.

Each repository gets its own PR. The goal, this spec and the plan live in this one.

## 6. Not in this work

- **No executor, runtime client or WebSocket client changes.** `AdtExecutor`, `AdtExecutorLegacy`,
  `AdtRuntimeClient` and `AdtClientsWS` keep their types.
- **No rename** of any result-set contract.
- **No change to a class's members.** The two quirks of today's compositions go with them: the
  class's own members are what a consumer reads now.
