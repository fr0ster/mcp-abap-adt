/**
 * Files production code reads beside itself (D27, spec §2): production code
 * that reads a repository file by its own location finds it in the test
 * build, because the node:test build places it there from one list
 * (`tools/node-test-placed.json`). The guard reads the production program
 * through the TypeScript checker (`locationReads.ts` states what it follows
 * and what it refuses) and fails on a read the list does not place, on any
 * way to the module's location whose target it cannot state, and on an entry
 * no read needs. The build's placement itself is `build.test.ts`'s.
 *
 * Each fixture is a small production tree under a temporary repository,
 * read as the repository's own sources are: one refused form per case, and a
 * clean counter-example beside them.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  type LocationReads,
  locationReads,
  PLACED_LIST,
  placementFindings,
  productionProgram,
  productionSources,
  programOver,
  readPlaced,
  WHY,
} from './locationReads';
import { REPO, temporaryDir, writeAt } from './toolRuns';

const scratch = temporaryDir('placed-files-');
after(() => scratch.remove());

let fixtures = 0;

/** A fixture repository holding `files` (path → lines), scanned under `dir`. */
function scan(
  files: Readonly<Record<string, readonly string[]>>,
  dir = 'pkg/src',
): {
  reads: LocationReads;
  unstated: string[];
} {
  fixtures += 1;
  const repo = path.join(scratch.dir, `repo-${fixtures}`);
  for (const [file, lines] of Object.entries(files)) {
    writeAt(repo, file, [...lines, ''].join('\n'));
  }
  const sources = productionSources(path.join(repo, ...dir.split('/')));
  const reads = locationReads(
    repo,
    programOver(path.join(REPO, 'tsconfig.json'), sources),
    sources,
  );
  return {
    reads,
    unstated: reads.unstated.map(
      (finding) => `${finding.by}:${finding.line}: ${finding.why}`,
    ),
  };
}

const FS = "import { readdirSync, readFileSync } from 'node:fs';";
const PATH = "import * as path from 'node:path';";

describe('files production code reads beside itself', () => {
  it('the list places exactly the files production code reads by its location', () => {
    const { program, sources } = productionProgram(REPO);
    const reads = locationReads(REPO, program, sources);
    assert.deepEqual(reads.unstated, []);
    assert.ok(reads.targets.length > 0, 'no read found');
    assert.deepEqual(
      placementFindings(reads, readPlaced(REPO)),
      [],
      `${PLACED_LIST} disagrees with the reads`,
    );
  });

  it('a read the list places passes; one it does not place, and an entry no read needs, fail', () => {
    const { reads, unstated } = scan({
      'pkg/package.json': ['{}'],
      'tools/table.json': ['[]'],
      'pkg/src/version.ts': [
        FS,
        PATH,
        "export const V = readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');",
      ],
      'pkg/src/table.ts': [
        "export const T: unknown = require('../../tools/table.json');",
        // Code is compiled, not placed.
        "export const C: unknown = require('./version');",
      ],
      // A test reads its data from the repository: never a production read.
      'pkg/src/__tests__/data.test.ts': [
        "export const D: unknown = require('../../../tools/table.json');",
      ],
    });
    assert.deepEqual(unstated, []);
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
    // A listed directory places what is under it.
    assert.deepEqual(placementFindings(reads, ['pkg', 'tools']), []);
  });

  describe('every way to the module location the scan does not resolve is refused', () => {
    const refusedForm = (name: string, lines: readonly string[], why: string) =>
      it(name, () => {
        const { unstated } = scan({ 'pkg/src/form.ts': lines });
        assert.ok(
          unstated.some((finding) => finding.endsWith(`: ${why}`)),
          unstated.join('\n'),
        );
      });
    refusedForm(
      'module.filename',
      ['export const F = module.filename;'],
      WHY.module,
    );
    refusedForm(
      "module['require']",
      ["export const R: unknown = module['require']('./x.json');"],
      WHY.module,
    );
    refusedForm(
      'a destructured module',
      ['const { filename } = module;', 'export const F = filename;'],
      WHY.module,
    );
    refusedForm(
      'process.argv[1]',
      ['export const P = process.argv[1];'],
      WHY.argv,
    );
    refusedForm(
      'process.argv as a value',
      ['const args = process.argv;', 'export const P = args[1];'],
      WHY.argv,
    );
    refusedForm(
      'a destructured process',
      ['const { argv } = process;', 'export const P = argv[1];'],
      WHY.process,
    );
    refusedForm(
      'process.mainModule',
      ['export const M = process.mainModule;'],
      WHY.mainModule,
    );
    refusedForm(
      'process held under a type with no argv, then read',
      [
        FS,
        'const hidden: object = process;',
        "export const S = readFileSync(String(Reflect.get(hidden, 'argv')));",
      ],
      WHY.process,
    );
    refusedForm(
      'process given to Reflect',
      ["export const P: unknown = Reflect.get(process, 'argv');"],
      WHY.process,
    );
    refusedForm(
      'process spread',
      ['export const P = { ...process };'],
      WHY.process,
    );
    refusedForm(
      'process returned',
      ['export function current(): object { return process; }'],
      WHY.process,
    );
    refusedForm(
      'process handed to a type with no argv',
      [
        'function listen(on: { exitCode?: number | string | undefined }): void { void on; }',
        'listen(process);',
      ],
      WHY.process,
    );
    refusedForm(
      'process read with a computed key',
      ["const key = 'argv';", 'export const P: unknown = process[key];'],
      WHY.process,
    );
    refusedForm(
      'process handed to a type that has argv',
      [
        'function inspect(p: NodeJS.Process): string | undefined { return p.argv[1]; }',
        'export const I = inspect(process);',
      ],
      WHY.process,
    );
    refusedForm(
      'require.resolve',
      ["export const A = require.resolve('./x.json');"],
      WHY.require,
    );
    refusedForm(
      'require of a computed name',
      ["const name = './x.json';", 'export const F: unknown = require(name);'],
      WHY.require,
    );
    refusedForm(
      'require held as a value',
      ['const r = require;', "export const H: unknown = r('./x.json');"],
      WHY.require,
    );
    refusedForm(
      'import() of a computed name',
      ["const name = './x.json';", 'export const G = import(name);'],
      WHY.importCall,
    );
    refusedForm(
      'new URL(…, import.meta.url)',
      [
        FS,
        "export const B = readFileSync(new URL('./x.json', import.meta.url));",
      ],
      WHY.importMeta,
    );
    refusedForm(
      'createRequire',
      [
        "import { createRequire } from 'node:module';",
        "export const E: unknown = createRequire('/x')('./x.json');",
      ],
      WHY.createRequire,
    );
    refusedForm(
      'createRequire renamed',
      [
        "import { createRequire as make } from 'node:module';",
        "export const E: unknown = make('/x')('./x.json');",
      ],
      WHY.createRequire,
    );
    refusedForm(
      'Module.createRequire',
      [
        "import Module from 'node:module';",
        "export const E: unknown = Module.createRequire('/x')('./x.json');",
      ],
      WHY.createRequire,
    );
    refusedForm(
      '__filename read whole',
      [FS, 'export const S = readFileSync(__filename);'],
      WHY.ownFile,
    );
    refusedForm(
      '__dirname read whole',
      [FS, 'export const S = readdirSync(__dirname);'],
      WHY.ownFile,
    );
    refusedForm(
      '__filename kept in an object (as src/lib/instance.ts did before 24.0.0)',
      [
        "export const I = { file: typeof __filename === 'string' ? __filename : 'bundled' };",
      ],
      WHY.unfollowed,
    );

    it('clean: what reads no location, and what the scan resolves', () => {
      const { reads, unstated } = scan({
        'pkg/x.json': ['{}'],
        'pkg/src/clean.ts': [
          FS,
          PATH,
          "export const stdio = process.argv.includes('--stdio');",
          'export const rest = process.argv.slice(2);',
          'export const first = process.argv[2];',
          "export const env = process.env['HOME'];",
          "process.on('exit', () => undefined);",
          "export const kind = typeof __filename === 'string';",
          "export const S = readFileSync(path.join(__filename, '..', '..', 'x.json'));",
          "export const T: unknown = require('node:path');",
        ],
      });
      assert.deepEqual(unstated, []);
      assert.deepEqual(reads.targets, [
        { target: 'pkg/x.json', by: 'pkg/src/clean.ts' },
      ]);
    });
  });

  describe('src/lib/instance.ts is read by the general rule', () => {
    const INSTANCE = 'src/lib/instance.ts';
    /** The registry and its registration as 23.x had them: `__filename` at line 14. */
    const earlier = (inside: readonly string[] = []): string[] => [
      "const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');",
      'function isRegistry(value: unknown): value is { file: string }[] {',
      '  return Array.isArray(value);',
      '}',
      'function registry(): { file: string }[] {',
      '  const found: unknown = Reflect.get(globalThis, REGISTRY);',
      ...inside,
      '  const created: { file: string }[] = [];',
      '  Reflect.set(globalThis, REGISTRY, created);',
      '  return created;',
      '}',
      'registry().push(',
      '  Object.freeze({',
      "    file: typeof __filename === 'string' ? __filename : 'bundled',",
      '  }),',
      ');',
    ];

    it("Codex's example: the entries read inside registry() — refused", () => {
      const lines = [
        FS,
        ...earlier([
          '  if (isRegistry(found)) {',
          '    for (const entry of found) readFileSync(entry.file);',
          '    return found;',
          '  }',
        ]),
      ];
      const { unstated } = scan({ [INSTANCE]: lines }, 'src');
      const at = lines.findIndex((line) => line.includes('? __filename :')) + 1;
      assert.deepEqual(unstated, [`${INSTANCE}:${at}: ${WHY.unfollowed}`]);
    });

    it('the earlier registration of __filename — refused', () => {
      const { unstated } = scan(
        { [INSTANCE]: earlier(['  if (isRegistry(found)) return found;']) },
        'src',
      );
      assert.deepEqual(unstated, [`${INSTANCE}:14: ${WHY.unfollowed}`]);
    });

    it('clean: the 24.0.0 registration, a version and a label', () => {
      const { reads, unstated } = scan(
        {
          'package.json': ['{ "name": "x", "version": "1.0.0" }'],
          [INSTANCE]: [
            "import { isSea } from 'node:sea';",
            "const manifest: unknown = require('../../package.json');",
            'const entries: { version: string; label: string }[] = [];',
            'entries.push(',
            "  Object.freeze({ version: String(manifest), label: isSea() ? 'bundled' : 'dist' }),",
            ');',
          ],
        },
        'src',
      );
      assert.deepEqual(unstated, []);
      assert.deepEqual(reads.targets, [
        { target: 'package.json', by: INSTANCE },
      ]);
    });
  });

  describe('a location exported by a module is followed through its namespace', () => {
    const base: Record<string, readonly string[]> = {
      'pkg/secret.json': ['{}'],
      'pkg/fixtures/a.json': ['"a"'],
      'pkg/src/base.ts': [
        PATH,
        "export const BASE = path.join(__dirname, '..', 'fixtures');",
      ],
    };
    it('a member read with a literal key is followed to its target', () => {
      const { reads, unstated } = scan({
        ...base,
        'pkg/src/user.ts': [
          FS,
          PATH,
          "import * as locations from './base.js';",
          "export const S = readFileSync(path.join(locations['BASE'], '..', 'secret.json'));",
        ],
      });
      assert.deepEqual(unstated, []);
      assert.deepEqual(reads.targets, [
        { target: 'pkg/fixtures', by: 'pkg/src/base.ts' },
        { target: 'pkg/secret.json', by: 'pkg/src/user.ts' },
      ]);
    });
    const refusedWhole = (
      name: string,
      lines: readonly string[],
      line: number,
    ) =>
      it(name, () => {
        const { unstated } = scan({
          ...base,
          'pkg/src/user.ts': [FS, PATH, ...lines],
        });
        assert.deepEqual(unstated, [
          `pkg/src/user.ts:${line}: ${WHY.moduleWhole}`,
        ]);
      });
    refusedWhole(
      'a member read with a computed key',
      [
        "import * as locations from './base.js';",
        "export const S = (key: 'BASE') => readFileSync(path.join(locations[key], 'a.json'));",
      ],
      4,
    );
    refusedWhole(
      'the namespace passed whole',
      [
        "import * as locations from './base.js';",
        'export const all = Object.values(locations);',
      ],
      4,
    );
    refusedWhole(
      'the namespace destructured',
      [
        "import * as locations from './base.js';",
        'const { BASE } = locations;',
        "export const S = readFileSync(path.join(BASE, '..', 'secret.json'));",
      ],
      4,
    );
    refusedWhole(
      'the module required',
      ["export const S: unknown = require('./base');"],
      3,
    );
    refusedWhole(
      'the module imported dynamically',
      ["export const S = import('./base.js');"],
      3,
    );
  });

  describe('the members of process that name the program are resolved by symbol', () => {
    const refusedArgv = (
      name: string,
      files: Record<string, readonly string[]>,
      why: string,
    ) =>
      it(name, () => {
        const { unstated } = scan(files);
        assert.ok(
          unstated.some((finding) => finding.endsWith(`: ${why}`)),
          unstated.join('\n'),
        );
      });
    refusedArgv(
      'argv imported from node:process',
      {
        'pkg/src/a.ts': [
          "import { argv } from 'node:process';",
          'export const P = argv[1];',
        ],
      },
      WHY.argv,
    );
    refusedArgv(
      'argv imported under another name',
      {
        'pkg/src/a.ts': [
          "import { argv as args } from 'process';",
          'export const P = args[1];',
        ],
      },
      WHY.argv,
    );
    refusedArgv(
      'argv re-exported',
      {
        'pkg/src/again.ts': ["export { argv } from 'node:process';"],
        'pkg/src/a.ts': [
          "import { argv } from './again.js';",
          'export const P = argv[1];',
        ],
      },
      WHY.argv,
    );
    refusedArgv(
      'the default import of node:process',
      {
        'pkg/src/a.ts': [
          "import proc from 'node:process';",
          'export const P = proc.argv[1];',
        ],
      },
      WHY.argv,
    );
    refusedArgv(
      'a namespace import of node:process',
      {
        'pkg/src/a.ts': [
          "import * as proc from 'node:process';",
          'export const P = proc.argv[1];',
        ],
      },
      WHY.argv,
    );
    refusedArgv(
      'argv read with a literal key',
      { 'pkg/src/a.ts': ["export const P = process['argv'][1];"] },
      WHY.argv,
    );
    refusedArgv(
      'mainModule imported from node:process',
      {
        'pkg/src/a.ts': [
          "import { mainModule } from 'node:process';",
          'export const M = mainModule;',
        ],
      },
      WHY.mainModule,
    );
    refusedArgv(
      'node:process required',
      {
        'pkg/src/a.ts': [
          "export const P: unknown = require('node:process').argv[1];",
        ],
      },
      WHY.builtinRequire,
    );

    it('clean: argv from node:process read past the program', () => {
      const { unstated } = scan({
        'pkg/src/a.ts': [
          "import { argv } from 'node:process';",
          "import proc from 'node:process';",
          'export const rest = argv.slice(2);',
          "export const stdio = proc.argv.includes('--stdio');",
          'export const path = proc.execPath;',
        ],
      });
      assert.deepEqual(unstated, []);
    });
  });

  describe('a computed part is taken only when it cannot leave its base', () => {
    const files = (read: string): Record<string, readonly string[]> => ({
      'pkg/fixtures/a.json': ['"a"'],
      'pkg/fixtures/b.json': ['"b"'],
      'pkg/src/under.ts': [
        FS,
        PATH,
        "const base = path.join(__dirname, '..', 'fixtures');",
        read,
      ],
    });
    const refusedPart = (name: string, read: string, why: string) =>
      it(name, () => {
        const { unstated } = scan(files(read));
        assert.deepEqual(unstated, [`pkg/src/under.ts:4: ${why}`]);
      });
    refusedPart(
      'a string part',
      'export const R = (name: string) => readFileSync(path.join(base, name));',
      WHY.computedUnbounded('pkg/fixtures'),
    );
    refusedPart(
      'a template part',
      'export const R = (name: string) => readFileSync(path.join(base, `${name}.json`));',
      WHY.computedUnbounded('pkg/fixtures'),
    );
    refusedPart(
      'a literal-typed part that climbs',
      "export const R = (up: '../a.json') => readFileSync(path.join(base, up));",
      WHY.computedUnbounded('pkg/fixtures'),
    );
    refusedPart(
      'a literal-typed absolute part',
      "export const R = (at: '/etc/a.json') => readFileSync(path.join(base, at));",
      WHY.computedUnbounded('pkg/fixtures'),
    );
    refusedPart(
      'any computed part under resolve',
      "export const R = (name: 'a.json') => readFileSync(path.resolve(base, name));",
      WHY.computedResolve,
    );

    it('a literal part that climbs is stated, and placed only by its own entry', () => {
      const { reads, unstated } = scan(
        files("export const R = readFileSync(path.join(base, '../x.json'));"),
      );
      assert.deepEqual(unstated, []);
      assert.deepEqual(reads.targets, [
        { target: 'pkg/x.json', by: 'pkg/src/under.ts' },
      ]);
      assert.deepEqual(placementFindings(reads, ['pkg/fixtures']), [
        'pkg/x.json: read by pkg/src/under.ts, not placed',
        'pkg/fixtures: placed, read by no production code',
      ]);
    });

    it('clean: a part bounded to literals is followed to each of them', () => {
      const { reads, unstated } = scan(
        files(
          "export const R = (name: 'a.json' | 'b.json') => readFileSync(path.join(base, name));",
        ),
      );
      assert.deepEqual(unstated, []);
      assert.deepEqual(reads.targets, [
        { target: 'pkg/fixtures/a.json', by: 'pkg/src/under.ts' },
        { target: 'pkg/fixtures/b.json', by: 'pkg/src/under.ts' },
      ]);
    });
  });

  describe('a location is followed through every export, by symbol', () => {
    const exporter: Record<string, readonly string[]> = {
      'pkg/fixtures/a.json': ['"a"'],
      'pkg/src/dir.ts': [
        PATH,
        "export const DIR = path.join(__dirname, '..', 'fixtures');",
        'export default DIR;',
      ],
      'pkg/src/reexport.ts': ["export { DIR as HERE } from './dir.js';"],
      'pkg/src/star.ts': ["export * from './reexport';"],
    };
    const refusedThrough = (name: string, lines: readonly string[]) =>
      it(name, () => {
        const { unstated } = scan({ ...exporter, 'pkg/src/user.ts': lines });
        assert.deepEqual(unstated, [
          `pkg/src/user.ts:4: ${WHY.computedUnbounded('pkg/fixtures')}`,
        ]);
      });
    refusedThrough('a re-export chain with .js specifiers', [
      FS,
      PATH,
      "import { HERE } from './star.js';",
      'export const U = (name: string) => readFileSync(path.join(HERE, name));',
    ]);
    refusedThrough('a default export', [
      FS,
      PATH,
      "import Dir from './dir';",
      'export const U = (name: string) => readFileSync(path.join(Dir, name));',
    ]);
    refusedThrough('a namespace import', [
      FS,
      PATH,
      "import * as dir from './dir';",
      'export const U = (name: string) => readFileSync(path.join(dir.DIR, name));',
    ]);

    it('clean: a literal read through the chain is its target', () => {
      const { reads, unstated } = scan({
        ...exporter,
        'pkg/src/user.ts': [
          FS,
          PATH,
          "import { HERE } from './star.js';",
          "export const U = readFileSync(path.join(HERE, 'a.json'));",
        ],
      });
      assert.deepEqual(unstated, []);
      assert.deepEqual(reads.targets, [
        { target: 'pkg/fixtures', by: 'pkg/src/dir.ts' },
        { target: 'pkg/fixtures/a.json', by: 'pkg/src/user.ts' },
      ]);
    });
  });

  describe('callees and references are resolved by symbol, not by name', () => {
    it('a join of its own is not the one of node:path', () => {
      const { unstated } = scan({
        'pkg/src/own.ts': [
          'function join(a: string, b: string): string { return a + b; }',
          "export const J = join(__dirname, 'x.json');",
        ],
      });
      assert.deepEqual(unstated, [`pkg/src/own.ts:2: ${WHY.call}`]);
    });

    it('a destructured join is not followed', () => {
      const { unstated } = scan({
        'pkg/src/own.ts': [
          PATH,
          'const { join } = path;',
          "export const J = join(__dirname, 'x.json');",
        ],
      });
      assert.deepEqual(unstated, [`pkg/src/own.ts:3: ${WHY.call}`]);
    });

    it('clean: a same-named binding in another scope is another symbol', () => {
      const { reads, unstated } = scan({
        'pkg/package.json': ['{}'],
        'pkg/src/scopes.ts': [
          FS,
          PATH,
          "const base = path.join(__dirname, '..');",
          "export const V = readFileSync(path.join(base, 'package.json'));",
          'export function other(name: string): Buffer {',
          "  const base = '/elsewhere';",
          '  return readFileSync(path.join(base, name));',
          '}',
          // A local __dirname is not the module's.
          'export function shadow(__dirname: string, name: string): Buffer {',
          '  return readFileSync(path.join(__dirname, name));',
          '}',
        ],
      });
      assert.deepEqual(unstated, []);
      assert.deepEqual(reads.targets, [
        { target: 'pkg/package.json', by: 'pkg/src/scopes.ts' },
      ]);
    });
  });

  describe('a location bound where the scan cannot follow it is refused', () => {
    const refusedBinding = (
      name: string,
      lines: readonly string[],
      why: string,
      line: number,
    ) =>
      it(name, () => {
        const { unstated } = scan({
          'pkg/package.json': ['{}'],
          'pkg/src/lost.ts': [FS, PATH, ...lines],
        });
        assert.deepEqual(unstated, [`pkg/src/lost.ts:${line}: ${why}`]);
      });
    refusedBinding(
      'a let',
      [
        "let moving = path.join(__dirname, '..');",
        "moving = '/x';",
        'export const M = moving;',
      ],
      WHY.binding,
      3,
    );
    refusedBinding(
      'a concatenation',
      [
        "const dir = path.join(__dirname, '..');",
        "export const B = readFileSync(dir + '/package.json');",
      ],
      WHY.unfollowed,
      4,
    );
    refusedBinding(
      'an object',
      ["const dir = path.join(__dirname, '..');", 'export const C = { dir };'],
      WHY.unfollowed,
      4,
    );
    refusedBinding(
      'a computed part on a file',
      [
        "const manifest = path.join(__dirname, '..', 'package.json');",
        "export const A = (name: string) => readFileSync(path.join(manifest, '..', name));",
      ],
      WHY.computedUnbounded('pkg/package.json'),
      4,
    );
  });
});
