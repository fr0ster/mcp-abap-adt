import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Where the raw ADT corpus lives, resolved in one place.
 *
 * The readings in `adtRefusal.ts` and this corpus are meant to leave together,
 * into a package of their own in the adt-clients repository. Everything else
 * about that move is a `git mv`: the readings import nothing but
 * `fast-xml-parser`, and the corpus is plain files.
 *
 * The one thing that would not survive is a fixture path spelled
 * `../../../tests/fixtures/adt` in every test, because it encodes this
 * repository's layout. It is spelled once, here, so the move is one edit.
 *
 * See `tests/fixtures/adt/README.md` for what the corpus is and what still
 * carries this system's own object names.
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
