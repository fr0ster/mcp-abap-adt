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

**Both new auth types bypass `@mcp-abap-adt/auth-broker` and `@mcp-abap-adt/auth-providers` entirely.** The broker's role is narrow: OAuth-style authorization with browser-callback interception. Certificate and Kerberos are non-interactive and transport/connection-level — no browser callback, no broker token lifecycle. They live in the **connection** package (+ types in `interfaces`, + env wiring in the server).

| Type | Pattern | Why |
|------|---------|-----|
| **Certificate** | Connection subclass + `httpsAgent` options, with an injected `ICertificateMaterialLoader` for testability | The credential is `cert`+private-key used in the **TLS handshake via `httpsAgent`** — transport-layer, below `getAuthHeaders()`. No header/cookie to "provide". |
| **Kerberos** | Connection subclass that generates the SPNEGO token **locally** (lazy/optional `kerberos` npm wrapper inside the connection package), sends `Authorization: Negotiate <token>` on the first request, then reuses the SAP session cookie | The Negotiate blob goes into a header, but generation is local GSSAPI (no callback, no refresh lifecycle). No broker, no `ITokenRefresher`, no `BaseTokenProvider`. |

`@mcp-abap-adt/connection` depends only on `interfaces` + `sap-rfc-lite` (not on `auth-providers`), so the SPNEGO wrapper lives in `connection`, keeping that dependency boundary intact.

### Kerberos handshake = single-leg, cookie reuse

`AbstractAbapConnection` already owns CSRF fetch + cookie capture/reuse (`fetchCsrfToken`, cookie merge). `KerberosAbapConnection` generates one AP-REQ for the SPN, sends `Authorization: Negotiate <token>` on the first request, captures the SAP session cookie (`SAP_SESSIONID`/`MYSAPSSO2`), and reuses the cookie thereafter. Single-leg only (no mutual-auth continuation in v1 — see Assumptions).

## 3. Per-package changes

**Three repos** (auth-broker and auth-providers are NOT touched). Listed in dependency (release) order — see §7.

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
  - **Self-contained — no broker, no `ITokenRefresher`, no provider.** Generates the SPNEGO token locally via the connection-local wrapper (below), using the resolved SPN.
  - `connect()` generates the Negotiate token, sends it on the first request, captures the SAP session cookie via the existing cookie machinery; subsequent requests reuse the cookie.
  - `buildAuthorizationHeader()` → `Negotiate ${token}` while no session cookie yet; `''` once a cookie exists.
  - `validateConfig`: requires `connectionType !== 'rfc'`; requires resolvable SPN (`kerberosSpn` or derive `HTTP@<host>` from URL).
- New `src/auth/FileCertificateMaterialLoader.ts`: reads PEM/PFX from disk → `ICertificateMaterial`. Pure I/O, mockable.
- New `src/auth/kerberosSpnego.ts`: thin wrapper over the optional `kerberos` npm package (`initializeClient` / `step`), **lazy `import()`**; declared in this package's `optionalDependencies`. The single native, mockable seam. (Lives here, not in auth-providers, because `connection` does not depend on `auth-providers`.)
- `src/connection/connectionFactory.ts`: add cases:
  ```ts
  case 'certificate': return new CertificateAbapConnection(config, logger, sessionId, options?.certLoader);
  case 'kerberos':    return new KerberosAbapConnection(config, logger, sessionId);
  ```
  Keep the existing `connectionType === 'rfc'` early-return guard (rfc wins) — but add validation so cert/kerberos + rfc throws a clear error rather than silently doing RFC.
- `src/config/sapConfig.ts`: extend `sapConfigSignature()` to include cert paths / SPN (so connection is recreated when these change). Never log key/passphrase contents.

### 3.3 NOT touched: `auth-providers` and `auth-broker`

Certificate and Kerberos bypass both. The broker is only for OAuth-style authorization + browser-callback interception; cert/kerberos are non-interactive and connection-level. **Do not add a `KerberosProvider` to auth-providers, do not modify `AuthBroker`, do not widen the broker's `IConnectionConfig.authType`** — that union is the broker's surface and stays `'basic' | 'jwt' | 'saml'`.

### 3.4 `mcp-abap-adt` (server, this repo)

- `src/lib/config.ts` (lines ~59-75) and `src/lib/utils.ts` (duplicate parser ~1892-1900): extend `SAP_AUTH_TYPE` acceptance to include `'certificate'` and `'kerberos'`. **De-dup opportunity:** these two parsers are copies — extract one shared `parseAuthType()` (recommended while here).
- Read new env into the assembled `SapConfig`: `SAP_CERT_PATH`, `SAP_CERT_KEY_PATH`, `SAP_CERT_PFX_PATH`, `SAP_CERT_PASSPHRASE`, `SAP_KERBEROS_SPN`, `SAP_KERBEROS_SERVICE`. Document in the help text (~line 1337).
- **Connection creation path:** find where the server creates an `AbapConnection` for non-broker auth (basic/RFC today) — cert/kerberos follow that same direct `createAbapConnection(...)` path, NOT the broker/`brokerFactory` path. Verify in code during Phase 3; do NOT route cert/kerberos through `brokerFactory`/`IBrokerSessionConfig`.
- Tool `available_in`: cert/kerberos are connection concerns, not tool capabilities — no tool-level change; but verify nothing assumes `authType ∈ {basic,jwt,saml}`.

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
  - `KerberosAbapConnection`: mock the connection-local `kerberosSpnego` wrapper; assert `Authorization: Negotiate <token>` on first request and `''` after a cookie exists; assert cookie capture+reuse; assert rfc-conflict error. No real KDC.
  - `connectionFactory`: new cases route correctly; cert/kerberos + rfc throws.
- **server**: `SAP_AUTH_TYPE=certificate|kerberos` parsed (shared `parseAuthType`); cert/kerberos env fields land in the assembled `SapConfig`; connection created via the direct `createAbapConnection` path (not broker).
- **Integration (live SAP, gated):** one cert smoke + one kerberos smoke against an on-prem system that supports them. Follow CLAUDE.md soft-mode strategy; do not block CI on secrets (see integration-test-env-gates approach).

## 7. Release order (cross-package)

Bottom-up. **The user publishes each package — the agent never runs `npm publish`.** Consumers import published npm versions (not local links), so each step is hard-gated: implement → commit → PR/merge → user publishes → bump consumer to the confirmed version → next step (follow the cross-package-fix-cycle discipline):

1. `interfaces` — union + fields + `ICertificateMaterialLoader`. User publishes, bump everywhere.
2. `connection` — connection classes + agent hook + cert loader + `kerberosSpnego` (optionalDep) + factory + signature. User publishes.
3. `mcp-abap-adt` (server) — `parseAuthType` + env→`SapConfig` + direct `createAbapConnection` wiring + docs. Bump deps to the published versions.

(`auth-providers` and `auth-broker` are not in the chain — not touched.) Each step gets its own worktree in its repo (per project workflow: worktrees on all changed code repos; spec stays only here).

## 8. Risks & assumptions

- **A1 — single-leg Negotiate.** Assumes SAP accepts a one-shot AP-REQ then issues a session cookie (typical for Kerberos). If a system demands mutual-auth continuation (`WWW-Authenticate: Negotiate <challenge>` round-trips), the single-token approach does not cover it; would need a continuation hook. **Accepted for v1** (user-confirmed); validate on a live system before claiming kerberos done.
- **A2 — native build.** `kerberos` npm compiles native bindings (needs GSSAPI dev libs on Linux / build tools on Windows). Mitigated by `optionalDependencies` + lazy import so non-kerberos installs never touch it.
- **A3 — TGT availability.** Cross-platform kerberos needs a valid TGT in the OS credential cache (`kinit`) or a keytab. Document prerequisite; not auto-provisioned.
- **A4 — Agent caching.** `getAxiosInstance()` caches the Agent; ensure cert material is loaded before the first request (it is, in `connect()`), else the cached Agent lacks the client cert.
- **A5 — duplicate auth parser.** `config.ts` and `utils.ts` both parse `SAP_AUTH_TYPE`; both must change. Optional de-dup flagged in §3.5.

## 9. Decisions (resolved)

1. **PEM and PFX both supported** in v1. (user-confirmed)
2. **Single-leg Negotiate accepted** for v1; no mutual-auth continuation. (user-confirmed)
3. **cert and kerberos both bypass the broker and auth-providers** — connection-layer only. (user-confirmed)
