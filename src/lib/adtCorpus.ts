import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Where the raw ADT corpus lives, resolved in one place.
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
  __dirname,
  '..',
  '..',
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
    params: Record<string, string> | null;
  };
  response: {
    status: number | string;
    headers: Record<string, string>;
    bodyFile: string;
  };
}

export function corpusSidecar(name: string): AdtCorpusSidecar {
  return JSON.parse(
    fs.readFileSync(path.join(ADT_CORPUS_DIR, `${name}.json`), 'utf-8'),
  );
}

/** The response body, exactly as it was recorded. */
export function corpusBody(name: string): string {
  return fs.readFileSync(
    path.join(ADT_CORPUS_DIR, corpusSidecar(name).response.bodyFile),
    'utf-8',
  );
}

/** Every exchange whose case name starts with `prefix`. */
export function corpusCases(prefix: string): string[] {
  return fs
    .readdirSync(ADT_CORPUS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}
