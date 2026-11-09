# Spec: an RFC destination states its own address

Goal: `2026-11-08-rfc-address-goal.md`. This file is the specification only. Beside it:
`2026-11-08-rfc-address-questions.md` (the questions, their options and the answer taken) and `2026-11-08-rfc-address-evidence.md` (the code this spec rests on,
`E.n` below). Text marked *(decision Qn)* carries the answer to question Qn of the questions file.

## 1. The contract: `ISapConfig` as a union (interfaces-auth-sap 4.0.0)

Carries: *One shape per connection type*, *Stated, never derived*, *The logon is stated too*,
*No key that does not belong* (by type). Evidence: E.1.

```ts
/** What every destination may state, whatever its wire. All `string`, as today. */
interface ISapConfigBase {
  authType: SapAuthType;
  username?; password?; jwtToken?; refreshToken?; sessionCookies?;
  certPath?; certKeyPath?; certPfxPath?; certPassphrase?;
  kerberosSpn?; kerberosService?;
  sncPartnerName?; sncQop?; sncLib?; sncMyName?;
  uaaUrl?; uaaClientId?; uaaClientSecret?;
}

/** HTTP: the URL; no RFC key. */
interface ISapHttpConfig extends ISapConfigBase {
  connectionType?: 'http';                      // (decision Q1)
  url: string;
  client?: string;
  ashost?: never; sysnr?: never; mshost?: never; msserv?: never;
  sysid?: never; group?: never; saprouter?: never; language?: never;
}

/** What every RFC destination states besides its address. */
interface ISapRfcLogon extends ISapConfigBase {
  connectionType: 'rfc';
  client: string;
  language: string;
  saprouter?: string;
  url?: never;
}

/** One application server. */
interface ISapRfcApplicationServer extends ISapRfcLogon {
  ashost: string;
  sysnr: string;
  mshost?: never; msserv?: never; sysid?: never; group?: never;
}

/** A message server, its service named by msserv, sysid or both, and a logon group. */
type ISapRfcMessageServer = ISapRfcLogon & {
  mshost: string;
  group: string;
  ashost?: never; sysnr?: never;
} & ({ msserv: string; sysid?: string } | { msserv?: string; sysid: string });

type ISapRfcConfig = ISapRfcApplicationServer | ISapRfcMessageServer;
type ISapConfig = ISapHttpConfig | ISapRfcConfig;
```

- **Names.** `ISapConfig` keeps its name and becomes the union; the six names above are
  exported beside it. `SapConnectionType` is unchanged.
- **The discriminant.** `connectionType === 'rfc'` narrows to `ISapRfcConfig`; anything else —
  `'http'` or absent — is `ISapHttpConfig`. An existing HTTP literal compiles unchanged *(decision Q1)*. That a destination states its connection type is the server's rule, not
  the type's (§7).
- **Field names** are the SAP NW RFC SDK's (`ashost`, `sysnr`, as `mshost` … `saprouter`
  already are), except `language`, the name `IConnectionConfig` and `SAP_LANGUAGE` use;
  connection maps it to the SDK's `lang` (§2).
- **`language` is new**, required on RFC, absent on HTTP. **`saprouter` leaves the HTTP shape**:
  it is an RFC SDK parameter that no HTTP wire reads.
- **The authentication fields stay common to both shapes** (auth per wire is out of the goal's
  scope); `ICertificateMaterialLoader.load` keeps taking `ISapConfig`.
- **Types and constants only** (the owner's rule for this package); the compile-only checks of
  §12 prove the shape.
- **Semver: 4.0.0.** CHANGELOG with "Migrating to 4.0.0": narrow on `connectionType` before
  reading `url`; an RFC config states `client`, `language` and one address; `ashost` / `sysnr`
  are new; `saprouter` and `language` are RFC-only.

## 2. connection 20.0.0

Carries: *Stated, never derived*, *What an RFC destination states is what the logon gets*,
*RFC works without a URL*. Evidence: E.2.

- **`rfcParamsFrom(config: ISapRfcConfig): RfcAddress`** reads as given:
  - application server → `{ ashost, sysnr, client, lang: language, saprouter? }`;
  - message server → `{ mshost, msserv?, sysid?, group, client, lang: language, saprouter? }`,
    each of `msserv`, `sysid`, `saprouter` present exactly when the config states it;
  - no default (`'000'`, `'EN'`, `'PUBLIC'` are gone), no derivation (no URL parsed, no `8000`
    subtracted), no read of `process.env` (`SAP_SYSNR` is gone), no trimming;
  - it refuses nothing: its parameter is typed and the type proves the address complete. Data
    from outside the type system is checked where it is read (§6). The two plain-`Error` throws
    are removed.
  - `RfcMessageServerParams` takes the "msserv, sysid or both" shape of §1.
- **`rfcConversationFrom(config: ISapRfcConfig)`** spreads the provider's logon parameters over
  that address, as today; nothing else is added.
- **The specs correlate wire and shape.** `CloudHttpSpec.config` and `OnPremHttpSpec.config`
  are `ISapHttpConfig`; `OnPremRfcSpec.config` is `ISapRfcConfig`. `createConnection` builds the
  HTTP address (`client`, `baseUrl: config.url`) inside the HTTP branches only.
- **The URL is the HTTP wire's, statically.**
  - The HTTP transports (`HttpTransport` and its subclasses) take `baseUrl: string` as a
    required constructor option; every request they originate (the CSRF fetch, the cloud
    preflight, the logoff) uses it. `IAdtSessionContext` loses `baseUrl`.
  - `CredentialAbapConnection.establishSession` no longer reads `getBaseUrl()`; it hands the
    transport the session context alone, the same for every wire.
  - `AbstractAbapConnection` holds `baseUrl: string | undefined`: the origin of `url` for an
    `ISapHttpConfig` (an unparsable URL refused as today: a value rule), `undefined` for an
    `ISapRfcConfig`. No URL is invented.
  - `getBaseUrl(): Promise<string | undefined>`, `undefined` exactly when the config is RFC
    (§3).
- **`sapConfigSignature`** includes `connectionType` and, over RFC, every address field, `client`
  and `language`.
- **Dependencies** (registry): `interfaces-auth-sap` `^4.0.0`, `interfaces-adt-connection`
  `^4.0.0`.
- **Semver: 20.0.0.** `docs/MIGRATION-20.0.md`: a consumer that relied on the URL-port
  convention, on `SAP_SYSNR`, or on `'000'` / `'EN'` / `'PUBLIC'` states `ashost` + `sysnr` (or
  `mshost` + `msserv` / `sysid` + `group`), `client` and `language`; hand-built HTTP transports
  take `baseUrl`; `getBaseUrl()` may answer `undefined`; `IAdtSessionContext` has no `baseUrl`.

## 3. URL absence in the connection contract (interfaces-adt-connection 4.0.0)

**The owner's explicit decision** (static types first): the absence of a URL is in the type.
The goal requires that RFC works without a URL; it does not by itself force this contract
change. Evidence: E.3.

- **`IAbapConnection.getBaseUrl(): Promise<string | undefined>`**: the system's HTTP origin,
  `undefined` for a connection that has none (RFC). An implementer answering a string still
  conforms; a caller narrows.
- **Semver: 4.0.0** (a caller of `getBaseUrl()` no longer compiles unchanged).
- **The ripple**, each from the registry:
  - `interfaces-adt`: range `^3.0.0 || ^4.0.0`, a minor (its exported types do not reach
    `IAbapConnection`).
  - `adt-strategies`: range widening, a minor (it does not read `getBaseUrl`).
  - `adt-clients-legacy`, a minor: its `interfaces-adt-connection` range widens to
    `^3.0.0 || ^4.0.0`, and its `adt-clients` peer range to `^43.1.0 || ^44.0.0` (its
    devDependency moves to `^44.0.0`). Accepting the new peer is no major of its own: it reads
    no `getBaseUrl` (E.3). Published after adt-clients 44.0.0.
  - `adt-clients` 44.0.0: `AdtBatchConnection.getBaseUrl()` answers `Promise<string |
    undefined>` (a widened return type of an exported class). `isCloudEnvironment` already
    skips a falsy URL and goes to its `systeminformation` fallback (E.3); only its types follow.
    Its test boundary changes per §6.

## 4. The destination path: broker and stores *(decision Q2)*

Carries: *The whole path carries it*. Evidence: E.4.

- **interfaces-auth-broker 1.4.0** (minor): `IConnectionConfig` gains the optional means
  `ashost`, `sysnr`, `mshost`, `msserv`, `sysid`, `group`, `saprouter` (`?: string | undefined`,
  as its other means); `language` and `sapClient` exist. Range on interfaces-auth-sap widens to
  `|| ^4.0.0`.
- **auth-stores** (minor): `EnvDestinationStore` adds the seven to `CONNECTION_FIELDS` with the
  suffixes `ASHOST`, `SYSNR`, `MSHOST`, `MSSERV`, `SYSID`, `GROUP`, `SAPROUTER` (`SAP_…` for
  ABAP, `XSUAA_…` for the XSUAA set, as every field), so its read, fallback merge and
  `setDestination` carry them. No store requires or refuses them: a store holds means; the
  consumer validates. Ranges: `interfaces-auth-broker` `^1.4.0`, `interfaces-auth-sap`
  `|| ^4.0.0`.
- **auth-broker** (minor, ranges only): `getConnectionConfig` already answers every means field
  the store gives.
- **auth-providers**: unchanged *(decision Q9)*.

## 5. The server: keys, sources and precedence

Carries: *Every source says the same*, *Stated, never derived*. Evidence: E.5.

- **The destination keys of this change**: the RFC address keys `ashost`, `sysnr`, `mshost`,
  `msserv`, `sysid`, `group`, `saprouter` (env `SAP_ASHOST` … `SAP_SAPROUTER`, CLI `--ashost` …,
  YAML `ashost` …), and `client`, `language` (`SAP_CLIENT`, `SAP_LANGUAGE`, `--client`,
  `--language`, YAML `client`, `language`) *(decision Q6)*. One list replaces
  `MESSAGE_SERVER_FIELDS` / `MESSAGE_SERVER_ENV`.
- **Precedence, for each key:** the CLI, then the **original** process environment, then the
  destination's own value (its means: its `.env`, then a service key's fallback), then YAML;
  trimmed; blank is unset *(decision Q2, Q6)*.
- **Provenance: the destination's file never becomes the environment.** `ENV_FILE_CONTEXT_KEYS`
  loses `SAP_CLIENT`, `SAP_LANGUAGE`, `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP` and
  `SAP_SAPROUTER`, and does not gain `SAP_ASHOST` / `SAP_SYSNR`: the store reads them from the
  file as means. Only `SAP_CONNECTION_TYPE` and `SAP_SYSTEM_TYPE` stay bridged (they decide the
  start before any destination is read). A value in the environment rank is therefore one the
  process was started with, and no destination's file can rank above another destination's
  means.
- **The master language** of created objects defaults to the destination's effective
  `SAP_LANGUAGE` (the same precedence), handed to the system context with the destination's
  settings, no longer read from a hydrated `process.env`; over HTTP it stays optional. Over RFC
  the same value is the logon language.
- **The system number is read from the destination's `.env`** exactly as the rest of the
  address.
- **`SAP_GROUP` has no default**: a message-server destination states it.
- **The HTTP and SSE binaries** refuse `--ashost`, `--sysnr`, `--client`, `--language` and YAML
  `ashost`, `sysnr`, `client`, `language` as stdio-only, beside the message-server options. No
  `x-sap-*` RFC header is defined; none is read or refused *(decision Q10)*.

## 6. The boundary map

Carries: *One shape per connection type*: input from outside the type system is checked where it
is read; past it nothing checks again. Evidence: E.6.

| Source | Where it enters the type system | Who checks |
|---|---|---|
| stdio destination: means, URL sources (§7 matrix), start parameters | `AuthBrokerFactory.readSettings` | the server, §7, before any connection opens |
| server live tests: environment, `test-config.yaml` | `configHelpers.getSapConfigFromEnv` | the helper, §7's cases in its own words |
| adt-clients tests: environment, `test-config.yaml` | `sessionConfig.getConfig` | the helper (below) |
| HTTP / SSE: `x-sap-*` headers | `credentialFromHeaders` | the server: `x-sap-url` required as today; result `ISapHttpConfig` |
| embedder: a typed `SapConfig` (`setConfigOverride`, `createAbapConnection`, exported factories) | the embedder's code | the embedder; typed, not checked again |
| embedder: an injected `IAbapConnection` / `freshConnection` | the embedder's code | the embedder; `getBaseUrl()` read as typed (§8) |
| any other consumer of connection reading untyped data | that consumer | that consumer; connection's typed API refuses nothing |

- **adt-clients' test boundary.** `getConfig` reads the connection type first, then per wire:
  HTTP requires `SAP_URL` as today; RFC reads `SAP_ASHOST` + `SAP_SYSNR` or the message-server
  keys, `SAP_CLIENT`, `SAP_LANGUAGE`, refuses `SAP_URL` and the cases of §7 (keys only), and
  builds an `ISapRfcConfig` literal. `connectionSpec` builds each spec's `config` inside its
  branch, from a config already narrowed (§9). Its `test-config.yaml.template`,
  `docs/development/RFC_TESTING.md`, `RUNNING_TESTS.md` and README describe the RFC keys (§10).
- The server's README and `docs/architecture` state the embedder rows: an embedder that reads
  configuration from outside the type system validates it before building an `ISapConfig`.

## 7. The server: refusals

Carries: *A refusal names what is missing*, *No key that does not belong*, *The logon is stated
too*. Evidence: E.5, E.6.

- **The connection type is decided first.** The start refuses an absent connection type for a
  destination before reading its settings (the check moves ahead of `checkAndSummarise`; neither
  sends anything). `readSettings` takes a stated `'http' | 'rfc'` and builds the shape literally.
- **The URL sources** *(decision Q5)*:

  | URL source | HTTP destination | RFC destination |
  |---|---|---|
  | `SAP_URL` in the destination's own `.env` (`--env` file, `sessions/<name>.env`) | its URL | refused, naming `SAP_URL` |
  | `XSUAA_MCP_URL` in `sessions/<name>.env` (an XSUAA key) | its URL | refused, naming `XSUAA_MCP_URL` |
  | an ABAP service key's `url`, as the store's fallback | its URL when the `.env` states none | not read |
  | an XSUAA service key's `url` | never read (as today) | never read |
  | `SAP_URL` in the process environment | not read (as today) | not read |

  "States" means present and not blank. Over RFC the server reads the destination's own file for
  these two keys and asks the URL store nothing.
- **The checks, in order**, each its own refusal, all before any connection opens; several
  faults of one step are named together, the first failing step answers:
  1. HTTP stating an RFC address key (any of the seven, any source) → names each.
  2. HTTP without a URL → today's refusal naming the URL key.
  3. RFC stating a URL (matrix above) → names the key.
  4. RFC with keys of both addresses (`SAP_ASHOST` or `SAP_SYSNR` beside any of `SAP_MSHOST`,
     `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`) → names every stated key of both.
  5. RFC with no address key → names both alternatives.
  6. An incomplete address → names what is missing: the other of `SAP_ASHOST` / `SAP_SYSNR`;
     beside `SAP_MSHOST`, `SAP_GROUP` and "`SAP_MSSERV` or `SAP_SYSID`"; `SAP_MSHOST` beside
     `SAP_MSSERV` / `SAP_SYSID` / `SAP_GROUP`.
  7. RFC without `SAP_CLIENT` or `SAP_LANGUAGE` → names the missing ones.
  8. ABAP Cloud with RFC → names `SAP_SYSTEM_TYPE`, `SAP_CONNECTION_TYPE` *(decision Q8)*.
  9. The certificate credential on an RFC destination → names `SAP_AUTH_TYPE`,
     `SAP_CONNECTION_TYPE` *(decision Q9)*; the same check in
     `credentialFromSapConfig`, which narrows on `connectionType` before building a
     `CertificateAuthProvider`.
- **The words** name keys, never values, and say which case it is:
  - `Destination "<d>" is HTTP and states RFC address keys, which HTTP does not take: <keys>`
  - `Destination "<d>" is RFC and states <URL key>, which an RFC destination does not take`
  - `Destination "<d>" states two RFC addresses — an application server and a message server: <keys>`
  - `Destination "<d>" is RFC and states no address: set SAP_ASHOST and SAP_SYSNR, or SAP_MSHOST with SAP_MSSERV or SAP_SYSID and SAP_GROUP`
  - `Destination "<d>" is RFC and its address lacks: <keys>`
  - `Destination "<d>" is RFC and lacks: <keys>`
  - `Destination "<d>" is ABAP Cloud over RFC, which ABAP Cloud does not offer: SAP_SYSTEM_TYPE, SAP_CONNECTION_TYPE`
  - `Destination "<d>" logs on with a client certificate over RFC, which the RFC wire does not take: SAP_AUTH_TYPE, SAP_CONNECTION_TYPE`
  Each key by its env name, with its CLI and YAML forms in the case's fixed hint.
- **The carrier.** The server's own class `DestinationAddressRefusal` carries the destination,
  the case (a closed union of the nine) and the keys; `destinationFailureOf` renders it into the
  words above and the `destination_refused` answer, for the start and a tool call alike.
- **Removed**: `rfcAddressRefusalFor`, `rfcAddressRefusalOf`, `RfcAddressRefusal` and their uses.

## 8. The server: RFC without a URL

Carries: *RFC works without a URL*. Evidence: E.7.

- **System information** goes over the RFC wire as a path; nothing on the way reads or builds a
  URL (§2).
- **The system key** `adtSystemKey(settings)`: HTTP `['http', url, client]`, RFC `['rfc', ashost,
  sysnr, mshost, msserv, sysid, group, saprouter, client]` (absent fields as `''`), chosen by
  narrowing on `connectionType`. It keys the header pairs, the system information and the
  background-run identity.
- **The background-run caller** is `{ system, client, user }`, `system` the system key
  *(decision Q4)*:
  - a destination's caller takes it from its settings;
  - an injected connection's from `getBaseUrl()` when it answers a URL (`['http', url, '']`),
    else from a new `EmbeddableMcpServerOptions.system: string` the embedder states; with
    neither, background runs are refused `background_runs_unavailable`, fixed words naming
    `system`;
  - a run on a fresh connection carries the caller computed from the injected context before it
    starts, as today.
- **`GetServiceBindingPreviewUrl` over RFC** *(decision Q3)*: `service_url`,
  `metadata_url` and `preview_url` are the path and query (starting with `/`), except a service
  URL the system answered absolute, which is kept; the V4 descriptor's `servicePath` is read from
  that path without `new URL`; the answer adds `origin: 'unknown'` and the note "The destination
  is RFC and states no URL: prefix the system's HTTP origin."; the description adds "Over RFC,
  the URLs are answered as their paths and query, to prefix with the HTTP origin of the system."
- **The managed connection's cache** follows connection's signature (§2).
- **The start summary** shows the address fields over RFC where it shows the URL over HTTP.
- **The debug line** in `utils.ts` and the leftover-session identity narrow on `connectionType`.
- **Every `getBaseUrl()` forwarder** passes `string | undefined` through, typed.

## 9. Building the union without casts

Carries: *One shape per connection type* for every builder. Evidence: E.8.

- **Branch-local construction.** A config is built inside the branch that narrowed
  `connectionType`, as a literal of that shape; no common object holds `config` before the wire
  is known (`connectionFactory` in the server, `connectionSpec` in adt-clients).
- **Omission, not `undefined`.** A key that does not belong is omitted, never set to `undefined`:
  without `exactOptionalPropertyTypes` (the server and connection) `?: never` accepts
  `undefined`; only absence satisfies both modes.
- **No whole-object spread across shapes.** A builder copies its own shape's fields; it never
  spreads a value of the other shape or of the whole union into a branch literal.
- **No cast** in production code; a test needing an ill-typed value uses `@ts-expect-error`.

## 10. Docs

Carries: *The docs describe the new contract only*. Locations: E.9.

- **Server:** `README.md`, `docs/installation/RFC_SETUP.md`, `INSTALLATION.md`,
  `examples/README.md`, `CLINE_CONFIGURATION.md`, `docs/user-guide/CLIENT_CONFIGURATION.md`
  (including its list of bridged keys), `CLI_OPTIONS.md` (rows for `--ashost`, `--sysnr`,
  `--client`, `--language`), `docs/configuration/YAML_CONFIG.md`, `docs/deployment/DOCKER.md`
  (bridged keys), `docs/architecture/` (§6's embedder rows), the launcher help and examples, the
  parameter help, the preview tool's description. Every RFC example states `SAP_ASHOST`,
  `SAP_SYSNR`, `SAP_CLIENT`, `SAP_LANGUAGE` and no `SAP_URL`; nothing names the `80NN`
  convention, `SAP_SYSNR` as process-only, or `PUBLIC` as a default.
- **`docs/MIGRATION-24.0.md`**, section "RFC destinations: the address is stated": the keys and
  precedence of §5, the refusals of §7; an existing RFC destination removes `SAP_URL`, adds
  `SAP_ASHOST` (the host of its `SAP_URL`) and `SAP_SYSNR` (the two digits of its port, `80NN` →
  `NN`, or the `SAP_SYSNR` it had in the environment), `SAP_CLIENT` if it relied on `000`,
  `SAP_LANGUAGE` if it relied on `EN`, `SAP_GROUP` if it relied on `PUBLIC`; a destination's
  `.env` no longer feeds the process environment for client, language and address; an HTTP
  destination stating an RFC key (`SAP_SAPROUTER` included) removes it; embedders: the union,
  connection 20, `getBaseUrl()` answering `undefined`, the background caller's `system`, the
  preview answer over RFC, the embedder rows of §6.
- **`CHANGELOG.md` 24.0.0**: "Changed — breaking for an RFC destination" and an embedder block.
- **connection:** README `rfcConversationFrom` section and migration index; `docs/USAGE.md`
  (the "derives `ashost` and `sysnr`" sentence and the RFC row); new `docs/MIGRATION-20.0.md`;
  `MIGRATION-6.0.md` and `MIGRATION-18.0.md` keep their text as history with one line at the top
  of their RFC section: "Superseded by 20.0.0: the address is stated, see MIGRATION-20.0."
- **adt-clients:** `test-config.yaml.template`, `docs/development/RFC_TESTING.md`,
  `RUNNING_TESTS.md`, README's variable list; `docs/usage/RFC_CONNECTION.md`: its example
  config states `connectionType: 'rfc'`, `ashost`, `sysnr`, `client`, `language` and no `url`;
  the "derives the connection parameters from the URL" list becomes "takes the address as
  stated"; the sentence that `connectionType: 'rfc'` was removed in connection 6.0.0 says it
  is the union's discriminant since interfaces-auth-sap 4 / connection 20 (the wire is still an
  argument); CHANGELOG 44.0.0 with migration notes. adt-clients-legacy: CHANGELOG (the widened
  ranges).
- **interfaces-auth-sap, interfaces-adt-connection, interfaces-auth-broker, auth-stores:**
  CHANGELOG entries with migration notes; READMEs list the new names / variables.
- `CLAUDE.md` files change only with the owner's approval of the text.

## 11. Release order

Carries: *The whole path carries it*: registry only, each consumer after what it depends on is
on the registry.

1. **Contracts:** `interfaces-auth-sap` 4.0.0 and `interfaces-adt-connection` 4.0.0; then
   `interfaces-auth-broker` 1.4.0 and `interfaces-adt` (range minor).
2. **connection** 20.0.0.
3. **Stores and clients:** `auth-stores`, `adt-strategies`; then `auth-broker` and
   `adt-clients` 44.0.0 (adt-clients depends on connection for its tests); then
   `adt-clients-legacy` (its peer and devDependency name adt-clients 44).
4. **auth-providers** — none *(decision Q9)*.
5. **The server**: mcp-abap-adt 24.0.0 and its sibling packages, installed from the registry;
   the lockfile checked for `"link": true` outside the repository's own packages.

## 12. Tests

Unit, in each package's own runner; each rule proved load-bearing by breaking it once.

- **interfaces-auth-sap** (compile-only, with `exactOptionalPropertyTypes` on and, in a second
  check config, off): both RFC shapes without `url` compile; with `url`, without `client` or
  `language`, `ashost` without `sysnr`, `mshost` without `group`, `mshost` with neither `msserv`
  nor `sysid`, keys of both addresses — each `@ts-expect-error`; `msserv` with `sysid` compiles;
  HTTP with any RFC key or `language` fails; an HTTP literal without `connectionType` compiles
  and narrows to `ISapHttpConfig`; `url: undefined` on RFC fails with the flag on (the off-mode
  result recorded as §9's reason); a spread of `ISapConfigBase` into each branch literal and a
  fieldwise composition compile; a spread of an `ISapHttpConfig` into an RFC literal fails.
  `sncTypes.ts` loses its `url`.
- **interfaces-adt-connection:** an implementer answering `Promise<string>` conforms; assigning
  the answer to `string` fails.
- **connection:** `rfcParamsFrom` answers exactly what each shape states; `SAP_SYSNR` in the
  environment changes nothing; no default; nothing throws. An RFC connection from a config
  without `url` and a fake conversation connects (establishment reads no URL), carries a request
  path, answers `getBaseUrl()` with `undefined`; an HTTP connection answers its origin; HTTP
  transports use their constructor's base URL for the CSRF fetch, preflight and logoff.
  `sapConfigSignature` differs per address field, client and language. Each spec refuses the
  other shape (type check).
- **adt-clients:** `isCloudEnvironment` with `undefined` goes to the fallback;
  `AdtBatchConnection` forwards `undefined`; `getConfig` per §6, its refusals keys only.
- **auth-stores:** the seven variables read, merged with a fallback and written, for the ABAP
  and XSUAA sets.
- **server:**
  - keys from every source with §5's precedence; a destination `.env` does not reach
    `process.env` for client, language or address keys;
  - **two destinations in one process** (two factories, or two `readSettings` calls), their
    `.env` files differing in client, language and address, the process environment stating
    none: each gets its own values, and each one's master-language default is its own;
  - each refusal of §7 with its words, keys only (a sentinel value never appears); each row of
    the URL matrix; the connection type refused before the destination check; HTTP / SSE refuse
    the new stdio-only options;
  - the RFC system key differs per address; system information over a fake RFC connection
    without a URL; the start summary over RFC; the preview tool over RFC;
  - background runs: a destination RFC caller and an injected one (with `system`, and refused
    without it) carry their identity; two systems with the same client and user never share a
    run in one store; a fresh connection's run keeps its injected identity;
  - the certificate refusal in both places; `rfcAddressRefusal*` absent; the live helper's
    refusals;
  - existing suites that change: `src/__tests__/unit/config/rfcMessageServer.test.ts`,
    `server-runtime/src/stdio/__tests__/rfcMessageServerParameters.test.ts`,
    `rfcMessageServerChain.test.ts`, `config/envFileContext.test.ts`,
    `unit/adtHeaders/adtHeadersEntry.test.ts`, the leftover-session harness.

Live, named here, written in the plan, run only on the owner's go *(scope: decision Q11)*:

- **RFC with SNC on the on-premise test system**, application-server address, `SAP_CLIENT`,
  `SAP_LANGUAGE`, no `SAP_URL`: the server starts, system information answers, the RFC live
  suite runs through the server's tools, the preview tool included.
- **The same with basic over RFC.**
- **A message-server destination**, measured live when its message server is reachable from the
  test machine; otherwise the docs say the message-server path is unit-tested only.
- **An old-style RFC destination** (`SAP_URL`, no address) refused at start with §7's words,
  before anything is sent.

## 13. Trace and acceptance

| Invariant of the goal | Carried by |
|---|---|
| Stated, never derived | §1, §2, §5 |
| The logon is stated too | §1, §5, §7 |
| No key that does not belong | §1, §7 |
| One shape per connection type | §1, §6, §9 |
| A refusal names what is missing | §7 |
| Every source says the same | §5 |
| What an RFC destination states is what the logon gets | §2 |
| The whole path carries it | §3, §4, §11 |
| RFC works without a URL | §2, §3, §8 |
| The docs describe the new contract only | §10 |

Accepted when: no `8000` derivation, no `process.env` read and no `'000'` / `'EN'` / `'PUBLIC'`
default remain in connection's RFC path; no doc describes the URL-port convention as current;
every package of the release resolves from the registry; the unit runs are green; the live
checks of §12 ran green on the owner's go — the application server with SNC and with basic, and
the message server if reachable, else documented as unit-tested.
