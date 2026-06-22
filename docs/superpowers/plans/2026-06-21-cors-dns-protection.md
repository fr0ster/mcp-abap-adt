# DNS-rebinding Protection (Host + Origin allowlist) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the parsed-but-dropped `allowed-hosts` / `allowed-origins` / `enable-dns-protection` options actually enforce DNS-rebinding protection (Host + Origin header allowlist) on the HTTP and SSE transports.

**Architecture:** Own Express handler wrapper (the SDK transport fields are `@deprecated`). Carry the already-parsed values through `IServerConfig` → `ServerConfigManager` (transport-aware) → `launcher` → both server wrappers, which wrap their MCP route handlers inside `registerRoutes()` (shared by standalone + embedded modes). `/mcp/health` stays ungated. Defaults off (no-op) → backward compatible.

**Tech Stack:** TypeScript, Express, MCP SDK transports, Jest.

**Spec:** `docs/superpowers/specs/2026-06-21-cors-dns-protection-design.md`
**Branch:** `feat/cors-dns-protection` (checked out; spec already committed).
**Target version:** 7.2.0.

**Not CORS:** this is Host/Origin allowlist validation gated by `enableDnsRebindingProtection`; it does NOT emit `Access-Control-Allow-Origin`. Match values as exact raw header values (Host includes port, e.g. `localhost:3000`).

---

## File Structure
- Create: `src/server/dnsRebindingProtection.ts` — `checkDnsRebinding()` + `withDnsRebindingProtection()`.
- Create: `src/__tests__/server/dnsRebindingProtection.test.ts` — unit tests.
- Modify: `src/lib/config/IServerConfig.ts` — 3 new fields.
- Modify: `src/lib/config/ServerConfigManager.ts` — transport-aware mapping.
- Create: `src/__tests__/lib/serverConfigDnsRebinding.test.ts` — mapping test.
- Modify: `src/server/launcher.ts` — pass fields to both servers.
- Modify: `src/server/StreamableHttpServer.ts` — options + wrap handler in `registerRoutes`.
- Modify: `src/server/SseServer.ts` — options + wrap handlers in `registerRoutes`.
- Modify (docs): `docs/user-guide/CLI_OPTIONS.md`, `docs/installation/INSTALLATION.md`, `docs/installation/platforms/INSTALL_{LINUX,MACOS,WINDOWS}.md`, `docs/configuration/YAML_CONFIG.md`, `docs/installation/CLINE_CONFIGURATION.md`.
- Modify (release): `package.json`, `package-lock.json`, `server.json`, `CHANGELOG.md`.

---

## Task 1: DNS-rebinding module (TDD)

**Files:**
- Create: `src/server/dnsRebindingProtection.ts`
- Test: `src/__tests__/server/dnsRebindingProtection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  checkDnsRebinding,
  withDnsRebindingProtection,
} from '../../server/dnsRebindingProtection';

describe('checkDnsRebinding', () => {
  it('returns null when protection is disabled', () => {
    expect(
      checkDnsRebinding({ host: 'evil.com' }, { enable: false, allowedHosts: ['localhost:3000'] }),
    ).toBeNull();
  });

  it('enabled + allowedHosts: rejects missing/other host, accepts exact host:port', () => {
    const opts = { enable: true, allowedHosts: ['localhost:3000'] };
    expect(checkDnsRebinding({ host: 'localhost:3000' }, opts)).toBeNull();
    expect(checkDnsRebinding({ host: 'localhost' }, opts)?.status).toBe(403);
    expect(checkDnsRebinding({}, opts)?.status).toBe(403);
  });

  it('enabled + allowedOrigins: matching passes, absent passes, other rejects', () => {
    const opts = { enable: true, allowedOrigins: ['https://app.example.com'] };
    expect(checkDnsRebinding({ origin: 'https://app.example.com' }, opts)).toBeNull();
    expect(checkDnsRebinding({}, opts)).toBeNull();
    expect(checkDnsRebinding({ origin: 'https://evil.com' }, opts)?.status).toBe(403);
  });

  it('enabled with empty lists is a no-op', () => {
    expect(checkDnsRebinding({ host: 'x', origin: 'y' }, { enable: true })).toBeNull();
  });
});

describe('withDnsRebindingProtection', () => {
  const makeRes = () => {
    const res: any = { statusCode: 0, body: undefined };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: unknown) => { res.body = b; return res; };
    return res;
  };

  it('rejects with 403 before calling the handler', () => {
    let called = false;
    const wrapped = withDnsRebindingProtection(
      () => { called = true; },
      { enable: true, allowedHosts: ['localhost:3000'] },
    );
    const res = makeRes();
    wrapped({ headers: { host: 'evil.com' } } as any, res, () => {});
    expect(res.statusCode).toBe(403);
    expect(called).toBe(false);
  });

  it('delegates to the handler when validation passes', () => {
    let called = false;
    const wrapped = withDnsRebindingProtection(
      () => { called = true; },
      { enable: true, allowedHosts: ['localhost:3000'] },
    );
    const res = makeRes();
    wrapped({ headers: { host: 'localhost:3000' } } as any, res, () => {});
    expect(called).toBe(true);
    expect(res.statusCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --testPathPatterns='dnsRebindingProtection' --testPathIgnorePatterns='[]'`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the module**

```ts
// src/server/dnsRebindingProtection.ts
import type { NextFunction, Request, Response } from 'express';

export interface DnsRebindingOptions {
  enable?: boolean;
  /** Exact raw Host header values, including port (e.g. "localhost:3000"). */
  allowedHosts?: string[];
  /** Exact raw Origin header values, including scheme (e.g. "https://app.example.com"). */
  allowedOrigins?: string[];
}

type RouteHandler = (
  req: Request,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>;

function reject(message: string): { status: number; body: unknown } {
  return {
    status: 403,
    body: { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
  };
}

/** Returns a 403 descriptor if the request must be rejected, else null. */
export function checkDnsRebinding(
  headers: { host?: string; origin?: string },
  opts: DnsRebindingOptions,
): { status: number; body: unknown } | null {
  if (opts.enable !== true) return null;
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

/** Wrap an MCP route handler so it validates Host/Origin before delegating. */
export function withDnsRebindingProtection(
  handler: RouteHandler,
  opts: DnsRebindingOptions,
): RouteHandler {
  return (req, res, next) => {
    const rejection = checkDnsRebinding(
      {
        host: req.headers?.host as string | undefined,
        origin: req.headers?.origin as string | undefined,
      },
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns='dnsRebindingProtection' --testPathIgnorePatterns='[]'`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/server/dnsRebindingProtection.ts src/__tests__/server/dnsRebindingProtection.test.ts
git commit -m "feat(server): DNS-rebinding Host/Origin allowlist guard"
```

---

## Task 2: Add config fields to `IServerConfig`

**Files:** Modify `src/lib/config/IServerConfig.ts`

- [ ] **Step 1: Add three fields after the `port?: number;` field** (in the HTTP/SSE section):

```ts
  /** Allowed Host header values (DNS-rebinding protection; exact, incl. port) */
  allowedHosts?: string[];
  /** Allowed Origin header values (DNS-rebinding protection; exact, incl. scheme) */
  allowedOrigins?: string[];
  /** Enable DNS-rebinding protection (requires allowedHosts and/or allowedOrigins) */
  enableDnsRebindingProtection?: boolean;
```

- [ ] **Step 2: Type-check**

Run: `npm run test:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/config/IServerConfig.ts
git commit -m "feat(config): IServerConfig fields for DNS-rebinding protection"
```

---

## Task 3: Transport-aware mapping in `ServerConfigManager` (+ test)

**Files:**
- Modify: `src/lib/config/ServerConfigManager.ts` (`parseCommandLine`)
- Test: `src/__tests__/lib/serverConfigDnsRebinding.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { ServerConfigManager } from '../../lib/config/ServerConfigManager';

function configFor(args: string[]) {
  process.argv = ['node', 'x', ...args];
  return new ServerConfigManager().getConfigSync();
}

describe('ServerConfigManager DNS-rebinding mapping', () => {
  it('maps http flags transport-aware', () => {
    const c = configFor([
      '--transport=http',
      '--http-allowed-origins=https://a.com,https://b.com',
      '--http-allowed-hosts=localhost:3000',
      '--http-enable-dns-protection',
    ]);
    expect(c.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(c.allowedHosts).toEqual(['localhost:3000']);
    expect(c.enableDnsRebindingProtection).toBe(true);
  });

  it('maps sse flags and does not bleed http values', () => {
    const c = configFor(['--transport=sse', '--sse-allowed-hosts=localhost:3001']);
    expect(c.allowedHosts).toEqual(['localhost:3001']);
    expect(c.allowedOrigins).toBeUndefined();
    expect(c.enableDnsRebindingProtection).toBe(false);
  });

  it('maps MCP_HTTP_* env vars', () => {
    process.env.MCP_HTTP_ALLOWED_ORIGINS = 'https://a.com';
    process.env.MCP_HTTP_ENABLE_DNS_PROTECTION = 'true';
    try {
      const c = configFor(['--transport=http']);
      expect(c.allowedOrigins).toEqual(['https://a.com']);
      expect(c.enableDnsRebindingProtection).toBe(true);
    } finally {
      delete process.env.MCP_HTTP_ALLOWED_ORIGINS;
      delete process.env.MCP_HTTP_ENABLE_DNS_PROTECTION;
    }
  });

  it('maps YAML keys via applyYamlConfigToArgs', () => {
    // YAML path: applyYamlConfigToArgs pushes flags onto argv, then ArgumentsParser reads them.
    process.argv = ['node', 'x', '--transport=http'];
    applyYamlConfigToArgs({
      http: { 'allowed-hosts': ['localhost:3000'], 'enable-dns-protection': true },
    } as any);
    const c = new ServerConfigManager().getConfigSync();
    expect(c.allowedHosts).toEqual(['localhost:3000']);
    expect(c.enableDnsRebindingProtection).toBe(true);
  });
});
```

(Top of the test file also import the YAML helper: `import { applyYamlConfigToArgs } from '../../lib/config/yamlConfig';`. Confirm the env-var names against `ArgumentsParser` — `MCP_HTTP_ALLOWED_ORIGINS` / `MCP_HTTP_ALLOWED_HOSTS` / `MCP_HTTP_ENABLE_DNS_PROTECTION` and the `MCP_SSE_*` equivalents — and adjust if they differ.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --testPathPatterns='serverConfigDnsRebinding' --testPathIgnorePatterns='[]'`
Expected: FAIL (`allowedOrigins` undefined / `enableDnsRebindingProtection` undefined).

- [ ] **Step 3: Implement the mapping**

In `parseCommandLine()`, beside the existing `transportHost`/`transportPort` block, add:

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

and add to the returned object (next to `host`/`port`):

```ts
      allowedOrigins: transportAllowedOrigins,
      allowedHosts: transportAllowedHosts,
      enableDnsRebindingProtection: transportEnableDns ?? false,
```

(Note: `parsed.*` is already populated from CLI, env, and YAML — YAML via `applyYamlConfigToArgs` → `ArgumentsParser`. No YAML code needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns='serverConfigDnsRebinding' --testPathIgnorePatterns='[]'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config/ServerConfigManager.ts src/__tests__/lib/serverConfigDnsRebinding.test.ts
git commit -m "feat(config): transport-aware DNS-rebinding mapping in ServerConfigManager"
```

---

## Task 4: Wire fields through the launcher

**Files:** Modify `src/server/launcher.ts`

- [ ] **Step 1: Add the three options to BOTH server constructions**

In the `new SseServer(handlersRegistry, authBrokerFactory, { … })` options object, add:

```ts
      allowedHosts: config.allowedHosts,
      allowedOrigins: config.allowedOrigins,
      enableDnsRebindingProtection: config.enableDnsRebindingProtection,
```

In the `new StreamableHttpServer(handlersRegistry, authBrokerFactory, { … })` options object, add the same three lines.

- [ ] **Step 2: Type-check**

Run: `npm run test:check`
Expected: FAIL until Tasks 5–6 add the option fields to the server interfaces — that is expected; proceed to Tasks 5/6, then this compiles. (If executing strictly task-by-task, do Tasks 5 and 6 before re-running.)

- [ ] **Step 3: Commit** (after Tasks 5–6 make it compile, or commit together)

```bash
git add src/server/launcher.ts
git commit -m "feat(server): pass DNS-rebinding options to HTTP/SSE servers"
```

---

## Task 5: StreamableHttpServer — options + wrap handler in `registerRoutes`

**Files:** Modify `src/server/StreamableHttpServer.ts`

- [ ] **Step 1: Add the import**

```ts
import { withDnsRebindingProtection } from './dnsRebindingProtection.js';
```

- [ ] **Step 2: Add fields to `StreamableHttpServerOptions`** (next to `host?`/`port?`):

```ts
  allowedHosts?: string[];
  allowedOrigins?: string[];
  enableDnsRebindingProtection?: boolean;
```

- [ ] **Step 3: Store them on the instance** (with the other `private readonly` fields and assign in the constructor from `opts`):

```ts
  private readonly allowedHosts?: string[];
  private readonly allowedOrigins?: string[];
  private readonly enableDnsRebindingProtection?: boolean;
```
```ts
    this.allowedHosts = opts?.allowedHosts;
    this.allowedOrigins = opts?.allowedOrigins;
    this.enableDnsRebindingProtection = opts?.enableDnsRebindingProtection;
```

- [ ] **Step 4: Wrap the MCP route handlers in `registerRoutes`**

Replace `app.post(this.path, handler);` and the `app.all(this.path, (…))` registration so both go through the guard (leave `/mcp/health` as-is):

```ts
    const dnsOpts = {
      enable: this.enableDnsRebindingProtection,
      allowedHosts: this.allowedHosts,
      allowedOrigins: this.allowedOrigins,
    };
    app.post(this.path, withDnsRebindingProtection(handler, dnsOpts) as any);
    app.all(
      this.path,
      withDnsRebindingProtection((_req: Request, res: Response) => {
        res.status(405).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed.' },
          id: null,
        });
      }, dnsOpts) as any,
    );
```
(Keep whatever body the existing `app.all` handler had; just wrap it. Cast `as any` only if the local `RouteHandler`/Express types require it, matching existing style.)

- [ ] **Step 5: Type-check**

Run: `npm run test:check`
Expected: PASS (with Task 4 done).

- [ ] **Step 6: Commit**

```bash
git add src/server/StreamableHttpServer.ts
git commit -m "feat(server): apply DNS-rebinding guard in StreamableHttpServer registerRoutes"
```

---

## Task 6: SseServer — options + wrap handlers in `registerRoutes`

**Files:** Modify `src/server/SseServer.ts`

- [ ] **Step 1: Add the import**

```ts
import { withDnsRebindingProtection } from './dnsRebindingProtection.js';
```

- [ ] **Step 2: Add fields to `SseServerOptions`** (next to `host?`/`port?`):

```ts
  allowedHosts?: string[];
  allowedOrigins?: string[];
  enableDnsRebindingProtection?: boolean;
```

- [ ] **Step 3: Store on the instance** (private readonly + assign from `opts` in the constructor), same three as Task 5 Step 3.

- [ ] **Step 4: Wrap the SSE GET and POST handlers in `registerRoutes`**

The current registrations are `app.get(this.ssePath, (async (req, res) => {…}))` and `app.post(this.postPath, (async (req, res) => {…}))`. Wrap each inline handler:

```ts
    const dnsOpts = {
      enable: this.enableDnsRebindingProtection,
      allowedHosts: this.allowedHosts,
      allowedOrigins: this.allowedOrigins,
    };
    app.get(
      this.ssePath,
      withDnsRebindingProtection((async (req: any, res: any) => {
        // ...existing SSE GET handler body unchanged...
      }) as any, dnsOpts) as any,
    );
    app.post(
      this.postPath,
      withDnsRebindingProtection((async (req: any, res: any) => {
        // ...existing POST handler body unchanged...
      }) as any, dnsOpts) as any,
    );
```
Leave `app.get('/mcp/health', …)` ungated.

- [ ] **Step 5: Type-check**

Run: `npm run test:check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/SseServer.ts
git commit -m "feat(server): apply DNS-rebinding guard in SseServer registerRoutes"
```

---

## Task 7: Restore the documentation (accurate — DNS-rebinding, not CORS)

**Files:** `docs/user-guide/CLI_OPTIONS.md`, `docs/installation/INSTALLATION.md`, `docs/installation/platforms/INSTALL_{LINUX,MACOS,WINDOWS}.md`, `docs/configuration/YAML_CONFIG.md`, `docs/installation/CLINE_CONFIGURATION.md`

- [ ] **Step 1: Add a flag-reference block** to CLI_OPTIONS.md (HTTP section and SSE section) and to the INSTALLATION.md / platform-guide option lists, using this content (adjust `--http-`/`--sse-` per section):

```
DNS-rebinding protection (Host + Origin allowlist; NOT browser CORS — no
Access-Control-Allow-Origin headers are emitted):

- `--http-allowed-hosts=<list>`   Comma-separated exact Host header values to allow,
                                  including port (e.g. localhost:3000).
- `--http-allowed-origins=<list>` Comma-separated exact Origin header values to allow,
                                  including scheme (e.g. https://app.example.com).
- `--http-enable-dns-protection`  Enable validation. Required for the allowlists to take
                                  effect; needs at least one of the two lists set.
                                  A non-allowlisted Host/Origin gets HTTP 403.
```
(SSE section: same with `--sse-` prefixes. Env vars: `MCP_HTTP_ALLOWED_HOSTS`, `MCP_HTTP_ALLOWED_ORIGINS`, `MCP_HTTP_ENABLE_DNS_PROTECTION`, and `MCP_SSE_*`.)

- [ ] **Step 2: Restore the YAML keys** in YAML_CONFIG.md (template snippet + config table) under `http:` and `sse:`:

```yaml
http:
  allowed-hosts: []          # exact Host values incl. port, e.g. ["localhost:3000"]
  allowed-origins: []        # exact Origin values incl. scheme
  enable-dns-protection: false  # enable Host/Origin allowlist validation (needs a list)
```
Table rows: `http.allowed-hosts`, `http.allowed-origins`, `http.enable-dns-protection` (and `sse.*`), each described as DNS-rebinding protection.

- [ ] **Step 3: CLINE_CONFIGURATION.md** — if a security example is appropriate, add one using `--http-enable-dns-protection` + `--http-allowed-hosts=localhost:3000`.

- [ ] **Step 4: Verify no "CORS" wording** crept in and examples use host:port:

Run: `grep -rniE 'CORS|Access-Control' docs/user-guide docs/installation docs/configuration | grep -viE 'not (a |browser )?cors|no Access-Control-Allow-Origin'`
Expected: **empty**. The intentional "NOT browser CORS / no Access-Control-Allow-Origin" disclaimers added in Step 1 are filtered out by the second `grep`; any line that survives would be wrongly presenting these options as CORS and must be fixed. (Do NOT scan `docs/superpowers/` — the spec/plan there intentionally discuss CORS and would be false positives.)

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: document DNS-rebinding protection (Host/Origin allowlist)"
```

---

## Task 8: Release 7.2.0

**Files:** `package.json`, `package-lock.json`, `server.json`, `CHANGELOG.md`

- [ ] **Step 1: Bump versions** — `package.json` 7.1.3 → 7.2.0; `server.json` both version fields → 7.2.0; then `npm install --package-lock-only`.

- [ ] **Step 2: Add CHANGELOG `[7.2.0] - <date>`**:

Use the ACTUAL release date (the day Task 8 runs), not a hardcoded one:

```markdown
## [7.2.0] - <YYYY-MM-DD release date>

### Added
- **DNS-rebinding protection for the HTTP/SSE transports.** `--http-allowed-hosts`/`--sse-allowed-hosts`, `--http-allowed-origins`/`--sse-allowed-origins`, and `--http-enable-dns-protection`/`--sse-enable-dns-protection` (plus the matching `MCP_HTTP_*`/`MCP_SSE_*` env vars and the `http`/`sse` `allowed-hosts`/`allowed-origins`/`enable-dns-protection` YAML keys) now take effect: when enabled with an allowlist, requests with a non-allowlisted `Host`/`Origin` header are rejected with HTTP 403. Transport-aware (http uses `http*`, sse uses `sse*`); applied in `registerRoutes` so both standalone and embedded modes are protected; `/mcp/health` is ungated. Defaults off (no-op). This is Host/Origin allowlist validation, NOT browser CORS. Values are matched exactly (Host includes port, e.g. `localhost:3000`). Implemented as own Express middleware rather than the now-deprecated SDK transport options.
```

- [ ] **Step 3: Final gate**

Run: `npm run build` then `npm run test:check` then `npx jest --testPathPatterns='dnsRebindingProtection|serverConfigDnsRebinding' --testPathIgnorePatterns='[]'`
Expected: all clean / PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server.json CHANGELOG.md
git commit -m "chore(release): 7.2.0 — DNS-rebinding protection for HTTP/SSE"
```

---

## Self-Review

**Spec coverage:** module (Task 1) ✓; IServerConfig fields (Task 2) ✓; transport-aware mapping (Task 3) ✓; launcher wiring (Task 4) ✓; both servers wrap in registerRoutes — embedded + standalone (Tasks 5–6) ✓; health ungated (Tasks 5–6) ✓; docs as DNS-rebinding incl. host:port (Task 7) ✓; not-CORS (Task 7 Step 4) ✓; deprecated SDK options unused (own module) ✓; release 7.2.0 (Task 8) ✓.

**Placeholders:** none — code shown for every code step; doc content provided; commands have expected output. The only "…unchanged…" markers (Task 6) refer to keeping existing handler bodies verbatim while wrapping them — the change is the wrap, shown in full.

**Type consistency:** `checkDnsRebinding(headers, opts)` and `withDnsRebindingProtection(handler, opts)` names/signatures match across Tasks 1, 5, 6. `DnsRebindingOptions` fields (`enable`, `allowedHosts`, `allowedOrigins`) consistent. `IServerConfig` fields (`allowedHosts`, `allowedOrigins`, `enableDnsRebindingProtection`) used identically in ServerConfigManager (Task 3), launcher (Task 4), and both servers (Tasks 5–6).
