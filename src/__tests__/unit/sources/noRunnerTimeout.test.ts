/**
 * The no-timeout scan (D27; spec §2 "No runner timeout", §3 "No force
 * exit"). A test ends on its result: nothing the runner chooses cuts a test,
 * a hook or a file's process. Refused:
 *
 * - `--test-timeout` in an npm script (node:test's per-test bound);
 * - `{ timeout }` on a `test`, `it`, `describe` / `suite` or hook (`before`,
 *   `after`, `beforeEach`, `afterEach`) in a node:test file, read from the
 *   file's syntax tree with the TypeScript compiler API;
 * - `--test-force-exit` in an npm script (node:test's force exit);
 * - `--forceExit` in an npm script (Jest's), except the four pairs the live
 *   scripts carry until they move to node:test (`ALLOWED_FORCE_EXIT`; step
 *   11 of the node:test plan empties it).
 *
 * The node:test files are those of the list (`tools/node-test-files.json`),
 * this one among them; the npm scripts are every package manifest's: the
 * root's and that of each package directory at the root, found on disk.
 * Each fixture under `__fixtures__/runnerTimeouts/refused` is refused by its
 * own check alone; the two under `clean` by none. No regular expression: a
 * script's words are read by `scriptWords`, a source by the compiler.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as ts from 'typescript';
import { repositoryRoot } from '../../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);
const THIS_FILE = 'src/__tests__/unit/sources/noRunnerTimeout.test.ts';
const FIXTURES = path.join(
  REPO,
  'src',
  '__tests__',
  'unit',
  'sources',
  '__fixtures__',
  'runnerTimeouts',
);

type ScriptCheck = '--test-timeout' | '--test-force-exit' | '--forceExit';
type Check = ScriptCheck | '{ timeout }';

/** Every check, the flags of the scripts and the option of the sources. */
const SCRIPT_CHECKS: readonly ScriptCheck[] = [
  '--test-timeout',
  '--test-force-exit',
  '--forceExit',
];
const CHECKS: readonly Check[] = [
  '--test-timeout',
  '--test-force-exit',
  '--forceExit',
  '{ timeout }',
];

/**
 * The scripts that may pass `--forceExit` until the live scripts move to
 * node:test (step 11 empties this): Appendix D's four. The list may only
 * shrink: an entry whose script no longer passes the flag fails, and so does
 * an entry outside Appendix D's four.
 */
const ALLOWED_FORCE_EXIT: readonly string[] = [
  'test:integration',
  'test:coverage-family',
  'test:high',
  'test:live-connection',
];

interface Finding {
  readonly check: Check;
  /** The file, relative to the repository, written with `/`. */
  readonly file: string;
  /** The script's name, or the source line. */
  readonly at: string;
  /** The refused word or property, as written. */
  readonly text: string;
}

function rel(file: string): string {
  return path.relative(REPO, file).split(path.sep).join('/');
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------------------------------------------------------------- scripts

const BLANKS = ' \t\r\n';
const OPERATORS = ';&|()<>';

/**
 * A script's words, as `sh` (the shell npm runs a script with on Linux and
 * macOS) splits them, in plain code:
 * - a blank (space, tab, CR, LF) ends a word, and so does each of
 *   `; & | ( ) < >`, so `build&&node --test …` reads `build`, `node`,
 *   `--test`;
 * - `'…'` keeps its text as it is; `"…"` keeps its text, a `\` in it taking
 *   the next character as it is; both quotes are removed from the word;
 * - outside quotes, `\` takes the next character as it is;
 * - an unterminated quote keeps the rest of the script in the word;
 *   expansions (`$…`, backticks) stay text.
 * On Windows npm runs a script with `cmd.exe`, where `'` does not quote: a
 * flag in single quotes reaches the program with its quotes there. Read
 * unquoted here, it is refused all the same: this reading refuses more,
 * never less.
 */
function scriptWords(command: string): string[] {
  const words: string[] = [];
  let word = '';
  let inWord = false;
  let quote = '';
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      word += character;
      escaped = false;
    } else if (quote === "'") {
      if (character === "'") quote = '';
      else word += character;
    } else if (character === '\\') {
      escaped = true;
      inWord = true;
    } else if (quote === '"') {
      if (character === '"') quote = '';
      else word += character;
    } else if (character === "'" || character === '"') {
      quote = character;
      inWord = true;
    } else if (BLANKS.includes(character) || OPERATORS.includes(character)) {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    } else {
      word += character;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return words;
}

/** The flag `word` is: the flag itself, or the flag with `=value`. */
function isFlag(word: string, flag: ScriptCheck): boolean {
  return word === flag || word.startsWith(`${flag}=`);
}

/** A manifest's scripts, name and command; data from outside the type system. */
function manifestScripts(file: string): Array<readonly [string, string]> {
  const manifest = readJson(file);
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`${file}: not an object`);
  }
  if (!('scripts' in manifest)) return [];
  const scripts: unknown = manifest.scripts;
  if (typeof scripts !== 'object' || scripts === null) {
    throw new Error(`${file}: scripts is not an object`);
  }
  return Object.keys(scripts).map((name) => {
    const command: unknown = Reflect.get(scripts, name);
    if (typeof command !== 'string') {
      throw new Error(`${file}: script ${name} is not a string`);
    }
    return [name, command];
  });
}

/** Every refused flag in a manifest's scripts, the allowed pairs included. */
function scriptFindings(file: string): Finding[] {
  const found: Finding[] = [];
  for (const [name, command] of manifestScripts(file)) {
    for (const word of scriptWords(command)) {
      for (const check of SCRIPT_CHECKS) {
        if (isFlag(word, check)) {
          found.push({ check, file: rel(file), at: name, text: word });
        }
      }
    }
  }
  return found;
}

/** The findings of the root manifest outside the allowed pairs. */
function outsideAllowed(found: readonly Finding[]): Finding[] {
  return found.filter(
    (one) =>
      !(one.check === '--forceExit' && ALLOWED_FORCE_EXIT.includes(one.at)),
  );
}

/** The root manifest and that of each package directory at the root. */
function manifests(): string[] {
  const packages = fs
    .readdirSync(REPO, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        fs.existsSync(path.join(REPO, entry.name, 'package.json')),
    )
    .map((entry) => path.join(REPO, entry.name, 'package.json'))
    .sort();
  return [path.join(REPO, 'package.json'), ...packages];
}

// ---------------------------------------------------------------- sources

/** The node:test functions that take options: tests, suites and hooks. */
const TEST_FUNCTIONS = new Set([
  'test',
  'it',
  'describe',
  'suite',
  'before',
  'after',
  'beforeEach',
  'afterEach',
]);
const MODIFIERS = new Set(['skip', 'todo', 'only']);

/**
 * The local names a file binds to node:test's test functions: a named import
 * by the name it imports (`test as check` is `test`), the default import as
 * `test` (node:test's default export).
 */
function nodeTestBindings(source: ts.SourceFile): Set<string> {
  const bound = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'node:test'
    ) {
      continue;
    }
    const clause = statement.importClause;
    if (clause === undefined) continue;
    if (clause.name !== undefined) bound.add(clause.name.text);
    const named = clause.namedBindings;
    if (named === undefined || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (TEST_FUNCTIONS.has(imported)) bound.add(element.name.text);
    }
  }
  return bound;
}

/**
 * A call of a test, a suite or a hook: a name bound to one of node:test's,
 * a member of that name on anything (a namespace import, a test context's
 * `t.test` / `t.beforeEach`), or a modifier of either (`test.skip`).
 */
function isTestCallee(
  callee: ts.Expression,
  bound: ReadonlySet<string>,
): boolean {
  if (ts.isParenthesizedExpression(callee)) {
    return isTestCallee(callee.expression, bound);
  }
  if (ts.isIdentifier(callee)) return bound.has(callee.text);
  if (ts.isPropertyAccessExpression(callee)) {
    const name = callee.name.text;
    if (TEST_FUNCTIONS.has(name)) return true;
    return MODIFIERS.has(name) && isTestCallee(callee.expression, bound);
  }
  return false;
}

/** A property name that is `timeout`: plain, quoted or computed from a literal. */
function namesTimeout(name: ts.PropertyName): boolean {
  const named = ts.isComputedPropertyName(name) ? name.expression : name;
  return (
    (ts.isIdentifier(named) ||
      ts.isStringLiteral(named) ||
      ts.isNoSubstitutionTemplateLiteral(named)) &&
    named.text === 'timeout'
  );
}

/**
 * The `timeout` properties of an argument written as an object literal
 * (through parentheses, `satisfies` and `as`), a spread object literal's
 * included. An options object held in a variable is not read: the scan reads
 * syntax, not types.
 */
function timeoutProperties(argument: ts.Expression): ts.Node[] {
  let value = argument;
  while (
    ts.isParenthesizedExpression(value) ||
    ts.isSatisfiesExpression(value) ||
    ts.isAsExpression(value)
  ) {
    value = value.expression;
  }
  if (!ts.isObjectLiteralExpression(value)) return [];
  return value.properties.flatMap((property): ts.Node[] => {
    if (ts.isSpreadAssignment(property)) {
      return timeoutProperties(property.expression);
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return property.name.text === 'timeout' ? [property] : [];
    }
    return namesTimeout(property.name) ? [property] : [];
  });
}

/** Every `{ timeout }` on a test, a suite or a hook in a source file. */
function sourceFindings(file: string): Finding[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bound = nodeTestBindings(source);
  const found: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCallee(node.expression, bound)) {
      for (const argument of node.arguments) {
        for (const property of timeoutProperties(argument)) {
          const line =
            source.getLineAndCharacterOfPosition(property.getStart(source))
              .line + 1;
          found.push({
            check: '{ timeout }',
            file: rel(file),
            at: String(line),
            text: property.getText(source),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The node:test list's source paths; data from outside the type system. */
function listedFiles(): string[] {
  const listed = readJson(path.join(REPO, 'tools', 'node-test-files.json'));
  if (
    !Array.isArray(listed) ||
    !listed.every((item): item is string => typeof item === 'string')
  ) {
    throw new Error('tools/node-test-files.json: not a list of strings');
  }
  return listed;
}

// ---------------------------------------------------------------- the tests

describe('the repository', () => {
  const listed = listedFiles();
  const manifestFiles = manifests();
  const rootManifest = path.join(REPO, 'package.json');

  it('scans every listed node:test file, this one among them, and every package manifest', () => {
    assert.ok(listed.includes(THIS_FILE));
    for (const source of listed) {
      assert.ok(fs.existsSync(path.join(REPO, ...source.split('/'))), source);
    }
    const scanned = manifestFiles.map(rel);
    for (const manifest of [
      'package.json',
      'server-runtime/package.json',
      'server/package.json',
      'compact-sse-ro/package.json',
    ]) {
      assert.ok(scanned.includes(manifest), manifest);
    }
  });

  it('no node:test file passes { timeout } to a test, a suite or a hook', () => {
    const found = listed.flatMap((source) =>
      sourceFindings(path.join(REPO, ...source.split('/'))),
    );
    assert.deepEqual(found, []);
  });

  it('no npm script passes --test-timeout, --test-force-exit or --forceExit but the allowed pairs', () => {
    const found = manifestFiles.flatMap((file) =>
      file === rootManifest
        ? outsideAllowed(scriptFindings(file))
        : scriptFindings(file),
    );
    assert.deepEqual(found, []);
  });

  it("each allowed pair is still in package.json's scripts, and is one of Appendix D's four", () => {
    const found = scriptFindings(rootManifest);
    for (const script of ALLOWED_FORCE_EXIT) {
      assert.ok(
        found.some((one) => one.check === '--forceExit' && one.at === script),
        `${script} no longer passes --forceExit: remove it from the list`,
      );
      assert.ok(
        [
          'test:integration',
          'test:coverage-family',
          'test:high',
          'test:live-connection',
        ].includes(script),
        `${script} is not one of Appendix D's four`,
      );
    }
  });
});

describe('the scan refuses each fixture by its own check alone', () => {
  const fixture = (kind: 'refused' | 'clean', name: string) =>
    path.join(FIXTURES, kind, name);
  const scanFixture = (file: string): Finding[] =>
    file.endsWith('.json')
      ? outsideAllowed(scriptFindings(file))
      : sourceFindings(file);
  /** Each refused fixture, its check, and how many findings it holds. */
  const REFUSED: ReadonlyArray<readonly [string, Check, number]> = [
    ['testTimeout.json', '--test-timeout', 4],
    ['testForceExit.json', '--test-force-exit', 3],
    ['forceExit.json', '--forceExit', 1],
    ['timeoutOnTest.ts', '{ timeout }', 8],
    ['timeoutOnIt.ts', '{ timeout }', 3],
    ['timeoutOnDescribe.ts', '{ timeout }', 3],
    ['timeoutOnHook.ts', '{ timeout }', 5],
  ];

  it('has one fixture per refusal, every check among them', () => {
    const onDisk = fs.readdirSync(path.join(FIXTURES, 'refused')).sort();
    assert.deepEqual(onDisk, REFUSED.map(([name]) => name).sort());
    assert.deepEqual(
      new Set(REFUSED.map(([, check]) => check)),
      new Set(CHECKS),
    );
    assert.deepEqual(fs.readdirSync(path.join(FIXTURES, 'clean')).sort(), [
      'clean.json',
      'clean.ts',
    ]);
  });

  for (const [name, check, count] of REFUSED) {
    it(`refuses ${name} under ${check} alone`, () => {
      const found = scanFixture(fixture('refused', name));
      assert.equal(found.length, count, JSON.stringify(found));
      assert.deepEqual(
        new Set(found.map((one) => one.check)),
        new Set([check]),
      );
    });
  }

  it('refuses --forceExit on a script outside the allowed list, not on an allowed one', () => {
    const found = scanFixture(fixture('refused', 'forceExit.json'));
    assert.deepEqual(
      found.map((one) => one.at),
      ['shared:setup'],
    );
  });

  it('accepts clean.json and clean.ts', () => {
    assert.deepEqual(scanFixture(fixture('clean', 'clean.json')), []);
    assert.deepEqual(scanFixture(fixture('clean', 'clean.ts')), []);
  });
});
