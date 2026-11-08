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

/**
 * `<source>: <why>` → why that finding reads no file. An entry that matches
 * no finding fails too, so the list cannot rot.
 */
const NOT_READS: ReadonlyMap<string, string> = new Map([
  [
    'src/lib/instance.ts: __filename, a location the scan does not resolve',
    'the registering copy is only shown, never resolved, read or compared (the module says so)',
  ],
]);

/** The findings of a fixture repository, as `<line>: <why>` per source. */
function unstatedOf(repo: string): string[] {
  return locationReads(repo, [path.join(repo, 'pkg', 'src')]).unstated.map(
    (finding) => `${finding.by}:${finding.line}: ${finding.why}`,
  );
}

describe('files production code reads beside itself', () => {
  it('the list places exactly the files production code reads by its location', () => {
    const reads = locationReads(REPO, productionSourceDirs(REPO));
    const allowed = reads.unstated.filter((finding) =>
      NOT_READS.has(`${finding.by}: ${finding.why}`),
    );
    assert.deepEqual(
      reads.unstated.filter((finding) => !allowed.includes(finding)),
      [],
    );
    assert.deepEqual(
      [...NOT_READS.keys()].filter(
        (key) =>
          !allowed.some((finding) => `${finding.by}: ${finding.why}` === key),
      ),
      [],
      'an entry of NOT_READS matches no finding',
    );
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
    assert.deepEqual(unstatedOf(repo), []);
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
    assert.deepEqual(
      locationReads(repo, [path.join(repo, 'pkg', 'src')]).targets,
      [],
    );
    assert.deepEqual(unstatedOf(repo), [
      'pkg/src/dynamic.ts:4: __dirname not joined with literal parts',
      'pkg/src/dynamic.ts:5: __dirname not joined with literal parts',
    ]);
  });

  it('every location mechanism the scan does not resolve is refused', () => {
    const repo = path.join(scratch.dir, 'mechanisms');
    writeAt(
      repo,
      'pkg/src/mechanisms.ts',
      [
        "import { readFileSync } from 'node:fs';",
        "import { createRequire } from 'node:module';",
        "import * as path from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        "export const A = require.resolve('./x.json');",
        "export const B = readFileSync(new URL('./x.json', import.meta.url));",
        'export const C = path.dirname(fileURLToPath(import.meta.url));',
        "export const D = readFileSync(path.join(__filename, '..', 'x.json'));",
        'const load = createRequire(C);',
        "export const E: unknown = load('./x.json');",
        "const name = './x.json';",
        'export const F: unknown = require(name);',
        'export const G = import(name);',
        'const r = require;',
        "export const H: unknown = r('./x.json');",
        '',
      ].join('\n'),
    );
    assert.deepEqual(unstatedOf(repo), [
      'pkg/src/mechanisms.ts:2: createRequire, a location the scan does not resolve',
      'pkg/src/mechanisms.ts:5: require not called with one literal',
      'pkg/src/mechanisms.ts:6: import.meta, a location the scan does not resolve',
      'pkg/src/mechanisms.ts:7: import.meta, a location the scan does not resolve',
      'pkg/src/mechanisms.ts:8: __filename, a location the scan does not resolve',
      'pkg/src/mechanisms.ts:9: createRequire, a location the scan does not resolve',
      'pkg/src/mechanisms.ts:12: require not called with one literal',
      'pkg/src/mechanisms.ts:13: import() not called with one literal',
      'pkg/src/mechanisms.ts:14: require not called with one literal',
    ]);
  });

  it('a path from __dirname is followed through its bindings to what is read', () => {
    const repo = path.join(scratch.dir, 'bindings');
    writeAt(repo, 'pkg/package.json', '{}\n');
    writeAt(repo, 'pkg/fixtures/a.json', '"a"\n');
    writeAt(
      repo,
      'pkg/src/bound.ts',
      [
        "import { readdirSync, readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        // Literal parts on a binding: the file read is the target, not the base.
        "const base = join(__dirname, '..');",
        "export const V = readFileSync(join(base, 'package.json'), 'utf8');",
        // A computed part on a directory: the directory is placed whole.
        "export const FIXTURES = join(__dirname, '..', 'fixtures');",
        'export function read(name: string): string {',
        "  return readFileSync(join(FIXTURES, `${name}.json`), 'utf8');",
        '}',
        'export const ALL = readdirSync(FIXTURES);',
        '',
      ].join('\n'),
    );
    // Another production file reads under the exported directory.
    writeAt(
      repo,
      'pkg/src/user.ts',
      [
        "import { readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "import { FIXTURES as here } from './bound';",
        'export const U = (name: string) => readFileSync(join(here, name));',
        '',
      ].join('\n'),
    );
    const reads = locationReads(repo, [path.join(repo, 'pkg', 'src')]);
    assert.deepEqual(unstatedOf(repo), []);
    assert.deepEqual(reads.targets, [
      { target: 'pkg/fixtures', by: 'pkg/src/bound.ts' },
      { target: 'pkg/package.json', by: 'pkg/src/bound.ts' },
    ]);
  });

  it('a path from __dirname the scan cannot follow is refused', () => {
    const repo = path.join(scratch.dir, 'unfollowed');
    writeAt(repo, 'pkg/package.json', '{}\n');
    writeAt(
      repo,
      'pkg/src/lost.ts',
      [
        "import { readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        // A computed part on a file: what is read is not stated.
        "const manifest = join(__dirname, '..', 'package.json');",
        "export const A = (name: string) => readFileSync(join(manifest, '..', name));",
        // A binding the scan cannot hold to one value.
        "let moving = join(__dirname, '..');",
        "moving = '/elsewhere';",
        // A path built by text, not by a join.
        "const dir = join(__dirname, '..');",
        "export const B = readFileSync(dir + '/package.json');",
        'export const C = { dir };',
        '',
      ].join('\n'),
    );
    // An exported location imported as a namespace: its uses are not followed.
    writeAt(
      repo,
      'pkg/src/exported.ts',
      [
        "import { join } from 'node:path';",
        "export const DIR = join(__dirname, '..');",
        '',
      ].join('\n'),
    );
    writeAt(
      repo,
      'pkg/src/namespace.ts',
      [
        "import * as exported from './exported';",
        'export const N = exported;',
        '',
      ].join('\n'),
    );
    // An exported file imported by name: its uses there are followed too.
    writeAt(
      repo,
      'pkg/src/manifest.ts',
      [
        "import { join } from 'node:path';",
        "export const MANIFEST = join(__dirname, '..', 'package.json');",
        '',
      ].join('\n'),
    );
    writeAt(
      repo,
      'pkg/src/byName.ts',
      [
        "import { readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "import { MANIFEST } from './manifest';",
        'export const M = (name: string) => readFileSync(join(MANIFEST, name));',
        '',
      ].join('\n'),
    );
    assert.deepEqual(unstatedOf(repo), [
      'pkg/src/byName.ts:4: a computed part joined onto pkg/package.json, which is not a directory',
      'pkg/src/lost.ts:4: a computed part joined onto pkg/package.json, which is not a directory',
      'pkg/src/lost.ts:5: a path from __dirname bound by a non-const declaration',
      'pkg/src/lost.ts:8: a path from __dirname used where the scan cannot follow it',
      'pkg/src/lost.ts:9: a path from __dirname used where the scan cannot follow it',
      'pkg/src/namespace.ts:1: a module exporting a path from __dirname imported other than by name',
    ]);
  });
});
