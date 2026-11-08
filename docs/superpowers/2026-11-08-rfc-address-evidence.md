# Evidence: an RFC destination states its own address

Companion of `2026-11-08-rfc-address-spec.md`. Each claim about today's code is **Code**
(`file:line`, read at the current HEAD of each local clone) or **Inference**. Server paths are
relative to the mcp-abap-adt worktree; other repositories are named by package.

## E.1 interfaces-auth-sap

- `ISapConfig` is one interface: `url: string` required; `client?`, `connectionType?`,
  `mshost?`, `msserv?`, `sysid?`, `group?`, `saprouter?` optional; no `ashost`, `sysnr`,
  `language` (Code, `src/sap/ISapConfig.ts:3-45`). `SapConnectionType = 'http' | 'rfc'` (Code,
  `src/sap/SapAuthType.ts:9`). Repository 3.5.0; the server installs 3.4.0 (Code).
- `ICertificateMaterialLoader.load(config: ISapConfig)` (Code, `src/auth/ICertificateMaterialLoader.ts:5`);
  `src/__typechecks__/sncTypes.ts:9-17` builds an RFC config with a `url`.
- `exactOptionalPropertyTypes` on in interfaces (`tsconfig.base.json:12`), auth-broker
  (`tsconfig.base.json:12`), auth-stores (`tsconfig.json:14`), auth-providers
  (`packages/auth-providers/tsconfig.json:12`); not in connection's or the server's tsconfig
  files (Code, grep).

## E.2 connection 19.1.0

- `rfcParamsFrom`: `client || '000'` (`src/connection/rfcConversation.ts:68`), `lang: 'EN'`
  (:83, :102), `group || 'PUBLIC'` (:81), throws without `msserv`/`sysid` (:72-76) and without
  `mshost` and `url` (:88-92), `ashost` from the URL, `sysnr` = port − 8000 (:94-96),
  `process.env.SAP_SYSNR` override (:100).
- `AbstractAbapConnection` parses `config.url` for every wire (Code,
  `src/connection/AbstractAbapConnection.ts:262-270`); `getBaseUrl()` answers it (:1236-1238);
  the session contexts carry it (:776-779, :2043-2045).
- `CredentialAbapConnection.establishSession` awaits `getBaseUrl()` into the establish context
  for every wire (Code, `src/connection/CredentialAbapConnection.ts:107-122`).
- `createConnection` builds `{ client, baseUrl: spec.config.url }` before choosing the wire
  (Code, `src/connection/createConnection.ts:141`); every spec's `config` is `SapConfig` (:36);
  "ABAP Cloud has one wire, 'http'" (:188).
- `HttpTransport` takes `options: { client?, baseUrl? } = {}` (Code, `src/connection/HttpTransport.ts:391`)
  and reads `context.baseUrl` (:492, :689, :1086); `CloudHttpTransport` reads it (Code,
  `src/connection/CloudHttpTransport.ts:102`, :136). `IAdtSessionContext.baseUrl: string`,
  exported (Code, `src/connection/IAdtTransport.ts:84-86`; `src/index.ts:62`).
- `RfcTransport` carries `request.url` as the URI (Code, `src/connection/RfcTransport.ts:552`),
  reads no `baseUrl` (Code, grep), refuses TLS material at every logon (Code, :502-512).
- `sapConfigSignature` has no RFC address (Code, `src/config/sapConfig.ts:12-40`).
- No HTTP transport reads `saprouter` (Code, grep: only `rfcConversation.ts`).
- Range on interfaces-auth-sap `^3.4.0` (Code, `package.json:57`).

## E.3 interfaces-adt-connection and the ADT clients

- `IAbapConnection.getBaseUrl(): Promise<string>` (Code, interfaces-adt-connection
  `src/IAbapConnection.ts:50`); 3.0.0.
- interfaces-adt 26.0.0 depends on it `^3.0.0` (Code, `package.json:39`) and names
  `IAbapConnection` only in a comment (Code, `src/adt/IAdtTransport.ts:299`).
- adt-strategies, adt-clients-legacy depend on it `^3.0.0` and do not call `getBaseUrl` (Code).
  adt-clients-legacy declares `@mcp-abap-adt/adt-clients` `^43.1.0` as peer and devDependency
  (Code, `packages/adt-clients-legacy/package.json:67`, :70).
- adt-clients: `AdtBatchConnection implements IAbapConnection`, `getBaseUrl(): Promise<string>`
  forwards (Code, `packages/adt-clients/src/batch/AdtBatchConnection.ts:21`, :54-56);
  `isCloudEnvironment` already tests `if (baseUrl)` before reading it and falls back to
  `systeminformation` (Code, `src/utils/systemInfo.ts:205-228`, the guard at :210);
  `getSystemInformation` sends a path (Code, :43, :126-140); `@mcp-abap-adt/connection` `^19.0.0`
  and interfaces-auth-sap are devDependencies (Code, `package.json:129-133`).
- adt-clients' test config: `getConfig` reads `process.env` (Code,
  `src/__tests__/helpers/sessionConfig.ts:121-128`), requires an `http(s)` `SAP_URL` before it
  chooses the wire (:131-133), returns RFC settings with that URL and no address or language
  (:149-166); `connectionSpec` captures `config` in `base` before branching (:594-617). Its
  `test-config.yaml.template:161`, `docs/development/RFC_TESTING.md:84-113` and `README.md:894`
  describe `SAP_URL` for RFC (Code).

## E.4 broker, stores, providers

- `IConnectionConfig` (interfaces-auth-broker 1.3.0): `serviceUrl?`, `sapClient?`, `language?`,
  SNC fields; no address (Code, `src/auth/IConnectionConfig.ts:7-103`). Range on auth-sap
  `^2.0.0 || ^3.0.0` (Code, `package.json:39`); it uses only `IAuthorizationConfig` (Code).
- `EnvDestinationStore` enumerates `CONNECTION_FIELDS` (Code, auth-stores
  `src/stores/destination/EnvDestinationStore.ts:87-118`), maps suffixes (:155-191), reads the
  file (:307), merges only the enumerated fields, a field present in the file winning, `''`
  included (:342-346; header :20-22). No store requires `serviceUrl` (Code, grep).
- auth-broker `getConnectionConfig` copies every non-secret field the store answered (Code,
  `packages/auth-broker/src/AuthBroker.ts:1417-1442`); `basicProvider`, `sncProvider` read no URL
  (Code, `src/destinations.ts:241-257`, :270-300); `issuedFor` is `undefined` without a URL
  (Code, `src/binding.ts:223-246`); only the consumer path requires `serviceUrl` (Code,
  `src/AuthBroker.ts:1336-1349`); the server builds no consumer provider (Code, server
  `server-runtime/src/stdio/auth/brokerFactory.ts:387-401`).
- auth-providers reads the certificate fields of `ISapConfig` (Code,
  `packages/auth-providers/src/credentials/FileCertificateMaterialLoader.ts:13-35`;
  `CertificateAuthProvider.ts:30`, :84); range `^3.5.0` (Code, `package.json:64`); the server's
  6.0.2 `^3.3.0` (Code).

## E.5 The server's keys and sources

- `MESSAGE_SERVER_FIELDS` / `MESSAGE_SERVER_ENV` (Code, `src/lib/config/messageServer.ts:11-27`);
  CLI / env / YAML rows (Code, `server-runtime/src/stdio/config/coreParameters.ts:141-165`);
  re-read after the env file: CLI, environment, YAML, trimmed (Code,
  `server-runtime/src/stdio/launcher.ts:418-459`, :777-783).
- `ENV_FILE_CONTEXT_KEYS`: `SAP_CLIENT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE`, `SAP_LANGUAGE`
  and the five message-server keys, copied from the file into `process.env` never over a set
  value (Code, `server-runtime/src/stdio/config/envFileContext.ts:22-54`, the loop :51-54),
  called at `launcher.ts:761`; no `SAP_SYSNR`.
- One stdio process serves one destination (Code, `launcher.ts:848`).
- `readSettings`: URL from the URL store, refused naming the URL key when absent; client from
  the means; connection type and message-server fields from the start config; `language` not
  read (Code, `brokerFactory.ts:230-264`, the XSUAA note :233). Nothing reads
  `process.env.SAP_CLIENT` or `process.env.SAP_URL` (Code, grep of `src/lib`, `server-runtime/src`).
- URL stores: `--env` file (Code, `server-runtime/src/stdio/auth/destinationStores.ts:131-145`);
  XSUAA key → `XSUAA_MCP_URL` from `sessions/<name>.env`, a store without fallback (:150-169);
  ABAP key → the destination store with the key as fallback (:172-186); `destinationFile` known
  (:144, :149).
- `SAP_LANGUAGE` → master language from `process.env` (Code, `src/lib/systemContext.ts:30`);
  `x-sap-language` over HTTP (Code, `src/lib/httpTransport/headerSource.ts:88-104`).

## E.6 Sources and boundaries

- `DestinationConfigError(destination, [fields], reason)`; rendered `Destination "<d>" cannot be
  used: <fields>` with a hint per field (Code, `server-runtime/src/stdio/auth/destinationFailure.ts:89-151`).
- Settings read before the connection type is checked (Code, `launcher.ts:648-697`, :855,
  :883-889); an absent connection type for a destination refused (:884).
- HTTP / SSE: `credentialFromHeaders` builds `{ url, client, authType }` (Code,
  `src/lib/credentialSources.ts:88-117`); header vocabulary (Code, `headerSource.ts:51-57`,
  :96-101; `credentialSources.ts:96-100`); stdio-only options refused (Code,
  `src/lib/config/authParameters.ts:884-926`); their launchers read no message-server variable
  (Code, grep).
- Typed overrides: `setConfigOverride(override?: SapConfig)` (Code, `src/lib/utils.ts:548-570`);
  `getManagedConnection` via `credentialFromSapConfig` (Code, `utils.ts:527-532`).
- `credentialFromSapConfig` passes the config to `CertificateAuthProvider` after switching on
  `authType` only (Code, `credentialSources.ts:51-68`).
- Embedders inject `connection` and `freshConnection` (Code, `src/embeddable/EmbeddableMcpServer.ts:49-67`).
- `connectionFactory` builds `common = { config: settings, … }` before the wire branches (Code,
  `src/lib/connectionFactory.ts:380-386`), cloud first whatever the connection type (:388-398),
  RFC on `connectionType === 'rfc'` (:400), HTTP otherwise.

## E.7 URL readers in the server

- System key `[url, client, connectionType ?? 'http']` (Code, `src/lib/adtHeaders/systemKey.ts:8-18`;
  `src/embeddable/BaseMcpServer.ts:2870-2876`).
- Background caller: injected → `getBaseUrl()`, client `''` (Code, `BaseMcpServer.ts:2357-2367`);
  destination → `settings.url ?? ''` (:2370-2372); computed before the run starts (:2255-2270);
  contract `src/lib/backgroundRuns/contract.ts:45-52`; key
  `background-runs-memory/src/InMemoryBackgroundRuns.ts:52`.
- Leftover-session identity `undefined` over RFC (Code, `src/lib/leftoverSessions/LeftoverSessions.ts:209-224`).
- Summary skips an absent URL (Code, `src/lib/utils.ts:922-928`; `launcher.ts:670-677`).
- Debug line calls a missing URL an error (Code, `src/lib/utils.ts:492-499`).
- `GetServiceBindingPreviewUrl`: base from `getBaseUrl()` (Code,
  `src/handlers/system/readonly/handleGetServiceBindingPreviewUrl.ts:144`); the system's service
  URL, absolute or prefixed (:316-322); `new URL(serviceUrl).pathname` for V4 (:380); answer
  fields (:424-437); description (:85-86).
- Forwarders of `getBaseUrl()`: `src/lib/batch/lateBound.ts:71-72`, `envelopeWatch.ts:37`,
  `phases.ts:119`, :169, `recorder.ts:145`, `handleRuntimeListFeeds.ts:538`,
  `src/lib/handlers/noConnection.ts:18` (Code).

## E.8 Construction

- The server's `common.config` (E.6) and adt-clients' `base` (E.3) are captured before
  narrowing; `systemKey.ts:16` and `connectionFactory.ts:400` read absence as HTTP (Code).
- Without `exactOptionalPropertyTypes` an optional property accepts `undefined`, so `url?: never`
  accepts `url: undefined` (TypeScript semantics; Inference until §12's check records it).

## E.9 Docs that state the old contract

- Server: `README.md:430-460`, :500; `docs/installation/RFC_SETUP.md:76-111`;
  `INSTALLATION.md:150-167`, :340; `examples/README.md:105-127`; `CLINE_CONFIGURATION.md:115-131`;
  `docs/user-guide/CLIENT_CONFIGURATION.md:235-273`; `CLI_OPTIONS.md:103`, :175-201;
  `docs/configuration/YAML_CONFIG.md:60-90`, :141; `docs/deployment/DOCKER.md:100`; launcher help
  `launcher.ts:105-223`, examples :226-250; parameter help `coreParameters.ts:141-165` (Code).
  Message-server logon not measured live (Code, `README.md:442`).
- connection: `README.md:84`, :165, :843-866; `docs/USAGE.md:166`, :1013; `docs/MIGRATION-6.0.md:182-186`,
  `MIGRATION-18.0.md:12-45`; `CLAUDE.md:162-166` (Code).
- adt-clients: E.3; and `docs/usage/RFC_CONNECTION.md`: says `connectionType: 'rfc'` was
  removed in connection 6.0.0 (:64-67), its example config has a `url`, no connection type,
  address or language, handed to `rfcConversationFrom` (:77-89), and it describes the
  derivation (:94-97) (Code).
