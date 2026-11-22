/**
 * SearchSource at each `detail` (terse answers, step 3), and the type node
 * SAP could not load.
 *
 * - **terse** (default): TSV — `# scanned` (and `# truncated` when it is
 *   so), `# not loaded by SAP` per node the walk could not read, then the
 *   hits under `# object PACKAGE TYPE NAME` group lines, one row per hit:
 *   `include\tline` (an `answer` given: `\tsnippet` at snippets, `include\thits`
 *   at objects). A hit of a function module or include names its group in
 *   the include column. With no `answer`, terse reads the hits as lines: the
 *   snippets come at `answer: snippets` or at medium and full.
 * - **medium**, **full**: the answer before `detail`, snippets by default.
 * - A type node SAP could not load in a scanned package is named in every
 *   answer (`not_loaded`), not dropped.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  searchSourceAnswerLevel,
  searchSourceRows,
} from '../../../handlers/system/readonly/handleSearchSource';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import { runSearchSource } from '../../../lib/search-source/orchestrator';
import { skipSapAnswers } from '../../../lib/search-source/readFailure';
import {
  exactPackages,
  listing,
  sourcesFrom,
} from '../../helpers/sourceReaderFake';

async function scanned(answer: 'objects' | 'lines' | 'snippets') {
  return runSearchSource(
    {
      lineMatch: substringLineMatch,
      sapAnswers: skipSapAnswers,
      fetchPackageContents: async (name) =>
        listing(name, [
          {
            name: 'not loaded by SAP',
            type: 'CLAS/OC',
            packageName: 'ZPKG',
            isPackage: false,
            notLoaded: true,
          },
          {
            name: 'ZPROG',
            type: 'PROG/P',
            packageName: 'ZPKG',
            isPackage: false,
          },
        ]),
      sourceReader: sourcesFrom({ 'PROG:ZPROG': 'one hit\nnone\nhit two' }),
      resolvePackages: exactPackages,
    },
    { query: 'hit', packages: ['ZPKG'], answer },
  );
}

describe('SearchSource detail', () => {
  it('a type node SAP could not load is named, not dropped', async () => {
    const result = await scanned('snippets');
    assert.deepStrictEqual(result.not_loaded, [
      { package: 'ZPKG', type: 'CLAS/OC' },
    ]);
  });

  it('terse with no answer reads the hits as lines; an answer given is kept', () => {
    assert.equal(searchSourceAnswerLevel('terse', undefined), 'lines');
    assert.equal(searchSourceAnswerLevel('terse', 'snippets'), 'snippets');
    assert.equal(searchSourceAnswerLevel('full', undefined), 'snippets');
    assert.equal(searchSourceAnswerLevel('medium', 'objects'), 'objects');
  });

  it('terse at lines: the hits under their object, include and line', async () => {
    assert.equal(
      searchSourceRows(await scanned('lines')),
      [
        '# scanned objects 1 sources 1 objects_with_hits 1',
        '# not loaded by SAP ZPKG CLAS/OC',
        'include\tline',
        '# object ZPKG PROG ZPROG',
        'ZPROG\t1',
        'ZPROG\t3',
      ].join('\n'),
    );
  });

  it('terse at snippets: a snippet column', async () => {
    const rows = searchSourceRows(await scanned('snippets')).split('\n');
    assert.equal(rows[2], 'include\tline\tsnippet');
    assert.equal(rows[4], 'ZPROG\t1\tone hit');
  });

  it('terse at objects: the hits counted per object and include', async () => {
    const rows = searchSourceRows(await scanned('objects')).split('\n');
    assert.equal(rows[2], 'include\thits');
    assert.equal(rows[4], 'ZPROG\t2');
  });
});
