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

Because `IHttpApplication.post(path, handler)` takes a **single** handler and
`IHttpApplication.use` is optional (not all embedded apps support it), we do NOT
use `app.use(...)` middleware. Instead the module exposes a **handler wrapper**
that runs the validation and then delegates — applied inside `registerRoutes()`
so it protects BOTH standalone and embedded modes (see §server integration).

```ts
import type { Request, Response, NextFunction } from 'express';

export interface DnsRebindingOptions {
  enable?: boolean;
  allowedHosts?: string[];   // exact raw Host header values, incl. port (e.g. "localhost:3000")
  allowedOrigins?: string[]; // exact raw Origin header values (e.g. "https://app.example.com")
}

type RouteHandler = (
  req: Request,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>;

/** Returns a 403 JSON-RPC body if the request must be rejected, else null. */
export function checkDnsRebinding(
  headers: { host?: string; origin?: string },
  opts: DnsRebindingOptions,
): { status: number; body: unknown } | null {
  if (opts.enable !== true) return null; // disabled → no validation
  const hosts = opts.allowedHosts ?? [];
  const origins = opts.allowedOrigins ?? [];
  if (hosts.length > 0) {
    const host = headers.host;
    if (!host || !hosts.includes(host)) {
      return reject(`Invalid Host header: ${host ?? ''}`);
    }
  }
  if (origins.length > 0) {
    const origin = headers.origin;
    if (origin && !origins.includes(origin)) {
      return reject(`Invalid Origin header: ${origin}`);
    }
  }
  return null;
}

function reject(message: string) {
  return {
    status: 403,
    body: { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
  };
}

/** Wrap an MCP route handler so it validates Host/Origin first. */
export function withDnsRebindingProtection(
  handler: RouteHandler,
  opts: DnsRebindingOptions,
): RouteHandler {
  return (req, res, next) => {
    const rejection = checkDnsRebinding(
      { host: req.headers.host, origin: req.headers.origin },
      opts,
    );
    if (rejection) {
      res.status(rejection.status).json(rejection.body);
      return;
    }
    return handler(req, res, next);
  };
}
```
Note: `Host`/`Origin` are matched as **exact raw header values** (the SDK does the
same). The `Host` header normally includes the port — `localhost:3000`, not
`localhost`. Origin includes scheme — `https://app.example.com`.

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
   the three fields to each `*ServerOptions` interface and store them on the
   instance. Apply protection **inside `registerRoutes()`** (NOT in `start()`),
   because `registerRoutes()` is the shared path for BOTH standalone mode and
   embedded mode (`start()` delegates to `registerRoutes(this.externalApp)` and
   returns). Wrap the MCP route handler(s) with `withDnsRebindingProtection(...)`:
   - HTTP: `app.post(this.path, withDnsRebindingProtection(handler, opts))` and the
     same wrapping for the `app.all(this.path, …)` fallback handler.
   - SSE: wrap the SSE connection (GET) handler and the message POST handler.
   - Leave `/mcp/health` (and any non-MCP route) **ungated**.
   Do NOT use `app.use(...)` — `IHttpApplication.post` takes a single handler and
   `IHttpApplication.use` is optional, so wrapping the handler is the only approach
   that works in embedded mode too. The SDK transports are still created WITHOUT
   the deprecated `allowed*`/`enableDnsRebindingProtection` options.

### Documentation (restore, accurate)

Re-add the options in `docs/user-guide/CLI_OPTIONS.md`,
`docs/installation/INSTALLATION.md`, the three `docs/installation/platforms/INSTALL_*.md`,
`docs/configuration/YAML_CONFIG.md`, and `docs/installation/CLINE_CONFIGURATION.md`,
described as **DNS-rebinding protection (Host + Origin allowlist)** — not CORS.
Each must state: it only takes effect when `enable-dns-protection` is set AND at
least one of `allowed-hosts`/`allowed-origins` is non-empty; transport-specific
(`--http-*` for http, `--sse-*` for sse); a non-allowlisted Host/Origin yields HTTP
403. **Values are matched as exact raw header values**: `allowed-hosts` entries must
include the port the client actually sends (e.g. `localhost:3000`, not `localhost`),
and `allowed-origins` entries include the scheme (e.g. `https://app.example.com`) —
include an example to prevent accidental lockout. Keep the generic flag style and
correct defaults established in 7.1.3.

### Testing

- **Unit — `src/__tests__/server/dnsRebindingProtection.test.ts`** — test
  `checkDnsRebinding(headers, opts)` directly (pure, no Express needed), and
  `withDnsRebindingProtection` with stub `req`/`res`/`next`:
  - disabled → `checkDnsRebinding` returns null / wrapper calls `next`, never 403.
  - enabled + allowedHosts set: allowed host (with port) → pass; missing/other host → 403.
  - enabled + allowedOrigins set: matching origin → pass; absent origin → pass;
    other origin → 403.
  - enabled with empty lists → pass (no-op), matching the SDK requirement note.
  - exact-match incl. port: `allowedHosts=['localhost:3000']` rejects `Host: localhost`
    and accepts `Host: localhost:3000`.
- Both standalone and embedded modes are covered because the wrapper is applied in
  the shared `registerRoutes()`; a focused test may assert the wrapped handler
  rejects before delegating.
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
