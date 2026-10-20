/**
 * Lexical tool retrieval, offline and deterministic: BM25 over each tool's
 * name, parameter names and `keywords` (as `tools/list` serves them, under
 * `_meta["mcp-abap-adt/search"]`), over the full set's catalog — the read
 * collection what the read-only set serves, the write collection the rest.
 * Every required group of every query (`queries.ts`, #270 and #271 among
 * them) is found within the consumer's top K per collection (`TOP_K`: 10
 * read, 5 write) for every role that asks it.
 */
import { servedCatalog, setOf } from './catalog';
import { bm25Scorer, type Catalog, catalogOf, lexicalText } from './harness';
import { QUERIES } from './queries';
import {
  Bm25,
  describeFailure,
  evaluate,
  ranked,
  TOP_K,
  tokenize,
} from './retrieval';

describe('BM25 tool retrieval over name, parameters and keywords', () => {
  let catalog: Catalog;
  beforeAll(async () => {
    catalog = catalogOf(
      await servedCatalog(setOf('core')),
      await servedCatalog(setOf('core-ro')),
    );
  });

  it('splits ABAP identifiers on underscores, case changes and digits, drops stopwords', () => {
    expect(tokenize('Where is BAPI_USER_GET_DETAIL used?')).toEqual([
      'where',
      'bapi',
      'user',
      'get',
      'detail',
      'used',
    ]);
    expect(tokenize('GetWhereUsed ADTType CDS views ZI_SALESORDER2')).toEqual([
      'get',
      'where',
      'used',
      'adt',
      'type',
      'cds',
      'view',
      'zi',
      'salesorder',
      '2',
    ]);
  });

  it('ranks the document carrying the rare query terms first', () => {
    const index = new Bm25([
      { name: 'A', text: 'read class source' },
      { name: 'B', text: 'read table rows data preview' },
      { name: 'C', text: 'read program source' },
    ]);
    expect(ranked(index.scores('rows of a table'))[0]).toBe('B');
  });

  it('serves every tool of the full set with its keywords', () => {
    const bare = catalog.tools
      .filter((tool) => (tool.search?.keywords.length ?? 0) === 0)
      .map((tool) => tool.name);
    expect(bare).toEqual([]);
    expect(catalog.byCollection.read.length).toBeGreaterThan(TOP_K.read);
    expect(catalog.byCollection.write.length).toBeGreaterThan(TOP_K.write);
  });

  it('finds every required tool of every query within the top K of its collection, per role', () => {
    const outcomes = evaluate(
      QUERIES,
      bm25Scorer(catalog, lexicalText),
      catalog.collectionOf,
    );
    expect(outcomes.length).toBeGreaterThan(QUERIES.length);
    expect(
      outcomes.filter((outcome) => !outcome.passed).map(describeFailure),
    ).toEqual([]);
  });
});
