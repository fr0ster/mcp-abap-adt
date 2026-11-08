# Plan: an RFC destination states its own address

Goal: `2026-11-08-rfc-address-goal.md`. Spec: `2026-11-08-rfc-address-spec.md` (with
`…-questions.md`, every answer decided as recommended, and `…-evidence.md`). The spec binds;
each step names the section it carries out. A plan of steps, not code: the code is written in
the step, test first. Its approval is separate from the spec's.

**Every commit ends green** on its repository's own gate — CI's step list, run locally the same
way, conditional steps included where their condition holds locally:
- **mcp-abap-adt-interfaces** (`.github/workflows/ci.yml`; Node 22, 24, 26): `npm ci`, then
  `npm run install:packages` (each package's own `npm ci` from its own `package-lock.json`: the
  packages are not workspaces and each installs its dependencies from the registry),
  `npm run build`, `npm run test:check`, `npm run lint:check`, `npm run check:surface`,
  `npm run check:graph`, `npm run check:packed`, `npm run check:publish`.
- **mcp-abap-connection** (ubuntu, windows × Node 22, 24, 26): `npm ci --ignore-scripts`,
  `npm run lint:check`, `npm run build`, `npm run test:ci`, `npm run check:docs`,
  `npm run check:pack`, `npm audit --audit-level=moderate`.
- **mcp-abap-adt-auth-stores** (Node 22, 24, 26): `npm ci`, `npm run build`,
  `npm run test:check`, `npm run lint:check`, `npm test`.
- **mcp-abap-adt-auth-broker** (Node 22, 24, 26): `npm ci`, `npm run check` (build,
  test:check, lint:check, check:graph, test:shape, check:packed, check:publish), `npm test`;
  the stand job `npm run test:stand`.
- **mcp-abap-adt-clients** (Node 24): `npm ci --ignore-scripts`,
  `npm audit --audit-level=moderate`, `npm run build`, `npm run test:check`,
  `npm run lint:check`, `MCP_ENV_PATH=/tmp/nonexistent-env npm test`, `npm run check:packed`,
  `npm run check:publish`, `npm run check:publish:root`.
- **mcp-abap-adt, PR #346** (ubuntu, macOS, windows × Node 22, 24):
  - `npm ci --ignore-scripts`;
  - `npm run lint:check -- --diagnostic-level=error`, then `lint:check` of `server`, `http`,
    `sse`, `compact`, `compact-readonly-entries`, `compact-modify`, `background-runs-memory`,
    `responsible-rules`, `server-runtime`, `compact-http`, `compact-sse`, `core-ro`, `http-ro`,
    `sse-ro`, `compact-ro`, `compact-http-ro`, `compact-sse-ro`;
  - `npm run build`; `npm run test:check`;
  - `npm test` with `SKIP_INSTALL_MATRIX=false` on ubuntu + Node 22 (the install matrix) and
    `true` elsewhere;
  - `test:check` of `server-runtime`, `server`, `http`, `sse`, `background-runs-memory`,
    `responsible-rules`;
  - on ubuntu + Node 22: `npm audit --audit-level=moderate`; `npm pack` of the root and the
    seventeen packages CI names; the external install of the tarballs with the sibling-resolution
    check and `--version` / `--help` of the twelve binaries; `scripts/ci/check-images.mjs`
    (Docker images); the Glama reference images when their `CORE_VERSION` is on npm.

**Every step proves itself load-bearing.** A step names its tests by kind: **red** (fails before
the change, passes after), **type regression** (a compile-only case or `test:check`), or
**characterization** (behaviour that already holds and must keep holding). Each rule is then
broken once on purpose in production code — each half of a compound rule on its own — the named
test seen red, the break reverted. Appendix A lists every rule with its test and its mutation; a
step's mutations are its rows there. A refusal's test asserts its own case's words.

**One PR per repository**, from its default branch in a worktree under its own `.worktrees/`
(never the main checkout's branch). A dependency upgrade is committed together with every change
it forces, so the commit is green. Each PR ends with its versions, CHANGELOG / MIGRATION, docs and
**publish: the owner's**. The next repository depends on the published version from the registry
— never a link — and checks its lockfile for `"link": true` outside its own workspace packages
(the standing exception for siblings of one repository applies until the release).

**A release phase** — every step below that says *publish: the owner's* — runs in this order:
1. its release commit, gate green;
2. merge and tag, done by the controller once the owner says merge; each tag names a commit
   whose tree is HEAD's;
3. the publish rehearsal naming exactly the phase's packages: `npm run release:publish --
   --dry-run` where the repository has that script (interfaces, auth-broker, clients, the
   server), else `npm publish --dry-run` of its one package (connection, auth-stores);
4. publish — the owner's;
5. the published versions confirmed visible on the registry (`npm view <package>@<version>
   version` for each) before the next phase installs them; a version not yet visible is waited
   for, never re-published.

## mcp-abap-adt-interfaces — branch `feat/rfc-address` from `master`

1. **`ISapConfig` as a union** (spec §1). **Files:** `packages/interfaces-auth-sap/src/sap/ISapConfig.ts`,
   `src/index.ts`, `src/__typechecks__/sncTypes.ts`, new `src/__typechecks__/rfcAddressTypes.ts`,
   new `tsconfig.typecheck-loose.json` (`exactOptionalPropertyTypes` off), the package's
   `test:check` running both configs, `check:surface`'s expected names.
   **Steps:**
   - Type regressions, red before the change: both RFC shapes without `url` compile; a sole
     `msserv` and a sole `sysid` message server compile; `msserv` with `sysid` compiles; an HTTP
     literal without `connectionType` compiles and narrows to `ISapHttpConfig`; the
     `@ts-expect-error` cases of spec §12 (RFC with `url` inline **and** by structural
     assignment of a non-literal value carrying `url`; without `client` or `language`; `ashost`
     without `sysnr`; `mshost` without `group`; a message server without `mshost`; neither
     `msserv` nor `sysid`; keys of both addresses; HTTP with each RFC key and `language`, each
     inline **and** by structural assignment of a non-literal value; `url: undefined` on RFC under the strict
     config; a spread of an `ISapHttpConfig` into an RFC literal); spreads of `ISapConfigBase`
     and a fieldwise composition into each branch compile.
   - Change: the seven types, their exports; `sncTypes.ts` without `url`.
   - Mutations: Appendix A, rows T1–T9.
   **Commit:** `feat(interfaces-auth-sap)!: ISapConfig is a union by connection type`
2. **`getBaseUrl()` may answer `undefined`** (spec §3). **Files:**
   `packages/interfaces-adt-connection/src/IAbapConnection.ts`,
   `src/__typechecks__/connectionCapabilities.ts`.
   **Steps:** type regressions, red before: an implementer answering `Promise<undefined>`
   conforms; a caller assigning the answer to `string` is `@ts-expect-error`; an implementer
   answering `Promise<string>` still conforms (characterization). Change: the return type.
   Mutations: A, T10.
   **Commit:** `feat(interfaces-adt-connection)!: getBaseUrl answers string | undefined`
3. **The RFC address as destination means** (spec §4). **Files:**
   `packages/interfaces-auth-broker/src/auth/IConnectionConfig.ts`, its `package.json` range
   `^2.0.0 || ^3.0.0 || ^4.0.0` on interfaces-auth-sap, `src/__typechecks__/` (new case).
   **Steps:** type regression, red before: a config stating each of the seven fields compiles,
   each `?: string | undefined`. Change: the seven fields; the range. The package installs
   interfaces-auth-sap from the registry, so until 4.0.0 is published its lockfile resolves 3.x —
   which the fields do not need; step 5b moves it to 4. Mutations: A, T11.
   **Commit:** `feat(interfaces-auth-broker): the RFC address in IConnectionConfig`
4. **interfaces-adt accepts interfaces-adt-connection 4** (spec §3, ripple). **Files:**
   `packages/interfaces-adt/package.json`. **Steps:** range `^3.0.0 || ^4.0.0`; verification:
   `check:graph` and `check:surface` green and `test:check` green against the 3.x the lockfile
   resolves until 4.0.0 is published; step 5b re-runs it against 4 (its exported types do not
   reach `getBaseUrl`, evidence E.3). No behaviour, no mutation.
   **Commit:** `chore(interfaces-adt): accept interfaces-adt-connection 4`
5. **Docs, versions, release, in two publishes** (spec §10, §11).
   - **5a — the two majors.** **Files:** `package.json` of interfaces-auth-sap (4.0.0) and
     interfaces-adt-connection (4.0.0), their `CHANGELOG.md` with migration sections, their
     `README.md` (the seven names; `getBaseUrl()` may answer `undefined`), each package's
     `package-lock.json` regenerated by npm. **Verification:** the gate; the release selection
     checked for real by the phase's rehearsal, which must name exactly these two (`check:publish`
     exercises the publish script on fixtures with a fake npm, not this repository's selection).
     Then the rest of the release phase; **publish: the owner's.**
     **Commit:** `release: interfaces-auth-sap 4.0.0, interfaces-adt-connection 4.0.0`
   - **5b — the two minors, on the published majors.** **Files:** `package-lock.json` of
     interfaces-auth-broker and interfaces-adt, regenerated by npm so they resolve 4.0.0 from the
     registry (checked: no `"link": true`, nothing outside the registry); their `package.json`
     (interfaces-auth-broker 1.4.0, interfaces-adt 26.1.0), `CHANGELOG.md`, interfaces-auth-broker
     `README.md` (the seven means). **Verification:** the gate against 4;
     the phase's rehearsal names exactly these two. Begins only after 5a's versions are visible on
     the registry. Then the release phase; **publish: the owner's.**
     **Commit:** `release: interfaces-auth-broker 1.4.0, interfaces-adt 26.1.0`

## mcp-abap-connection — branch `feat/rfc-address` from `master`

6. **The contracts and everything they force** (spec §2). One commit: installing
   interfaces-auth-sap 4 and interfaces-adt-connection 4 makes every RFC read of `url` and the
   string-typed base URL fail to compile.
   **Files:** `package.json` (`^4.0.0` both, from the registry), `package-lock.json`,
   `src/connection/rfcConversation.ts`, `createConnection.ts`, `AbstractAbapConnection.ts`,
   `CredentialAbapConnection.ts`, `HttpTransport.ts`, `CloudHttpTransport.ts`,
   `OnPremHttpTransport.ts`, `LegacyOnPremHttpTransport.ts`, `IAdtTransport.ts`, `src/index.ts`
   (new exported names); the README examples that `check:docs` compiles and that pass a general
   `config` to `rfcConversationFrom` (`README.md:876-888`, and any other TypeScript fence the
   checker reports) and the checker's placeholders (`scripts/check-docs.mjs:346`: an
   `ISapRfcConfig` placeholder beside the HTTP one), so `check:docs` stays green in this commit; tests `rfcConversation.test.ts`, `rfc-connection.test.ts`,
   `createConnection.test.ts`, `transportEstablish.test.ts`, `rfcConnectorPath.test.ts`,
   `httpTransport.test.ts`, a type-check file for the specs.
   **Steps:**
   - Red: `rfcParamsFrom(config: ISapRfcConfig)` answers exactly each shape's fields (`lang`
     from `language`; `msserv`, `sysid`, `saprouter` present exactly as stated); with
     `SAP_SYSNR` in the environment the answer is unchanged; no `'000'`, `'EN'`, `'PUBLIC'`;
     nothing throws. `rfcConversationFrom(config: ISapRfcConfig)`: a fake SDK client receives the
     stated address with the provider's logon parameters spread over it, every logon key
     present, no address key changed. An RFC connection from a config without `url` connects with
     a fake conversation, carries a request path, answers `getBaseUrl()` with `undefined`; an HTTP
     connection answers its origin; the HTTP transports' CSRF fetch, cloud preflight and logoff
     address the constructor's base URL.
   - Type regressions: each spec refuses the other shape; an HTTP transport without `baseUrl`
     does not compile; `IAdtSessionContext` has no `baseUrl`.
   - The old derivation and `SAP_SYSNR` cases are removed with the code they pinned.
   - Change: `rfcParamsFrom` and `rfcConversationFrom` typed by `ISapRfcConfig`, reading as
     stated, defaults, derivation, environment read and throws removed;
     `RfcMessageServerParams` in the "msserv, sysid or both" shape; the specs' `config` types;
     the HTTP address built inside the HTTP branches; `baseUrl` a required HTTP-transport option;
     `establishSession` hands the context without reading `getBaseUrl()`;
     `AbstractAbapConnection.baseUrl: string | undefined`; values passed through untrimmed
     (red: a padded `ashost` reaches the client as given).
   - Mutations: A, C1–C9.
   **Commit:** `feat!: the RFC address is read as stated; no URL over RFC`
7. **The signature names the RFC address** (spec §2). **Files:** `src/config/sapConfig.ts`,
   `src/__tests__/sapConfig.test.ts`. **Steps:** red: two configs differing only in
   `connectionType`, in each address field, in `client`, in `language` sign differently. Change:
   the fields in the signature. Mutations: A, C10.
   **Commit:** `fix: the config signature includes the RFC address`
8. **Docs, version, release** (spec §10). **Files:** `docs/MIGRATION-20.0.md` (new); `README.md` prose
   (`rfcConversationFrom` section :843-866, migration index :165, :84; its compiled examples
   changed in step 6); `docs/USAGE.md` (:166,
   :1013); `docs/MIGRATION-6.0.md`, `docs/MIGRATION-18.0.md` (one "Superseded by 20.0.0" line at
   their RFC sections); `CHANGELOG.md` 20.0.0; `package.json` 20.0.0; lockfile.
   **Verification:** `check:docs`; a search of README and USAGE — descriptions of current
   behaviour, not migration history — for the URL-port convention, `SAP_SYSNR` and the three
   defaults finds none. **CLAUDE.md proposal for the owner** (no edit): the "Taking the RFC wire"
   paragraph (`CLAUDE.md:162-166`), proposed text in the PR description. Release phase (rehearsal: `npm publish --dry-run` of
   `@mcp-abap-adt/connection` 20.0.0); **publish: the owner's.**
   **Commit:** `release: 20.0.0 — the RFC address is stated`

## mcp-abap-adt-auth-stores — branch `feat/rfc-address` from `master`

9. **The seven address means** (spec §4). **Files:** `package.json` (interfaces-auth-broker
   `^1.4.0`, interfaces-auth-sap `^3.3.0 || ^4.0.0`, from the registry), lockfile,
   `src/stores/destination/EnvDestinationStore.ts`, its tests.
   **Steps:** red: for the ABAP and the XSUAA variable sets, each of the seven read from the file,
   taken from a fallback when the file lacks it and not when the file states it (`''` included),
   written and removed by `setDestination`. Change: `CONNECTION_FIELDS` and the suffixes.
   Mutations: A, S1–S5.
   **Commit:** `feat: EnvDestinationStore carries the RFC address`
10. **Docs, version, release** (spec §10). **Files:** `README.md` (the variables table :367 and
    the example :296), `CHANGELOG.md`, `package.json` 5.1.0, lockfile. **Verification:** the gate;
    `npm pack --dry-run` lists the built store. Release phase (rehearsal: `npm publish --dry-run`
    of `@mcp-abap-adt/auth-stores` 5.1.0); **publish: the owner's.**
    **Commit:** `release: 5.1.0 — the RFC address as means`

## mcp-abap-adt-auth-broker — branch `chore/rfc-address` from `main`

11. **The new contracts and stores** (spec §4). **Files:** `packages/auth-broker/package.json`
    (interfaces-auth-broker `^1.4.0`, interfaces-auth-sap `^3.3.0 || ^4.0.0`; devDependency
    auth-stores `^5.1.0`), lockfile, `src/__tests__/` (new case).
    **Steps:** characterization: `getConnectionConfig` answers each of the seven means a real
    `EnvDestinationStore` gives (it already forwards every non-secret field, evidence E.4).
    Change: the ranges. Mutations: A, B1. `npm run test:stand` green.
    **Commit:** `chore: interfaces-auth-broker 1.4, interfaces-auth-sap 4; the RFC address passes`
12. **Version, release.** **Files:** `packages/auth-broker/CHANGELOG.md`, `package.json` 5.1.0,
    lockfile. **Verification:** `npm run check`. Release phase (the rehearsal names auth-broker
    5.1.0 alone); **publish: the owner's.**
    **Commit:** `release: auth-broker 5.1.0`

## mcp-abap-adt-clients — branch `feat/rfc-address` from `main`

13. **interfaces-adt-connection 4 and what it forces; strategies 0.21.0** (spec §3). One commit:
    with 4 installed, `AdtBatchConnection.getBaseUrl(): Promise<string>` no longer compiles.
    **Files:** `packages/adt-strategies/package.json` (interfaces-adt-connection
    `^3.0.0 || ^4.0.0`, version 0.21.0), `packages/adt-clients/package.json`
    (interfaces-adt-connection `^4.0.0`; devDependency adt-strategies `^0.21.0`),
    `packages/adt-clients-legacy/package.json` (interfaces-adt-connection `^3.0.0 || ^4.0.0`;
    devDependency adt-strategies `^0.21.0`), lockfile;
    `packages/adt-clients/src/batch/AdtBatchConnection.ts`, `src/utils/systemInfo.ts` (types only),
    their tests.
    **Steps:** type regression: `test:check` red after the install until `AdtBatchConnection`
    answers `Promise<string | undefined>`. Characterization: `AdtBatchConnection` forwards
    `undefined`; `isCloudEnvironment` with `undefined` reaches the `systeminformation` fallback
    (it already skips a falsy URL, E.3). Lockfile: every sibling resolves to the workspace, every
    third-party package from the registry. Mutations: A, K1–K2.
    **Commit:** `feat!: getBaseUrl answers string | undefined (interfaces-adt-connection 4)`
14. **connection 20 and the test config boundary** (spec §6, §9). One commit: with connection 20
    and interfaces-auth-sap 4 installed, the RFC test config (a `url`, no address) no longer
    compiles. **Files:** `packages/adt-clients/package.json` devDependencies (connection
    `^20.0.0`, interfaces-auth-sap `^4.0.0`), lockfile,
    `src/__tests__/helpers/sessionConfig.ts` (`getConfig`, `connectionSpec`), `caseGate.ts`,
    `globalSetup.ts`, `test-config.yaml.template`, new unit tests of the helper.
    **Steps:** red: per wire — HTTP requires `SAP_URL`; RFC reads `SAP_ASHOST` + `SAP_SYSNR` or the
    message-server keys, `SAP_CLIENT`, `SAP_LANGUAGE`, refuses `SAP_URL` and each case of spec §7
    by its keys (each case on its own, as spec §7 numbers them), returns an `ISapRfcConfig`;
    `connectionSpec` builds `config` in each branch. Mutations: A, K3–K8.
    **Commit:** `test: the RFC test config states its address (connection 20)`
15. **Docs, versions, release** (spec §10, §11). **Files:** `packages/adt-clients/docs/usage/RFC_CONNECTION.md`
    (:64-97), `docs/development/RFC_TESTING.md` (:84-113), `docs/development/RUNNING_TESTS.md`,
    `README.md` (:894); `CHANGELOG.md` of adt-clients (44.0.0, migration notes), adt-strategies
    (0.21.0), adt-clients-legacy (0.8.0: the widened ranges); adt-clients-legacy's peer
    `@mcp-abap-adt/adt-clients` `^43.1.0 || ^44.0.0` and devDependency `^44.0.0`; versions;
    lockfile. **Verification:** the gate; `check:publish` and `check:publish:root` name the three.
    The rehearsal names exactly the three; publish order adt-strategies 0.21.0, adt-clients 44.0.0,
    adt-clients-legacy 0.8.0, each visible on the registry before the next. Release phase;
    **publish: the owner's.**
    **Commit:** `release: adt-clients 44.0.0, adt-strategies 0.21.0, adt-clients-legacy 0.8.0`

## mcp-abap-adt — PR #346, branch `refactor/static-types` (the `static-types` worktree)

16. **The additive dependencies** (spec §11). **Files:** root `package.json`
    (`@mcp-abap-adt/interfaces-auth-broker` `^1.4.0`, `auth-stores` `^5.1.0`, `auth-broker`
    `^5.1.0`, `adt-strategies` `^0.21.0`) and the sibling manifests that name them; lockfile.
    **Verification:** the gate green with nothing else changed (all four are minors or, for
    adt-strategies, additive since 0.19.1: its CHANGELOG 0.20.0 adds members only); lockfile:
    `"link": true` only for the repository's own packages.
    **Commit:** `chore(deps): interfaces-auth-broker 1.4, auth-stores 5.1, auth-broker 5.1, adt-strategies 0.21`
17. **The keys and their precedence** (spec §5). **Files:** `src/lib/config/messageServer.ts`
    (becomes the RFC destination key list), `src/lib/config/index.ts`,
    `server-runtime/src/stdio/config/coreParameters.ts`, `envFileContext.ts`,
    `server-runtime/src/stdio/launcher.ts`, `server-runtime/src/stdio/auth/brokerFactory.ts`
    (reads the means' address, client and language into the effective values handed on),
    `IAuthBrokerFactoryConfig.ts`, `src/lib/config/authParameters.ts`, `src/lib/systemContext.ts`;
    tests `rfcMessageServerParameters.test.ts`, `config/envFileContext.test.ts`,
    `unit/config/rfcMessageServer.test.ts`, a new two-destination suite.
    **Steps:** red: `--ashost`, `--sysnr`, `--client`, `--language` and their env and YAML forms;
    for each key, CLI over the original environment, environment over means, means over YAML,
    blank as unset, trimmed; the `.env` no longer copies client, language or address keys into
    `process.env`; two destinations in one process keep their own values and master-language
    defaults; the HTTP and SSE binaries refuse the four options and YAML keys. Change: as listed.
    Mutations: A, P1–P8.
    **Commit:** `feat!: the RFC address, client and language: every source, one precedence`
18. **interfaces-adt-connection 4, adt-clients 44, and what they force** (spec §3, §8). One
    commit: `getBaseUrl()` answering `string | undefined` breaks every typed caller.
    **Files:** root and sibling manifests (`interfaces-adt-connection` `^4.0.0`, `adt-clients`
    `^44.0.0`), lockfile; the forwarders `src/lib/batch/lateBound.ts`, `envelopeWatch.ts`,
    `phases.ts`, `recorder.ts`, `handleRuntimeListFeeds.ts`, `src/lib/handlers/noConnection.ts`;
    `handleGetServiceBindingPreviewUrl.ts`; `src/embeddable/BaseMcpServer.ts` (background caller),
    `EmbeddableMcpServer.ts` (`system` option), `src/lib/backgroundRuns/contract.ts`,
    `background-runs-memory/src/InMemoryBackgroundRuns.ts`; tests for each.
    **Steps:**
    - Type regression: `test:check` red after the install until every caller narrows.
    - Red: the preview tool with `getBaseUrl()` answering `undefined` answers paths and query,
      keeps an absolute system service URL, adds `origin: 'unknown'` and the note, reads the V4
      `servicePath` without `new URL`; its description carries the added sentence. The background
      caller is `{ system, client, user }`; an injected connection answering a URL takes
      `['http', url, '']`; one answering `undefined` takes `EmbeddableMcpServerOptions.system`, and
      without it background runs are refused with the fixed words naming `system`; a fresh
      connection's run keeps the injected identity; two systems with the same client and user
      never share a run in one store.
    - Mutations: A, U1–U7.
    **Commit:** `feat!: getBaseUrl may be undefined: preview paths, background identity by system`
19. **interfaces-auth-sap 4, connection 20, and what they force** (spec §6, §7, §8, §9). One
    commit: the union makes every read of `settings.url` and every RFC literal with a `url` fail
    to compile. **Files:** manifests (`interfaces-auth-sap` `^4.0.0`, `connection` `^20.0.0`),
    lockfile; `server-runtime/src/stdio/auth/brokerFactory.ts` (`readSettings` builds the two
    shapes), `server-runtime/src/stdio/launcher.ts` (connection type before the settings),
    `server-runtime/src/stdio/auth/destinationFailure.ts`, new `DestinationAddressRefusal`,
    `src/lib/credentialSources.ts` (`credentialFromHeaders` builds `ISapHttpConfig`; the
    certificate narrowing), `src/lib/connectionFactory.ts` (branch-local `config`),
    `src/lib/adtHeaders/systemKey.ts`, `BaseMcpServer.ts` (`targetOf`, the destination's
    background `system`), `src/lib/utils.ts` (summary, debug line), `src/lib/leftoverSessions/LeftoverSessions.ts`,
    removal of `rfcAddressRefusalFor` / `rfcAddressRefusalOf` / `RfcAddressRefusal` and their uses
    (`messageServer.ts`, `connectionFactory.ts`, `launcher.ts`);
    `src/__tests__/integration/helpers/configHelpers.ts`, `tests/test-config.yaml.template`; tests
    `rfcMessageServerChain.test.ts`, `unit/adtHeaders/adtHeadersEntry.test.ts`, the leftover-session
    harness, new refusal and boundary suites, unit cases of the live helper,
    `src/__tests__/unit/sources/rfcConfigConstruction.test.ts` and its entry in
    `tools/node-test-files.json`.
    **Steps:**
    - Type regression: `test:check` and every package's `test:check` red after the install until
      each site narrows.
    - The construction check (new test `src/__tests__/unit/sources/rfcConfigConstruction.test.ts`,
      a `node:test` file with `node:assert/strict`, added to `tools/node-test-files.json` and so
      run by `npm test` on the node:test runner — a TypeScript-program scan, the category D27 moves
      off Jest — on the model of `sources/helpers/typeEscapeScan.ts`): a TypeScript
      program over the production `.ts` files of `src/lib`, `src/embeddable`, `src/handlers` and
      `server-runtime/src` (no `__tests__`), read with the compiler API and its type checker — no
      regular expression over code. It reports: an `as` / angle-bracket assertion whose target
      type is `ISapConfig` or one of its members (`SapConfig` included); an object literal of an
      `ISapConfig` member type built before its `connectionType` is narrowed (a literal whose
      contextual type is the whole union, or a variable of union type later spread into a
      branch); a property of an RFC-typed literal that `ISapRfcConfig` forbids, `undefined`
      included; a spread whose source's type is the other shape (or the union) inside a branch
      literal, decided by the checker's type of the spread expression.
    - Red: each of the nine refusal cases with its own words, keys only, a sentinel value absent
      from every output; each row of the URL matrix; an absent connection type refused before
      the settings are read; the certificate on RFC refused in `readSettings` and in
      `credentialFromSapConfig`; `readSettings` answers an `ISapRfcConfig` with the stated address,
      client and language; the RFC system key differs per address field; system information over
      a fake RFC connection without a URL; the destination's background `system` is its system
      key; the summary shows the address; the live helper per wire and per refusal case; a
      destination with faults of two steps answers the earlier step only; a step with several
      faulty keys names every one.
    - Mutations: A, R1–R16, X1–X9.
    **Commit:** `feat!: an RFC destination: one shape, checked at its boundary, no URL`
20. **Docs** (spec §10). **Files:** `README.md`; `docs/installation/RFC_SETUP.md`,
    `INSTALLATION.md`, `examples/README.md`, `CLINE_CONFIGURATION.md`;
    `docs/user-guide/CLIENT_CONFIGURATION.md`, `CLI_OPTIONS.md`; `docs/configuration/YAML_CONFIG.md`;
    `docs/deployment/DOCKER.md`; `docs/architecture/` (§6's embedder rows); the launcher help and
    examples (`launcher.ts`); the parameter help (`coreParameters.ts`); `docs/MIGRATION-24.0.md`
    section "RFC destinations: the address is stated"; `CHANGELOG.md` 24.0.0 blocks.
    **Verification:** a search of descriptions of current behaviour (the files above except
    MIGRATION and CHANGELOG history; the migration section's `80NN` → `NN` explanation is
    expected) finds no URL-port convention, no process-only `SAP_SYSNR`, no `PUBLIC` default, no
    RFC example with `SAP_URL`; the help test suites that pin the help text updated and green.
    **CLAUDE.md proposal for the owner** (no edit): every passage of the server's `CLAUDE.md` that
    describes the RFC address, the message-server keys or the keys bridged from the `.env`; the
    proposed text in the PR description.
    **Commit:** `docs: an RFC destination states its address`
21. **Live checks — only on the owner's go** (spec §12). Verification of the commit at HEAD
    after step 20; no commit of its own: a failure is fixed under its own commit in this PR and
    the run repeated. Each run starts with the realm check (the target's 401 realm before any
    logon; a password refusal stops every run). Runs:
    - RFC with SNC, application-server address, `SAP_CLIENT`, `SAP_LANGUAGE`, no `SAP_URL`: the
      server starts, system information answers, the RFC live suite green through the server's
      tools, the preview tool included;
    - the same with basic over RFC;
    - a message-server destination when its message server is reachable from the test machine;
      otherwise step 20's docs say the path is unit-tested only, in that step's commit;
    - an old-style RFC destination refused at start with the spec's words, nothing sent.
    Green: every run passes, the run report matches the ledger, no leftover session. Counts go into
    the PR description, with no system name.
22. **The end.** Delete `2026-11-08-rfc-address-goal.md`, `…-spec.md`, `…-questions.md`,
    `…-evidence.md` and `…-plan.md` before the 24.0.0 release commit; what they still owe goes
    into the PR description first. The 24.0.0 release that follows is PR #346's own release
    phase (rehearsal `npm run release:publish -- --dry-run` naming every package of the release);
    **publish: the owner's.**
    **Commit:** `docs: remove the rfc-address goal, spec, questions, evidence and plan — implemented`

## Appendix A — every rule, its test, its mutation

Each mutation is made in production code (or the type, for a contract), the named test seen red,
then reverted.

| Id | Rule (spec) | Test | Mutation |
|---|---|---|---|
| T1 | RFC has no `url` (§1) | structural assignment of a non-literal with `url` | drop `url?: never` from `ISapRfcLogon` |
| T2 | RFC states `client` (§1) | RFC without `client` | make `client` optional |
| T3 | RFC states `language` (§1) | RFC without `language` | make `language` optional |
| T4 | application server: `ashost` and `sysnr` (§1) | without `sysnr`; without `ashost` | make each optional, one at a time |
| T5 | message server: `group` (§1) | without `group` | make `group` optional |
| T5a | message server: `mshost` (§1) | without `mshost` | make `mshost` optional |
| T5b | a service is required (§1) | neither `msserv` nor `sysid` | add a third arm `{ msserv?: string; sysid?: string }` |
| T6 | `msserv` alone is a service (§1) | sole-`msserv` compiles | remove the `{ msserv: string; sysid?: string }` arm |
| T7 | `sysid` alone is a service (§1) | sole-`sysid` compiles | remove the `{ msserv?: string; sysid: string }` arm |
| T8 | one address (§1) | keys of both addresses | drop `mshost?: never` from the application server; then `ashost?: never` from the message server |
| T9 | HTTP takes no RFC key (§1) | per key: a structural assignment of a non-literal value carrying it | drop each `?: never` from `ISapHttpConfig`, one at a time |
| T10 | `getBaseUrl` may be `undefined` (§3) | `undefined` implementer conforms | return type back to `Promise<string>` |
| T11 | the seven means (§4) | each field compiles | remove each field, one at a time |
| C1 | `lang` is `language` (§2) | language case | `lang: 'EN'` |
| C2 | `SAP_SYSNR` not read (§2) | environment case | read `process.env.SAP_SYSNR` |
| C3 | no `client` default (§2) | client case | `client || '000'` |
| C4 | no `group` default (§2) | group case | `group || 'PUBLIC'` |
| C5 | `msserv`, `sysid`, `saprouter` exactly as stated (§2) | each presence case | drop each, one at a time |
| C5a | no trimming (§2) | padded value case | trim the values |
| C6 | logon spread over the stated address (§2) | `rfcConversationFrom` with a fake client | build the client from the address alone; then from the logon alone |
| C7 | establishment reads no URL (§2) | RFC connect without `url` | read `getBaseUrl()` in `establishSession` and throw on `undefined` |
| C8 | no URL parsed for RFC (§2) | RFC construction | parse `url` for every config |
| C9 | the HTTP transport's own base URL (§2) | CSRF fetch, preflight, logoff cases | take the base from a context field, each request on its own |
| C10 | the signature names the address (§2) | per-field signature cases | leave out each of `connectionType`, the seven, `client`, `language`, one at a time |
| S1 | each of the seven read (§4) | ABAP and XSUAA read cases | drop each from `CONNECTION_FIELDS`, one at a time |
| S2 | the suffixes (§4) | variable-name case per field | change each suffix, one at a time |
| S3 | the file wins, `''` included (§4) | fallback cases | prefer the fallback over a present `''` |
| S4 | written (§4) | `setDestination` write case per field | skip each field in the write |
| S5 | removed (§4) | `setDestination` `null` case per field | skip each field in the removal |
| B1 | the broker forwards the seven (§4) | characterization with a real store | filter the means by an allowlist without them |
| K1 | `AdtBatchConnection` forwards `undefined` (§3) | characterization | answer `''` for `undefined` |
| K2 | `isCloudEnvironment` falls back without a URL (§3) | characterization | treat `undefined` as on-premise |
| K3 | the test config reads the wire first (§6) | RFC case without `SAP_URL` | require `SAP_URL` before the wire |
| K4 | RFC test config refuses `SAP_URL` (§6) | refusal case | drop the check |
| K5 | RFC test config needs `SAP_LANGUAGE` (§6) | case | drop the check |
| K6 | `connectionSpec` builds per branch (§9) | type check of the spec literal | capture `config` before the branch (cast-free build fails) |
| K7 | the test config's other refusals (§7.1, .4–.6) | one case per refusal: HTTP with an RFC key, two addresses, no address, each incomplete half | skip each check, one at a time |
| K8 | RFC test config without `SAP_CLIENT` refused (§6) | case | drop the check |
| P1 | CLI over environment (§5) | per key | read the environment first |
| P2 | environment over means (§5) | per key | rank means first |
| P3 | means over YAML (§5) | per key | rank YAML first |
| P4 | blank is unset, values trimmed (§5) | blank and padded cases | keep a blank; skip the trim, each on its own |
| P5 | the `.env` does not reach `process.env` (§5) | hydration case per key | put each key back into `ENV_FILE_CONTEXT_KEYS`, one at a time |
| P6 | two destinations keep their own values (§5) | two-destination suite | read client and language from `process.env` |
| P7 | master language from the destination (§5) | two-destination master-language case | read `process.env.SAP_LANGUAGE` |
| P8 | HTTP / SSE refuse the stdio-only options (§5) | each option and YAML key | remove each from `DESTINATION_OPTIONS_REMOVED`, one at a time |
| U1 | preview paths without origin (§8) | path case | prefix `''` with `new URL` |
| U2 | an absolute system service URL kept (§8) | absolute case | strip its origin |
| U3 | `origin: 'unknown'` and the note (§8) | answer fields | drop each, one at a time |
| U4 | injected identity from `system` (§8) | injected without URL, with `system` | ignore the option |
| U5 | injected without URL and `system` refused (§8) | refusal case | fall back to `''` |
| U6 | a fresh connection keeps the injected identity (§8) | fresh-connection case | compute the caller from the fresh connection |
| U7 | runs keyed by system (§8) | collision case | key by client and user only |
| R1 | HTTP with an RFC key refused (§7.1) | per key | skip the check |
| R2 | HTTP without URL refused (§7.2) | case | skip it |
| R3 | RFC with the destination's `SAP_URL` refused (§7.3) | case | skip it |
| R4 | RFC with `XSUAA_MCP_URL` refused (§7.3) | case | skip it |
| R5 | a key's URL not read over RFC (§7 matrix) | key-URL row | ask the URL store over RFC |
| R6 | the environment's `SAP_URL` not read (§7 matrix) | environment row | read `process.env.SAP_URL` |
| R7 | two addresses refused (§7.4) | `SAP_ASHOST` + each message-server key; `SAP_SYSNR` + `SAP_MSHOST` | skip the check; then check only `SAP_ASHOST` |
| R8 | no address refused (§7.5) | case | skip it |
| R9 | incomplete application server (§7.6) | without `SAP_SYSNR`; without `SAP_ASHOST` | skip each half |
| R10 | incomplete message server (§7.6) | without `SAP_GROUP`; without both services; `SAP_MSSERV` without `SAP_MSHOST` | skip each, one at a time |
| R11 | RFC without `SAP_CLIENT` / `SAP_LANGUAGE` (§7.7) | each | skip each |
| R12 | cloud with RFC refused (§7.8) | case | skip it |
| R13 | certificate on RFC refused (§7.9) | `readSettings` and `credentialFromSapConfig` cases | skip each site's narrowing |
| R14 | connection type before the settings (§7) | ordering case | check it after `checkAndSummarise` |
| R15 | the first failing step answers (§7) | one case per pair of steps that can fault together: 1+2 (HTTP with an RFC key and no URL); 3 with 4, 5, 6 and 7; 4+6 (both addresses, one incomplete); 4, 5, 6 each with 7; 8 with 3–7; 9 with 3–8. Not applicable, since the faults exclude each other: 1/3 and 2/3 (HTTP vs RFC), 4/5 and 5/6 (an address stated vs none) | swap the two steps' order, one pair at a time |
| R16 | every faulty key of a step named (§7) | multi-key case per step | stop at the first key |
| X1 | the RFC system key per address (§8) | per-field cases | leave out each field, one at a time |
| X2 | the destination's background `system` (§8) | destination case | take `settings.url` |
| X3 | a refusal never quotes a value (§7) | sentinel case per refusal | put the value into one case's words |
| X4 | each case its own words (§7) | words per case | render two cases with one sentence |
| X5 | the summary shows the address over RFC (§8) | summary case | skip the RFC lines |
| X6 | branch-local construction, no cast (§9) | `rfcConfigConstruction.test.ts` (step 19): assertion and pre-narrowing findings | add an `as SapConfig` in `connectionFactory`; then build `config` in a common object before the branch — each reported |
| X7 | omission, not `undefined` (§9) | `rfcConfigConstruction.test.ts`: forbidden-property finding; the loose-config compile case | set `url: undefined` in `readSettings`' RFC literal — reported |
| X8 | no cross-shape spread (§9) | `rfcConfigConstruction.test.ts`: spread finding by the checker's type | spread the HTTP settings into the RFC literal — reported |
| X9 | the live helper's refusals (§6, §7) | one unit case per refusal case | skip each check, one at a time |
