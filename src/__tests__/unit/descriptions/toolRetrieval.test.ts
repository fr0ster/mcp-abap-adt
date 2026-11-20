/**
 * Lexical tool retrieval, offline and deterministic: BM25 over each tool's
 * name, parameter names and `keywords` (as `tools/list` serves them, under
 * `_meta["mcp-abap-adt/search"]`), over the full set's catalog — the read
 * collection what the read-only set serves, the write collection the rest.
 * Every required group of every query of the tuning set (`queries.ts`, #270
 * and #271 among them) is found within the consumer's top K per collection
 * (`TOP_K`: 10 read, 5 write) for every role that asks it. The held-out set
 * (`heldOut.ts`, never used to tune the texts) gets no worse than its
 * recorded baseline; a held-out failure is fixed only together with fresh
 * held-out queries.
 */

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { servedCatalog, setOf } from './catalog';
import { bm25Scorer, type Catalog, catalogOf, lexicalText } from './harness';
import { HELD_OUT, worseThanBaseline } from './heldOut';
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
  before(async () => {
    catalog = catalogOf(
      await servedCatalog(setOf('core')),
      await servedCatalog(setOf('core-ro')),
    );
  });

  it('splits ABAP identifiers on underscores, case changes and digits, drops stopwords', () => {
    assert.deepStrictEqual(tokenize('Where is BAPI_USER_GET_DETAIL used?'), [
      'where',
      'bapi',
      'user',
      'get',
      'detail',
      'used',
    ]);
    assert.deepStrictEqual(
      tokenize('GetWhereUsed ADTType CDS views ZI_SALESORDER2'),
      [
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
      ],
    );
  });

  it('ranks the document carrying the rare query terms first', () => {
    const index = new Bm25([
      { name: 'A', text: 'read class source' },
      { name: 'B', text: 'read table rows data preview' },
      { name: 'C', text: 'read program source' },
    ]);
    assert.equal(ranked(index.scores('rows of a table'))[0], 'B');
  });

  it('counts a tool that scored nothing as not found, whatever its place', () => {
    const [outcome] = evaluate(
      [
        {
          query: 'q',
          roles: ['reader'],
          required: [['Aaa']],
          source: 'own',
        },
      ],
      () =>
        new Map([
          ['Aaa', 0],
          ['Bbb', 0],
        ]),
      () => 'read',
    );
    assert.deepStrictEqual(outcome?.groups[0], {
      tools: ['Aaa'],
      rank: 1,
      found: false,
    });
    assert.equal(outcome?.passed, false);
  });

  it('serves every tool of the full set with its keywords', () => {
    const bare = catalog.tools
      .filter((tool) => (tool.search?.keywords.length ?? 0) === 0)
      .map((tool) => tool.name);
    assert.deepStrictEqual(bare, []);
    assert.ok(catalog.byCollection.read.length > TOP_K.read);
    assert.ok(catalog.byCollection.write.length > TOP_K.write);
  });

  it('finds every required tool of every query within the top K of its collection, per role', () => {
    const outcomes = evaluate(
      QUERIES,
      bm25Scorer(catalog, lexicalText),
      catalog.collectionOf,
    );
    assert.ok(outcomes.length > QUERIES.length);
    assert.deepStrictEqual(
      outcomes.filter((outcome) => !outcome.passed).map(describeFailure),
      [],
    );
  });

  it('gets the held-out queries no worse than their recorded baseline', () => {
    const outcomes = evaluate(
      HELD_OUT,
      bm25Scorer(catalog, lexicalText),
      catalog.collectionOf,
    );
    assert.ok(outcomes.length > HELD_OUT.length);
    assert.deepStrictEqual(worseThanBaseline('bm25', outcomes), []);
  });
});
