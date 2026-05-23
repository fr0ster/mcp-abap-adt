# Certificate (mTLS) + Kerberos Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `certificate` (file-based mTLS) and `kerberos` (SPNEGO/Negotiate) authentication to the ADT connection stack, cross-platform, on-prem HTTP only.

**Architecture:** Kerberos = token provider (`KerberosProvider extends BaseTokenProvider`) consumed via the existing `ITokenRefresher` injection (the JWT path); the connection emits `Authorization: Negotiate <token>` and reuses the resulting SAP session cookie (single-leg). Certificate = connection subclass (`CertificateAbapConnection`) that injects mTLS material into the axios `httpsAgent` via a new `getHttpsAgentOptions()` hook, with file I/O behind an injectable `ICertificateMaterialLoader`. Native `kerberos` npm is an `optionalDependency` loaded lazily.

**Tech Stack:** TypeScript, axios, `node:https` Agent, `kerberos` npm (optional/native), vitest/jest per repo. Five repos delivered bottom-up: `interfaces` → `auth-providers` → `connection` → `auth-broker` → `mcp-abap-adt`.

**Spec:** `docs/superpowers/specs/2026-05-23-cert-kerberos-auth-design.md` (this repo).

**Worktree discipline:** Each phase runs in its own repo. Before touching a repo, create a worktree on branch `feat/cert-kerberos-auth` in that repo (`git worktree add .worktrees/cert-kerberos-auth -b feat/cert-kerberos-auth`; ensure `.worktrees/` is gitignored). Never commit to `master`/`main` directly.

**PUBLISH GATE (critical):** The agent **NEVER runs `npm publish`** — the **user publishes**. Packages depend on each other via **published npm imports, not local links**, so a consumer repo cannot be tested or bumped against unpublished changes. Each phase therefore ends at a hard gate: implement → commit → (PR/merge) → **hand the package off to the user to publish and wait for their confirmation of the published version** → only then bump the consumer and start the next phase.

**Decisions locked:** PEM **and** PFX both supported. Single-leg Negotiate only (no mutual-auth continuation in v1).

---

## Phase 1 — `@mcp-abap-adt/interfaces` (`~/prj/mcp-abap-adt-interfaces`)

Repo paths below are relative to `~/prj/mcp-abap-adt-interfaces`.

### Task 1.1: Extend `SapAuthType` union

**Files:**
- Modify: `src/sap/SapAuthType.ts`
- Test: `src/__tests__/sapAuthType.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'; // or jest — match repo runner
import type { SapAuthType } from '../sap/SapAuthType';

describe('SapAuthType', () => {
  it('accepts certificate and kerberos', () => {
    const a: SapAuthType[] = ['basic', 'jwt', 'saml', 'certificate', 'kerberos'];
    expect(a).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test, verify it fails to compile** (`certificate`/`kerberos` not assignable).
  Run: repo test command (check `package.json` `scripts.test`). Expected: TS error on the array.

- [ ] **Step 3: Implement**

```ts
export type SapAuthType = 'basic' | 'jwt' | 'saml' | 'certificate' | 'kerberos';

export type SapConnectionType = 'http' | 'rfc';
```

- [ ] **Step 4: Run test, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/sap/SapAuthType.ts src/__tests__/sapAuthType.test.ts
git commit -m "feat(types): add certificate and kerberos to SapAuthType"
```

### Task 1.2: Add config fields to `ISapConfig`

**Files:**
- Modify: `src/sap/ISapConfig.ts`

- [ ] **Step 1: Add fields** (after the existing optional fields, before `uaaUrl`):

```ts
  // Certificate (mTLS) auth — file-based, cross-platform
  certPath?: string;        // PEM cert file
  certKeyPath?: string;     // PEM private key file
  certPfxPath?: string;     // PKCS#12 / PFX file (alternative to PEM pair)
  certPassphrase?: string;  // optional passphrase for key/PFX

  // Kerberos / SPNEGO auth
  kerberosSpn?: string;     // e.g. "HTTP@sap-host.corp"; derived from url if absent
  kerberosService?: string; // service class, default "HTTP"
```

- [ ] **Step 2: Build the package** (`npm run build`). Expected: compiles. Commit.

```bash
git add src/sap/ISapConfig.ts
git commit -m "feat(types): add cert/kerberos fields to ISapConfig"
```

### Task 1.3: Add `ICertificateMaterialLoader` interface

**Files:**
- Create: `src/auth/ICertificateMaterialLoader.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create the interface**

```ts
import type { ISapConfig } from '../sap/ISapConfig';

/** Loaded TLS client-cert material for an https.Agent. */
export interface ICertificateMaterial {
  cert?: Buffer | string;
  key?: Buffer | string;
  pfx?: Buffer;
  passphrase?: string;
}

/** Loads client-certificate material from a connection config (file paths, etc.). */
export interface ICertificateMaterialLoader {
  load(config: ISapConfig): Promise<ICertificateMaterial>;
}
```

- [ ] **Step 2: Export from `src/index.ts`** — add:

```ts
export type {
  ICertificateMaterial,
  ICertificateMaterialLoader,
} from './auth/ICertificateMaterialLoader';
```

- [ ] **Step 3: Build, verify compile. Commit.**

```bash
git add src/auth/ICertificateMaterialLoader.ts src/index.ts
git commit -m "feat(types): add ICertificateMaterialLoader"
```

### Task 1.4: Release interfaces (publish gate — user publishes)

- [ ] **Step 1:** Bump version in `package.json` (patch/minor per repo convention), update CHANGELOG. Commit.
- [ ] **Step 2:** `npm run build` and run the package's tests — confirm green. **Do NOT publish.**
- [ ] **Step 3:** Open PR for the worktree branch, merge per project workflow.
- [ ] **Step 4: HAND OFF — ask the user to `npm publish` and tell you the published version `X.Y.Z`. Wait for confirmation before Phase 2** (consumers import the published version, not a local link).

---

## Phase 2 — `@mcp-abap-adt/auth-providers` (`~/prj/mcp-abap-adt-auth-providers`)

First: `npm i @mcp-abap-adt/interfaces@X.Y.Z` (the version from Task 1.4).

### Task 2.1: Native SPNEGO wrapper (lazy, optional)

**Files:**
- Create: `src/sso/kerberosSpnego.ts`
- Test: `src/__tests__/sso/kerberosSpnego.test.ts`
- Modify: `package.json` (`optionalDependencies`)

- [ ] **Step 1: Add optional dependency** to `package.json`:

```json
"optionalDependencies": {
  "kerberos": "^2.1.0"
}
```

- [ ] **Step 2: Write the failing test** (the module must lazy-load and surface a clear error when `kerberos` is absent; we test the public shape with the native call mocked):

```ts
import { describe, it, expect, vi } from 'vitest';

describe('kerberosSpnego', () => {
  it('generateSpnegoToken returns a base64 token for an SPN', async () => {
    vi.doMock('kerberos', () => ({
      initializeClient: vi.fn(async () => ({
        step: vi.fn(async (_challenge: string) => undefined),
        // after step, the response token is exposed on `.response`
        response: 'YIIBexyz==',
      })),
    }));
    const { generateSpnegoToken } = await import('../../sso/kerberosSpnego');
    const token = await generateSpnegoToken('HTTP@sap-host.corp');
    expect(token).toBe('YIIBexyz==');
  });
});
```

- [ ] **Step 3: Run test, verify FAIL** (module missing).

- [ ] **Step 4: Implement** `src/sso/kerberosSpnego.ts`:

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

  // mechOID GSS_MECH_OID_SPNEGO; client uses ambient TGT from the OS credential cache.
  const client = await kerberos.initializeClient(spn, {});
  // Single-leg: produce the initial AP-REQ. Empty challenge for the first step.
  await client.step('');
  const token = (client as unknown as { response?: string }).response;
  if (!token) {
    throw new Error('Kerberos: no SPNEGO token produced (no TGT? run kinit, or check SPN).');
  }
  return token;
}
```

- [ ] **Step 5: Run test, verify PASS. Commit.**

```bash
git add src/sso/kerberosSpnego.ts src/__tests__/sso/kerberosSpnego.test.ts package.json
git commit -m "feat(providers): lazy SPNEGO token wrapper over optional kerberos"
```

### Task 2.2: `KerberosProvider`

**Files:**
- Create: `src/providers/KerberosProvider.ts`
- Test: `src/__tests__/providers/KerberosProvider.test.ts`
- Modify: `src/providers/index.ts`, `src/index.ts`

- [ ] **Step 1: Write the failing test** (mock the spnego wrapper; assert `ITokenResult` shape):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../sso/kerberosSpnego', () => ({
  generateSpnegoToken: vi.fn(async (_spn: string) => 'NEG_TOKEN_1'),
}));

describe('KerberosProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performLogin returns negotiate token as opaque', async () => {
    const { KerberosProvider } = await import('../../providers/KerberosProvider');
    const p = new KerberosProvider({ spn: 'HTTP@host.corp' });
    const result = await p.getTokens();
    expect(result.authorizationToken).toBe('NEG_TOKEN_1');
    expect(result.tokenType).toBe('opaque');
  });

  it('performRefresh regenerates the token', async () => {
    const spnego = await import('../../sso/kerberosSpnego');
    const { KerberosProvider } = await import('../../providers/KerberosProvider');
    const p = new KerberosProvider({ spn: 'HTTP@host.corp' });
    await p.getTokens();
    (spnego.generateSpnegoToken as any).mockResolvedValueOnce('NEG_TOKEN_2');
    const refreshed = await (p as any).performRefresh();
    expect(refreshed.authorizationToken).toBe('NEG_TOKEN_2');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL.**

- [ ] **Step 3: Implement** `src/providers/KerberosProvider.ts` (mirror `Saml2PureProvider`):

```ts
import type { ILogger, ITokenResult, OAuth2GrantType } from '@mcp-abap-adt/interfaces';
import { AUTH_TYPE_USER_TOKEN } from '@mcp-abap-adt/interfaces';
import { generateSpnegoToken } from '../sso/kerberosSpnego';
import { BaseTokenProvider } from './BaseTokenProvider';

export interface KerberosProviderConfig {
  spn: string; // e.g. "HTTP@sap-host.corp"
  logger?: ILogger;
  /** Negotiate token TTL hint in ms (SPNEGO token is short-lived; force re-init). Default 5 min. */
  ttlMs?: number;
}

export class KerberosProvider extends BaseTokenProvider {
  private config: KerberosProviderConfig;

  constructor(config: KerberosProviderConfig) {
    super();
    this.config = config;
    this.logger = config.logger;
    this.tokenType = 'opaque';
    if (!config.spn) {
      const e = new Error('Missing required field: spn') as Error & { code: string };
      e.code = 'VALIDATION_ERROR';
      throw e;
    }
  }

  protected getAuthType(): OAuth2GrantType {
    return AUTH_TYPE_USER_TOKEN;
  }

  protected async performLogin(): Promise<ITokenResult> {
    const token = await generateSpnegoToken(this.config.spn);
    const ttl = this.config.ttlMs ?? 5 * 60 * 1000;
    return {
      authorizationToken: token,
      authType: AUTH_TYPE_USER_TOKEN,
      tokenType: 'opaque',
      expiresAt: Date.now() + ttl,
    };
  }

  protected async performRefresh(): Promise<ITokenResult> {
    return this.performLogin();
  }
}
```

> If `AUTH_TYPE_USER_TOKEN` is not exported from interfaces, use the same constant `Saml2PureProvider` imports (grep `Saml2PureProvider.ts` for the exact symbol).

- [ ] **Step 4: Export** — add to `src/providers/index.ts`:

```ts
export { KerberosProvider } from './KerberosProvider';
export type { KerberosProviderConfig } from './KerberosProvider';
```

and re-export `KerberosProvider` + `KerberosProviderConfig` from `src/index.ts` alongside the other providers.

- [ ] **Step 5: Run test, verify PASS. Commit.**

```bash
git add src/providers/KerberosProvider.ts src/providers/index.ts src/index.ts src/__tests__/providers/KerberosProvider.test.ts
git commit -m "feat(providers): add KerberosProvider (SPNEGO, opaque token)"
```

### Task 2.3: Release auth-providers (publish gate — user publishes)

- [ ] **Step 1:** Bump version + CHANGELOG, commit. `npm run build` + tests green. **Do NOT publish.**
- [ ] **Step 2:** PR + merge.
- [ ] **Step 3: HAND OFF — ask the user to publish; wait for the confirmed published version before Phase 3.**

---

## Phase 3 — `@mcp-abap-adt/connection` (`~/prj/mcp-abap-connection`)

First: `npm i @mcp-abap-adt/interfaces@<v>` (Task 1.4 version).

### Task 3.1: `getHttpsAgentOptions()` hook on `AbstractAbapConnection`

**Files:**
- Modify: `src/connection/AbstractAbapConnection.ts` (`getAxiosInstance`, ~line 743)
- Test: `src/__tests__/connection/httpsAgentHook.test.ts`

- [ ] **Step 1: Write the failing test** (a tiny concrete subclass overriding the hook; assert the Agent options are applied):

```ts
import { describe, it, expect } from 'vitest';
import { Agent } from 'node:https';

// minimal concrete subclass exposing the agent for assertion
import { AbstractAbapConnection } from '../../connection/AbstractAbapConnection';

class TestConn extends (AbstractAbapConnection as any) {
  protected getHttpsAgentOptions() { return { rejectUnauthorized: false, cert: 'C', key: 'K' }; }
  async connect() {}
  protected buildAuthorizationHeader() { return ''; }
  // expose the private axios agent
  getAgent() { return (this as any).getAxiosInstance().defaults.httpsAgent as Agent; }
}

describe('getHttpsAgentOptions hook', () => {
  it('merges subclass agent options into the https.Agent', () => {
    const c = new TestConn({ url: 'https://h:44300', authType: 'basic' } as any, null);
    const agent = c.getAgent();
    expect((agent as any).options.cert).toBe('C');
    expect((agent as any).options.key).toBe('K');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL** (hook does not exist; cert not on agent).

- [ ] **Step 3: Implement.** Add the hook method to the class (near other protected methods):

```ts
  /** Subclasses override to inject extra https.Agent options (e.g. mTLS cert/key/pfx). */
  protected getHttpsAgentOptions(): import('node:https').AgentOptions {
    return {};
  }
```

Then change `getAxiosInstance()` to merge them:

```ts
      this.axiosInstance = axios.create({
        httpsAgent: new Agent({
          rejectUnauthorized,
          ...this.getHttpsAgentOptions(),
        }),
      });
```

- [ ] **Step 4: Run test, verify PASS. Commit.**

```bash
git add src/connection/AbstractAbapConnection.ts src/__tests__/connection/httpsAgentHook.test.ts
git commit -m "feat(connection): add getHttpsAgentOptions hook to AbstractAbapConnection"
```

### Task 3.2: `FileCertificateMaterialLoader`

**Files:**
- Create: `src/auth/FileCertificateMaterialLoader.ts`
- Test: `src/__tests__/auth/FileCertificateMaterialLoader.test.ts`

- [ ] **Step 1: Write the failing test** (use a temp dir):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('FileCertificateMaterialLoader', () => {
  const loader = new FileCertificateMaterialLoader();

  it('loads PEM cert+key', async () => {
    const m = await loader.load({ url: 'https://h', authType: 'certificate',
      certPath: join(dir, 'c.crt'), certKeyPath: join(dir, 'c.key') } as any);
    expect(m.cert?.toString()).toBe('CERT');
    expect(m.key?.toString()).toBe('KEY');
  });

  it('loads PFX with passphrase', async () => {
    const m = await loader.load({ url: 'https://h', authType: 'certificate',
      certPfxPath: join(dir, 'c.pfx'), certPassphrase: 'pw' } as any);
    expect(m.pfx).toBeInstanceOf(Buffer);
    expect(m.passphrase).toBe('pw');
  });

  it('throws when both PEM and PFX given', async () => {
    await expect(loader.load({ url: 'https://h', authType: 'certificate',
      certPath: join(dir, 'c.crt'), certPfxPath: join(dir, 'c.pfx') } as any)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL.**

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

- [ ] **Step 4: Run test, verify PASS. Commit.**

```bash
git add src/auth/FileCertificateMaterialLoader.ts src/__tests__/auth/FileCertificateMaterialLoader.test.ts
git commit -m "feat(connection): file-based certificate material loader"
```

### Task 3.3: `CertificateAbapConnection`

**Files:**
- Create: `src/connection/CertificateAbapConnection.ts`
- Test: `src/__tests__/connection/CertificateAbapConnection.test.ts`

- [ ] **Step 1: Write the failing test** (inject a fake loader; assert agent options + empty auth header):

```ts
import { describe, it, expect } from 'vitest';
import { CertificateAbapConnection } from '../../connection/CertificateAbapConnection';
import type { ICertificateMaterialLoader } from '@mcp-abap-adt/interfaces';

const fakeLoader: ICertificateMaterialLoader = {
  load: async () => ({ cert: 'C', key: 'K', passphrase: 'pw' }),
};

describe('CertificateAbapConnection', () => {
  const cfg = { url: 'https://h:44300', authType: 'certificate', client: '100',
    certPath: '/x.crt', certKeyPath: '/x.key' } as any;

  it('builds no Authorization header (mTLS identifies user)', () => {
    const c = new CertificateAbapConnection(cfg, null, undefined, fakeLoader);
    expect((c as any).buildAuthorizationHeader()).toBe('');
  });

  it('puts loaded material on the https agent after connect', async () => {
    const c = new CertificateAbapConnection(cfg, null, undefined, fakeLoader);
    await (c as any).loadMaterialForTest(); // helper that calls the loader path
    const opts = (c as any).getHttpsAgentOptions();
    expect(opts.cert).toBe('C');
    expect(opts.key).toBe('K');
  });

  it('rejects connectionType rfc', () => {
    expect(() => new CertificateAbapConnection({ ...cfg, connectionType: 'rfc' }, null, undefined, fakeLoader))
      .toThrow(/rfc/i);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL.**

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

  constructor(
    config: SapConfig,
    logger?: ILogger | null,
    sessionId?: string,
    loader?: ICertificateMaterialLoader,
  ) {
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

  /** Load material before the first request so the cached agent carries the client cert. */
  private async loadMaterialForTest(): Promise<void> {
    this.material = await this.loader.load(this.getConfigForLoader());
  }

  // expose config to the loader (AbstractAbapConnection stores it privately)
  private getConfigForLoader(): SapConfig {
    return (this as unknown as { config: SapConfig }).config;
  }

  async connect(): Promise<void> {
    this.material = await this.loader.load(this.getConfigForLoader());
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

> The test calls `loadMaterialForTest()` and `getConfigForLoader()` — both are private helpers above. If the repo lints against unused/private test hooks, mark them with a `/* @internal */` comment rather than deleting. `getConfig()`/`getBaseUrl()`/`fetchCsrfToken()`/`setCsrfToken()` already exist on `AbstractAbapConnection` (used by `SamlAbapConnection`/`JwtAbapConnection`).

- [ ] **Step 4: Run test, verify PASS. Commit.**

```bash
git add src/connection/CertificateAbapConnection.ts src/__tests__/connection/CertificateAbapConnection.test.ts
git commit -m "feat(connection): CertificateAbapConnection (mTLS via https agent)"
```

### Task 3.4: `KerberosAbapConnection`

**Files:**
- Create: `src/connection/KerberosAbapConnection.ts`
- Test: `src/__tests__/connection/KerberosAbapConnection.test.ts`

- [ ] **Step 1: Write the failing test** (inject a fake `ITokenRefresher`; assert Negotiate header):

```ts
import { describe, it, expect } from 'vitest';
import { KerberosAbapConnection } from '../../connection/KerberosAbapConnection';
import type { ITokenRefresher } from '@mcp-abap-adt/interfaces';

const refresher: ITokenRefresher = {
  getToken: async () => 'NEG_TOKEN',
  refreshToken: async () => 'NEG_TOKEN_2',
};

describe('KerberosAbapConnection', () => {
  const cfg = { url: 'https://h:44300', authType: 'kerberos', client: '100',
    kerberosSpn: 'HTTP@h.corp' } as any;

  it('emits Authorization: Negotiate <token>', async () => {
    const c = new KerberosAbapConnection(cfg, null, undefined, refresher);
    await (c as any).primeToken();           // pulls initial token via refresher.getToken()
    expect((c as any).buildAuthorizationHeader()).toBe('Negotiate NEG_TOKEN');
  });

  it('rejects connectionType rfc', () => {
    expect(() => new KerberosAbapConnection({ ...cfg, connectionType: 'rfc' }, null, undefined, refresher))
      .toThrow(/rfc/i);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL.**

- [ ] **Step 3: Implement** `src/connection/KerberosAbapConnection.ts` (mirror `JwtAbapConnection`, swap prefix):

```ts
import type { ITokenRefresher } from '@mcp-abap-adt/interfaces';
import type { SapConfig } from '../config/sapConfig.js';
import type { ILogger } from '../logger.js';
import { AbstractAbapConnection } from './AbstractAbapConnection.js';

/** Kerberos / SPNEGO single-leg auth: send Negotiate token, reuse resulting SAP session cookie. */
export class KerberosAbapConnection extends AbstractAbapConnection {
  private tokenRefresher: ITokenRefresher;
  private currentToken = '';

  constructor(
    config: SapConfig,
    logger?: ILogger | null,
    sessionId?: string,
    tokenRefresher?: ITokenRefresher,
  ) {
    KerberosAbapConnection.validateConfig(config);
    super(config, logger || null, sessionId);
    if (!tokenRefresher) throw new Error('KerberosAbapConnection requires a tokenRefresher.');
    this.tokenRefresher = tokenRefresher;
  }

  private static validateConfig(config: SapConfig): void {
    if (config.authType !== 'kerberos') {
      throw new Error(`Kerberos connection expects authType "kerberos", got "${config.authType}"`);
    }
    if (config.connectionType === 'rfc') {
      throw new Error('Kerberos auth is not supported with connectionType "rfc".');
    }
  }

  private async primeToken(): Promise<void> {
    this.currentToken = await this.tokenRefresher.getToken();
  }

  async connect(): Promise<void> {
    await this.primeToken();
    const baseUrl = await this.getBaseUrl();
    const discoveryUrl = `${baseUrl}/sap/bc/adt/discovery`;
    try {
      const token = await this.fetchCsrfToken(discoveryUrl, 3, 1000);
      this.setCsrfToken(token);
      // After the first authenticated round-trip, SAP issues a session cookie which the
      // base class captures and reuses; subsequent requests need no new Negotiate token.
    } catch (error) {
      this.logger?.warn(
        `[WARN] KerberosAbapConnection - connect deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected buildAuthorizationHeader(): string {
    // Once a session cookie exists, the cookie carries auth; only send Negotiate while no cookie yet.
    if (this.getCookies()) return '';
    return this.currentToken ? `Negotiate ${this.currentToken}` : '';
  }
}
```

> `getCookies()`, `getBaseUrl()`, `fetchCsrfToken()`, `setCsrfToken()` are inherited (same ones `JwtAbapConnection`/`SamlAbapConnection` use). If a live system rejects the cookie-only follow-ups, that surfaces assumption A1 in the spec — escalate, do not silently loop.

- [ ] **Step 4: Run test, verify PASS. Commit.**

```bash
git add src/connection/KerberosAbapConnection.ts src/__tests__/connection/KerberosAbapConnection.test.ts
git commit -m "feat(connection): KerberosAbapConnection (single-leg Negotiate)"
```

### Task 3.5: Wire the factory + config signature

**Files:**
- Modify: `src/connection/connectionFactory.ts`
- Modify: `src/config/sapConfig.ts` (`sapConfigSignature`)
- Test: `src/__tests__/connectionFactory.test.ts` (extend existing)

- [ ] **Step 1: Write failing factory tests** — add cases:

```ts
it('creates CertificateAbapConnection for authType certificate', () => {
  const c = createAbapConnection({ url: 'https://h', authType: 'certificate',
    certPath: '/c', certKeyPath: '/k' } as any, null);
  expect(c.constructor.name).toBe('CertificateAbapConnection');
});

it('creates KerberosAbapConnection for authType kerberos', () => {
  const c = createAbapConnection({ url: 'https://h', authType: 'kerberos', kerberosSpn: 'HTTP@h' } as any,
    null, undefined, { getToken: async () => 't', refreshToken: async () => 't' } as any);
  expect(c.constructor.name).toBe('KerberosAbapConnection');
});

it('throws for certificate + rfc', () => {
  expect(() => createAbapConnection({ url: 'https://h', authType: 'certificate', connectionType: 'rfc',
    certPath: '/c', certKeyPath: '/k' } as any, null)).toThrow(/rfc/i);
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement.** Add imports and a `certLoader` param + cases. The factory signature gains an optional loader (default constructed inside the connection if omitted):

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
      return new KerberosAbapConnection(config, logger, sessionId, tokenRefresher);
    default:
      throw new Error(`Unsupported SAP authentication type: ${config.authType}`);
  }
}
```

> Note: `options` previously was `{ skipSessionType?: boolean }`. Existing callers passing the old shape still compile. Verify no caller passes a 5th positional arg positionally that breaks.

- [ ] **Step 4: Extend `sapConfigSignature()`** in `src/config/sapConfig.ts` — add to the returned object (presence flags / paths, never secrets):

```ts
    certPath: config.certPath ?? null,
    certKeyPath: config.certKeyPath ?? null,
    certPfxPath: config.certPfxPath ?? null,
    certPassphrase: config.certPassphrase ? 'set' : null,
    kerberosSpn: config.kerberosSpn ?? null,
```

- [ ] **Step 5: Run all connection tests, verify PASS. Commit.**

```bash
git add src/connection/connectionFactory.ts src/config/sapConfig.ts src/__tests__/connectionFactory.test.ts
git commit -m "feat(connection): route certificate/kerberos in factory; extend config signature"
```

### Task 3.6: Release connection (publish gate — user publishes)

- [ ] **Step 1:** Bump + CHANGELOG, commit. `npm run build` + tests green. **Do NOT publish.**
- [ ] **Step 2:** PR + merge.
- [ ] **Step 3: HAND OFF — ask the user to publish; wait for the confirmed published version before Phase 4.**

---

## Phase 4 — `@mcp-abap-adt/auth-broker` (`~/prj/mcp-abap-adt-auth-broker`)

First: bump `@mcp-abap-adt/auth-providers` + `@mcp-abap-adt/connection` + `@mcp-abap-adt/interfaces` to the versions **the user confirmed published** in Phases 1–3.

### Task 4.1: Select provider/mode for kerberos & certificate

**Files:**
- Modify: `src/AuthBroker.ts` (provider selection ~407-477; connectionConfig.authType emission ~419/477)
- Test: `src/__tests__/broker/authTypeSelection.test.ts`

- [ ] **Step 1: Write failing test** (kerberos → KerberosProvider injected & getTokens works; certificate → no provider / session-only):

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@mcp-abap-adt/auth-providers', async (orig) => {
  const real = await (orig as any)();
  return { ...real, KerberosProvider: vi.fn().mockImplementation(() => ({
    getTokens: vi.fn(async () => ({ authorizationToken: 'NEG', tokenType: 'opaque', authType: 'user_token' })),
  })) };
});

describe('AuthBroker auth type selection', () => {
  it('uses KerberosProvider for kerberos auth and yields a negotiate token', async () => {
    // Construct broker for a kerberos connectionConfig (mirror existing jwt/saml broker setup in this file)
    // ...assert provider.getTokens() returns authorizationToken 'NEG'
  });

  it('treats certificate as session-only (no token provider)', async () => {
    // Construct broker for certificate connectionConfig; assert no provider/getToken path is required
  });
});
```

> Fill the broker construction to match how this file already builds brokers for `jwt`/`saml` (search `Saml2PureProvider`/`isSaml` around lines 419 and 477). Keep the assertions above.

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement.** In the provider-selection branch, add:

```ts
// where authType is resolved for the connection config:
if (connectionConfig.authType === 'kerberos') {
  const { KerberosProvider } = await import('@mcp-abap-adt/auth-providers');
  this.tokenProvider = new KerberosProvider({
    spn: connectionConfig.kerberosSpn ?? deriveSpnFromUrl(connectionConfig.serviceUrl),
    logger,
  });
}
// certificate: no token provider — credential is static (mTLS), broker behaves like 'basic'.
```

Add a small helper:

```ts
function deriveSpnFromUrl(url: string): string {
  return `HTTP@${new URL(url).hostname}`;
}
```

Ensure `connectionConfig.authType` is emitted as `'kerberos'`/`'certificate'` where the broker currently sets `isSaml ? 'saml' : 'jwt'` — extend that mapping.

- [ ] **Step 4: Run, verify PASS. Commit.**

```bash
git add src/AuthBroker.ts src/__tests__/broker/authTypeSelection.test.ts
git commit -m "feat(broker): KerberosProvider wiring; certificate session-only mode"
```

### Task 4.2: Broker mode mapping + release (publish gate — user publishes)

- [ ] **Step 1:** Where the broker derives mode (`session-only`/`session-provider`/`full`), map `certificate → session-only`, `kerberos → session-provider`. Add/extend a unit test asserting the mode.
- [ ] **Step 2:** Commit. Bump + CHANGELOG. `npm run build` + tests green. **Do NOT publish.** PR + merge.
- [ ] **Step 3: HAND OFF — ask the user to publish; wait for the confirmed published version before Phase 5.**

---

## Phase 5 — `mcp-abap-adt` (server, this repo)

First: bump `@mcp-abap-adt/auth-broker`, `@mcp-abap-adt/connection`, `@mcp-abap-adt/interfaces` to the versions **the user confirmed published** in Phases 1–4. Work on branch `feat/cert-kerberos-auth` (worktree).

### Task 5.1: Extract shared `parseAuthType()` and accept new types

**Files:**
- Create: `src/lib/config/parseAuthType.ts`
- Modify: `src/lib/config.ts` (~59-75), `src/lib/utils.ts` (~1892-1900)
- Test: `src/__tests__/lib/parseAuthType.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseAuthType } from '../../lib/config/parseAuthType';

describe('parseAuthType', () => {
  it('maps env to auth types', () => {
    expect(parseAuthType({ SAP_JWT_TOKEN: 'x' })).toBe('jwt');
    expect(parseAuthType({ SAP_AUTH_TYPE: 'xsuaa' })).toBe('jwt');
    expect(parseAuthType({ SAP_AUTH_TYPE: 'certificate' })).toBe('certificate');
    expect(parseAuthType({ SAP_AUTH_TYPE: 'kerberos' })).toBe('kerberos');
    expect(parseAuthType({ SAP_AUTH_TYPE: 'saml' })).toBe('saml');
    expect(parseAuthType({})).toBe('basic');
  });
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

- [ ] **Step 4: Replace both inline parsers** in `config.ts` (~59-75) and `utils.ts` (~1892-1900) with a call to `parseAuthType(process.env)`. Remove the duplicated literal logic.

- [ ] **Step 5: Run, verify PASS. Commit.**

```bash
git add src/lib/config/parseAuthType.ts src/lib/config.ts src/lib/utils.ts src/__tests__/lib/parseAuthType.test.ts
git commit -m "refactor(config): shared parseAuthType incl. certificate/kerberos"
```

### Task 5.2: Read new env fields into SapConfig

**Files:**
- Modify: `src/lib/config.ts` (and `src/lib/utils.ts` if it builds a parallel config), wherever `SapConfig` is assembled from env.

- [ ] **Step 1: Write failing test** asserting that a `certificate` env produces a config with `certPath`/`certKeyPath`, and `kerberos` env produces `kerberosSpn`. (Mirror the existing config-building test; if none, add one targeting the exported builder.)

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

- [ ] **Step 4: Run, verify PASS. Commit.**

```bash
git add src/lib/config.ts src/lib/utils.ts src/__tests__/...
git commit -m "feat(config): read cert/kerberos env into SapConfig"
```

### Task 5.3: Extend `IConnectionConfig` + brokerFactory wiring

**Files:**
- Modify: `src/lib/auth/IBrokerSessionConfig.ts` (`IConnectionConfig.authType` union + fields)
- Modify: `src/lib/auth/brokerFactory.ts` (~750-786)
- Test: `src/__tests__/lib/auth/brokerFactory.test.ts` (extend)

- [ ] **Step 1: Write failing test** — brokerFactory builds a session config with `authType: 'certificate'` (cert paths threaded) and `authType: 'kerberos'` (spn threaded), given the matching env.

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3a: Update `IBrokerSessionConfig.ts`:**

```ts
  authType: 'basic' | 'jwt' | 'certificate' | 'kerberos';
  // cert
  certPath?: string;
  certKeyPath?: string;
  certPfxPath?: string;
  certPassphrase?: string;
  // kerberos
  kerberosSpn?: string;
  kerberosService?: string;
```

- [ ] **Step 3b: Update `brokerFactory.ts`** (~751): replace the `'basic' | 'jwt'` narrowing with `parseAuthType`-derived value and thread the new fields into the `connectionConfig` it builds (mirror how `username`/`jwtToken` are passed).

- [ ] **Step 4: Run, verify PASS. Commit.**

```bash
git add src/lib/auth/IBrokerSessionConfig.ts src/lib/auth/brokerFactory.ts src/__tests__/lib/auth/brokerFactory.test.ts
git commit -m "feat(server): thread certificate/kerberos through broker session config"
```

### Task 5.4: Docs + help text

**Files:**
- Modify: `src/lib/utils.ts` (~1337 env help block)
- Modify: `README.md` / relevant docs; `CHANGELOG.md`

- [ ] **Step 1:** Add the new env vars to the help text:

```
  SAP_CERT_PATH / SAP_CERT_KEY_PATH    Client cert + key (PEM) for certificate auth
  SAP_CERT_PFX_PATH / SAP_CERT_PASSPHRASE   PKCS#12 cert for certificate auth
  SAP_KERBEROS_SPN                     SPN for kerberos auth (default HTTP@<host>)
  SAP_AUTH_TYPE                        basic|jwt|saml|certificate|kerberos (default: basic)
```

- [ ] **Step 2:** Document cert/kerberos setup in README (prereqs: kinit/keytab for kerberos; on-prem HTTP only). Update CHANGELOG.
- [ ] **Step 3: Commit.**

```bash
git add src/lib/utils.ts README.md CHANGELOG.md
git commit -m "docs: certificate + kerberos auth env vars and setup"
```

### Task 5.5: Integration smoke (live, gated)

**Files:**
- Create/extend: integration smoke tests behind env gates (see integration-test-env-gates skill).

- [ ] **Step 1:** Add a `describeCertificate`/`describeKerberos` gate that runs only when `SAP_CERT_PATH`/`SAP_KERBEROS_SPN` (and a target system) are present. One read (e.g. read a class source) per auth type.
- [ ] **Step 2:** **Coordinate with the user** to run against a real on-prem system that supports the auth type (per CLAUDE.md — do not automate SAP env verification). Validate spec assumption A1 (single-leg) on kerberos here.
- [ ] **Step 3:** Save full log to `/tmp/integration-cert-kerberos.log` (no `tail` truncation). Commit any test additions.

### Task 5.6: Release server (publish gate — user publishes)

- [ ] **Step 1:** Bump version + CHANGELOG, regenerate tool catalogs if affected (auth is not a tool, likely none). `npm run build` + tests green. **Do NOT publish.** Open PR, merge per workflow.
- [ ] **Step 2: HAND OFF — ask the user to publish the server package.**
- [ ] **Step 3:** Once the user confirms the full feature is published and verified, **delete the spec** `docs/superpowers/specs/2026-05-23-cert-kerberos-auth-design.md` and this plan (project lifecycle rule). History remains in git.

---

## Self-review notes

- **Spec coverage:** §3.1 → Phase 1; §3.2 → Phase 3; §3.3 → Phase 2; §3.4 → Phase 4; §3.5 → Phase 5; §4 config surface → Tasks 5.1/5.2/5.4; §5 security (no secret logging, NTLM reject) → loaders/signature avoid secrets (Task 3.2/3.5); NTLM-reject is **not yet a dedicated task** — see gap below; §6 test plan → tests in each task + 5.5; §7 release order → phase order; §8 assumptions A1/A4 → Tasks 3.4/3.3 notes.
- **Gap (NTLM reject, spec §5):** add a guard in `KerberosAbapConnection.connect()` — if a `WWW-Authenticate` response offers only `NTLM` (or the server challenge decodes to an NTLM token prefix `TlRMTVNTUAA`), throw a clear error. Add as Task 3.4b during execution (small; test with a mocked 401 carrying `www-authenticate: NTLM`).
- **Type consistency:** `ICertificateMaterialLoader.load(config)`, `getHttpsAgentOptions()`, `KerberosProvider({spn})`, `ITokenRefresher.getToken()/refreshToken()` are used consistently across tasks.
- **Assumption to verify in code:** the `kerberos` npm `client.response` field name (Task 2.1) — confirm against the installed package's types before finalizing; adjust the accessor if the API exposes the token differently.
