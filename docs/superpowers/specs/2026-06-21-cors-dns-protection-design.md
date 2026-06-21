# DNS-rebinding protection (Host + Origin allowlist) for the HTTP/SSE transports

**Status:** design (approved: 7.2.0; both transports; default off; **approach B —
own Express middleware**, not the deprecated SDK transport fields).
**Target version:** 7.2.0 (minor — adds real capability).

## Problem

The flags `--http-allowed-origins`/`--http-allowed-hosts`/`--http-enable-dns-protection`
(and `--sse-*`), the matching `MCP_HTTP_*`/`MCP_SSE_*` env vars, and the `http`/`sse`
`allowed-origins`/`allowed-hosts`/`enable-dns-protection` YAML keys are **parsed**
but **dropped**: `IServerConfig` has no fields for them, `ServerConfigManager`
never reads them, and the launcher never passes them to the servers. In 7.1.3 the
docs for them were removed (they advertised dead options). This change implements
them.

### What this actually is (NOT CORS)

These options configure **DNS-rebinding protection** — server-side validation of
the inbound `Host` and `Origin` request headers against allowlists. It does **not**
emit CORS response headers (`Access-Control-Allow-Origin`) and does not implement a
browser CORS policy. Behaviour (mirrors the MCP SDK's own `validateRequestHeaders`):
- When protection is **disabled** (default): no validation at all.
- When **enabled**: if `allowedHosts` is non-empty, reject any request whose `Host`
  header is missing or not in the list (HTTP 403); if `allowedOrigins` is non-empty,
  reject any request whose `Origin` header is present and not in the list (403). A
  request with no `Origin` passes the origin check.

Docs must describe it as DNS-rebinding / Host+Origin allowlist validation, never as
"CORS".

## Approach: own Express middleware (not the SDK transport options)

The MCP SDK transports (`StreamableHTTPServerTransport`, `SSEServerTransport`) do
expose `allowedHosts`/`allowedOrigins`/`enableDnsRebindingProtection`, but in
`@modelcontextprotocol/sdk@1.29.0` these are **`@deprecated`** with the explicit
recommendation to "use external middleware instead". To avoid building on
deprecated fields that will break on an SDK major bump, we implement the same
validation as our own Express middleware (both servers already use Express).
**Tradeoff recorded:** slightly more code now vs. a deprecated-API dependency that
would need migration later; we chose the durable, SDK-recommended path.

## Goal / success criteria

- With protection enabled and an allowlist set (via CLI flag, env var, or YAML),
  the HTTP/SSE server rejects requests with a non-allowlisted `Host`/`Origin` (403)
  and passes allowlisted ones — for both transports.
- Transport-aware (mirrors the 7.1.3 host/port fix): http uses the `http*` values,
  sse uses the `sse*` values.
- Backward compatible: defaults off/empty; `enableDnsRebindingProtection` defaults
  `false` → existing setups unchanged (middleware is a no-op).
- The docs removed in 7.1.3 are restored, described accurately.

## Design

### New module — `src/server/dnsRebindingProtection.ts`

A factory returning an Express `RequestHandler`, mirroring the SDK semantics:
```ts
import type { Request, Response, NextFunction } from 'express';

export interface DnsRebindingOptions {
  enable?: boolean;
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

export function createDnsRebindingMiddleware(opts: DnsRebindingOptions) {
  const enabled = opts.enable === true;
  const hosts = opts.allowedHosts ?? [];
  const origins = opts.allowedOrigins ?? [];
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled) return next();
    if (hosts.length > 0) {
      const host = req.headers.host;
      if (!host || !hosts.includes(host)) {
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Invalid Host header: ${host ?? ''}` },
          id: null,
        });
        return;
      }
    }
    if (origins.length > 0) {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin)) {
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Invalid Origin header: ${origin}` },
          id: null,
        });
        return;
      }
    }
    next();
  };
}
```

### Config data flow

1. **`src/lib/config/IServerConfig.ts`** — add to `IServerConfig`:
   ```ts
   /** Allowed Host header values (DNS-rebinding protection) */
   allowedHosts?: string[];
   /** Allowed Origin header values (DNS-rebinding protection) */
   allowedOrigins?: string[];
   /** Enable DNS-rebinding protection (requires allowedHosts and/or allowedOrigins) */
   enableDnsRebindingProtection?: boolean;
   ```

2. **`src/lib/config/ServerConfigManager.ts`** (`parseCommandLine`) — resolve
   transport-aware, beside the existing `transportHost`/`transportPort`:
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
   return: `allowedOrigins: transportAllowedOrigins`,
   `allowedHosts: transportAllowedHosts`,
   `enableDnsRebindingProtection: transportEnableDns ?? false`.

   **No YAML code needed:** the active path is
   `getConfig()` → `loadYamlConfigIfNeeded()` → `applyYamlConfigToArgs()` →
   `ArgumentsParser` (NOT the legacy `ConfigLoader`). `applyYamlConfigToArgs`
   already maps `http`/`sse` `allowed-origins`/`allowed-hosts`/`enable-dns-protection`
   to `--http-*`/`--sse-*`, so `parsed.*` is already populated from YAML.

3. **`src/server/launcher.ts`** — pass `config.allowedHosts`,
   `config.allowedOrigins`, `config.enableDnsRebindingProtection` into BOTH
   `new SseServer(...)` and `new StreamableHttpServer(...)` option objects.

4. **`src/server/StreamableHttpServer.ts`** & **`src/server/SseServer.ts`** — add
   the three fields to each `*ServerOptions` interface, store on the instance, and
   in `start()` register the middleware on the Express app BEFORE the MCP route
   handlers (the `this.path` POST/all routes for HTTP; the SSE + post routes for
   SSE). Do NOT gate the `/mcp/health` endpoint. The SDK transports are created
   WITHOUT the deprecated `allowed*`/`enableDnsRebindingProtection` options (the
   middleware does the validation).

### Documentation (restore, accurate)

Re-add the options in `docs/user-guide/CLI_OPTIONS.md`,
`docs/installation/INSTALLATION.md`, the three `docs/installation/platforms/INSTALL_*.md`,
`docs/configuration/YAML_CONFIG.md`, and `docs/installation/CLINE_CONFIGURATION.md`,
described as **DNS-rebinding protection (Host + Origin allowlist)** — not CORS.
Each must state: it only takes effect when `enable-dns-protection` is set AND at
least one of `allowed-hosts`/`allowed-origins` is non-empty; transport-specific
(`--http-*` for http, `--sse-*` for sse); a non-allowlisted Host/Origin yields HTTP
403. Keep the generic flag style and correct defaults established in 7.1.3.

### Testing

- **Unit — `src/__tests__/server/dnsRebindingProtection.test.ts`** (Express not
  required; call the handler with stub `req`/`res`/`next`):
  - disabled → always `next()`, never 403.
  - enabled + allowedHosts set: allowed host → next; missing/other host → 403.
  - enabled + allowedOrigins set: matching origin → next; absent origin → next;
    other origin → 403.
  - enabled with empty lists → next (no-op), matching the SDK requirement note.
- **Unit — ServerConfigManager mapping** (set `process.argv`): `--transport=http
  --http-allowed-origins=a,b --http-enable-dns-protection` → `config.allowedOrigins
  = ['a','b']`, `config.enableDnsRebindingProtection === true`; `--transport=sse
  --sse-allowed-hosts=h` → sse values map, http values do not bleed in.
- `npm run build` + `npm run test:check`.

## Out of scope

- Real browser CORS (`Access-Control-Allow-Origin` response headers) — different
  feature; not requested. The flag names are DNS-rebinding allowlists.
- The deprecated SDK transport `allowed*` options — intentionally not used.
- host/port/transport behaviour (7.1.3).

## Release

7.2.0 (minor). New `src/` runtime behaviour + restored docs (docs ship in `files`).
After merge: tag `v7.2.0`; maintainer publishes.
