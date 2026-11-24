/**
 * Plan step 10 (owner): a description is ready when a user's typical
 * questions find its tool first. Each moved tool has 3–5 queries, in
 * Ukrainian and in English (`descriptionQueries.json`); embedded with the
 * Ollama model, every query must rank its own tool first among every
 * served description — or a sibling `siblings` names, which also answers
 * it, the owner's decision beside it. What misses today is recorded in
 * `misses`, for the owner, and must match the measurement exactly. A model the Ollama does not serve
 * skips with its reason; `MEANING_REQUIRED` naming the model makes that a
 * failure (CI, `meaning-vectors`).
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';
import { servedCatalog, setOf } from './catalog';
import { embed, MODELS, OLLAMA_URL, servedModels } from './ollama';

/** The model the query check runs with (the owner's choice). */
const QUERY_MODEL = 'bge-m3';

interface QueryFile {
  readonly queries: Readonly<Record<string, readonly string[]>>;
  /** A query's accepted first tool, by query: a true sibling that answers it too. */
  readonly siblings: Readonly<Record<string, string>>;
  /**
   * The queries measured not yet first, as `<tool>: <query>`:
   * each named for the owner, shrinking as descriptions get ready. A new miss
   * fails, and so does a recorded one that no longer misses.
   */
  readonly misses: readonly string[];
}

const FILE = path.join(
  repositoryRoot(__dirname),
  'src',
  '__tests__',
  'unit',
  'descriptions',
  'descriptionQueries.json',
);

/** The cosine of two vectors; 0 when either is empty. */
function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

const served = servedModels();
const required = process.env.MEANING_REQUIRED;
const model = MODELS.find((each) => each.model === QUERY_MODEL);

describe('each moved tool ranks first on its typical queries', () => {
  const file: QueryFile = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let descriptions: Array<{ name: string; description: string }> = [];
  before(async () => {
    const seen = new Set<string>();
    for (const tools of [
      await servedCatalog(setOf('core')),
      await servedCatalog(setOf('core'), 'stdio', 'cloud'),
    ]) {
      for (const tool of tools) {
        if (seen.has(tool.name)) continue;
        seen.add(tool.name);
        descriptions.push({ name: tool.name, description: tool.description });
      }
    }
    descriptions = descriptions.sort((a, b) => a.name.localeCompare(b.name));
  });

  it('holds queries for tools that exist, 3 to 5 each', () => {
    for (const [tool, queries] of Object.entries(file.queries)) {
      assert.ok(queries.length >= 3 && queries.length <= 5, tool);
    }
  });

  const unserved =
    served === undefined
      ? `the Ollama at ${OLLAMA_URL} does not answer`
      : served.has(QUERY_MODEL)
        ? undefined
        : `the Ollama at ${OLLAMA_URL} does not serve ${QUERY_MODEL}`;
  it(`${QUERY_MODEL}: every query finds its own tool first`, {
    skip:
      unserved !== undefined && required !== QUERY_MODEL
        ? `skipped: ${unserved}`
        : false,
  }, async () => {
    assert.equal(unserved, undefined, unserved);
    assert.ok(model !== undefined);
    const names = descriptions.map((each) => each.name);
    for (const tool of Object.keys(file.queries)) {
      assert.ok(names.includes(tool), `${tool} is served`);
    }
    const documents = await embed(
      model.model,
      descriptions.map((each) => `${model.document}${each.description}`),
      [],
      model.cpu === true,
    );
    const asked = Object.entries(file.queries).flatMap(([tool, queries]) =>
      queries.map((query) => ({ tool, query })),
    );
    const queries = await embed(
      model.model,
      asked.map(({ query }) => `${model.query}${query}`),
      [],
      model.cpu === true,
    );
    const misses = asked.flatMap(({ tool, query }, i) => {
      const vector = queries[i] ?? [];
      const ranked = names
        .map((name, j) => ({ name, score: cosine(vector, documents[j] ?? []) }))
        .sort((a, b) => b.score - a.score);
      const first = ranked[0]?.name;
      const rank = ranked.findIndex((each) => each.name === tool) + 1;
      if (first === tool || file.siblings[query] === first) return [];
      return [{ key: `${tool}: ${query}`, rank, first }];
    });
    // The ranks and first tools go to the message: the record names the miss.
    assert.deepStrictEqual(
      misses.map((each) => each.key),
      file.misses,
      misses
        .map((each) => `${each.key} (at ${each.rank}, first: ${each.first})`)
        .join('\n'),
    );
  });
});
