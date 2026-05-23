# Spec: Certificate (mTLS) + Kerberos auth across the ADT connection stack

> Status: design approved, ready for implementation planning.
> Lifecycle: this spec lives only in `mcp-abap-adt`. **Delete after implementation** — history stays in git.
> Source of idea: analysis of `sap-adt-mcp` (see `docs/superpowers/plans/innovations-from-sap-adt-mcp.md`, item A).

## 1. Goal & scope

Add two new authentication types to the ADT connection stack:

- **`certificate`** — client-certificate mutual TLS (mTLS), cross-platform, credential material loaded from **files** (PEM or PFX/PKCS#12).
- **`kerberos`** — SPNEGO/Negotiate SSO, cross-platform via the `kerberos` npm package (GSSAPI on Linux/macOS, SSPI on Windows), as an **optional dependency**.

**In scope:** on-prem ABAP over **HTTP** (`connectionType: 'http'`). Both new types are invalid for `connectionType: 'rfc'` and for BTP cloud (which stays `jwt`).

**Out of scope (explicitly NOT building):**
- Windows Certificate Store / PowerShell-SChannel bridge (the `sap-adt-mcp` approach). Cross-platform file-based only.
- NTLM. We hard-reject NTLM tokens if a server offers only NTLM (see Risks).
- Kerberos mutual-auth multi-leg continuation (see Assumptions).
- RFC-transport variants of these auth types.

## 2. Architecture decision (the core call)

The existing stack already supports non-bearer credentials through the token-provider abstraction: `Saml2PureProvider` returns **session cookies** in `ITokenResult.authorizationToken` with `tokenType: 'saml'`, and `ITokenResult.tokenType` already includes `'opaque'`. So "provider → credential string → header/cookie" is a real, reusable pattern — not OAuth-only.

Against that, the two new types split differently:

| Type | Pattern | Why |
|------|---------|-----|
| **Kerberos** | **Provider + `ITokenRefresher` injection** (the JWT path) | The credential is a Negotiate blob that goes into the `Authorization: Negotiate <blob>` **header** — same consumption point as bearer/SAML. Fits the provider model directly. |
| **Certificate** | **Connection subclass + `httpsAgent` options** (the SAML/JWT subclass path), with an injected `ICertificateMaterialLoader` for testability | The credential is `cert`+private-key used in the **TLS handshake via `httpsAgent`** — a transport-layer concern *below* `getAuthHeaders()`. There is no header/cookie to "provide", so the provider abstraction does not apply. |

This split is deliberate: kerberos reuses an existing DI path (no new interface needed); certificate uses the existing per-type connection-subclass pattern plus one small injected loader for the file I/O.

### Kerberos sub-decision (K2, recommended)

Two ways to run the SPNEGO handshake:

- **K1** — provider performs the full HTTP login round-trip against SAP and returns session cookies (mirrors `Saml2PureProvider`). Connection becomes cookie-only.
- **K2 (recommended)** — provider/refresher returns only the Negotiate **token** (`tokenType: 'opaque'`); `KerberosAbapConnection` sends `Authorization: Negotiate <token>` on the first request, captures the SAP session cookie (`SAP_SESSIONID`/`MYSAPSSO2`), and reuses the cookie thereafter.

**Choose K2.** `AbstractAbapConnection` already owns CSRF fetch + cookie capture/reuse (`fetchCsrfToken`, cookie merge). K2 keeps HTTP in the connection layer and reduces the genuinely-native, mockable unit to just "generate an AP-REQ for this SPN". K1 would duplicate HTTP+cookie handling inside the provider.

## 3. Per-package changes

Five repos. Listed in dependency (release) order — see §7.

### 3.1 `@mcp-abap-adt/interfaces` (`~/prj/mcp-abap-adt-interfaces`)

- `src/sap/SapAuthType.ts`: extend union →
  `export type SapAuthType = 'basic' | 'jwt' | 'saml' | 'certificate' | 'kerberos';`
- `src/sap/ISapConfig.ts`: add optional fields:
  - Certificate: `certPath?`, `certKeyPath?`, `certPfxPath?`, `certPassphrase?`. (PEM = certPath+certKeyPath; PFX = certPfxPath. Mutually exclusive — validated in connector.)
  - Kerberos: `kerberosSpn?` (e.g. `HTTP@host.domain`), `kerberosService?` (default `HTTP`).
- `src/token/ITokenResult.ts`: no shape change needed — kerberos uses existing `tokenType: 'opaque'`. (Optional: add `'kerberos'` to the `tokenType` union for clarity; not required.)
- New interface `src/auth/ICertificateMaterialLoader.ts`:
  ```ts
  export interface ICertificateMaterial { cert?: Buffer|string; key?: Buffer|string; pfx?: Buffer; passphrase?: string; }
  export interface ICertificateMaterialLoader { load(config: ISapConfig): Promise<ICertificateMaterial>; }
  ```
- Export new symbols from `src/index.ts`.

### 3.2 `@mcp-abap-adt/connection` (`~/prj/mcp-abap-connection`) — the connector, heaviest changes

- `src/connection/AbstractAbapConnection.ts`:
  - In `getAxiosInstance()` (currently builds `new Agent({ rejectUnauthorized })`), add a protected hook:
    `protected getHttpsAgentOptions(): https.AgentOptions { return {}; }`
    and merge it into the Agent options. **Important:** the Agent is currently cached on first build; certificate material must be available before the first request (it is — loaded in the cert connection's `connect()`/constructor). Keep `rejectUnauthorized` behavior intact.
- New `src/connection/CertificateAbapConnection.ts` (extends `AbstractAbapConnection`):
  - `validateConfig`: requires `connectionType !== 'rfc'`; requires either (`certPath`+`certKeyPath`) or `certPfxPath`; rejects having both PEM and PFX.
  - Constructor takes an injected `ICertificateMaterialLoader` (default: a file-based impl). `connect()` loads material, then proceeds with normal CSRF fetch.
  - `getHttpsAgentOptions()` returns `{ cert, key, pfx, passphrase }`.
  - `buildAuthorizationHeader()` returns `''` (no Authorization header; mTLS identifies the user).
- New `src/connection/KerberosAbapConnection.ts` (extends `AbstractAbapConnection`):
  - Mirrors `JwtAbapConnection`: takes injected `ITokenRefresher` (broker-created, see §3.4).
  - `buildAuthorizationHeader()` → `Negotiate ${currentToken}` (token from refresher).
  - First request sends Negotiate; capture session cookie via existing cookie machinery; subsequent requests reuse cookie. On 401, re-acquire token via `refreshToken()` (re-init security context).
  - `validateConfig`: requires `connectionType !== 'rfc'`; requires resolvable SPN (`kerberosSpn` or derive `HTTP@<host>` from URL).
- New `src/auth/FileCertificateMaterialLoader.ts`: reads PEM/PFX from disk → `ICertificateMaterial`. Pure I/O, mockable.
- `src/connection/connectionFactory.ts`: add cases:
  ```ts
  case 'certificate': return new CertificateAbapConnection(config, logger, sessionId, certLoader);
  case 'kerberos':    return new KerberosAbapConnection(config, logger, sessionId, tokenRefresher);
  ```
  Keep the existing `connectionType === 'rfc'` early-return guard (rfc wins) — but add validation so cert/kerberos + rfc throws a clear error rather than silently doing RFC.
- `src/config/sapConfig.ts`: extend `sapConfigSignature()` to include cert paths / SPN (so connection is recreated when these change). Never log key/passphrase contents.

### 3.3 `@mcp-abap-adt/auth-providers` (`~/prj/mcp-abap-adt-auth-providers`)

- New `src/providers/KerberosProvider.ts` extends `BaseTokenProvider`:
  - `tokenType = 'opaque'`. `performLogin()` = generate SPNEGO AP-REQ for the SPN via the native step (below). `performRefresh()` = re-generate (re-init security context).
  - Returns `ITokenResult { authorizationToken: <negotiate-blob>, tokenType: 'opaque', authType: <user-token-grant> }`.
  - Expiry: derive from Kerberos ticket lifetime if available, else short TTL so it re-inits on demand.
- New `src/sso/kerberosSpnego.ts`: thin wrapper over the `kerberos` npm package (`initializeClient` / `step`). **Lazy `import()`** so the package is only required when kerberos auth is actually used; declared in `optionalDependencies`. This is the single native, mockable seam.
- Export `KerberosProvider` (+ config type) from `src/index.ts`; optionally register in `SsoProviderFactory`.

### 3.4 `@mcp-abap-adt/auth-broker` (`~/prj/mcp-abap-adt-auth-broker`)

- `AuthBroker.ts`: when `authType === 'kerberos'`, build a `KerberosProvider` + an `ITokenRefresher` over it (same wiring as the JWT/SAML refresher at `AuthBroker.ts:419/477`) and inject into the connection. For `certificate`, no provider/refresher — broker treats it as a credential-static type (like `basic` → `session-only` broker mode).
- `src/cli/parseArgs.ts`: note this file's `authType` is the **broker store type** (`abap|xsuaa`), a different axis — no change needed there for the SAP auth type. Confirm cert/kerberos flow through the SAP-config axis, not this one.
- Broker mode mapping: `certificate` → `session-only`; `kerberos` → `session-provider` (needs the provider/refresher).

### 3.5 `mcp-abap-adt` (server, this repo)

- `src/lib/config.ts` (lines ~59-75) and `src/lib/utils.ts` (duplicate parser ~1892-1900): extend `SAP_AUTH_TYPE` acceptance to include `'certificate'` and `'kerberos'`. **De-dup opportunity:** these two parsers are copies — consider extracting one shared `parseAuthType()` while here (optional, flagged, not required).
- New env vars (document in `src/lib/utils.ts` help text ~1337):
  - `SAP_CERT_PATH`, `SAP_CERT_KEY_PATH`, `SAP_CERT_PFX_PATH`, `SAP_CERT_PASSPHRASE`
  - `SAP_KERBEROS_SPN`, `SAP_KERBEROS_SERVICE`
- `src/lib/auth/IBrokerSessionConfig.ts`: extend `IConnectionConfig.authType` union (`'basic' | 'jwt'`) → add `'certificate' | 'kerberos'`; add the new config fields.
- `src/lib/auth/brokerFactory.ts` (~750-786): map the new auth types into the broker session config; pass cert paths / SPN through.
- Tool `available_in`: cert/kerberos are on-prem-only auth; no tool-level `available_in` change needed (they're a connection concern, not a tool capability), but verify nothing assumes `authType ∈ {basic,jwt,saml}`.

## 4. Configuration surface (summary)

`.env` (server-driven, on-prem HTTP):
```
SAP_AUTH_TYPE=certificate
SAP_CERT_PATH=/path/client.crt          # PEM
SAP_CERT_KEY_PATH=/path/client.key      # PEM
# or:
SAP_CERT_PFX_PATH=/path/client.pfx      # PKCS#12
SAP_CERT_PASSPHRASE=...                  # optional
```
```
SAP_AUTH_TYPE=kerberos
SAP_KERBEROS_SPN=HTTP@sap-host.corp     # optional; derived from SAP_URL if absent
```

## 5. Security rules

- Never log private-key bytes, PFX bytes, passphrase, or Negotiate tokens. Safe to log: cert subject/CN, cert path (not contents), SPN, `tokenType`.
- `sapConfigSignature()` must not embed secret material — use presence flags / hashes, mirroring how it previews tokens today.
- Reject NTLM: if the server's `WWW-Authenticate` offers only `NTLM` (token begins `TlRMTVNTUAA...`), fail with a clear error rather than negotiating.

## 6. Test plan

Per repo, unit-first (mock the native/IO seams):

- **interfaces**: type-level only (compile).
- **connection**:
  - `CertificateAbapConnection`: inject a fake `ICertificateMaterialLoader`; assert `getHttpsAgentOptions()` carries cert/key/pfx; assert no Authorization header; assert PEM-vs-PFX validation and rfc-conflict errors.
  - `KerberosAbapConnection`: inject a fake `ITokenRefresher`; assert `Authorization: Negotiate <token>`; assert cookie capture+reuse; assert 401 → `refreshToken()`.
  - `connectionFactory`: new cases route correctly; cert/kerberos + rfc throws.
- **auth-providers**: `KerberosProvider` with mocked `kerberosSpnego` step → asserts `ITokenResult` shape (`tokenType:'opaque'`), `performRefresh` re-inits. No real KDC.
- **auth-broker**: kerberos → provider+refresher created & injected; certificate → session-only, no provider.
- **server**: `SAP_AUTH_TYPE=certificate|kerberos` parsed in both `config.ts` and `utils.ts`; brokerFactory threads fields.
- **Integration (live SAP, gated):** one cert smoke + one kerberos smoke against an on-prem system that supports them. Follow CLAUDE.md soft-mode strategy; do not block CI on secrets (see integration-test-env-gates approach).

## 7. Release order (cross-package)

Bottom-up. **The user publishes each package — the agent never runs `npm publish`.** Consumers import published npm versions (not local links), so each step is hard-gated: implement → commit → PR/merge → user publishes → bump consumer to the confirmed version → next step (follow the cross-package-fix-cycle discipline):

1. `interfaces` — union + fields + `ICertificateMaterialLoader`. Publish, bump everywhere.
2. `auth-providers` — `KerberosProvider` + `kerberosSpnego` (optionalDep). Publish.
3. `connection` — connection classes + agent hook + loader + factory. Publish.
4. `auth-broker` — kerberos provider/refresher wiring + broker modes. Publish.
5. `mcp-abap-adt` (server) — env parsing + `IConnectionConfig` + brokerFactory + docs. Bump deps to the published versions.

Each step gets its own worktree in its repo (per project workflow: worktrees on all changed code repos; spec stays only here).

## 8. Risks & assumptions

- **A1 — single-leg Negotiate.** Assumes SAP accepts a one-shot AP-REQ then issues a session cookie (typical for Kerberos). If a system demands mutual-auth continuation (`WWW-Authenticate: Negotiate <challenge>` round-trips), the K2 single `getToken()` does not cover it; would need a continuation hook. Validate on a live system before claiming kerberos done.
- **A2 — native build.** `kerberos` npm compiles native bindings (needs GSSAPI dev libs on Linux / build tools on Windows). Mitigated by `optionalDependencies` + lazy import so non-kerberos installs never touch it.
- **A3 — TGT availability.** Cross-platform kerberos needs a valid TGT in the OS credential cache (`kinit`) or a keytab. Document prerequisite; not auto-provisioned.
- **A4 — Agent caching.** `getAxiosInstance()` caches the Agent; ensure cert material is loaded before the first request (it is, in `connect()`), else the cached Agent lacks the client cert.
- **A5 — duplicate auth parser.** `config.ts` and `utils.ts` both parse `SAP_AUTH_TYPE`; both must change. Optional de-dup flagged in §3.5.

## 9. Open questions for the user

1. PEM **and** PFX both supported, or pick one for v1? (Spec assumes both; PFX is a small extra.)
2. Confirm assumption A1 (single-leg) is acceptable for v1, or must continuation be designed in now?
