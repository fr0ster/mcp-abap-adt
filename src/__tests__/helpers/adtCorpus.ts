import * as fs from 'node:fs';
import * as path from 'node:path';
import { child, entries, isElement } from '../../lib/thrownValue';
import { repositoryRoot } from './repoRoot';

/**
 * Where the raw ADT corpus lives, resolved in one place: in the repository,
 * from its root (`repositoryRoot`), so a test reads it there whether it runs
 * from its source (Jest) or from the node:test build. Test support only: no
 * production code reads the corpus.
 *
 * The readings left, into `@mcp-abap-adt/adt-strategies`, and the corpus went
 * with them — that repository tests them against it. This copy stays because
 * the things that did NOT leave still need it: the projections, the promised
 * form, the package walk, and the join between a real document and the MCP
 * adapter. Those are this server's side of the boundary, and they are the ones
 * that have to be checked against what SAP actually sent.
 *
 * See `tests/fixtures/adt/README.md` for what the corpus is.
 */
export const ADT_CORPUS_DIR = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'adt',
);

/** One exchange: what was asked, and what came back. */
export interface AdtCorpusSidecar {
  case: string;
  step: number;
  request: {
    method: string;
    url: string;
    effectiveUrl?: string;
    /** Absent where the recording kept none. */
    params?: Record<string, string> | null;
  };
  response: {
    status: number | string;
    headers: Record<string, string>;
    /** `null` where the exchange recorded no body. */
    bodyFile: string | null;
  };
}

/** Whether every member of `value` is text. */
function isTextRecord(value: unknown): value is Record<string, string> {
  return (
    isElement(value) &&
    entries(value).every(([, member]) => typeof member === 'string')
  );
}

/** Whether `value` is a sidecar: every field `AdtCorpusSidecar` declares, of its type. */
function isSidecar(value: unknown): value is AdtCorpusSidecar {
  const request = child(value, 'request');
  const response = child(value, 'response');
  const effectiveUrl = child(request, 'effectiveUrl');
  const params = child(request, 'params');
  const status = child(response, 'status');
  const bodyFile = child(response, 'bodyFile');
  return (
    typeof child(value, 'case') === 'string' &&
    typeof child(value, 'step') === 'number' &&
    typeof child(request, 'method') === 'string' &&
    typeof child(request, 'url') === 'string' &&
    (effectiveUrl === undefined || typeof effectiveUrl === 'string') &&
    (params === undefined || params === null || isTextRecord(params)) &&
    (typeof status === 'number' || typeof status === 'string') &&
    isTextRecord(child(response, 'headers')) &&
    (bodyFile === null || typeof bodyFile === 'string')
  );
}

export function corpusSidecar(name: string): AdtCorpusSidecar {
  const read: unknown = JSON.parse(
    fs.readFileSync(path.join(ADT_CORPUS_DIR, `${name}.json`), 'utf-8'),
  );
  if (!isSidecar(read)) {
    throw new Error(`The corpus sidecar ${name}.json is not one`);
  }
  return read;
}

/** The response body, exactly as it was recorded. */
export function corpusBody(name: string): string {
  const bodyFile = corpusSidecar(name).response.bodyFile;
  if (bodyFile === null) {
    throw new Error(`The corpus exchange ${name} recorded no body`);
  }
  return fs.readFileSync(path.join(ADT_CORPUS_DIR, bodyFile), 'utf-8');
}

/** Every exchange whose case name starts with `prefix`. */
export function corpusCases(prefix: string): string[] {
  return fs
    .readdirSync(ADT_CORPUS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}
