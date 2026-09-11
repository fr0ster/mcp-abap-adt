/**
 * Capture raw ADT wire exchanges — normal answers AND refusals — into
 * tests/fixtures/adt/, so the result/error strategies (docs/superpowers/plans/
 * 2026-09-09-inventory-and-answer-adapter.md) can be written against real
 * documents instead of imagined ones.
 *
 * This intentionally does NOT go through this repository's handlers (they
 * transform the answer — the one thing that must not happen here). It talks
 * to `@mcp-abap-adt/adt-clients` directly: the public `AdtClient` /
 * `AdtUtils` surface builds correct requests (XML payloads, lock handles,
 * content types); a thin interceptor on `connection.makeAdtRequest` — the
 * single funnel every one of those calls goes through — captures each raw
 * exchange (method, URL, status, headers, unparsed body) byte for byte.
 *
 * Every capture is scoped by `withCase(name, fn)`. Setup/teardown calls made
 * outside a `withCase` block (creating the scratch class, locking it for
 * bookkeeping, the final cleanup) are NOT persisted — only console-logged —
 * so the corpus holds exactly the named cases, not incidental plumbing.
 *
 * Side effects on the SAP system: creates ONE scratch class
 * (`SCRATCH_CLASS_NAME` below) in `environment.default_package`
 * (tests/test-config.yaml), exercises it (lock/unlock/update/check/activate/
 * delete), and deletes it at the end. Never touches the 29 restored shared
 * polygon objects (`ZMCP_SHR_PKG`) beyond reading them.
 *
 * Usage:
 *   npx tsx scripts/capture-adt-corpus.ts [--env <path>]
 *
 * Default --env is the prepared trial session
 * (~/.config/mcp-abap-adt/sessions/trial.env).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AdtClient } from '@mcp-abap-adt/adt-clients';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import * as dotenv from 'dotenv';
import * as yaml from 'js-yaml';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { resolveSystemContext } from '../src/lib/systemContext';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'adt');
const SCRATCH_CLASS_NAME = 'ZMCP_BLD_ANSCH01';
const NONEXISTENT_CLASS_NAME = 'ZMCP_BLD_NOPE_CLS99';
const NONEXISTENT_PACKAGE_NAME = 'ZMCP_BLD_NOPKG9X';
const SHARED_PACKAGE = 'ZMCP_SHR_PKG';
const SHARED_CLASS = 'ZBP_MCP_SHR_I_ROOT';
const SHARED_TABLE = 'ZMCP_SHR_RTABL';
const SHARED_FGRP = 'ZMCP_SHR_FGRP';
const SHARED_FM = 'Z_MCP_SHR_FM';

const MINIMAL_VALID_SOURCE = `CLASS ${SCRATCH_CLASS_NAME} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS say_hello
      RETURNING VALUE(rv_text) TYPE string.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${SCRATCH_CLASS_NAME} IMPLEMENTATION.
  METHOD say_hello.
    rv_text = |Hello from the answer-adapter corpus scratch class|.
  ENDMETHOD.
ENDCLASS.`;

const BROKEN_SOURCE = `CLASS ${SCRATCH_CLASS_NAME} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS say_hello
      RETURNING VALUE(rv_text) TYPE string.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${SCRATCH_CLASS_NAME} IMPLEMENTATION.
  METHOD say_hello.
    DATA lv_broken TYPE strong_but_not_a_real_type.
    rv_text = lv_broken +++ 1 ~~~ syntax error on purpose.
  ENDMETHOD.
ENDCLASS.`;

// ---------------------------------------------------------------------------
// Scrubbing — no Authorization header, no cookie values, no bearer tokens,
// no session ids that identify a real user. See README.md in the fixtures
// dir for the placeholder convention this produces.
// ---------------------------------------------------------------------------

const REDACTED = 'REDACTED';
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-sap-security-session',
]);

function collectSecrets(): string[] {
  return [
    process.env.SAP_JWT_TOKEN,
    process.env.SAP_REFRESH_TOKEN,
    process.env.SAP_UAA_CLIENT_SECRET,
    process.env.SAP_PASSWORD,
  ].filter((v): v is string => Boolean(v && v.length > 8));
}

function scrubString(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join(REDACTED);
  }
  return out;
}

function scrubHeaders(
  headers: Record<string, unknown> | undefined,
  secrets: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    const stringValue = Array.isArray(value)
      ? value.join(', ')
      : String(value ?? '');
    out[key] = SENSITIVE_HEADER_NAMES.has(lower)
      ? REDACTED
      : scrubString(stringValue, secrets);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Recorder — wraps connection.makeAdtRequest, the single funnel every
// AdtClient/AdtUtils call goes through.
// ---------------------------------------------------------------------------

interface CapturedExchange {
  step: number;
  tag: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  status: number | 'NETWORK_ERROR';
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  timestamp: string;
}

function tagFor(method: string, url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('_action=lock')) return 'lock';
  if (lower.includes('_action=unlock')) return 'unlock';
  if (lower.includes('/deletion/check')) return 'deletion-check';
  if (lower.includes('/deletion/delete')) return 'deletion-delete';
  if (lower.includes('/activation')) return 'activation';
  if (lower.includes('/checkruns')) return 'checkrun';
  if (lower.includes('/source/main') && method === 'PUT')
    return 'update-source';
  if (lower.includes('/source/main')) return 'read-source';
  if (lower.includes('/nodestructure')) return 'nodestructure';
  const pathOnly = lower.split('?')[0];
  const segments = pathOnly.split('/').filter(Boolean);
  return (
    segments
      .slice(-2)
      .join('-')
      .replace(/[^a-z0-9-]/g, '') || 'exchange'
  );
}

function bodyToString(data: unknown): {
  text: string;
  wasReserialized: boolean;
} {
  if (data === null || data === undefined)
    return { text: '', wasReserialized: false };
  if (typeof data === 'string') return { text: data, wasReserialized: false };
  // Axios auto-parsed JSON (rare for ADT, which is mostly XML/text) — note
  // that this is NOT the verbatim byte stream, only a best-effort fallback.
  return { text: JSON.stringify(data, null, 2), wasReserialized: true };
}

function extFor(
  headers: Record<string, string>,
  reserialized: boolean,
): string {
  if (reserialized) return 'json';
  const ct = (
    headers['content-type'] ||
    headers['Content-Type'] ||
    ''
  ).toLowerCase();
  if (ct.includes('xml')) return 'xml';
  if (ct.includes('json')) return 'json';
  return 'txt';
}

class Recorder {
  private currentCase: string | null = null;
  private readonly byCase = new Map<string, CapturedExchange[]>();
  private readonly secrets: string[];

  constructor(secrets: string[]) {
    this.secrets = secrets;
  }

  withCase = async (name: string, fn: () => Promise<void>): Promise<void> => {
    console.log(`\n=== case: ${name} ===`);
    this.currentCase = name;
    try {
      await fn();
      console.log('  (completed without throwing)');
    } catch (error) {
      const e = error as { message?: string };
      console.log(
        `  (threw — expected for refusal cases): ${e?.message ?? error}`,
      );
    } finally {
      this.currentCase = null;
    }
  };

  /** Install the interceptor on a connected connection. */
  instrument(connection: any): void {
    const original = connection.makeAdtRequest.bind(connection);
    const recorder = this;
    connection.makeAdtRequest = async function patched(options: any) {
      const method = String(options.method || 'GET').toUpperCase();
      const url = String(options.url || '');
      const requestHeaders = scrubHeaders(options.headers, recorder.secrets);
      const requestBody =
        options.data === null || options.data === undefined
          ? null
          : scrubString(String(options.data), recorder.secrets);
      const timestamp = new Date().toISOString();
      try {
        const response = await original(options);
        recorder.record({
          method,
          url,
          requestHeaders,
          requestBody,
          status: response.status,
          statusText: response.statusText ?? '',
          responseHeaders: scrubHeaders(response.headers, recorder.secrets),
          responseData: response.data,
          timestamp,
        });
        return response;
      } catch (error) {
        const e = error as {
          response?: {
            status?: number;
            statusText?: string;
            headers?: Record<string, unknown>;
            data?: unknown;
          };
          message?: string;
        };
        if (e.response) {
          recorder.record({
            method,
            url,
            requestHeaders,
            requestBody,
            status: e.response.status ?? ('NETWORK_ERROR' as const),
            statusText: e.response.statusText ?? '',
            responseHeaders: scrubHeaders(e.response.headers, recorder.secrets),
            responseData: e.response.data,
            timestamp,
          });
        } else {
          recorder.record({
            method,
            url,
            requestHeaders,
            requestBody,
            status: 'NETWORK_ERROR',
            statusText: '',
            responseHeaders: {},
            responseData: `(no HTTP response — thrown before/without one) ${scrubString(String(e?.message ?? error), recorder.secrets)}`,
            timestamp,
          });
        }
        throw error;
      }
    };
  }

  private record(entry: {
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody: string | null;
    status: number | 'NETWORK_ERROR';
    statusText: string;
    responseHeaders: Record<string, string>;
    responseData: unknown;
    timestamp: string;
  }): void {
    if (!this.currentCase) {
      console.log(
        `  [unrecorded setup call] ${entry.method} ${entry.url} -> ${entry.status}`,
      );
      return;
    }
    const list = this.byCase.get(this.currentCase) ?? [];
    const { text } = bodyToString(entry.responseData);
    list.push({
      step: list.length + 1,
      tag: tagFor(entry.method, entry.url),
      method: entry.method,
      url: entry.url,
      requestHeaders: entry.requestHeaders,
      requestBody: entry.requestBody,
      status: entry.status,
      statusText: entry.statusText,
      responseHeaders: entry.responseHeaders,
      responseBody: text,
      timestamp: entry.timestamp,
    });
    this.byCase.set(this.currentCase, list);
    console.log(
      `  [captured] ${entry.method} ${entry.url} -> ${entry.status} ${entry.statusText} (${text.length} bytes)`,
    );
  }

  /** Write every recorded case to tests/fixtures/adt/. Returns a summary. */
  flush(): { case: string; files: string[] }[] {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    const summary: { case: string; files: string[] }[] = [];
    for (const [caseName, exchanges] of this.byCase) {
      const files: string[] = [];
      const multi = exchanges.length > 1;
      for (const exchange of exchanges) {
        const slug = multi
          ? `${caseName}--${String(exchange.step).padStart(2, '0')}-${exchange.tag}`
          : caseName;
        const { wasReserialized } = bodyToString(exchange.responseBody);
        const ext = extFor(exchange.responseHeaders, false);
        const bodyFile = `${slug}.body.${ext}`;
        const sidecarFile = `${slug}.json`;
        fs.writeFileSync(
          path.join(FIXTURES_DIR, bodyFile),
          exchange.responseBody,
          'utf-8',
        );
        fs.writeFileSync(
          path.join(FIXTURES_DIR, sidecarFile),
          JSON.stringify(
            {
              case: caseName,
              step: exchange.step,
              stepTag: exchange.tag,
              capturedAt: exchange.timestamp,
              request: {
                method: exchange.method,
                url: exchange.url,
                headers: exchange.requestHeaders,
                body: exchange.requestBody,
              },
              response: {
                status: exchange.status,
                statusText: exchange.statusText,
                headers: exchange.responseHeaders,
                bodyFile,
              },
              note: wasReserialized
                ? 'responseBody was JSON.stringify-reserialized by axios auto-parsing; not verbatim wire bytes.'
                : undefined,
            },
            null,
            2,
          ),
          'utf-8',
        );
        files.push(bodyFile, sidecarFile);
      }
      summary.push({ case: caseName, files });
    }
    return summary;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const envFile = path.resolve(
    get('--env') ||
      path.join(
        os.homedir(),
        '.config',
        'mcp-abap-adt',
        'sessions',
        'trial.env',
      ),
  );
  dotenv.config({ path: envFile, override: true });
  console.log(`env: ${envFile}`);

  const secrets = collectSecrets();
  const recorder = new Recorder(secrets);

  const connection = createAbapConnection(getSapConfigFromEnv()) as any;
  if (typeof connection.connect === 'function') {
    await connection.connect();
  }
  recorder.instrument(connection);

  const ctx = await resolveSystemContext(connection);
  console.log(
    `system: isLegacy=${ctx.isLegacy ?? false} responsible=${ctx.responsible ?? '(unset)'} masterSystem=${ctx.masterSystem ?? '(unset)'}`,
  );

  const client = new AdtClient(connection, undefined, {
    masterSystem: ctx.masterSystem,
    responsible: ctx.responsible,
    masterLanguage: ctx.masterLanguage,
  });
  const utils = client.getUtils();

  // Dev package to hold the scratch class — read from test-config.yaml so
  // this script never guesses an environment value.
  const testConfigPath = path.join(
    __dirname,
    '..',
    'tests',
    'test-config.yaml',
  );
  const testConfig = yaml.load(fs.readFileSync(testConfigPath, 'utf-8')) as any;
  const devPackage: string = testConfig?.environment?.default_package;
  if (!devPackage) {
    throw new Error(
      `tests/test-config.yaml has no environment.default_package — refusing to guess a package for the scratch class.`,
    );
  }
  console.log(`dev package for scratch class: ${devPackage}`);

  const { withCase } = recorder;

  // -------------------------------------------------------------------
  // NORMAL CASES — read-only, against the restored shared polygon.
  // -------------------------------------------------------------------

  await withCase('read-class-source-text', async () => {
    await client.getClass().read({ className: SHARED_CLASS });
  });

  await withCase('read-function-module-source-text', async () => {
    await client
      .getFunctionModule()
      .read({ functionGroupName: SHARED_FGRP, functionModuleName: SHARED_FM });
  });

  await withCase('check-success-verdict', async () => {
    await client.getClass().check({ className: SHARED_CLASS }, 'active');
  });

  await withCase('read-table-metadata-structure', async () => {
    await client.getTable().readMetadata({ tableName: SHARED_TABLE });
  });

  await withCase('read-package-contents-structure', async () => {
    await utils.getPackageContents(SHARED_PACKAGE);
  });

  await withCase('read-object-tree-structure', async () => {
    await utils.getPackageHierarchy(SHARED_PACKAGE, {
      includeSubpackages: false,
      maxDepth: 2,
      includeDescriptions: true,
    });
  });

  await withCase('read-where-used-list-structure', async () => {
    await utils.getWhereUsed({
      object_name: SHARED_CLASS,
      object_type: 'class',
    });
  });

  await withCase('read-transport-list-structure', async () => {
    await client.getRequest().list({ user: ctx.responsible || '' });
  });

  // -------------------------------------------------------------------
  // REFUSALS that need no scratch object.
  // -------------------------------------------------------------------

  await withCase('refusal-object-not-found', async () => {
    await client.getClass().read({ className: NONEXISTENT_CLASS_NAME });
  });

  await withCase('refusal-check-nonexistent-object', async () => {
    await client
      .getClass()
      .check({ className: NONEXISTENT_CLASS_NAME }, 'active');
  });

  // This is literally GetPackageTree's own pre-check (fixes #38) —
  // `src/handlers/system/high/handleGetPackageTree.ts` calls
  // `client.getPackage().read({ packageName })` before walking, and treats a
  // 404 there as "Package not found". Reproducing that exact call captures
  // the refusal GetPackageTree surfaces, on the wire.
  await withCase('refusal-package-not-found-tree', async () => {
    await client.getPackage().read({ packageName: NONEXISTENT_PACKAGE_NAME });
  });

  await withCase('refusal-package-not-found-contents-empty', async () => {
    await utils.getPackageContents(NONEXISTENT_PACKAGE_NAME);
  });

  await withCase('refusal-package-not-found-objectslist-empty', async () => {
    await utils.fetchNodeStructure('DEVC/K', NONEXISTENT_PACKAGE_NAME);
  });

  // Also try getPackageHierarchy (the "object tree" builder) directly
  // against the nonexistent package, unlabeled — since it walks via
  // nodestructure like GetObjectsList, it may NOT refuse the way the
  // handler's separate pre-check does. Captured as a bonus case so the
  // contradiction (if any) is on the wire, not asserted in prose.
  await withCase('refusal-package-not-found-hierarchy-direct', async () => {
    await utils.getPackageHierarchy(NONEXISTENT_PACKAGE_NAME, {
      includeSubpackages: false,
      maxDepth: 2,
    });
  });

  // -------------------------------------------------------------------
  // SCRATCH CLASS LIFECYCLE — only object this script ever writes to.
  // Setup/teardown calls outside withCase() are not persisted.
  // -------------------------------------------------------------------

  console.log(`\n--- setup: create scratch class ${SCRATCH_CLASS_NAME} ---`);
  try {
    await client.getClass().delete({ className: SCRATCH_CLASS_NAME });
    console.log('  (a leftover scratch class from a previous run was deleted)');
  } catch {
    // Expected: nothing to delete on a clean run.
  }
  await client.getClass().create(
    {
      className: SCRATCH_CLASS_NAME,
      packageName: devPackage,
      description: 'answer-adapter corpus scratch (safe to delete)',
    },
    { sourceCode: MINIMAL_VALID_SOURCE, activateOnCreate: false },
  );
  console.log('  created (inactive, valid source, not yet activated)');

  let lockHandle: string | undefined;

  await withCase('lock-success', async () => {
    lockHandle = await client
      .getClass()
      .lock({ className: SCRATCH_CLASS_NAME });
  });

  await withCase('refusal-lock-held-by-other', async () => {
    await client.getClass().lock({ className: SCRATCH_CLASS_NAME });
  });

  await withCase('unlock-success', async () => {
    if (lockHandle) {
      await client
        .getClass()
        .unlock({ className: SCRATCH_CLASS_NAME }, lockHandle);
    }
  });
  lockHandle = undefined;

  await withCase('refusal-write-not-locked', async () => {
    await client
      .getClass()
      .update(
        { className: SCRATCH_CLASS_NAME, sourceCode: MINIMAL_VALID_SOURCE },
        { lockHandle: 'ZZ_INVALID_LOCK_HANDLE_0001' },
      );
  });

  await withCase('refusal-syntax-check', async () => {
    await client
      .getClass()
      .check(
        { className: SCRATCH_CLASS_NAME, sourceCode: BROKEN_SOURCE },
        'inactive',
      );
  });

  // Activate the still-valid scratch class BEFORE poisoning it with broken
  // source — this is the "successful activation" normal case.
  await withCase('activation-success-verdict', async () => {
    await client.getClass().activate({ className: SCRATCH_CLASS_NAME });
  });

  console.log('\n--- setup: persist broken source into the scratch class ---');
  const brokenLock = await client
    .getClass()
    .lock({ className: SCRATCH_CLASS_NAME });
  await withCase('update-source-success', async () => {
    // A raw PUT never syntax-checks; it saves whatever bytes it is given.
    await client
      .getClass()
      .update(
        { className: SCRATCH_CLASS_NAME, sourceCode: BROKEN_SOURCE },
        { lockHandle: brokenLock },
      );
  });
  await client.getClass().unlock({ className: SCRATCH_CLASS_NAME }, brokenLock);
  console.log('  broken source saved as the inactive version, unlocked');

  // THE big one: SAP answers HTTP 200 with the refusal inside the document.
  await withCase('refusal-activation-fails', async () => {
    await client.getClass().activate({ className: SCRATCH_CLASS_NAME });
  });

  console.log('\n--- setup: lock scratch class before attempting delete ---');
  const deleteLock = await client
    .getClass()
    .lock({ className: SCRATCH_CLASS_NAME });
  await withCase('refusal-delete-refused', async () => {
    await client.getClass().delete({ className: SCRATCH_CLASS_NAME });
  });
  try {
    await client
      .getClass()
      .unlock({ className: SCRATCH_CLASS_NAME }, deleteLock);
    console.log('  unlocked after the refused delete attempt');
  } catch (error) {
    console.log(
      `  unlock after refused delete failed (object may already be gone): ${(error as Error).message}`,
    );
  }

  await withCase('delete-success', async () => {
    await client.getClass().delete({ className: SCRATCH_CLASS_NAME });
  });

  console.log('\n--- verifying cleanup ---');
  try {
    const stillThere = await client
      .getClass()
      .read({ className: SCRATCH_CLASS_NAME });
    if (stillThere) {
      console.error(
        `WARNING: ${SCRATCH_CLASS_NAME} still exists after cleanup — MANUAL CLEANUP NEEDED.`,
      );
    } else {
      console.log(
        `  ${SCRATCH_CLASS_NAME} confirmed gone (read returned undefined).`,
      );
    }
  } catch (error) {
    console.log(
      `  ${SCRATCH_CLASS_NAME} confirmed gone (read threw: ${(error as Error).message}).`,
    );
  }

  // -------------------------------------------------------------------
  // Flush corpus
  // -------------------------------------------------------------------

  const summary = recorder.flush();
  console.log(`\n=== wrote ${summary.length} cases to ${FIXTURES_DIR} ===`);
  for (const s of summary) {
    console.log(`  ${s.case}: ${s.files.length / 2} exchange(s)`);
  }
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
