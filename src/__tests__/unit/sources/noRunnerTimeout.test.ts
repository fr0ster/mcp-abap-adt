/**
 * The no-timeout scan (D27; spec §2 "No runner timeout", §3 "No force
 * exit"). A test ends on its result: nothing the runner chooses cuts a test,
 * a hook or a file's process. Refused:
 *
 * - `--test-timeout` in an npm script (node:test's per-test bound);
 * - `{ timeout }` on a `test`, `it`, `describe` / `suite` or hook (`before`,
 *   `after`, `beforeEach`, `afterEach`) in a node:test file, read with the
 *   TypeScript type checker over a program of those files: a call counts
 *   when its signature resolves to node:test's declaration, and an argument
 *   when its type may carry a `timeout` property, an object held in a
 *   variable included;
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
 * script's words are read by `scriptWords`, a source by the type checker.
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

/**
 * The names node:test declares its tests, suites and hooks under, and their
 * modifiers: `test` (also exported as `it`, the default export and the test
 * context's `t.test`), `suite` (also `describe`), the four hooks (also the
 * test context's `t.before` …), and `skip` / `todo` / `only` (`test.skip`,
 * `describe.only`, the top-level shorthands). A test context's `t.skip()` and
 * `t.todo()` share the names and take no options. Other node:test calls
 * (`run`, `t.waitFor`, `t.plan`, `mock`) are not tests and are not read.
 */
const TEST_DECLARATIONS = new Set([
  'test',
  'suite',
  'before',
  'after',
  'beforeEach',
  'afterEach',
  'skip',
  'todo',
  'only',
]);

/** `declare module "node:test"`: where `@types/node` declares node:test. */
function isNodeTestModule(node: ts.Node): boolean {
  return (
    ts.isModuleDeclaration(node) &&
    ts.isStringLiteral(node.name) &&
    node.name.text === 'node:test'
  );
}

/**
 * A call of a node:test test, suite or hook: the signature the type checker
 * resolves the call to is declared in node:test's module under one of
 * `TEST_DECLARATIONS`. However the function is reached — a named or default
 * import, an alias, a variable holding it, a test context — the declaration
 * is the same; a method of that name on any other object is not node:test's.
 */
function isNodeTestCall(
  checker: ts.TypeChecker,
  call: ts.CallExpression,
): boolean {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === undefined || ts.isJSDocSignature(declaration)) {
    return false;
  }
  const name = declaration.name;
  return (
    name !== undefined &&
    ts.isIdentifier(name) &&
    TEST_DECLARATIONS.has(name.text) &&
    ts.findAncestor(declaration, isNodeTestModule) !== undefined
  );
}

/**
 * Whether a value of `type` may carry a `timeout` property, read from the
 * type, not the syntax, so an options object held in a variable is seen.
 * When the type cannot rule it out, the answer is yes (the scan refuses
 * more, never less): `any` and `unknown`; a union or an intersection when
 * any member may (a union's property is not one of the union's own unless
 * every member has it); a type parameter by its constraint, and one without
 * a constraint. Otherwise the apparent type (a primitive's wrapper) has the
 * property, or an index signature the key `timeout` fits, or neither: a
 * declared `TestOptions`, whose `timeout` is optional, may; so may
 * `{ [key: string]: number }`.
 */
function mayHoldTimeout(checker: ts.TypeChecker, type: ts.Type): boolean {
  if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
    return true;
  }
  if (type.isUnionOrIntersection()) {
    return type.types.some((member) => mayHoldTimeout(checker, member));
  }
  if (type.isTypeParameter()) {
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint === undefined || mayHoldTimeout(checker, constraint);
  }
  const apparent = checker.getApparentType(type);
  if (apparent.getProperty('timeout') !== undefined) return true;
  // An index signature the key `timeout` fits (`[key: string]`, a
  // template such as `[key: \`time${string}\`]`) types a `timeout`
  // without naming one; a number or symbol key does not fit it.
  const key = checker.getStringLiteralType('timeout');
  return checker
    .getIndexInfosOfType(apparent)
    .some((index) => checker.isTypeAssignableTo(key, index.keyType));
}

/**
 * Whether an argument may carry a `timeout`: its type, or for a spread
 * (`test(...args)`) the type of the elements it spreads; a spread of a type
 * with no element type may.
 */
function argumentMayHoldTimeout(
  checker: ts.TypeChecker,
  argument: ts.Expression,
): boolean {
  if (!ts.isSpreadElement(argument)) {
    return mayHoldTimeout(checker, checker.getTypeAtLocation(argument));
  }
  const spread = checker.getApparentType(
    checker.getTypeAtLocation(argument.expression),
  );
  const elements = checker.getIndexInfoOfType(spread, ts.IndexKind.Number);
  return elements === undefined || mayHoldTimeout(checker, elements.type);
}

/**
 * A type-checked program over `files`, with the node:test build's options
 * (`tsconfig.node-test.json`: its `types`, the name table's `paths`), so a
 * call resolves as it does in the build.
 */
function scanProgram(files: readonly string[]): ts.Program {
  const configFile = path.join(REPO, 'tsconfig.node-test.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFile,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );
  if (parsed === undefined) throw new Error(`${configFile}: not read`);
  assert.deepEqual(parsed.errors, []);
  return ts.createProgram({
    rootNames: files,
    options: { ...parsed.options, noEmit: true },
  });
}

/**
 * Every argument that may carry a `timeout` on a node:test test, suite or
 * hook in a file of `program`. The file must type-check: a call the checker
 * cannot resolve would be read as no test.
 */
function sourceFindings(program: ts.Program, file: string): Finding[] {
  const source = program.getSourceFile(file);
  if (source === undefined) throw new Error(`${file}: not in the program`);
  const problems = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ].map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
  assert.deepEqual(problems, [], `${rel(file)} does not type-check`);
  const checker = program.getTypeChecker();
  const found: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isNodeTestCall(checker, node)) {
      for (const argument of node.arguments) {
        if (!argumentMayHoldTimeout(checker, argument)) continue;
        const line =
          source.getLineAndCharacterOfPosition(argument.getStart(source)).line +
          1;
        found.push({
          check: '{ timeout }',
          file: rel(file),
          at: String(line),
          text: argument.getText(source),
        });
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
    const files = listed.map((source) => path.join(REPO, ...source.split('/')));
    const program = scanProgram(files);
    const found = files.flatMap((file) => sourceFindings(program, file));
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
  type Kind = 'refused' | 'clean';
  const KINDS: readonly Kind[] = ['refused', 'clean'];
  const fixture = (kind: Kind, name: string) => path.join(FIXTURES, kind, name);
  /** One program over every source fixture, built at the first scan. */
  let program: ts.Program | undefined;
  const sourceFixtures = (): ts.Program => {
    program ??= scanProgram(
      KINDS.flatMap((kind) =>
        fs
          .readdirSync(path.join(FIXTURES, kind))
          .filter((name) => name.endsWith('.ts'))
          .map((name) => fixture(kind, name)),
      ),
    );
    return program;
  };
  const scanFixture = (file: string): Finding[] =>
    file.endsWith('.json')
      ? outsideAllowed(scriptFindings(file))
      : sourceFindings(sourceFixtures(), file);
  /** Each refused fixture, its check, and how many findings it holds. */
  const REFUSED: ReadonlyArray<readonly [string, Check, number]> = [
    ['testTimeout.json', '--test-timeout', 4],
    ['testForceExit.json', '--test-force-exit', 3],
    ['forceExit.json', '--forceExit', 1],
    ['timeoutOnTest.ts', '{ timeout }', 13],
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
