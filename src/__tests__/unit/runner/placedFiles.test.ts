/**
 * Files production code reads beside itself (D27, spec §2): production code
 * that reads a repository file by its own location — `require('<relative>')`
 * of a file that is not code, or `__dirname` joined or resolved with literal
 * parts — finds it in the test build, because the node:test build places it
 * there from one list (`tools/node-test-placed.json`). The guard reads every
 * production source with the TypeScript parser and fails on a read the list
 * does not place, on a read whose target it cannot state, and on an entry no
 * read needs. The build's placement itself is `build.test.ts`'s.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  locationReads,
  PLACED_LIST,
  placementFindings,
  productionSourceDirs,
  readPlaced,
} from './locationReads';
import { REPO, temporaryDir, writeAt } from './toolRuns';

const scratch = temporaryDir('placed-files-');
after(() => scratch.remove());

describe('files production code reads beside itself', () => {
  it('the list places exactly the files production code reads by its location', () => {
    const reads = locationReads(REPO, productionSourceDirs(REPO));
    assert.deepEqual(reads.unstated, []);
    assert.ok(reads.targets.length > 0, 'no read found');
    assert.deepEqual(
      placementFindings(reads, readPlaced(REPO)),
      [],
      `${PLACED_LIST} disagrees with the reads`,
    );
  });

  it('a read the list places passes; one it does not place, and an entry no read needs, fail', () => {
    const repo = path.join(scratch.dir, 'reads');
    writeAt(repo, 'pkg/package.json', '{}\n');
    writeAt(repo, 'tools/table.json', '[]\n');
    writeAt(
      repo,
      'pkg/src/version.ts',
      [
        "import { readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "export const V = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');",
        '',
      ].join('\n'),
    );
    writeAt(
      repo,
      'pkg/src/table.ts',
      [
        "export const T: unknown = require('../../tools/table.json');",
        // Code is compiled, not placed.
        "export const C: unknown = require('./version');",
        '',
      ].join('\n'),
    );
    // A test reads its data from the repository: never a production read.
    writeAt(
      repo,
      'pkg/src/__tests__/data.test.ts',
      "export const D: unknown = require('../../../tools/table.json');\n",
    );
    const reads = locationReads(repo, [path.join(repo, 'pkg', 'src')]);
    assert.deepEqual(reads.unstated, []);
    assert.deepEqual(reads.targets, [
      { target: 'pkg/package.json', by: 'pkg/src/version.ts' },
      { target: 'tools/table.json', by: 'pkg/src/table.ts' },
    ]);

    assert.deepEqual(
      placementFindings(reads, ['pkg/package.json', 'tools/table.json']),
      [],
    );
    assert.deepEqual(placementFindings(reads, ['pkg/package.json']), [
      'tools/table.json: read by pkg/src/table.ts, not placed',
    ]);
    assert.deepEqual(
      placementFindings(reads, [
        'pkg/package.json',
        'tools/other.json',
        'tools/table.json',
      ]),
      ['tools/other.json: placed, read by no production code'],
    );
  });

  it('a read whose target it cannot state fails', () => {
    const repo = path.join(scratch.dir, 'unstated');
    writeAt(
      repo,
      'pkg/src/dynamic.ts',
      [
        "import { readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "const name = 'package.json';",
        'export const A = readFileSync(join(__dirname, name));',
        'export const B = readFileSync(__dirname);',
        '',
      ].join('\n'),
    );
    const reads = locationReads(repo, [path.join(repo, 'pkg', 'src')]);
    assert.deepEqual(reads.targets, []);
    assert.deepEqual(reads.unstated, [
      'pkg/src/dynamic.ts:4: __dirname not joined with literal parts',
      'pkg/src/dynamic.ts:5: __dirname not joined with literal parts',
    ]);
  });
});
