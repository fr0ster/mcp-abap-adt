/**
 * Tool retrieval as a consumer runs it: a query against a collection of tool
 * documents, the top K kept, and every required group of the query found
 * among them. Lexical scoring is BM25; vector scoring is cosine over
 * embeddings someone else computes (see `toolRetrievalVectors.test.ts`).
 *
 * Plain code, no regular expression: an ABAP identifier is split on
 * underscores, case changes and letter/digit boundaries, so
 * `BAPI_USER_GET_DETAIL` and `GetWhereUsed` read as words.
 */
import type { Query, Role } from './queries';

/** The two collections of a consumer: read tools and the rest. */
export type Collection = 'read' | 'write';

/** How many tools a consumer keeps per collection (#271: top-K per collection). */
export const TOP_K: Readonly<Record<Collection, number>> = {
  read: 10,
  write: 5,
};

/** The collections a role searches. */
export const COLLECTIONS: Readonly<Record<Role, readonly Collection[]>> = {
  reader: ['read'],
  developer: ['read', 'write'],
};

const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'i',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'please',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'this',
  'to',
  'us',
  'was',
  'we',
  'what',
  'when',
  'which',
  'why',
  'with',
  'you',
  'your',
]);

function isLetter(character: string): boolean {
  return character.toLowerCase() !== character.toUpperCase();
}

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

function isUpper(character: string): boolean {
  return isLetter(character) && character === character.toUpperCase();
}

/** `GetWhereUsed` → Get, Where, Used; `ADTType` → ADT, Type; `v2x` → v, 2, x. */
function splitWord(word: string): string[] {
  const parts: string[] = [];
  let current = '';
  const characters = [...word];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] as string;
    const previous = index > 0 ? (characters[index - 1] as string) : '';
    const next =
      index + 1 < characters.length ? (characters[index + 1] as string) : '';
    const boundary =
      current !== '' &&
      ((isUpper(character) && !isUpper(previous) && !isDigit(previous)) ||
        (isUpper(character) &&
          isUpper(previous) &&
          next !== '' &&
          isLetter(next) &&
          !isUpper(next)) ||
        (isDigit(character) !== isDigit(previous) && previous !== ''));
    if (boundary) {
      parts.push(current);
      current = '';
    }
    current += character;
  }
  if (current !== '') parts.push(current);
  return parts;
}

/** A plural's singular, kept short: `views` → `view`, `entries` → `entry`. */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (
    word.length > 3 &&
    word.endsWith('s') &&
    !word.endsWith('ss') &&
    !word.endsWith('us') &&
    !word.endsWith('is')
  ) {
    return word.slice(0, -1);
  }
  return word;
}

/** The search terms of `text`, lower-cased, stopwords dropped. */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  let word = '';
  const flush = () => {
    if (word === '') return;
    for (const part of splitWord(word)) {
      const lower = singular(part.toLowerCase());
      if (lower !== '' && !STOPWORDS.has(lower)) terms.push(lower);
    }
    word = '';
  };
  for (const character of text) {
    if (isLetter(character) || isDigit(character)) {
      word += character;
      continue;
    }
    flush();
  }
  flush();
  return terms;
}

/** One searchable document: the tool and its text. */
export interface ToolDocument {
  readonly name: string;
  readonly text: string;
}

/** Okapi BM25 over one collection (k1 = 1.2, b = 0.75). */
export class Bm25 {
  private readonly terms: ReadonlyArray<ReadonlyMap<string, number>>;
  private readonly lengths: readonly number[];
  private readonly averageLength: number;
  private readonly documentFrequency = new Map<string, number>();

  constructor(private readonly documents: readonly ToolDocument[]) {
    this.terms = documents.map((document) => {
      const counts = new Map<string, number>();
      for (const term of tokenize(document.text)) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
      return counts;
    });
    this.lengths = this.terms.map((counts) => {
      let length = 0;
      for (const count of counts.values()) length += count;
      return length;
    });
    this.averageLength =
      this.lengths.reduce((sum, length) => sum + length, 0) /
      Math.max(1, this.lengths.length);
    for (const counts of this.terms) {
      for (const term of counts.keys()) {
        this.documentFrequency.set(
          term,
          (this.documentFrequency.get(term) ?? 0) + 1,
        );
      }
    }
  }

  /** The score of every document for `query`, by tool name. */
  scores(query: string): Map<string, number> {
    const k1 = 1.2;
    const b = 0.75;
    const n = this.documents.length;
    const queryTerms = tokenize(query);
    const result = new Map<string, number>();
    this.documents.forEach((document, index) => {
      const counts = this.terms[index] as ReadonlyMap<string, number>;
      const length = this.lengths[index] as number;
      let score = 0;
      for (const term of queryTerms) {
        const frequency = counts.get(term);
        if (frequency === undefined) continue;
        const df = this.documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score +=
          (idf * frequency * (k1 + 1)) /
          (frequency + k1 * (1 - b + (b * length) / this.averageLength));
      }
      result.set(document.name, score);
    });
    return result;
  }
}

/** The names of `scores`, best first; ties by name, so the order is fixed. */
export function ranked(scores: ReadonlyMap<string, number>): string[] {
  return [...scores.entries()]
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map(([name]) => name);
}

/** `scores` divided by its largest, so a hybrid can weigh it beside cosine. */
export function normalised(
  scores: ReadonlyMap<string, number>,
): Map<string, number> {
  let top = 0;
  for (const score of scores.values()) top = Math.max(top, score);
  const result = new Map<string, number>();
  for (const [name, score] of scores) {
    result.set(name, top > 0 ? score / top : 0);
  }
  return result;
}

/** The scores of one collection for one query. */
export type Scorer = (
  collection: Collection,
  query: string,
) => ReadonlyMap<string, number>;

/** One query's outcome for a role: each required group's best rank. */
export interface Outcome {
  readonly query: string;
  readonly role: Role;
  /** Per group: its tools, and the best rank of one of them (1-based, in its collection), or none. */
  readonly groups: ReadonlyArray<{
    readonly tools: readonly string[];
    readonly rank: number | undefined;
    readonly found: boolean;
  }>;
  readonly passed: boolean;
}

/**
 * Runs every query for every role it names: each collection the role
 * searches gives its top K, and a group is found when one of its tools is
 * among them.
 */
export function evaluate(
  queries: readonly Query[],
  scorer: Scorer,
  collectionOf: (tool: string) => Collection,
): Outcome[] {
  const outcomes: Outcome[] = [];
  for (const query of queries) {
    for (const role of query.roles) {
      const rankings = new Map<Collection, string[]>();
      for (const collection of COLLECTIONS[role]) {
        rankings.set(collection, ranked(scorer(collection, query.query)));
      }
      const groups = query.required.map((tools) => {
        let best: number | undefined;
        let found = false;
        for (const tool of tools) {
          const ranking = rankings.get(collectionOf(tool));
          if (ranking === undefined) continue;
          const index = ranking.indexOf(tool);
          if (index < 0) continue;
          const rank = index + 1;
          if (best === undefined || rank < best) best = rank;
          if (rank <= TOP_K[collectionOf(tool)]) found = true;
        }
        return { tools, rank: best, found };
      });
      outcomes.push({
        query: query.query,
        role,
        groups,
        passed: groups.every((group) => group.found),
      });
    }
  }
  return outcomes;
}

/** A failed outcome in one line: the query, the role, each missed group's rank. */
export function describeFailure(outcome: Outcome): string {
  const missed = outcome.groups
    .filter((group) => !group.found)
    .map((group) => `${group.tools.join('|')} at ${group.rank ?? '-'}`)
    .join(', ');
  return `[${outcome.role}] "${outcome.query}": ${missed}`;
}

/** Cosine similarity of two vectors of one length. */
export function cosine(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length) return 0;
  let dot = 0;
  let xx = 0;
  let yy = 0;
  for (let index = 0; index < x.length; index += 1) {
    const a = x[index] as number;
    const c = y[index] as number;
    dot += a * c;
    xx += a * a;
    yy += c * c;
  }
  return xx === 0 || yy === 0 ? 0 : dot / Math.sqrt(xx * yy);
}
