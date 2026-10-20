/**
 * The measurement over the full set's catalog: the read collection is what
 * the read-only set serves, the write collection the rest of the full set;
 * each searched by BM25, by cosine over embeddings, or by both (0.7 cosine +
 * 0.3 BM25, the BM25 half divided by its best score).
 */
import type { ServedTool } from './catalog';
import { embed, type MODELS } from './ollama';
import type { Query } from './queries';
import {
  Bm25,
  type Collection,
  cosine,
  normalised,
  type Scorer,
  type ToolDocument,
} from './retrieval';

/** The full set's tools split into the two collections. */
export interface Catalog {
  readonly tools: readonly ServedTool[];
  readonly collectionOf: (tool: string) => Collection;
  readonly byCollection: Readonly<Record<Collection, readonly ServedTool[]>>;
}

export function catalogOf(
  full: readonly ServedTool[],
  readOnly: readonly ServedTool[],
): Catalog {
  const readNames = new Set(readOnly.map((tool) => tool.name));
  const collectionOf = (tool: string): Collection =>
    readNames.has(tool) ? 'read' : 'write';
  return {
    tools: full,
    collectionOf,
    byCollection: {
      read: full.filter((tool) => collectionOf(tool.name) === 'read'),
      write: full.filter((tool) => collectionOf(tool.name) === 'write'),
    },
  };
}

/** The lexical document of a tool: its name, parameter names and keywords. */
export function lexicalText(tool: ServedTool): string {
  return [tool.name, ...tool.parameters, ...(tool.search?.keywords ?? [])].join(
    ' ',
  );
}

/** BM25 over each collection, each tool's document `textOf(tool)`. */
export function bm25Scorer(
  catalog: Catalog,
  textOf: (tool: ServedTool) => string,
): Scorer {
  const indexes = {
    read: new Bm25(documents(catalog.byCollection.read, textOf)),
    write: new Bm25(documents(catalog.byCollection.write, textOf)),
  };
  return (collection, query) => indexes[collection].scores(query);
}

function documents(
  tools: readonly ServedTool[],
  textOf: (tool: ServedTool) => string,
): ToolDocument[] {
  return tools.map((tool) => ({ name: tool.name, text: textOf(tool) }));
}

/**
 * The cosine and hybrid scorers of `model`: every tool's `textOf(tool)` and
 * every query embedded once, kept for this run only.
 */
export async function vectorScorers(
  model: (typeof MODELS)[number],
  catalog: Catalog,
  queries: readonly Query[],
  textOf: (tool: ServedTool) => string,
  lexical: Scorer,
): Promise<{ cosine: Scorer; hybrid: Scorer; unembeddable: string[] }> {
  const unembeddable: string[] = [];
  const toolVectors = await embed(
    model.model,
    catalog.tools.map((tool) => `${model.document}${textOf(tool)}`),
    unembeddable,
    model.cpu === true,
  );
  const queryVectors = await embed(
    model.model,
    queries.map((query) => `${model.query}${query.query}`),
    unembeddable,
    model.cpu === true,
  );
  const byTool = new Map<string, number[]>();
  catalog.tools.forEach((tool, index) => {
    byTool.set(tool.name, toolVectors[index] as number[]);
  });
  const byQuery = new Map<string, number[]>();
  queries.forEach((query, index) => {
    byQuery.set(query.query, queryVectors[index] as number[]);
  });
  const cosineScorer: Scorer = (collection, query) => {
    const vector = byQuery.get(query);
    if (vector === undefined) throw new Error(`query not embedded: ${query}`);
    const scores = new Map<string, number>();
    for (const tool of catalog.byCollection[collection]) {
      scores.set(tool.name, cosine(vector, byTool.get(tool.name) as number[]));
    }
    return scores;
  };
  const hybrid: Scorer = (collection, query) => {
    const dense = cosineScorer(collection, query);
    const sparse = normalised(lexical(collection, query));
    const scores = new Map<string, number>();
    for (const [name, score] of dense) {
      scores.set(name, 0.7 * score + 0.3 * (sparse.get(name) ?? 0));
    }
    return scores;
  };
  return { cosine: cosineScorer, hybrid, unembeddable };
}
