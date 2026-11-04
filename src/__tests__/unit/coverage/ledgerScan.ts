/**
 * The coverage guard's reading of test files and its checks (spec §8,
 * acceptance 2). Files are read with the TypeScript compiler API
 * (`ts.createSourceFile` and a walk of its nodes), never matched as text;
 * every key is computed with `keyOf` from a call's `tool` and `args`
 * literals.
 *
 * - `scanUnitFile`: every `pinCases([...])` row of a file, its key, its
 *   variant, whether it counts for its key (a `refusal` row does not), and
 *   each problem of its shape or its place.
 * - `scanLiveFile`: every `liveCall('<tool>', { … })`, its key, the systems
 *   its `liveSuite` names, and each problem of its place.
 * - `checkLedger`: the ledger against the required keys and the scans.
 *
 * A reference with a problem is reported by its problem and still matched
 * as present for its key (so one defect is one finding); it is never
 * reported as an orphan besides.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import type { ServedTool, SystemKind } from '../../helpers/servedTools';
import {
  type CoverageKey,
  DIMENSIONS,
  deleteCheckOf,
  isDimension,
  isTypelessPart,
  keyOf,
  OPERATIONAL_ARGUMENTS,
  readerOf,
  requiredKeys,
  SENDS_NOTHING,
} from './coverageKeys';

/** What can be wrong with one reference. */
export type Problem =
  // place
  | 'not-executable'
  | 'skipped'
  | 'only'
  | 'failing'
  | 'concurrent'
  // pin rows
  | 'rows-not-array'
  | 'row-not-literal'
  | 'tool-not-literal'
  | 'variant-not-literal'
  | 'args-not-literal'
  | 'dimension-not-literal'
  | 'bind-key-field'
  | 'typeless-part-typed'
  | 'expected-empty'
  | 'expected-not-literal'
  | 'request-not-literal'
  | 'request-keys'
  | 'url-not-literal'
  | 'none-not-allowed'
  | 'nothing-sent-without-refusal'
  // live calls
  | 'live-not-awaited'
  | 'live-not-statement'
  | 'live-in-hook'
  | 'live-nested-function'
  | 'live-outside-suite'
  | 'suite-systems-not-literal'
  | 'delete-no-check'
  | 'delete-wrong-check'
  | 'delete-check-other-object'
  | 'delete-check-wrong-tool';

/** One `pinCases` row. */
export interface PinRef {
  readonly file: string;
  readonly line: number;
  /** `keyOf(tool, args)`; absent when the tool is not a literal. */
  readonly key: CoverageKey | undefined;
  readonly variant: SystemKind | undefined;
  /** Whether it stands for its key: a `refusal` row does not. */
  readonly counts: boolean;
  readonly problems: readonly Problem[];
}

/** One `liveCall`. */
export interface LiveRef {
  readonly file: string;
  readonly line: number;
  readonly key: CoverageKey | undefined;
  /** The systems its enclosing `liveSuite` names. */
  readonly systems: readonly SystemKind[];
  readonly problems: readonly Problem[];
}

// ---------------------------------------------------------------------------
// Reading literals

/** A property's name as written, when it is a plain name or a string. */
function nameOf(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name)
    ? name.text
    : undefined;
}

/** The property assignments of an object literal, by name; `undefined` with a spread or a computed name. */
function propertiesOf(
  literal: ts.ObjectLiteralExpression,
): Map<string, ts.ObjectLiteralElementLike> | undefined {
  const out = new Map<string, ts.ObjectLiteralElementLike>();
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property)) return undefined;
    const name =
      property.name === undefined ? undefined : nameOf(property.name);
    if (name === undefined) return undefined;
    out.set(name, property);
  }
  return out;
}

/** A property's value expression; `undefined` for a method or an accessor. */
function initializerOf(
  property: ts.ObjectLiteralElementLike | undefined,
): ts.Expression | undefined {
  if (property === undefined) return undefined;
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

/** A string literal's text; `undefined` for anything else. */
function literalText(
  expression: ts.Expression | undefined,
): string | undefined {
  return expression !== undefined && ts.isStringLiteralLike(expression)
    ? expression.text
    : undefined;
}

const isSystemKind = (value: string | undefined): value is SystemKind =>
  value === 'onprem' || value === 'cloud';

// ---------------------------------------------------------------------------
// Jest scope

type JestBase = 'describe' | 'test' | 'hook' | 'suite';
type Modifier = 'skip' | 'only' | 'todo' | 'failing' | 'concurrent' | undefined;

const BASES: Readonly<Record<string, readonly [JestBase, Modifier]>> = {
  describe: ['describe', undefined],
  xdescribe: ['describe', 'skip'],
  fdescribe: ['describe', 'only'],
  it: ['test', undefined],
  test: ['test', undefined],
  xit: ['test', 'skip'],
  xtest: ['test', 'skip'],
  fit: ['test', 'only'],
  beforeAll: ['hook', undefined],
  beforeEach: ['hook', undefined],
  afterAll: ['hook', undefined],
  afterEach: ['hook', undefined],
  liveSuite: ['suite', undefined],
};

const MODIFIERS: Readonly<Record<string, Modifier>> = {
  skip: 'skip',
  only: 'only',
  todo: 'todo',
  // Neither is a plain test: a failing test passes when its body fails, and
  // a concurrent one shares its hooks with others running at once.
  concurrent: 'concurrent',
  failing: 'failing',
};

/** What Jest call `call` is: its base and modifier; `undefined` for any other call. */
function jestCall(
  call: ts.CallExpression,
): { base: JestBase; modifier: Modifier } | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    const known = BASES[callee.text];
    return known === undefined
      ? undefined
      : { base: known[0], modifier: known[1] };
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression)
  ) {
    const known = BASES[callee.expression.text];
    const modifierName = callee.name.text;
    if (known === undefined || !(modifierName in MODIFIERS)) return undefined;
    return { base: known[0], modifier: MODIFIERS[modifierName] ?? known[1] };
  }
  return undefined;
}

/** Whether `node` is a callback argument of `call`. */
const isArgumentOf = (node: ts.Node, call: ts.CallExpression): boolean =>
  call.arguments.some((argument) => argument === node);

/** The function whose body `statement` is a direct statement of, if any. */
function bodyOwner(statement: ts.Node): ts.FunctionLikeDeclaration | undefined {
  const block = statement.parent;
  if (block === undefined || !ts.isBlock(block)) return undefined;
  const owner = block.parent;
  return owner !== undefined &&
    (ts.isArrowFunction(owner) || ts.isFunctionExpression(owner))
    ? owner
    : undefined;
}

/**
 * Whether `call` runs when Jest collects the file: a statement of the
 * module's top level, or of a `describe` (or `liveSuite`) callback that is
 * itself collected.
 */
function collected(call: ts.CallExpression): boolean {
  const statement = call.parent;
  let owner: ts.Node | undefined;
  if (statement !== undefined && ts.isArrowFunction(statement)) {
    owner = statement;
  } else if (statement !== undefined && ts.isExpressionStatement(statement)) {
    if (ts.isSourceFile(statement.parent)) return true;
    owner = bodyOwner(statement);
  }
  if (owner === undefined) return false;
  const outer = owner.parent;
  if (outer === undefined || !ts.isCallExpression(outer)) return false;
  if (!isArgumentOf(owner, outer)) return false;
  const kind = jestCall(outer);
  if (
    kind === undefined ||
    (kind.base !== 'describe' && kind.base !== 'suite')
  ) {
    return false;
  }
  return collected(outer);
}

/** Whether any Jest call around `node` carries `modifiers`. */
function modifiedAround(
  node: ts.Node,
  modifiers: readonly Modifier[],
): boolean {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (ts.isCallExpression(at)) {
      const kind = jestCall(at);
      if (kind !== undefined && modifiers.includes(kind.modifier)) return true;
    }
  }
  return false;
}

/** Whether any Jest call around `node` is skipped (`skip`, `x…`, `todo`). */
const skippedAround = (node: ts.Node): boolean =>
  modifiedAround(node, ['skip', 'todo']);

/** Whether the file holds any `.only` (or `fit`, `fdescribe`). */
function hasOnly(file: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && jestCall(node)?.modifier === 'only') {
      found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Every call of `name` in `file`. */
function callsOf(file: ts.SourceFile, name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const lineOf = (file: ts.SourceFile, node: ts.Node): number =>
  file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

/** The place problems every registration shares. */
function placeProblems(call: ts.CallExpression, only: boolean): Problem[] {
  const problems: Problem[] = [];
  if (skippedAround(call)) problems.push('skipped');
  if (modifiedAround(call, ['failing'])) problems.push('failing');
  if (modifiedAround(call, ['concurrent'])) problems.push('concurrent');
  if (only) problems.push('only');
  return problems;
}

/** The key of a `tool` literal and an `args` object literal, and what is not literal in them. */
function keyOfLiterals(
  tool: string | undefined,
  args: ts.Expression | undefined,
): {
  key: CoverageKey | undefined;
  given: ReadonlyMap<string, string>;
  problems: Problem[];
} {
  const problems: Problem[] = [];
  const given = new Map<string, string>();
  if (tool === undefined) problems.push('tool-not-literal');
  if (args === undefined || !ts.isObjectLiteralExpression(args)) {
    problems.push('args-not-literal');
  } else {
    const properties = propertiesOf(args);
    if (properties === undefined) {
      problems.push('args-not-literal');
    } else {
      for (const dimension of DIMENSIONS) {
        const property = properties.get(dimension);
        if (property === undefined) continue;
        const text = literalText(initializerOf(property));
        if (text === undefined) problems.push('dimension-not-literal');
        else given.set(dimension, text);
      }
    }
  }
  return {
    key:
      tool === undefined ? undefined : keyOf(tool, Object.fromEntries(given)),
    given,
    problems,
  };
}

function parse(filePath: string, text: string): ts.SourceFile {
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

// ---------------------------------------------------------------------------
// pinCases

const REQUEST_KEYS = ['method', 'url', 'headers', 'body'] as const;

/** The problems of a row's `expected` and `refusal`, and whether it counts for its key. */
function expectedProblems(
  key: CoverageKey | undefined,
  expected: ts.Expression | undefined,
  refusal: ts.Expression | undefined,
): { problems: Problem[]; counts: boolean } {
  const problems: Problem[] = [];
  const refusalText = literalText(refusal);
  let counts = refusal === undefined;
  if (expected !== undefined && ts.isArrayLiteralExpression(expected)) {
    if (expected.elements.length === 0) problems.push('expected-empty');
    for (const request of expected.elements) {
      if (!ts.isObjectLiteralExpression(request)) {
        problems.push('request-not-literal');
        continue;
      }
      const properties = propertiesOf(request);
      if (properties === undefined) {
        problems.push('request-not-literal');
        continue;
      }
      const names = [...properties.keys()];
      if (
        names.length !== REQUEST_KEYS.length ||
        !REQUEST_KEYS.every((name) => properties.has(name))
      ) {
        problems.push('request-keys');
      }
      if (literalText(initializerOf(properties.get('url'))) === undefined) {
        problems.push('url-not-literal');
      }
    }
    return { problems, counts };
  }
  const text = literalText(expected);
  if (text === 'none') {
    if (key === undefined || !SENDS_NOTHING.has(key)) {
      problems.push('none-not-allowed');
    }
  } else if (text === 'nothing-sent') {
    counts = false;
    if (refusalText !== 'thrown') problems.push('nothing-sent-without-refusal');
  } else {
    problems.push('expected-not-literal');
  }
  return { problems, counts };
}

/** One `pinCases` row. */
function pinRow(
  file: ts.SourceFile,
  filePath: string,
  row: ts.Expression,
  place: readonly Problem[],
): PinRef {
  const line = lineOf(file, row);
  if (!ts.isObjectLiteralExpression(row)) {
    return {
      file: filePath,
      line,
      key: undefined,
      variant: undefined,
      counts: false,
      problems: [...place, 'row-not-literal'],
    };
  }
  const properties = propertiesOf(row);
  if (properties === undefined) {
    return {
      file: filePath,
      line,
      key: undefined,
      variant: undefined,
      counts: false,
      problems: [...place, 'row-not-literal'],
    };
  }
  const tool = literalText(initializerOf(properties.get('tool')));
  const { key, given, problems } = keyOfLiterals(
    tool,
    initializerOf(properties.get('args')),
  );
  const variantText = literalText(initializerOf(properties.get('variant')));
  if (!isSystemKind(variantText)) problems.push('variant-not-literal');
  const part = given.get('part');
  if (
    tool === 'HandlerGet' &&
    given.has('object_type') &&
    part !== undefined &&
    isTypelessPart(part)
  ) {
    problems.push('typeless-part-typed');
  }
  const bind = initializerOf(properties.get('bind'));
  if (bind !== undefined && ts.isObjectLiteralExpression(bind)) {
    for (const property of bind.properties) {
      const name =
        property.name === undefined ? undefined : nameOf(property.name);
      if (name !== undefined && isDimension(name)) {
        problems.push('bind-key-field');
      }
    }
  }
  const expected = expectedProblems(
    key,
    initializerOf(properties.get('expected')),
    initializerOf(properties.get('refusal')),
  );
  return {
    file: filePath,
    line,
    key,
    variant: isSystemKind(variantText) ? variantText : undefined,
    counts: expected.counts,
    problems: [...place, ...problems, ...expected.problems],
  };
}

/** Every `pinCases` row of a file's text. */
export function scanUnitText(filePath: string, text: string): PinRef[] {
  const file = parse(filePath, text);
  const only = hasOnly(file);
  const refs: PinRef[] = [];
  for (const call of callsOf(file, 'pinCases')) {
    const place = placeProblems(call, only);
    if (!collected(call)) place.push('not-executable');
    const [rows] = call.arguments;
    if (rows === undefined || !ts.isArrayLiteralExpression(rows)) {
      refs.push({
        file: filePath,
        line: lineOf(file, call),
        key: undefined,
        variant: undefined,
        counts: false,
        problems: [...place, 'rows-not-array'],
      });
      continue;
    }
    for (const row of rows.elements) {
      refs.push(pinRow(file, filePath, row, place));
    }
  }
  return refs;
}

/** Every `pinCases` row of the file at `path`. */
export function scanUnitFile(filePath: string): readonly PinRef[] {
  return scanUnitText(filePath, fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// liveCall

/** The awaited call statement `name(...)` of `statement`, if it is one. */
function awaitedCallOf(statement: ts.Statement): ts.CallExpression | undefined {
  if (!ts.isExpressionStatement(statement)) return undefined;
  const awaited = statement.expression;
  if (!ts.isAwaitExpression(awaited)) return undefined;
  const call = awaited.expression;
  return ts.isCallExpression(call) ? call : undefined;
}

/**
 * The problem of a delete's read-back: `expectAbsent` / `expectCleared`
 * (as the delete's contract chooses) awaited after `deleted` in the same
 * body, reading the same object (and part) as the delete's `args`.
 */
function deleteProblem(
  key: CoverageKey,
  statement: ts.Statement,
  deleteArgs: ts.Expression | undefined,
  file: ts.SourceFile,
): Problem | undefined {
  const wanted = deleteCheckOf(key);
  if (wanted === undefined) return undefined;
  const block = statement.parent;
  if (!ts.isBlock(block)) return 'delete-no-check';
  const after = block.statements.slice(block.statements.indexOf(statement) + 1);
  const checks = after
    .map(awaitedCallOf)
    .filter(
      (call): call is ts.CallExpression =>
        call !== undefined &&
        ts.isIdentifier(call.expression) &&
        (call.expression.text === 'expectAbsent' ||
          call.expression.text === 'expectCleared'),
    );
  if (checks.length === 0) return 'delete-no-check';
  const right = checks.filter(
    (call) =>
      ts.isIdentifier(call.expression) && call.expression.text === wanted,
  );
  if (right.length === 0) return 'delete-wrong-check';
  // The read names the deleted object: every argument of the delete that
  // names it (its type, part and names — all but the operational ones) is
  // in the read with the same expression; and the read is the tool that
  // reads that object.
  const deleted =
    deleteArgs !== undefined && ts.isObjectLiteralExpression(deleteArgs)
      ? propertiesOf(deleteArgs)
      : undefined;
  const identity =
    deleted === undefined
      ? []
      : [...deleted.keys()].filter((name) => !OPERATIONAL_ARGUMENTS.has(name));
  const reads = right.map((call) => {
    const [read] = call.arguments;
    const fields =
      read !== undefined && ts.isObjectLiteralExpression(read)
        ? propertiesOf(read)
        : undefined;
    const readArgs = initializerOf(fields?.get('args'));
    return {
      tool: literalText(initializerOf(fields?.get('tool'))),
      args:
        readArgs !== undefined && ts.isObjectLiteralExpression(readArgs)
          ? propertiesOf(readArgs)
          : undefined,
    };
  });
  const names = (read: (typeof reads)[number]): boolean => {
    const reading = read.args;
    return (
      deleted !== undefined &&
      reading !== undefined &&
      identity.some((name) => name !== 'object_type' && name !== 'part') &&
      identity.every(
        (name) =>
          reading.has(name) &&
          initializerOf(reading.get(name))?.getText(file) ===
            initializerOf(deleted.get(name))?.getText(file),
      )
    );
  };
  const named = reads.filter(names);
  if (named.length === 0) return 'delete-check-other-object';
  return named.some((read) => read.tool === readerOf(key))
    ? undefined
    : 'delete-check-wrong-tool';
}

/** The enclosing `liveSuite` of a collected test call, and its systems. */
function suiteOf(
  test: ts.CallExpression,
): { systems: SystemKind[]; problem?: Problem } | undefined {
  for (let at = test.parent; at !== undefined; at = at.parent) {
    if (
      ts.isCallExpression(at) &&
      ts.isIdentifier(at.expression) &&
      at.expression.text === 'liveSuite'
    ) {
      const [systems] = at.arguments;
      if (systems === undefined || !ts.isArrayLiteralExpression(systems)) {
        return { systems: [], problem: 'suite-systems-not-literal' };
      }
      const named = systems.elements.map((element) =>
        ts.isExpression(element) ? literalText(element) : undefined,
      );
      if (!named.every(isSystemKind)) {
        return { systems: [], problem: 'suite-systems-not-literal' };
      }
      return { systems: named.filter(isSystemKind) };
    }
  }
  return undefined;
}

/** One `liveCall`. */
function liveRef(
  file: ts.SourceFile,
  filePath: string,
  call: ts.CallExpression,
  only: boolean,
): LiveRef {
  const problems = placeProblems(call, only);
  const [toolArgument, args] = call.arguments;
  const literal = keyOfLiterals(
    toolArgument === undefined ? undefined : literalText(toolArgument),
    args,
  );
  problems.push(...literal.problems);
  const ref = (systems: readonly SystemKind[]): LiveRef => ({
    file: filePath,
    line: lineOf(file, call),
    key: literal.key,
    systems,
    problems,
  });
  const awaited = call.parent;
  if (awaited === undefined || !ts.isAwaitExpression(awaited)) {
    problems.push('live-not-awaited');
    return ref(suiteOf(call)?.systems ?? []);
  }
  let statement: ts.Statement | undefined;
  const holder = awaited.parent;
  if (ts.isExpressionStatement(holder)) statement = holder;
  else if (
    ts.isVariableDeclaration(holder) &&
    holder.initializer === awaited &&
    ts.isVariableDeclarationList(holder.parent) &&
    ts.isVariableStatement(holder.parent.parent)
  ) {
    statement = holder.parent.parent;
  }
  if (statement === undefined) {
    problems.push('live-not-statement');
    return ref(suiteOf(call)?.systems ?? []);
  }
  const owner = bodyOwner(statement);
  const test = owner?.parent;
  const kind =
    test !== undefined &&
    ts.isCallExpression(test) &&
    owner !== undefined &&
    isArgumentOf(owner, test)
      ? jestCall(test)
      : undefined;
  if (kind?.base === 'hook') {
    problems.push('live-in-hook');
    return ref(suiteOf(call)?.systems ?? []);
  }
  if (
    kind?.base !== 'test' ||
    test === undefined ||
    !ts.isCallExpression(test)
  ) {
    problems.push('live-nested-function');
    return ref(suiteOf(call)?.systems ?? []);
  }
  if (!collected(test)) problems.push('not-executable');
  const suite = suiteOf(test);
  if (suite === undefined) {
    problems.push('live-outside-suite');
    return ref([]);
  }
  if (suite.problem !== undefined) problems.push(suite.problem);
  if (literal.key !== undefined) {
    const wrong = deleteProblem(literal.key, statement, args, file);
    if (wrong !== undefined) problems.push(wrong);
  }
  return ref(suite.systems);
}

/** Every `liveCall` of a file's text. */
export function scanLiveText(filePath: string, text: string): LiveRef[] {
  const file = parse(filePath, text);
  const only = hasOnly(file);
  return callsOf(file, 'liveCall').map((call) =>
    liveRef(file, filePath, call, only),
  );
}

/** Every `liveCall` of the file at `path`. */
export function scanLiveFile(filePath: string): readonly LiveRef[] {
  return scanLiveText(filePath, fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// The checks

/** What each check reports. */
export type Check =
  | 'served-mismatch'
  | 'ledger-shape'
  | 'missing-row'
  | 'extra-row'
  | 'missing-system'
  | 'extra-system'
  | 'unit-not-discovered'
  | 'unit-no-pin'
  | 'live-not-integration'
  | 'live-missing'
  | 'orphan'
  | Problem;

export interface Finding {
  readonly check: Check;
  readonly detail: string;
}

/** One ledger row as the file states it. */
export interface LedgerRow {
  readonly unit: string;
  readonly live: Partial<Record<SystemKind, string>>;
}

/** What the checks read: the served tools and the files, given. */
export interface CheckInput {
  /** `servedTools()`: the onprem and cloud listings of all twelve binaries. */
  readonly served: readonly ServedTool[];
  /** `listed-schemas.json`'s `schemas`, as the file states it. */
  readonly listed: unknown;
  /** `coverage-ledger.json`, as the file states it. */
  readonly ledger: unknown;
  /** The repository paths of the test files `npm test` runs (Jest's own discovery). */
  readonly discovered: ReadonlySet<string>;
  /** The repository paths scanned for orphans and problems, beside the ledger's files. */
  readonly scanned: readonly string[];
  /** A repository path's text; `undefined` when there is no such file. */
  read(repoPath: string): string | undefined;
}

/** The ledger's rows, or why it is not a ledger. */
function ledgerRows(ledger: unknown): Map<CoverageKey, LedgerRow> | string {
  if (typeof ledger !== 'object' || ledger === null || Array.isArray(ledger)) {
    return 'the ledger is not an object';
  }
  const rows = new Map<CoverageKey, LedgerRow>();
  for (const [key, row] of Object.entries(ledger)) {
    const unit: unknown =
      typeof row === 'object' && row !== null
        ? Reflect.get(row, 'unit')
        : undefined;
    const live: unknown =
      typeof row === 'object' && row !== null
        ? Reflect.get(row, 'live')
        : undefined;
    if (typeof unit !== 'string' || typeof live !== 'object' || live === null) {
      return `${key}: a row is { unit: <file>, live: { onprem?: <file>, cloud?: <file> } }`;
    }
    const files: Partial<Record<SystemKind, string>> = {};
    for (const [system, file] of Object.entries(live)) {
      if (!isSystemKind(system) || typeof file !== 'string') {
        return `${key}: live names onprem and cloud only, each a file`;
      }
      files[system] = file;
    }
    rows.set(key, { unit, live: files });
  }
  return rows;
}

/** The served list against the fixture's `listedBy`, projected to onprem and cloud. */
function servedFindings(input: CheckInput): Finding[] {
  const findings: Finding[] = [];
  const served = new Map<string, Set<string>>();
  for (const tool of input.served) {
    const by = served.get(tool.name) ?? new Set<string>();
    by.add(`${tool.variant} ${tool.binary}`);
    served.set(tool.name, by);
  }
  const listed = new Map<string, Set<string>>();
  if (typeof input.listed === 'object' && input.listed !== null) {
    for (const [tool, values] of Object.entries(input.listed)) {
      const by = new Set<string>();
      if (Array.isArray(values)) {
        for (const value of values) {
          const listedBy: unknown =
            typeof value === 'object' && value !== null
              ? Reflect.get(value, 'listedBy')
              : undefined;
          if (!Array.isArray(listedBy)) continue;
          for (const each of listedBy) {
            if (
              typeof each === 'string' &&
              (each.startsWith('onprem ') || each.startsWith('cloud '))
            ) {
              by.add(each);
            }
          }
        }
      }
      listed.set(tool, by);
    }
  }
  const sorted = (set: ReadonlySet<string> | undefined) =>
    [...(set ?? [])].sort().join(', ');
  for (const tool of new Set([...served.keys(), ...listed.keys()])) {
    const servedBy = sorted(served.get(tool));
    const listedBy = sorted(listed.get(tool));
    if (servedBy !== listedBy) {
      findings.push({
        check: 'served-mismatch',
        detail: `${tool}: served by [${servedBy}], listed by [${listedBy}]`,
      });
    }
  }
  return findings;
}

/** A finding per problem of each reference. */
function problemFindings(
  refs: ReadonlyArray<{
    file: string;
    line: number;
    key: CoverageKey | undefined;
    problems: readonly Problem[];
  }>,
): Finding[] {
  return refs.flatMap((ref) =>
    ref.problems.map((problem) => ({
      check: problem,
      detail: `${ref.file}:${ref.line} ${ref.key ?? '(no key)'}`,
    })),
  );
}

const INTEGRATION = 'src/__tests__/integration/';

/** Every check of the ledger; `[]` when the ledger is what the code serves. */
export function checkLedger(input: CheckInput): Finding[] {
  const findings = servedFindings(input);
  const rows = ledgerRows(input.ledger);
  if (typeof rows === 'string') {
    return [...findings, { check: 'ledger-shape', detail: rows }];
  }
  const required = requiredKeys(input.served);

  const units = new Map<string, readonly PinRef[]>();
  const lives = new Map<string, readonly LiveRef[]>();
  const unitRefs = (file: string): readonly PinRef[] => {
    let refs = units.get(file);
    if (refs === undefined) {
      const text = input.read(file);
      refs = text === undefined ? [] : scanUnitText(file, text);
      units.set(file, refs);
    }
    return refs;
  };
  const liveRefs = (file: string): readonly LiveRef[] => {
    let refs = lives.get(file);
    if (refs === undefined) {
      const text = input.read(file);
      refs = text === undefined ? [] : scanLiveText(file, text);
      lives.set(file, refs);
    }
    return refs;
  };

  for (const [key, kinds] of required) {
    const row = rows.get(key);
    if (row === undefined) {
      findings.push({ check: 'missing-row', detail: key });
      continue;
    }
    for (const kind of kinds) {
      if (row.live[kind] === undefined) {
        findings.push({ check: 'missing-system', detail: `${key}: ${kind}` });
      }
    }
    for (const system of Object.keys(row.live)) {
      if (!isSystemKind(system) || !kinds.has(system)) {
        findings.push({ check: 'extra-system', detail: `${key}: ${system}` });
      }
    }
    if (!input.discovered.has(row.unit)) {
      findings.push({
        check: 'unit-not-discovered',
        detail: `${key}: ${row.unit}`,
      });
    }
    const pins = unitRefs(row.unit).filter(
      (ref) => ref.key === key && ref.counts,
    );
    for (const kind of kinds) {
      if (!pins.some((ref) => ref.variant === kind)) {
        findings.push({
          check: 'unit-no-pin',
          detail: `${key} (${kind}): ${row.unit}`,
        });
      }
    }
    for (const [system, file] of Object.entries(row.live)) {
      if (!isSystemKind(system) || file === undefined || !kinds.has(system)) {
        continue;
      }
      if (!file.startsWith(INTEGRATION) || !file.endsWith('.test.ts')) {
        findings.push({
          check: 'live-not-integration',
          detail: `${key}: ${file}`,
        });
      }
      if (
        !liveRefs(file).some(
          (ref) => ref.key === key && ref.systems.includes(system),
        )
      ) {
        findings.push({
          check: 'live-missing',
          detail: `${key} (${system}): ${file}`,
        });
      }
    }
  }
  for (const key of rows.keys()) {
    if (!required.has(key)) findings.push({ check: 'extra-row', detail: key });
  }

  // Pins are read in every scanned file; live calls where a live case can
  // stand — under the integration tree, or where the ledger names a live
  // file — so a unit test of the live helpers is not read as a live case.
  const files = new Set(input.scanned);
  const liveFiles = new Set<string>();
  for (const row of rows.values()) {
    files.add(row.unit);
    for (const file of Object.values(row.live)) {
      if (file !== undefined) {
        files.add(file);
        liveFiles.add(file);
      }
    }
  }
  for (const file of [...files].sort()) {
    const pins = unitRefs(file);
    const live =
      file.startsWith(INTEGRATION) || liveFiles.has(file) ? liveRefs(file) : [];
    findings.push(...problemFindings(pins), ...problemFindings(live));
    for (const ref of [...pins, ...live]) {
      if (
        ref.problems.length === 0 &&
        ref.key !== undefined &&
        !rows.has(ref.key)
      ) {
        findings.push({
          check: 'orphan',
          detail: `${ref.file}:${ref.line} ${ref.key}`,
        });
      }
    }
  }
  return findings;
}

/** A repository path read from the repository root; `undefined` when absent. */
export function repoReader(
  root: string,
): (repoPath: string) => string | undefined {
  return (repoPath) => {
    const full = path.join(root, repoPath);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : undefined;
  };
}
