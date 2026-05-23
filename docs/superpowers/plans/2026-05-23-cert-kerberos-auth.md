# Certificate (mTLS) + Kerberos Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `certificate` (file-based mTLS) and `kerberos` (SPNEGO/Negotiate, single-leg) authentication to the ADT connection stack, cross-platform, on-prem HTTP only.

**Architecture:** **Both new types bypass `auth-broker` and `auth-providers`** (the broker is only for OAuth + browser-callback auth; cert/kerberos are non-interactive, connection-level). Certificate = `CertificateAbapConnection` injecting mTLS material into the axios `httpsAgent` via a new `getHttpsAgentOptions()` hook, with file I/O behind an injectable `ICertificateMaterialLoader`. Kerberos = `KerberosAbapConnection` that generates the Negotiate token **locally** via a lazy/optional `kerberos` npm wrapper living in the connection package, sends it on the first request, then reuses the SAP session cookie. No `ITokenRefresher`, no `BaseTokenProvider`.

**Tech Stack:** TypeScript, axios, `node:https` Agent, optional native `kerberos` npm. **Three repos**, bottom-up: `interfaces` → `connection` → `mcp-abap-adt` (server).

**Spec:** `docs/superpowers/specs/2026-05-23-cert-kerberos-auth-design.md` (this repo).

**Decisions locked:** PEM **and** PFX both supported. Single-leg Negotiate only. cert+kerberos bypass broker/providers.

**Worktree discipline:** Each phase runs in its own repo, on branch `feat/cert-kerberos-auth` (`git worktree add .worktrees/cert-kerberos-auth -b feat/cert-kerberos-auth`; `.worktrees/` gitignored). Never commit to `master`/`main` directly.

**PUBLISH GATE (critical):** The agent **NEVER runs `npm publish`** — the **user publishes**. Packages depend via **published npm imports, not local links**, so a consumer cannot be tested/bumped against unpublished changes. Each phase ends: implement → commit → PR/merge → **hand off to user to publish; wait for the confirmed version** → bump consumer → next phase.

---

## Phase 1 — `@mcp-abap-adt/interfaces` — ✅ DONE

Implemented, reviewed (spec + quality), committed on `feat/cert-kerberos-auth` in `~/prj/mcp-abap-adt-interfaces`:
- `SapAuthType` union → `'basic' | 'jwt' | 'saml' | 'certificate' | 'kerberos'`.
- `ISapConfig` + `certPath?`, `certKeyPath?`, `certPfxPath?`, `certPassphrase?`, `kerberosSpn?`, `kerberosService?`.
- New `src/auth/ICertificateMaterialLoader.ts` (`ICertificateMaterial`, `ICertificateMaterialLoader`), exported from `src/index.ts`.
- `IConnectionConfig.authType` **left as `'basic'|'jwt'|'saml'`** (NOT widened) — it is the broker's auth surface and cert/kerberos bypass the broker.
- Build plumbing: `tsconfig.build.json` excludes the compile-only `src/__typechecks__/` from `dist`.

**Remaining: publish gate** — user publishes `interfaces`; note the version `<IFACE_VER>` for Phases 2–3.

---

## Phase 2 — `@mcp-abap-adt/connection` (`~/prj/mcp-abap-connection`)

First: in the worktree, `npm i @mcp-abap-adt/interfaces@<IFACE_VER>` (the user-published version from Phase 1). Confirm baseline tests pass before starting.

Repo paths below are relative to `~/prj/mcp-abap-connection`. Test runner: this repo HAS a test runner (check `package.json` `scripts.test` — jest per `jest.config.js`). Use it.

### Task 2.1: `getHttpsAgentOptions()` hook on `AbstractAbapConnection`

**Files:**
- Modify: `src/connection/AbstractAbapConnection.ts` — `getAxiosInstance()` (~line 743) + add a protected hook.
- Test: `src/__tests__/connection/httpsAgentHook.test.ts`

- [ ] **Step 1: Write the failing test** (concrete subclass overriding the hook; assert options reach the Agent):

```ts
import { Agent } from 'node:https';
import { AbstractAbapConnection } from '../../connection/AbstractAbapConnection';

class TestConn extends (AbstractAbapConnection as any) {
  protected getHttpsAgentOptions() { return { cert: 'C', key: 'K' }; }
  async connect() {}
  protected buildAuthorizationHeader() { return ''; }
  getAgent(): Agent { return (this as any).getAxiosInstance().defaults.httpsAgent; }
}

test('getHttpsAgentOptions merges into the https.Agent', () => {
  const c = new TestConn({ url: 'https://h:44300', authType: 'basic' } as any, null);
  const agent = c.getAgent();
  expect((agent as any).options.cert).toBe('C');
  expect((agent as any).options.key).toBe('K');
});
```

- [ ] **Step 2: Run, verify FAIL** (hook missing). Run the repo's test command targeting this file.

- [ ] **Step 3: Implement.** Add the hook method near other protected methods:

```ts
  /** Subclasses override to inject extra https.Agent options (e.g. mTLS cert/key/pfx). */
  protected getHttpsAgentOptions(): import('node:https').AgentOptions {
    return {};
  }
```

Change `getAxiosInstance()` to merge them:

```ts
      this.axiosInstance = axios.create({
        httpsAgent: new Agent({
          rejectUnauthorized,
          ...this.getHttpsAgentOptions(),
        }),
      });
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `feat(connection): add getHttpsAgentOptions hook to AbstractAbapConnection`.

### Task 2.2: `FileCertificateMaterialLoader`

**Files:**
- Create: `src/auth/FileCertificateMaterialLoader.ts`
- Test: `src/__tests__/auth/FileCertificateMaterialLoader.test.ts`

- [ ] **Step 1: Write the failing test** (temp dir for PEM/PFX):

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileCertificateMaterialLoader } from '../../auth/FileCertificateMaterialLoader';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'certtest-'));
  writeFileSync(join(dir, 'c.crt'), 'CERT');
  writeFileSync(join(dir, 'c.key'), 'KEY');
  writeFileSync(join(dir, 'c.pfx'), Buffer.from([1, 2, 3]));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const loader = new FileCertificateMaterialLoader();

test('loads PEM cert+key', async () => {
  const m = await loader.load({ url: 'https://h', authType: 'certificate',
    certPath: join(dir, 'c.crt'), certKeyPath: join(dir, 'c.key') } as any);
  expect(m.cert?.toString()).toBe('CERT');
  expect(m.key?.toString()).toBe('KEY');
});

test('loads PFX with passphrase', async () => {
  const m = await loader.load({ url: 'https://h', authType: 'certificate',
    certPfxPath: join(dir, 'c.pfx'), certPassphrase: 'pw' } as any);
  expect(m.pfx).toBeInstanceOf(Buffer);
  expect(m.passphrase).toBe('pw');
});

test('throws when both PEM and PFX given', async () => {
  await expect(loader.load({ url: 'https://h', authType: 'certificate',
    certPath: join(dir, 'c.crt'), certPfxPath: join(dir, 'c.pfx') } as any)).rejects.toThrow();
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `src/auth/FileCertificateMaterialLoader.ts`:

```ts
import { readFile } from 'node:fs/promises';
import type {
  ICertificateMaterial,
  ICertificateMaterialLoader,
  ISapConfig,
} from '@mcp-abap-adt/interfaces';

export class FileCertificateMaterialLoader implements ICertificateMaterialLoader {
  async load(config: ISapConfig): Promise<ICertificateMaterial> {
    const hasPem = !!(config.certPath || config.certKeyPath);
    const hasPfx = !!config.certPfxPath;
    if (hasPem && hasPfx) {
      throw new Error('Certificate auth: provide either PEM (certPath+certKeyPath) OR certPfxPath, not both.');
    }
    if (hasPfx) {
      return { pfx: await readFile(config.certPfxPath as string), passphrase: config.certPassphrase };
    }
    if (config.certPath && config.certKeyPath) {
      return {
        cert: await readFile(config.certPath),
        key: await readFile(config.certKeyPath),
        passphrase: config.certPassphrase,
      };
    }
    throw new Error('Certificate auth requires certPfxPath OR (certPath AND certKeyPath).');
  }
}
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `feat(connection): file-based certificate material loader`.

### Task 2.3: `CertificateAbapConnection`

**Files:**
- Create: `src/connection/CertificateAbapConnection.ts`
- Test: `src/__tests__/connection/CertificateAbapConnection.test.ts`

- [ ] **Step 1: Write the failing test** (inject fake loader; check agent options + empty header + rfc guard):

```ts
import { CertificateAbapConnection } from '../../connection/CertificateAbapConnection';
import type { ICertificateMaterialLoader } from '@mcp-abap-adt/interfaces';

const fakeLoader: ICertificateMaterialLoader = {
  load: async () => ({ cert: 'C', key: 'K', passphrase: 'pw' }),
};
const cfg = { url: 'https://h:44300', authType: 'certificate', client: '100',
  certPath: '/x.crt', certKeyPath: '/x.key' } as any;

test('no Authorization header (mTLS identifies user)', () => {
  const c = new CertificateAbapConnection(cfg, null, undefined, fakeLoader);
  expect((c as any).buildAuthorizationHeader()).toBe('');
});

test('loaded material reaches getHttpsAgentOptions after material load', async () => {
  const c = new CertificateAbapConnection(cfg, null, undefined, fakeLoader);
  await (c as any).ensureMaterial();
  const opts = (c as any).getHttpsAgentOptions();
  expect(opts.cert).toBe('C');
  expect(opts.key).toBe('K');
});

test('rejects connectionType rfc', () => {
  expect(() => new CertificateAbapConnection({ ...cfg, connectionType: 'rfc' }, null, undefined, fakeLoader))
    .toThrow(/rfc/i);
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `src/connection/CertificateAbapConnection.ts`:

```ts
import type { AgentOptions } from 'node:https';
import type { ICertificateMaterial, ICertificateMaterialLoader } from '@mcp-abap-adt/interfaces';
import type { SapConfig } from '../config/sapConfig.js';
import type { ILogger } from '../logger.js';
import { AbstractAbapConnection } from './AbstractAbapConnection.js';
import { FileCertificateMaterialLoader } from '../auth/FileCertificateMaterialLoader.js';

/** Client-certificate (mTLS) authentication. Credential lives on the TLS agent. */
export class CertificateAbapConnection extends AbstractAbapConnection {
  private loader: ICertificateMaterialLoader;
  private material: ICertificateMaterial | null = null;

  constructor(config: SapConfig, logger?: ILogger | null, sessionId?: string, loader?: ICertificateMaterialLoader) {
    CertificateAbapConnection.validateConfig(config);
    super(config, logger || null, sessionId);
    this.loader = loader ?? new FileCertificateMaterialLoader();
  }

  private static validateConfig(config: SapConfig): void {
    if (config.authType !== 'certificate') {
      throw new Error(`Certificate connection expects authType "certificate", got "${config.authType}"`);
    }
    if (config.connectionType === 'rfc') {
      throw new Error('Certificate auth is not supported with connectionType "rfc".');
    }
    const hasPem = !!(config.certPath && config.certKeyPath);
    const hasPfx = !!config.certPfxPath;
    if (!hasPem && !hasPfx) {
      throw new Error('Certificate auth requires certPfxPath OR (certPath AND certKeyPath).');
    }
    if ((config.certPath || config.certKeyPath) && config.certPfxPath) {
      throw new Error('Certificate auth: provide either PEM pair OR PFX, not both.');
    }
  }

  private cfg(): SapConfig {
    return (this as unknown as { config: SapConfig }).config;
  }

  /** Load cert material before the first request so the cached agent carries the client cert. */
  private async ensureMaterial(): Promise<void> {
    if (!this.material) this.material = await this.loader.load(this.cfg());
  }

  async connect(): Promise<void> {
    await this.ensureMaterial();
    const baseUrl = await this.getBaseUrl();
    const discoveryUrl = `${baseUrl}/sap/bc/adt/discovery`;
    try {
      const token = await this.fetchCsrfToken(discoveryUrl, 3, 1000);
      this.setCsrfToken(token);
    } catch (error) {
      this.logger?.warn(
        `[WARN] CertificateAbapConnection - connect deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected getHttpsAgentOptions(): AgentOptions {
    if (!this.material) return {};
    const { cert, key, pfx, passphrase } = this.material;
    return { cert, key, pfx, passphrase };
  }

  protected buildAuthorizationHeader(): string {
    return '';
  }
}
```

> `getConfig()`/`getBaseUrl()`/`fetchCsrfToken()`/`setCsrfToken()` exist on `AbstractAbapConnection` (used by Saml/Jwt). The private `config` is accessed via the `cfg()` helper because the base stores it privately; if the base exposes a `getConfig()` accessor, prefer that and drop `cfg()`.

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `feat(connection): CertificateAbapConnection (mTLS via https agent)`.

### Task 2.4: `kerberosSpnego` wrapper (lazy, optional native dep)

**Files:**
- Create: `src/auth/kerberosSpnego.ts`
- Test: `src/__tests__/auth/kerberosSpnego.test.ts`
- Modify: `package.json` (`optionalDependencies`)

- [ ] **Step 1: Add optional dependency** to `package.json`:

```json
"optionalDependencies": {
  "kerberos": "^2.1.0"
}
```

- [ ] **Step 2: Write the failing test** (mock the native module; assert token returned):

```ts
test('generateSpnegoToken returns a base64 token for an SPN', async () => {
  jest.doMock('kerberos', () => ({
    initializeClient: jest.fn(async () => ({
      step: jest.fn(async (_c: string) => undefined),
      response: 'YIIBexyz==',
    })),
  }), { virtual: true });
  const { generateSpnegoToken } = await import('../../auth/kerberosSpnego');
  const token = await generateSpnegoToken('HTTP@sap-host.corp');
  expect(token).toBe('YIIBexyz==');
});
```

> Use the repo's mocking idiom (jest shown; the `{ virtual: true }` lets the test run even if `kerberos` isn't installed). Match `jest.config.js` ESM/CJS conventions.

- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Implement** `src/auth/kerberosSpnego.ts`:

```ts
/** Thin, lazily-loaded wrapper over the optional `kerberos` native package. */
export async function generateSpnegoToken(spn: string): Promise<string> {
  let kerberos: typeof import('kerberos');
  try {
    kerberos = await import('kerberos');
  } catch {
    throw new Error(
      'Kerberos authentication requires the optional "kerberos" package. ' +
        'Install it (needs GSSAPI dev libs on Linux / build tools on Windows): npm i kerberos',
    );
  }
  const client = await kerberos.initializeClient(spn, {});
  await client.step(''); // single-leg: initial AP-REQ
  const token = (client as unknown as { response?: string }).response;
  if (!token) {
    throw new Error('Kerberos: no SPNEGO token produced (no TGT? run kinit, or check SPN).');
  }
  return token;
}
```

> **Verify the `kerberos` API** against the installed package's types before finalizing: confirm `initializeClient(spn, options)` and that the produced token is on `client.response` after `step()`. Adjust the accessor if the real API differs (some versions return the token from `step()`); keep the public `generateSpnegoToken(spn): Promise<string>` shape stable so the connection and test are unaffected.

- [ ] **Step 5: Run, verify PASS.**
- [ ] **Step 6: Commit** `feat(connection): lazy SPNEGO token wrapper over optional kerberos`.

### Task 2.5: `KerberosAbapConnection`

**Files:**
- Create: `src/connection/KerberosAbapConnection.ts`
- Test: `src/__tests__/connection/KerberosAbapConnection.test.ts`

- [ ] **Step 1: Write the failing test** (mock the spnego wrapper; assert Negotiate header logic + rfc guard):

```ts
jest.mock('../../auth/kerberosSpnego', () => ({
  generateSpnegoToken: jest.fn(async (_spn: string) => 'NEG_TOKEN'),
}));
import { KerberosAbapConnection } from '../../connection/KerberosAbapConnection';

const cfg = { url: 'https://h:44300', authType: 'kerberos', client: '100', kerberosSpn: 'HTTP@h.corp' } as any;

test('emits Authorization: Negotiate <token> before a cookie exists', async () => {
  const c = new KerberosAbapConnection(cfg, null, undefined);
  await (c as any).ensureToken();
  expect((c as any).buildAuthorizationHeader()).toBe('Negotiate NEG_TOKEN');
});

test('derives SPN from url when kerberosSpn absent', async () => {
  const c = new KerberosAbapConnection({ ...cfg, kerberosSpn: undefined }, null, undefined);
  await (c as any).ensureToken();
  const spnego = await import('../../auth/kerberosSpnego');
  expect((spnego.generateSpnegoToken as any)).toHaveBeenCalledWith('HTTP@h');
});

test('rejects connectionType rfc', () => {
  expect(() => new KerberosAbapConnection({ ...cfg, connectionType: 'rfc' }, null, undefined)).toThrow(/rfc/i);
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `src/connection/KerberosAbapConnection.ts`:

```ts
import type { SapConfig } from '../config/sapConfig.js';
import type { ILogger } from '../logger.js';
import { AbstractAbapConnection } from './AbstractAbapConnection.js';
import { generateSpnegoToken } from '../auth/kerberosSpnego.js';

/** Kerberos / SPNEGO single-leg auth: send Negotiate token, reuse the resulting SAP session cookie. */
export class KerberosAbapConnection extends AbstractAbapConnection {
  private spn: string;
  private currentToken = '';

  constructor(config: SapConfig, logger?: ILogger | null, sessionId?: string) {
    KerberosAbapConnection.validateConfig(config);
    super(config, logger || null, sessionId);
    this.spn = config.kerberosSpn ?? `${config.kerberosService ?? 'HTTP'}@${new URL(config.url).hostname}`;
  }

  private static validateConfig(config: SapConfig): void {
    if (config.authType !== 'kerberos') {
      throw new Error(`Kerberos connection expects authType "kerberos", got "${config.authType}"`);
    }
    if (config.connectionType === 'rfc') {
      throw new Error('Kerberos auth is not supported with connectionType "rfc".');
    }
  }

  private async ensureToken(): Promise<void> {
    if (!this.currentToken) this.currentToken = await generateSpnegoToken(this.spn);
  }

  async connect(): Promise<void> {
    await this.ensureToken();
    const baseUrl = await this.getBaseUrl();
    const discoveryUrl = `${baseUrl}/sap/bc/adt/discovery`;
    try {
      const token = await this.fetchCsrfToken(discoveryUrl, 3, 1000);
      this.setCsrfToken(token);
      // After the first authenticated round-trip SAP issues a session cookie which the base
      // class captures and reuses; later requests need no new Negotiate token.
    } catch (error) {
      this.logger?.warn(
        `[WARN] KerberosAbapConnection - connect deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected buildAuthorizationHeader(): string {
    if (this.getCookies()) return '';            // cookie carries auth after first round-trip
    return this.currentToken ? `Negotiate ${this.currentToken}` : '';
  }
}
```

> The default `getAuthHeaders()` calls `buildAuthorizationHeader()` and sets `Authorization` only when non-empty (confirm against `AbstractAbapConnection`; `SamlAbapConnection` relies on the same empty-header behavior). `getCookies()` is inherited. If the SPNEGO token must be generated lazily on the very first request rather than only in `connect()`, also call `ensureToken()` at the top of an overridden `getAuthHeaders()` — verify which entrypoint runs first and add the guard if needed. **NTLM reject:** if a live `WWW-Authenticate` response offers only `NTLM` (challenge decodes to prefix `TlRMTVNTUAA`), throw a clear error instead of looping — add this guard when wiring the 401 path (test with a mocked 401 carrying `www-authenticate: NTLM`).

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `feat(connection): KerberosAbapConnection (single-leg Negotiate)`.

### Task 2.6: Wire the factory + config signature

**Files:**
- Modify: `src/connection/connectionFactory.ts`
- Modify: `src/config/sapConfig.ts` (`sapConfigSignature`)
- Test: `src/__tests__/connectionFactory.test.ts` (extend)

- [ ] **Step 1: Write failing factory tests:**

```ts
test('creates CertificateAbapConnection for authType certificate', () => {
  const c = createAbapConnection({ url: 'https://h', authType: 'certificate',
    certPath: '/c', certKeyPath: '/k' } as any, null);
  expect(c.constructor.name).toBe('CertificateAbapConnection');
});
test('creates KerberosAbapConnection for authType kerberos', () => {
  const c = createAbapConnection({ url: 'https://h', authType: 'kerberos', kerberosSpn: 'HTTP@h' } as any, null);
  expect(c.constructor.name).toBe('KerberosAbapConnection');
});
test('throws for certificate + rfc', () => {
  expect(() => createAbapConnection({ url: 'https://h', authType: 'certificate', connectionType: 'rfc',
    certPath: '/c', certKeyPath: '/k' } as any, null)).toThrow(/rfc/i);
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Add imports + an optional `certLoader` in `options` + cases. The kerberos case takes NO tokenRefresher (self-contained):

```ts
import { CertificateAbapConnection } from './CertificateAbapConnection.js';
import { KerberosAbapConnection } from './KerberosAbapConnection.js';
import type { ICertificateMaterialLoader } from '@mcp-abap-adt/interfaces';

export function createAbapConnection(
  config: SapConfig,
  logger?: ILogger | null,
  sessionId?: string,
  tokenRefresher?: ITokenRefresher,
  options?: { skipSessionType?: boolean; certLoader?: ICertificateMaterialLoader },
): AbapConnection {
  if (config.connectionType === 'rfc') {
    if (config.authType === 'certificate' || config.authType === 'kerberos') {
      throw new Error(`authType "${config.authType}" is not supported with connectionType "rfc".`);
    }
    return new RfcAbapConnection(config, logger);
  }

  switch (config.authType) {
    case 'basic':
      return new BaseAbapConnection(config, logger, sessionId, options);
    case 'jwt':
      return new JwtAbapConnection(config, logger, sessionId, tokenRefresher);
    case 'saml':
      return new SamlAbapConnection(config, logger, sessionId, options);
    case 'certificate':
      return new CertificateAbapConnection(config, logger, sessionId, options?.certLoader);
    case 'kerberos':
      return new KerberosAbapConnection(config, logger, sessionId);
    default:
      throw new Error(`Unsupported SAP authentication type: ${config.authType}`);
  }
}
```

> Verify no existing caller passes a 5th positional arg in a way the widened `options` shape breaks.

- [ ] **Step 4: Extend `sapConfigSignature()`** in `src/config/sapConfig.ts` — add to the returned object (paths/flags only, never secrets):

```ts
    certPath: config.certPath ?? null,
    certKeyPath: config.certKeyPath ?? null,
    certPfxPath: config.certPfxPath ?? null,
    certPassphrase: config.certPassphrase ? 'set' : null,
    kerberosSpn: config.kerberosSpn ?? null,
```

- [ ] **Step 5: Run all connection tests, verify PASS.**
- [ ] **Step 6: Commit** `feat(connection): route certificate/kerberos in factory; extend config signature`.

### Task 2.7: Release connection (publish gate — user publishes)

- [ ] **Step 1:** Bump version + CHANGELOG, commit. `npm run build` + full test suite green. **Do NOT publish.**
- [ ] **Step 2:** PR + merge.
- [ ] **Step 3: HAND OFF — ask the user to publish; record the confirmed version `<CONN_VER>` before Phase 3.**

---

## Phase 3 — `mcp-abap-adt` (server, this repo)

First: in the worktree, bump `@mcp-abap-adt/interfaces@<IFACE_VER>` and `@mcp-abap-adt/connection@<CONN_VER>` to the user-confirmed published versions. Work on branch `feat/cert-kerberos-auth`.

### Task 3.1: Shared `parseAuthType()` accepting new types

**Files:**
- Create: `src/lib/config/parseAuthType.ts`
- Modify: `src/lib/config.ts` (~59-75), `src/lib/utils.ts` (~1892-1900)
- Test: `src/__tests__/lib/parseAuthType.test.ts`

- [ ] **Step 1: Write failing test:**

```ts
import { parseAuthType } from '../../lib/config/parseAuthType';

test('maps env to auth types', () => {
  expect(parseAuthType({ SAP_JWT_TOKEN: 'x' })).toBe('jwt');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'xsuaa' })).toBe('jwt');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'certificate' })).toBe('certificate');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'kerberos' })).toBe('kerberos');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'saml' })).toBe('saml');
  expect(parseAuthType({})).toBe('basic');
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `src/lib/config/parseAuthType.ts`:

```ts
import type { SapAuthType } from '@mcp-abap-adt/interfaces';

export function parseAuthType(env: NodeJS.ProcessEnv | Record<string, string | undefined>): SapAuthType {
  if (env.SAP_JWT_TOKEN) return 'jwt';
  const raw = env.SAP_AUTH_TYPE?.trim().toLowerCase();
  if (!raw) return 'basic';
  if (raw === 'xsuaa') return 'jwt';
  if (raw === 'basic' || raw === 'jwt' || raw === 'saml' || raw === 'certificate' || raw === 'kerberos') {
    return raw;
  }
  return 'basic';
}
```

- [ ] **Step 4: Replace both inline parsers** in `config.ts` (~59-75) and `utils.ts` (~1892-1900) with `parseAuthType(process.env)`. Remove the duplicated literal logic.
- [ ] **Step 5: Run, verify PASS.**
- [ ] **Step 6: Commit** `refactor(config): shared parseAuthType incl. certificate/kerberos`.

### Task 3.2: Read new env fields into `SapConfig`

**Files:**
- Modify: wherever `SapConfig` is assembled from env (`src/lib/config.ts`, and `src/lib/utils.ts` if it builds a parallel config).
- Test: extend the existing config-building test (or add one targeting the exported builder).

- [ ] **Step 1: Write failing test** — `SAP_AUTH_TYPE=certificate` + `SAP_CERT_PATH`/`SAP_CERT_KEY_PATH` env yields a config with those fields; `SAP_AUTH_TYPE=kerberos` + `SAP_KERBEROS_SPN` yields `kerberosSpn`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — where the config object is built, add:

```ts
    certPath: process.env.SAP_CERT_PATH,
    certKeyPath: process.env.SAP_CERT_KEY_PATH,
    certPfxPath: process.env.SAP_CERT_PFX_PATH,
    certPassphrase: process.env.SAP_CERT_PASSPHRASE,
    kerberosSpn: process.env.SAP_KERBEROS_SPN,
    kerberosService: process.env.SAP_KERBEROS_SERVICE,
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** `feat(config): read cert/kerberos env into SapConfig`.

### Task 3.3: Confirm the connection-creation path (NOT the broker)

**Files:**
- Investigate, then minimal change: wherever the server calls `createAbapConnection(...)` for basic/RFC auth.

- [ ] **Step 1:** Locate where the server constructs an `AbapConnection` for non-broker auth (grep for `createAbapConnection` in `src/`). Confirm cert/kerberos `SapConfig` flows there unchanged. Certificate/kerberos must NOT be routed through `brokerFactory`/`IBrokerSessionConfig` (broker is OAuth-only).
- [ ] **Step 2:** If the path already passes the full `SapConfig` (with the new fields) to `createAbapConnection`, no code change is needed beyond Task 3.2 — add a test asserting that a `certificate`/`kerberos` config produces the right connection class via the server's creation path. If the server narrows authType anywhere (e.g. only handles basic/jwt before delegating), widen that branch.
- [ ] **Step 3:** Run, verify PASS. Commit (only if a change was needed) `feat(server): create certificate/kerberos connections via direct path`.

### Task 3.4: Docs + help text

**Files:**
- Modify: `src/lib/utils.ts` (~1337 env help block), `README.md`, `CHANGELOG.md`

- [ ] **Step 1:** Add to help text:

```
  SAP_CERT_PATH / SAP_CERT_KEY_PATH         Client cert + key (PEM) for certificate auth
  SAP_CERT_PFX_PATH / SAP_CERT_PASSPHRASE   PKCS#12 cert for certificate auth
  SAP_KERBEROS_SPN                          SPN for kerberos auth (default HTTP@<host>)
  SAP_AUTH_TYPE                             basic|jwt|saml|certificate|kerberos (default: basic)
```

- [ ] **Step 2:** README: document cert/kerberos setup (on-prem HTTP only; kerberos prereq: `kinit`/keytab + optional `kerberos` npm). Update CHANGELOG.
- [ ] **Step 3: Commit** `docs: certificate + kerberos auth env vars and setup`.

### Task 3.5: Integration smoke (live, gated)

**Files:**
- Create/extend: integration smoke behind env gates (see integration-test-env-gates skill).

- [ ] **Step 1:** Add `describeCertificate`/`describeKerberos` gates that run only when `SAP_CERT_PATH`/`SAP_KERBEROS_SPN` (+ a target system) are present. One read (e.g. read a class source) per auth type.
- [ ] **Step 2: Coordinate with the user** to run against a real on-prem system supporting the auth type (per CLAUDE.md — do not automate SAP env verification). Validate spec assumption A1 (single-leg) on kerberos here.
- [ ] **Step 3:** Save full log to `/tmp/integration-cert-kerberos.log` (no `tail` truncation). Commit any test additions.

### Task 3.6: Release server (publish gate — user publishes)

- [ ] **Step 1:** Bump version + CHANGELOG, regenerate tool catalogs if affected (auth is not a tool — likely none). `npm run build` + tests green. **Do NOT publish.** PR, merge.
- [ ] **Step 2: HAND OFF — ask the user to publish the server package.**
- [ ] **Step 3:** Once the user confirms the full feature is published and verified, **delete the spec** `docs/superpowers/specs/2026-05-23-cert-kerberos-auth-design.md` and this plan (project lifecycle rule). History remains in git.

---

## Self-review notes

- **Spec coverage:** §3.1 → Phase 1 (done); §3.2 connection (cert+kerberos+spnego+factory) → Tasks 2.1–2.6; §3.3 (auth-providers/broker NOT touched) → respected (no tasks, by design); §3.4 server → Tasks 3.1–3.4; §4 config surface → 3.1/3.2/3.4; §5 security (no secret logging) → loader/signature avoid secrets; **NTLM reject** → folded into Task 2.5 note (add the guard when wiring the 401 path; test with mocked `www-authenticate: NTLM`); §6 test plan → per-task tests + 3.5; §7 release order → phase order; §8 A1/A4 → Tasks 2.5/2.3 notes.
- **No broker/providers tasks** — intentional (cert+kerberos bypass them).
- **Type consistency:** `ICertificateMaterialLoader.load(config)`, `getHttpsAgentOptions()`, `generateSpnegoToken(spn)`, `createAbapConnection(..., options?.certLoader)` are used consistently across tasks. Kerberos connection takes NO `tokenRefresher`.
- **Verify-in-code flags:** the `kerberos` npm token accessor (`client.response`, Task 2.4); the server's connection-creation path (Task 3.3); `AbstractAbapConnection` empty-header behavior for kerberos cookie phase (Task 2.5).