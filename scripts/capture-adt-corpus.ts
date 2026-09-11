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
 * DURABILITY: every exchange is written to disk THE MOMENT it is captured
 * (see `Recorder.record`), not buffered for a final flush. A session that
 * dies mid-run (an expired JWT, a network drop) still leaves everything
 * captured before that point on disk.
 *
 * ORDER: refusal cases run first, normal reads last. Refusals are the half
 * this script exists for and the ones that need the scratch object; normal
 * reads are cheap to redo if a run gets cut short.
 *
 * ABORT ON CONNECTION LOSS: `withCase` distinguishes an ADT-level refusal
 * (the request completed; SAP sent back a real HTTP response, error or not)
 * from a connection-level failure (no response at all — expired token,
 * network reset, timeout). The former is expected and swallowed; the latter
 * is rethrown, stops the whole run immediately, and is reported by `main`'s
 * top-level handler — it does NOT run an auth command or open a browser.
 *
 * QUERY PARAMETERS: `makeAdtRequest` takes the query string as a separate
 * `params` option, and much of adt-clients uses it (core/shared/nodeStructure
 * passes `parent_name` there, so does `update` for most object types). The
 * interceptor records `params` explicitly and also stores an `effectiveUrl`
 * with the query string folded in. Without this, every nodestructure exchange
 * records the same bare `/sap/bc/adt/repository/nodestructure` and the object
 * whose tree was asked for is simply absent from the corpus.
 *
 * WHAT THE RECORDED HEADERS ARE: the caller's custom headers, not the full
 * wire headers. The connection adds its own below this interception point —
 * the default Accept, `sap-adt-connection-id`, the stateful-session trio, the
 * CSRF token and the Authorization header. That is why no credential can
 * reach the corpus by construction: this code never sees one.
 *
 * MANIFEST: each run appends `_run-<timestamp>.json` recording every case,
 * its outcome and its exchange count, so a later reader can tell a case that
 * was never attempted from one that was attempted and answered nothing.
 *
 * Every capture is scoped by `withCase(name, fn)`. Setup calls made outside a
 * `withCase` block (creating the scratch class, locking it for bookkeeping)
 * are NOT persisted — only console-logged — so the corpus holds exactly the
 * named cases, not incidental plumbing. Teardown runs in a `finally`, so an
 * aborted run does not strand the scratch class on the system.
 *
 * Side effects on the SAP system: creates ONE scratch class
 * (`SCRATCH_CLASS_NAME` below) in `environment.default_package`
 * (tests/test-config.yaml), exercises it (lock/unlock/update/check/activate/
 * delete), and deletes it at the end. Never touches the 29 restored shared
 * polygon objects (`ZMCP_SHR_PKG`) beyond reading them.
 *
 * Usage:
 *   npx tsx scripts/capture-adt-corpus.ts [--env <path>] [--only a,b,c]
 *                                         [--empty-package ZNAME]
 *
 * Default --env is the prepared trial session
 * (~/.config/mcp-abap-adt/sessions/trial.env).
 *
 * `--only` captures just the named cases, for topping a partial corpus up.
 * The scratch class is created only when a case that writes to it is
 * selected; `delete-success` on its own reuses a class left by an earlier
 * aborted run instead of making a new one.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AdtClient } from '@mcp-abap-adt/adt-clients';
import * as dotenv from 'dotenv';
import * as yaml from 'js-yaml';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { createAbapConnection } from '../src/lib/connectionFactory';
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

/** What each validation endpoint negotiates; taken from adt-clients' constants. */
const ACCEPT_VALIDATION = 'application/vnd.sap.as+xml';
const ACCEPT_VALIDATION_CLASS =
  'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.oo.clifname.check';
/**
 * A package that EXISTS but holds nothing. Verified read-only against trial:
 * `getPackage().read()` succeeds, `getPackageContents()` answers HTTP 200 with
 * a zero-byte body — byte for byte the same answer a package that does not
 * exist gives. Capturing both is the whole point: it settles, from the wire,
 * whether the walkers can tell "empty" from "no such package" without the
 * extra pre-check round trip GetPackageTree pays. Override with
 * --empty-package if this name ever gains content.
 */
const DEFAULT_EMPTY_PACKAGE_NAME = 'ZMCP_BLD_PKG01';

/**
 * Names for the validation cases. `validate` asks one question — may an object
 * of this type be created under this name in this package — and the answer
 * splits by object family in a way nothing in this repository had captured.
 *
 * The taken names must be objects that genuinely exist, which is why two are
 * SAP's own domains: a name invented for the occasion answers "free", and
 * reading that as "taken" would invent a masking defect that is not there.
 */
const SHARED_DDL = 'ZMCP_SHR_I_ROOT';
const STANDARD_DOMAIN = 'MANDT';
const FREE_CLASS_NAME = 'ZMCP_BLD_FREE_X1';
const FREE_TABLE_NAME = 'ZMCP_BLD_FREE_T1';

/**
 * Scratch objects for the create cases, one per family, all in the dev package
 * and all removed in the teardown. `createResult` accounts for 16 compile
 * errors across 16 families and the corpus held no create document at all —
 * writing a create strategy against nothing is the thing the corpus exists to
 * prevent.
 *
 * Three families, three different endpoints. Not sixteen: each one is a write,
 * and a family whose create needs a payload this script would have to invent is
 * a family whose capture would be measuring the invention.
 */
const CREATE_CLASS_NAME = 'ZMCP_BLD_CRT_CL2';
const CREATE_DOMAIN_NAME = 'ZMCP_BLD_CRT_DOM';
const CREATE_DTEL_NAME = 'ZMCP_BLD_CRT_DTEL';

/**
 * One real object per family in the shared polygon, read from its own node in
 * the package tree rather than assumed. Metadata is NOT one shape repeated:
 * every family negotiates its own media type — `oo.classes.v4`, `blues.v1`,
 * `structures.v2`, `ddlSource`, `functions.groups.v2`, `ddic.srvd.v1` — so a
 * reading proved against a table says nothing about a class.
 */
const METADATA_TARGETS: Array<{
  family: string;
  url: string;
  accept: string;
}> = [
  {
    family: 'class',
    url: '/sap/bc/adt/oo/classes/ZBP_MCP_SHR_I_ROOT',
    accept:
      'application/vnd.sap.adt.oo.classes.v4+xml, application/vnd.sap.adt.oo.classes.v3+xml, application/vnd.sap.adt.oo.classes.v2+xml, application/vnd.sap.adt.oo.classes.v1+xml',
  },
  {
    family: 'ddl',
    url: '/sap/bc/adt/ddic/ddl/sources/ZMCP_SHR_I_ROOT',
    accept:
      'application/vnd.sap.adt.ddlSource.v2+xml, application/vnd.sap.adt.ddlSource+xml',
  },
  {
    family: 'function-group',
    url: '/sap/bc/adt/functions/groups/ZMCP_SHR_FGRP',
    // The client sends `*/*` here and so do we. Asking for v2/v1 explicitly
    // gets a 406 from this system, which serves v3 — a reminder that the
    // constant named ACCEPT_FUNCTION_GROUP is not what the read actually uses.
    accept: '*/*',
  },
  {
    family: 'function-module',
    url: '/sap/bc/adt/functions/groups/ZMCP_SHR_FGRP/fmodules/Z_MCP_SHR_FM',
    accept:
      'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
  },
  {
    family: 'structure',
    url: '/sap/bc/adt/ddic/structures/ZMCP_SHR_STRU',
    accept:
      'application/vnd.sap.adt.structures.v2+xml, application/vnd.sap.adt.structures.v1+xml',
  },
  {
    family: 'behavior-definition',
    url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_shr_i_root?version=active',
    accept: 'application/vnd.sap.adt.blues.v1+xml, application/xml',
  },
  {
    family: 'service-definition',
    url: '/sap/bc/adt/ddic/srvd/sources/ZMCP_SHR_SRVD01',
    accept: 'application/vnd.sap.adt.ddic.srvd.v1+xml, application/xml',
  },
  {
    family: 'package',
    url: '/sap/bc/adt/packages/ZMCP_SHR_PKG?version=active',
    accept:
      'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml',
  },
];

/**
 * Cases that need the scratch class to exist. `delete-success` is deliberately
 * NOT in WRITE_CASES: it only removes the class, so it can run against one a
 * previous aborted run left behind, which is also how that leftover gets
 * cleaned up.
 */
const WRITE_CASES: ReadonlySet<string> = new Set([
  'lock-success',
  'refusal-lock-held-by-other',
  'unlock-success',
  'refusal-write-not-locked',
  'refusal-syntax-check',
  'refusal-activation-fails',
  'refusal-delete-refused',
  'activation-success-verdict',
]);

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
/**
 * The SAP user id is not a credential, but it is an identity and the corpus is
 * committed. SAP writes it into ordinary answer text ("User <id> is currently
 * editing ..."), so it is replaced with a stable placeholder rather than
 * dropped — an error strategy still has to see that a user name sits there.
 * Every substitution a run performs is listed in that run's manifest.
 */
const USER_PLACEHOLDER = 'SAPUSER01';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-sap-security-session',
]);

/** [literal to find, what to write instead]. */
type Replacement = [from: string, to: string];

function collectSecretReplacements(): Replacement[] {
  return [
    process.env.SAP_JWT_TOKEN,
    process.env.SAP_REFRESH_TOKEN,
    process.env.SAP_UAA_CLIENT_SECRET,
    process.env.SAP_PASSWORD,
  ]
    .filter((v): v is string => Boolean(v && v.length > 8))
    .map((value): Replacement => [value, REDACTED]);
}

function scrubString(text: string, replacements: Replacement[]): string {
  let out = text;
  for (const [from, to] of replacements) {
    if (from) out = out.split(from).join(to);
  }
  return out;
}

function scrubHeaders(
  headers: Record<string, unknown> | undefined,
  replacements: Replacement[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    const stringValue = Array.isArray(value)
      ? value.join(', ')
      : String(value ?? '');
    out[key] = SENSITIVE_HEADER_NAMES.has(lower)
      ? REDACTED
      : scrubString(stringValue, replacements);
  }
  return out;
}

function scrubParams(
  params: Record<string, unknown> | undefined,
  replacements: Replacement[],
): Record<string, string> | null {
  if (!params || Object.keys(params).length === 0) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = scrubString(String(value ?? ''), replacements);
  }
  return out;
}

/**
 * The URL as the request actually addresses it: the endpoint with `params`
 * folded into the query string. `url` alone is not enough to reproduce, or
 * even to tell two requests apart — see the QUERY PARAMETERS note at the top.
 */
function buildEffectiveUrl(
  url: string,
  params: Record<string, string> | null,
): string {
  if (!params) return url;
  const qs = new URLSearchParams(params).toString();
  if (!qs) return url;
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
}

// ---------------------------------------------------------------------------
// Recorder — wraps connection.makeAdtRequest, the single funnel every
// AdtClient/AdtUtils call goes through. Writes each exchange to disk
// immediately (see the DURABILITY note at the top of the file).
// ---------------------------------------------------------------------------

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

/** Thrown by withCase when a request never got an HTTP response back at all. */
class ConnectionLostError extends Error {}

/** One line of the run manifest. */
interface CaseRecord {
  case: string;
  outcome: 'completed' | 'threw' | 'skipped' | 'connection-lost';
  exchanges: number;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

class Recorder {
  private currentCase: string | null = null;
  private readonly stepCounters = new Map<string, number>();
  private readonly writtenFiles = new Map<string, string[]>();
  private readonly replacements: Replacement[];
  /** null = run every case; otherwise only these. Set from --only. */
  private caseFilter: ReadonlySet<string> | null = null;
  private readonly caseLog: CaseRecord[] = [];
  private readonly manifestFile: string;
  /** Last case/step name entered, for the "which case were you on" report. */
  lastLabel = '(before any case)';
  /**
   * Set by `record()` — NOT inferred from the shape of whatever error
   * eventually bubbles up to `withCase`. This matters: adt-clients' own
   * wrapper functions (e.g. `checkClass`) inspect a perfectly good HTTP 200
   * response and then throw a plain `Error('Class check failed: ...')` with
   * no `.response` property at all. Judging "was there a connection" by
   * whether the caught error happens to carry `.response` would misread
   * that as connection loss and abort a run that is working fine. The
   * interceptor is the one place that actually knows whether a response
   * came back, so it is the one place allowed to set this flag.
   */
  private hadConnectionLossInCurrentCase = false;

  constructor(replacements: Replacement[]) {
    this.replacements = [...replacements];
    this.manifestFile = `_run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  /**
   * Add a substitution discovered after construction — the SAP user id only
   * becomes known once the system context has been resolved, which needs a
   * live connection.
   */
  addReplacement(from: string | undefined, to: string): void {
    if (from && from.length >= 3) this.replacements.push([from, to]);
  }

  setCaseFilter(filter: ReadonlySet<string> | null): void {
    this.caseFilter = filter;
  }

  /** Is this case part of the current run at all? */
  selected(name: string): boolean {
    return !this.caseFilter || this.caseFilter.has(name);
  }

  /** Rewritten after every case, so an abort still leaves a readable manifest. */
  private writeManifest(): void {
    fs.writeFileSync(
      path.join(FIXTURES_DIR, this.manifestFile),
      JSON.stringify(
        {
          startedAt: this.startedAt,
          finishedAt: new Date().toISOString(),
          substitutions: this.replacements.map(([, to]) => to),
          cases: this.caseLog,
        },
        null,
        2,
      ),
      'utf-8',
    );
  }

  private readonly startedAt = new Date().toISOString();

  withCase = async (name: string, fn: () => Promise<void>): Promise<void> => {
    if (!this.selected(name)) {
      this.caseLog.push({ case: name, outcome: 'skipped', exchanges: 0 });
      this.writeManifest();
      console.log(`--- case: ${name} (skipped, not in --only) ---`);
      return;
    }
    console.log(`\n=== case: ${name} ===`);
    this.lastLabel = name;
    this.currentCase = name;
    this.hadConnectionLossInCurrentCase = false;
    const startedAt = new Date().toISOString();
    const finish = (outcome: CaseRecord['outcome'], error?: string): void => {
      this.caseLog.push({
        case: name,
        outcome,
        exchanges: (this.writtenFiles.get(name) ?? []).length / 2,
        startedAt,
        endedAt: new Date().toISOString(),
        error,
      });
      this.writeManifest();
    };
    try {
      await fn();
      console.log('  (completed without throwing)');
      finish('completed');
    } catch (error) {
      const e = error as { message?: string };
      if (this.hadConnectionLossInCurrentCase) {
        // At least one request in this case never got an HTTP response back
        // at all (expired token, network reset, timeout...). Do not swallow
        // this — swallowing it would cascade into every remaining case
        // failing the same way and bury the actual stopping point in noise.
        console.log(
          `  (a request in this case got no HTTP response — connection-level, aborting run): ${e?.message ?? error}`,
        );
        this.currentCase = null;
        finish('connection-lost', e?.message ?? String(error));
        throw error instanceof Error
          ? new ConnectionLostError(`case "${name}": ${error.message}`)
          : new ConnectionLostError(`case "${name}": ${String(error)}`);
      }
      // A real HTTP response came back for every request in this case —
      // this is the expected shape for a refusal case: a 4xx/5xx, a 200
      // with a refusal encoded inside, or a library wrapper (checkClass,
      // activate, ...) that inspected a real response and threw its own
      // summary Error over it.
      console.log(
        `  (threw — expected for refusal cases): ${e?.message ?? error}`,
      );
      finish('threw', e?.message ?? String(error));
    } finally {
      this.currentCase = null;
    }
  };

  /** Read-only view for the interceptor closure. */
  get reps(): Replacement[] {
    return this.replacements;
  }

  /** Install the interceptor on a connected connection. */
  instrument(connection: any): void {
    const original = connection.makeAdtRequest.bind(connection);
    const recorder = this;
    connection.makeAdtRequest = async function patched(options: any) {
      const method = String(options.method || 'GET').toUpperCase();
      // Scrubbed like everything else: adt-clients puts the SAP user id
      // straight into a query string (cts/transportrequests?user=...).
      const url = scrubString(String(options.url || ''), recorder.reps);
      const requestHeaders = scrubHeaders(options.headers, recorder.reps);
      // `params` is a first-class makeAdtRequest option and carries the object
      // being addressed for a large part of adt-clients. Dropping it makes two
      // different requests record identically.
      const requestParams = scrubParams(options.params, recorder.reps);
      const requestBody =
        options.data === null || options.data === undefined
          ? null
          : scrubString(String(options.data), recorder.reps);
      const timestamp = new Date().toISOString();
      try {
        const response = await original(options);
        recorder.record({
          method,
          url,
          requestParams,
          requestHeaders,
          requestBody,
          status: response.status,
          statusText: response.statusText ?? '',
          responseHeaders: scrubHeaders(response.headers, recorder.reps),
          responseData: response.data,
          timestamp,
          hadResponse: true,
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
            requestParams,
            requestHeaders,
            requestBody,
            status: e.response.status ?? ('NETWORK_ERROR' as const),
            statusText: e.response.statusText ?? '',
            responseHeaders: scrubHeaders(e.response.headers, recorder.reps),
            responseData: e.response.data,
            timestamp,
            hadResponse: true,
          });
        } else {
          // No response object — record a marker so the corpus shows exactly
          // where the connection died, then let the caller (withCase) decide
          // to abort the run.
          recorder.record({
            method,
            url,
            requestParams,
            requestHeaders,
            requestBody,
            status: 'NETWORK_ERROR',
            statusText: '',
            responseHeaders: {},
            responseData: `(no HTTP response — connection-level failure) ${scrubString(String(e?.message ?? error), recorder.reps)}`,
            timestamp,
            hadResponse: false,
          });
        }
        throw error;
      }
    };
  }

  private record(entry: {
    method: string;
    url: string;
    requestParams: Record<string, string> | null;
    requestHeaders: Record<string, string>;
    requestBody: string | null;
    status: number | 'NETWORK_ERROR';
    statusText: string;
    responseHeaders: Record<string, string>;
    responseData: unknown;
    timestamp: string;
    hadResponse: boolean;
  }): void {
    if (!this.currentCase) {
      console.log(
        `  [unrecorded setup call] ${entry.method} ${entry.url} -> ${entry.status}`,
      );
      return;
    }
    if (!entry.hadResponse) {
      this.hadConnectionLossInCurrentCase = true;
    }
    const step = (this.stepCounters.get(this.currentCase) ?? 0) + 1;
    this.stepCounters.set(this.currentCase, step);

    const tag = tagFor(
      entry.method,
      buildEffectiveUrl(entry.url, entry.requestParams),
    );
    const slug = `${this.currentCase}--${String(step).padStart(2, '0')}-${tag}`;
    const raw = bodyToString(entry.responseData);
    const text = scrubString(raw.text, this.replacements);
    const wasReserialized = raw.wasReserialized;
    const ext = extFor(entry.responseHeaders, wasReserialized);
    const bodyFile = `${slug}.body.${ext}`;
    const sidecarFile = `${slug}.json`;

    // Written immediately — this is the durability guarantee. If the process
    // dies on the very next line, this exchange is already on disk.
    fs.writeFileSync(path.join(FIXTURES_DIR, bodyFile), text, 'utf-8');
    fs.writeFileSync(
      path.join(FIXTURES_DIR, sidecarFile),
      JSON.stringify(
        {
          case: this.currentCase,
          step,
          stepTag: tag,
          capturedAt: entry.timestamp,
          request: {
            method: entry.method,
            url: entry.url,
            params: entry.requestParams,
            // url with params folded in — what the request actually addresses
            effectiveUrl: buildEffectiveUrl(entry.url, entry.requestParams),
            headers: entry.requestHeaders,
            headersNote:
              'Caller-supplied headers only. The connection adds Accept, sap-adt-connection-id, the stateful-session headers, CSRF and Authorization below this interception point.',
            body: entry.requestBody,
          },
          response: {
            status: entry.status,
            statusText: entry.statusText,
            headers: entry.responseHeaders,
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

    const list = this.writtenFiles.get(this.currentCase) ?? [];
    list.push(bodyFile, sidecarFile);
    this.writtenFiles.set(this.currentCase, list);

    console.log(
      `  [written] ${entry.method} ${buildEffectiveUrl(entry.url, entry.requestParams)} -> ${entry.status} ${entry.statusText} (${text.length} bytes) -> ${bodyFile}`,
    );
  }

  summary(): { case: string; files: string[] }[] {
    return [...this.writtenFiles.entries()].map(([caseName, files]) => ({
      case: caseName,
      files,
    }));
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
  const onlyArg = get('--only');
  const caseFilter = onlyArg
    ? new Set(
        onlyArg
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
      )
    : null;
  const emptyPackage = get('--empty-package') || DEFAULT_EMPTY_PACKAGE_NAME;

  dotenv.config({ path: envFile, override: true });
  console.log(`env: ${envFile}`);
  console.log(`fixtures dir: ${FIXTURES_DIR}`);
  if (caseFilter) console.log(`only: ${[...caseFilter].join(', ')}`);

  const recorder = new Recorder(collectSecretReplacements());
  recorder.setCaseFilter(caseFilter);

  const connection = createAbapConnection(getSapConfigFromEnv()) as any;
  if (typeof connection.connect === 'function') {
    await connection.connect();
  }
  recorder.instrument(connection);

  const ctx = await resolveSystemContext(connection);
  console.log(
    `system: isLegacy=${ctx.isLegacy ?? false} responsible=${ctx.responsible ?? '(unset)'} masterSystem=${ctx.masterSystem ?? '(unset)'}`,
  );
  // The SAP user id is only knowable now. SAP writes it into ordinary answer
  // text, so replace it everywhere from here on.
  recorder.addReplacement(ctx.responsible, USER_PLACEHOLDER);

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
  const track = (label: string) => {
    recorder.lastLabel = label;
    console.log(`\n--- ${label} ---`);
  };

  // The scratch class is only worth creating when a case that writes to it is
  // actually selected. `delete-success` alone reuses whatever a previous
  // aborted run left behind — which is also how that leftover gets removed.
  const needScratchWrites = [...WRITE_CASES].some((c) => recorder.selected(c));
  const CREATE_CASES = [
    'create-class',
    'update-source-success',
    'create-domain',
    'create-dataelement',
  ];
  const needCreateWrites = CREATE_CASES.some((c) => recorder.selected(c));
  let scratchClassCreated = false;

  /** Does the scratch class exist right now? Not recorded — plumbing. */
  const scratchExists = async (): Promise<boolean> => {
    try {
      const res = (await client
        .getClass()
        .read({ className: SCRATCH_CLASS_NAME })) as {
        readResult?: unknown;
        errors?: unknown[];
      } | null;
      return Boolean(res?.readResult) && (res?.errors?.length ?? 0) === 0;
    } catch {
      return false;
    }
  };

  /**
   * Remove the scratch class. Runs in a `finally`, so it also fires when the
   * run aborts halfway. It only deletes a class this run created, or one the
   * selected `delete-success` case was meant to remove anyway — a read-only
   * run reports a leftover rather than silently disposing of it.
   */
  const teardownScratch = async (): Promise<void> => {
    const mayDelete =
      scratchClassCreated || recorder.selected('delete-success');
    track('teardown: ensure the scratch class is gone');
    if (!(await scratchExists())) {
      console.log(`  ${SCRATCH_CLASS_NAME} confirmed gone.`);
      scratchClassCreated = false;
      return;
    }
    if (!mayDelete) {
      console.error(
        `  WARNING: ${SCRATCH_CLASS_NAME} exists in ${devPackage} but this run did not create it and did not select delete-success. Left untouched.`,
      );
      return;
    }
    try {
      await client.getClass().delete({ className: SCRATCH_CLASS_NAME });
    } catch (error) {
      console.error(
        `  delete during teardown threw: ${(error as Error).message}`,
      );
    }
    if (await scratchExists()) {
      console.error(
        `  WARNING: ${SCRATCH_CLASS_NAME} still exists in ${devPackage} — MANUAL CLEANUP NEEDED.`,
      );
    } else {
      console.log(`  ${SCRATCH_CLASS_NAME} deleted.`);
      scratchClassCreated = false;
    }
  };

  /** Remove the create-case objects, whatever happened to the run. */
  const teardownCreated = async (): Promise<void> => {
    if (!needCreateWrites) return;
    track('teardown: remove the create-case scratch objects');
    const removals: Array<[string, () => Promise<unknown>]> = [
      [
        CREATE_CLASS_NAME,
        () => client.getClass().delete({ className: CREATE_CLASS_NAME }),
      ],
      [
        CREATE_DOMAIN_NAME,
        () => client.getDomain().delete({ domainName: CREATE_DOMAIN_NAME }),
      ],
      [
        CREATE_DTEL_NAME,
        () =>
          client.getDataElement().delete({ dataElementName: CREATE_DTEL_NAME }),
      ],
    ];
    // Do not believe the delete. ADT answers a refused deletion with HTTP 200
    // and `isDeleted="false"`, so a call that does not throw has not told you
    // the object is gone — this teardown printed "deleted" for a class that was
    // still there and locked, which is the very masking the corpus documents.
    // Read it back instead.
    for (const [name, remove, stillThere] of removals) {
      try {
        await remove();
      } catch (error) {
        console.error(`  ${name}: delete threw — ${(error as Error).message}`);
      }
      if (await stillThere()) {
        console.error(
          `  WARNING: ${name} is STILL PRESENT in ${devPackage} — delete it by hand.`,
        );
      } else {
        console.log(`  ${name} confirmed gone.`);
      }
    }
  };

  try {
    // -----------------------------------------------------------------
    // PHASE 1 — REFUSALS FIRST. These are the half this task exists for,
    // and the scratch-object ones are expensive to lose. Normal reads
    // (Phase 2) are cheap to redo and run last.
    // -----------------------------------------------------------------

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
    // `client.getPackage().read({ packageName })` before walking, and
    // treats a 404 there as "Package not found". Reproducing that exact
    // call captures the refusal GetPackageTree surfaces, on the wire.
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
    // against the nonexistent package — since it walks via nodestructure
    // like GetObjectsList, it may NOT refuse the way the handler's separate
    // pre-check does. Captured so the contradiction (if any) is on the
    // wire, not asserted in prose.
    await withCase('refusal-package-not-found-hierarchy-direct', async () => {
      await utils.getPackageHierarchy(NONEXISTENT_PACKAGE_NAME, {
        includeSubpackages: false,
        maxDepth: 2,
      });
    });

    // -------------------------------------------------------------------
    // SCRATCH CLASS — the only object this script ever writes to. Setup
    // calls outside withCase() are not persisted (console-logged only).
    // Skipped entirely when no write case is selected, so a top-up run
    // never creates an object it does not need.
    // -------------------------------------------------------------------

    if (needScratchWrites) {
      track(`setup: create scratch class ${SCRATCH_CLASS_NAME}`);
      try {
        await client.getClass().delete({ className: SCRATCH_CLASS_NAME });
        console.log(
          '  (a leftover scratch class from a previous run was deleted)',
        );
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
      scratchClassCreated = true;
      console.log('  created (inactive, valid source, not yet activated)');

      let lockHandle: string | undefined;

      await withCase('lock-success', async () => {
        lockHandle = await client
          .getClass()
          .lock({ className: SCRATCH_CLASS_NAME });
      });

      await withCase('refusal-lock-held-by-other', async () => {
        // Same session, second LOCK while the first is still held — not a
        // second user. Documents whatever SAP actually does with that, on
        // the wire, rather than assuming it matches "locked by another user".
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
        // "object doesn't need to exist" per checkClass's own doc comment —
        // this validates hypothetical code without persisting anything.
        await client
          .getClass()
          .check(
            { className: SCRATCH_CLASS_NAME, sourceCode: BROKEN_SOURCE },
            'inactive',
          );
      });

      track('setup: persist broken source into the scratch class');
      const brokenLock = await client
        .getClass()
        .lock({ className: SCRATCH_CLASS_NAME });
      // A raw PUT never syntax-checks; it saves whatever bytes it is given.
      await client
        .getClass()
        .update(
          { className: SCRATCH_CLASS_NAME, sourceCode: BROKEN_SOURCE },
          { lockHandle: brokenLock },
        );
      await client
        .getClass()
        .unlock({ className: SCRATCH_CLASS_NAME }, brokenLock);
      console.log('  broken source saved as the inactive version, unlocked');

      // THE big one #1: SAP answers HTTP 200 with the refusal inside the body.
      await withCase('refusal-activation-fails', async () => {
        await client.getClass().activate({ className: SCRATCH_CLASS_NAME });
      });

      track('setup: lock scratch class before attempting delete');
      const deleteLock = await client
        .getClass()
        .lock({ className: SCRATCH_CLASS_NAME });
      // THE big one #2: deletion refusal, expected (per project history) to
      // also be HTTP 200 with a refusal (`isDeleted=false` + `del:message`)
      // rather than a 4xx.
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

      // The last scratch case: put valid source back, then capture what a
      // successful activation looks like.
      track(
        'setup: restore valid source before the activation-success capture',
      );
      const restoreLock = await client
        .getClass()
        .lock({ className: SCRATCH_CLASS_NAME });
      await client
        .getClass()
        .update(
          { className: SCRATCH_CLASS_NAME, sourceCode: MINIMAL_VALID_SOURCE },
          { lockHandle: restoreLock },
        );
      await client
        .getClass()
        .unlock({ className: SCRATCH_CLASS_NAME }, restoreLock);

      await withCase('activation-success-verdict', async () => {
        await client.getClass().activate({ className: SCRATCH_CLASS_NAME });
      });
    } else {
      console.log('\n(no write case selected — scratch class not created)');
    }

    // -----------------------------------------------------------------
    // PHASE 2 — NORMAL READS. Cheap to redo; they run only once every
    // refusal above is already safely on disk. None of them writes.
    // -----------------------------------------------------------------

    await withCase('read-class-source-text', async () => {
      await client.getClass().read({ className: SHARED_CLASS });
    });

    await withCase('read-function-module-source-text', async () => {
      await client.getFunctionModule().read({
        functionGroupName: SHARED_FGRP,
        functionModuleName: SHARED_FM,
      });
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

    // -----------------------------------------------------------------
    // CREATE, and the successful UPDATE the corpus never had. Writes.
    // Everything here is removed in the teardown.
    // -----------------------------------------------------------------

    if (needCreateWrites) {
      await withCase('create-class', async () => {
        await client.getClass().create({
          className: CREATE_CLASS_NAME,
          packageName: devPackage,
          description: 'corpus create capture (safe to delete)',
        });
      });

      // The corpus had a PUT that was refused with 423 and no PUT that worked,
      // so nothing recorded what a successful write actually answers.
      await withCase('update-source-success', async () => {
        // `lock` answers an IAdtResponse on 18, not a bare handle. Passing the
        // response straight through produces `lockHandle=[object Object]` and a
        // 423, which is what this capture did on the first attempt. Every
        // handler that locks meets this.
        const locked = (await client
          .getClass()
          .lock({ className: CREATE_CLASS_NAME })) as unknown as {
          ok: boolean;
          getResult: () => { value: string };
        };
        const lock =
          typeof locked === 'string' ? locked : locked.getResult().value;
        // `sourceCode` goes in OPTIONS, not the config. adt-clients 18 made
        // `config.sourceCode` belong to `check` alone — a syntax check compiles
        // a source that is not on the server yet, so it has nowhere else to
        // arrive — and an update that puts it in the config is told "Source
        // code is required for update". The handler migration meets this at
        // every call to `update`.
        await client.getClass().update(
          { className: CREATE_CLASS_NAME },
          {
            lockHandle: lock,
            sourceCode:
              MINIMAL_VALID_SOURCE.split(SCRATCH_CLASS_NAME).join(
                CREATE_CLASS_NAME,
              ),
          },
        );
        await client.getClass().unlock({ className: CREATE_CLASS_NAME }, lock);
      });

      await withCase('create-domain', async () => {
        await client.getDomain().create({
          domainName: CREATE_DOMAIN_NAME,
          packageName: devPackage,
          description: 'corpus create capture (safe to delete)',
          datatype: 'CHAR',
          length: 10,
        });
      });

      await withCase('create-dataelement', async () => {
        await client.getDataElement().create({
          dataElementName: CREATE_DTEL_NAME,
          packageName: devPackage,
          description: 'corpus create capture (safe to delete)',
          typeKind: 'predefinedAbapType',
          dataType: 'CHAR',
          length: 10,
        });
      });
    }

    // -----------------------------------------------------------------
    // METADATA, one family at a time. The 70 compile errors on
    // `metadataResult` span seventeen families and the corpus had one.
    // -----------------------------------------------------------------

    for (const target of METADATA_TARGETS) {
      await withCase(`read-metadata-${target.family}`, async () => {
        await connection.makeAdtRequest({
          url: target.url,
          method: 'GET',
          timeout: 30000,
          headers: { Accept: target.accept },
        });
      });
    }

    // -----------------------------------------------------------------
    // VALIDATION — may this name be created here? Read-only: it asks, it
    // does not create. Captured per family because the families disagree.
    // -----------------------------------------------------------------

    await withCase('validation-name-free-class', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/oo/validation/objectname?objname=${FREE_CLASS_NAME}&objtype=CLAS%2FOC&packagename=${devPackage}`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION_CLASS },
      });
    });

    await withCase('refusal-validation-name-taken-class', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/oo/validation/objectname?objname=${SHARED_CLASS}&objtype=CLAS%2FOC&packagename=${SHARED_PACKAGE}`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION_CLASS },
      });
    });

    await withCase('refusal-validation-name-taken-domain', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/ddic/domains/validation?objname=${STANDARD_DOMAIN}&packagename=${devPackage}&description=x`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION },
      });
    });

    await withCase('validation-name-free-table', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/ddic/tables/validation?objname=${FREE_TABLE_NAME}&packagename=${devPackage}&description=x`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION },
      });
    });

    await withCase('refusal-validation-name-taken-table', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/ddic/tables/validation?objname=${SHARED_TABLE}&packagename=${SHARED_PACKAGE}&description=x`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION },
      });
    });

    // The two that answer 200 with the refusal in the body — the shape the
    // 400-answering families never produce.
    await withCase('refusal-validation-name-taken-ddl', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/ddic/ddl/validation?objname=${SHARED_DDL}&packagename=${SHARED_PACKAGE}&description=x`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION },
      });
    });

    await withCase('refusal-validation-name-taken-functiongroup', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/functions/validation?objname=${SHARED_FGRP}&objtype=FUGR%2FF&packagename=${SHARED_PACKAGE}&description=x`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION },
      });
    });

    await withCase('validation-name-free-ddl', async () => {
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/ddic/ddl/validation?objname=ZMCP_BLD_FREE_V1&packagename=${devPackage}&description=x`,
        method: 'POST',
        headers: { Accept: ACCEPT_VALIDATION },
      });
    });

    // The discriminator the walkers hang on: a package that EXISTS but holds
    // nothing, captured through both walkers, right next to the
    // refusal-package-not-found-* captures of a package that does not exist.
    // If the two answers match byte for byte, "empty" and "no such package"
    // cannot be told apart from the response alone, and the pre-check round
    // trip GetPackageTree pays is the only thing that can tell them apart.
    await withCase('read-empty-package-contents', async () => {
      await utils.getPackageContents(emptyPackage);
      await utils.fetchNodeStructure('DEVC/K', emptyPackage);
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

    // -----------------------------------------------------------------
    // PHASE 3 — final real cleanup of the scratch class.
    // -----------------------------------------------------------------

    await withCase('delete-success', async () => {
      await client.getClass().delete({ className: SCRATCH_CLASS_NAME });
    });
    scratchClassCreated = false;
  } catch (error) {
    const isConnectionLoss = error instanceof ConnectionLostError;
    console.error(
      `\n=== STOPPED during "${recorder.lastLabel}" (${isConnectionLoss ? 'connection lost' : 'unexpected error — see below'}) ===`,
    );
    console.error(`  ${error instanceof Error ? error.message : error}`);
    if (scratchClassCreated) {
      console.error(
        `  WARNING: ${SCRATCH_CLASS_NAME} may still exist in ${devPackage} — could not run final cleanup. Delete it manually once a session is available.`,
      );
    }
    printSummary(recorder);
    if (isConnectionLoss) {
      console.error(
        '\nNo auth or re-authentication command was run. Re-run this script once a fresh session is available; already-written fixtures are untouched.',
      );
      process.exitCode = 1;
      return;
    }
    // Not a connection-level failure — a real bug. Everything captured so
    // far is still safely on disk (see the summary above); rethrow so the
    // process exits non-zero with the full stack trace for diagnosis.
    throw error;
  } finally {
    // Teardown belongs here, not at the end of the happy path. The previous
    // shape left the scratch class stranded on the system whenever a run was
    // cut short, which is exactly when it is hardest to notice.
    await teardownScratch();
    await teardownCreated();
  }

  printSummary(recorder);
}

function printSummary(recorder: Recorder): void {
  const summary = recorder.summary();
  const totalExchanges = summary.reduce((n, s) => n + s.files.length / 2, 0);
  console.log(
    `\n=== ${summary.length} case(s), ${totalExchanges} exchange(s) written to ${FIXTURES_DIR} ===`,
  );
  for (const s of summary) {
    console.log(`  ${s.case}: ${s.files.length / 2} exchange(s)`);
  }
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
