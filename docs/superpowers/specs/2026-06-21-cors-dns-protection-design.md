# Wire CORS / allowed-hosts / DNS-rebinding protection to the SDK transports

**Status:** design (approved decisions: 7.2.0, both transports, DNS default false), pre-implementation.
**Target version:** 7.2.0 (minor — adds real capability).

## Problem

The CLI flags `--http-allowed-origins`/`--http-allowed-hosts`/`--http-enable-dns-protection`
(and the `--sse-*` equivalents), the `MCP_HTTP_*`/`MCP_SSE_*` env vars, and the
`http`/`sse` `allowed-origins`/`allowed-hosts`/`enable-dns-protection` YAML keys
are **parsed** (`ArgumentsParser` → `parsed.httpAllowedOrigins` etc.; YAML →
`ConfigLoader` → the same `parsed.*` fields) but then **dropped**: `IServerConfig`
has no fields for them, `ServerConfigManager` never reads them, and the launcher
never passes them to the servers. They have no effect. In 7.1.3 the docs for them
were removed (they advertised dead options). This change implements them.

## Key finding (makes this small + safe)

The MCP SDK transports already enforce these natively — no custom security
middleware needed:
- `StreamableHTTPServerTransport` options (`WebStandardStreamableHTTPServerTransportOptions`)
  expose `allowedHosts?: string[]`, `allowedOrigins?: string[]`,
  `enableDnsRebindingProtection?: boolean`.
- `SSEServerTransport(endpoint, res, options?)` — its `SSEServerTransportOptions`
  expose the same three.

So the work is **plumbing**: carry the already-parsed values through
`IServerConfig` → `ServerConfigManager` → `launcher` → the two server wrappers →
the SDK transport options. The SDK does the enforcement.

## Goal / success criteria

- `--transport=http`/`sse` with the allowed-origins/allowed-hosts/DNS flags (or the
  matching env vars / YAML keys) actually configures the SDK transport, so CORS
  origin checks, Host-header allowlisting, and DNS-rebinding protection take effect.
- Transport-aware (mirrors the 7.1.3 host/port fix): http uses the `http*` values,
  sse uses the `sse*` values.
- Backward compatible: all three default off/empty; `enableDnsRebindingProtection`
  defaults `false`, so existing setups are unchanged.
- The docs removed in 7.1.3 are restored — now describing working options.

## Design

### Data flow / components

1. **`src/lib/config/IServerConfig.ts`** — add three optional fields to
   `IServerConfig` (alongside `host`/`port`/`httpPath`/…):
   ```ts
   /** Allowed CORS origins (HTTP/SSE transport security) */
   allowedOrigins?: string[];
   /** Allowed Host header values (HTTP/SSE transport security) */
   allowedHosts?: string[];
   /** Enable DNS-rebinding protection (requires allowedHosts and/or allowedOrigins) */
   enableDnsRebindingProtection?: boolean;
   ```

2. **`src/lib/config/ServerConfigManager.ts`** (`parseCommandLine`) — resolve them
   transport-aware, next to the existing `transportHost`/`transportPort` block:
   ```ts
   const transportAllowedOrigins = isSse
     ? parsed.sseAllowedOrigins
     : parsed.httpAllowedOrigins;
   const transportAllowedHosts = isSse
     ? parsed.sseAllowedHosts
     : parsed.httpAllowedHosts;
   const transportEnableDns = isSse
     ? parsed.sseEnableDnsProtection
     : parsed.httpEnableDnsProtection;
   ```
   and return them: `allowedOrigins: transportAllowedOrigins`,
   `allowedHosts: transportAllowedHosts`,
   `enableDnsRebindingProtection: transportEnableDns ?? false`.
   (`parsed.*` already carries CLI, env, and YAML-sourced values via
   `ArgumentsParser`/`ConfigLoader`.)

3. **`src/server/launcher.ts`** — pass the three `config.*` fields into BOTH
   `new SseServer(...)` and `new StreamableHttpServer(...)` option objects (next to
   `host`/`port`/`tls`).

4. **`src/server/StreamableHttpServer.ts`** — add `allowedOrigins?`,
   `allowedHosts?`, `enableDnsRebindingProtection?` to `StreamableHttpServerOptions`,
   store them on the instance, and pass them into the existing
   `new StreamableHTTPServerTransport({ sessionIdGenerator, enableJsonResponse, … })`
   call:
   ```ts
   const transport = new StreamableHTTPServerTransport({
     sessionIdGenerator: undefined,
     enableJsonResponse: this.enableJsonResponse,
     allowedHosts: this.allowedHosts,
     allowedOrigins: this.allowedOrigins,
     enableDnsRebindingProtection: this.enableDnsRebindingProtection,
   });
   ```

5. **`src/server/SseServer.ts`** — add the same three to `SseServerOptions`, store
   them, and pass them as the 3rd arg to the transport:
   ```ts
   const transport = new SSEServerTransport(this.postPath, res, {
     allowedHosts: this.allowedHosts,
     allowedOrigins: this.allowedOrigins,
     enableDnsRebindingProtection: this.enableDnsRebindingProtection,
   });
   ```

### Documentation (restore, now accurate)

Re-add the options removed in 7.1.3, describing real behaviour, in:
`docs/user-guide/CLI_OPTIONS.md`, `docs/installation/INSTALLATION.md`, the three
`docs/installation/platforms/INSTALL_*.md`, `docs/configuration/YAML_CONFIG.md`,
and `docs/installation/CLINE_CONFIGURATION.md`. Each must note: **DNS-rebinding
protection requires `allowedHosts` and/or `allowedOrigins` to be set** (SDK
constraint), and that these are transport-specific (`--http-*` for http,
`--sse-*` for sse). Use the generic flag-style consistent with the rest of the
docs; do NOT reintroduce the wrong defaults or non-existent flags fixed in 7.1.3.

### Error handling / edge cases

- All three optional; unset → SDK behaves as before (no enforcement). No throw.
- `enableDnsRebindingProtection: true` with empty allow-lists: the SDK treats it as
  no-op protection (documented as requiring the lists); we surface that in docs, no
  special handling.
- Empty arrays vs undefined: pass through as-is; the SDK handles both.

### Testing

- Unit (`src/__tests__/lib/...`): drive `ServerConfigManager` with `process.argv`
  set to `--transport=http --http-allowed-origins=a,b --http-enable-dns-protection`
  and assert `config.allowedOrigins`, `config.enableDnsRebindingProtection`; and
  with `--transport=sse --sse-allowed-hosts=h` assert the sse values map and the
  http ones do not bleed in. (Same pattern proven for host/port via tsx in 7.1.3.)
- Build + `test:check`.
- Manual/tsx sanity: construct each server with the options and confirm the
  transport receives them (no live SAP needed).

## Out of scope

- Custom CORS/host middleware — unnecessary; the SDK transports enforce it.
- Changing the existing host/port/transport behaviour (7.1.3).
- Any non-security HTTP/SSE flags.

## Release

7.2.0 (minor). `IServerConfig` + servers are `dist/` runtime changes, and the
restored docs ship in the package (`files`), so this is a real published release.
After merge: tag `v7.2.0`; maintainer publishes.
