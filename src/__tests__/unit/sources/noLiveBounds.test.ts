/**
 * No bound, no delay and no poll limit in a live test (D27, step 13; spec §3
 * "No bound on a live test"; P3, P7). Leaving Jest is leaving its timeouts,
 * and nothing replaces them: each step of a live test goes on the answer of
 * the one before it, and a wait that does not end is ended by the person
 * with the runner's interrupt.
 *
 * - **The templates** (`tests/test-config.yaml.template` and its copy under
 *   `docs/development/tests/`) name none of the time keys: under
 *   `test_settings` no `timeout`, `timeouts`, `operation_delays`,
 *   `retry_on_failure` or `max_retries`, and in no case `operation_delays`,
 *   `poll_interval_ms`, `poll_timeout_ms`, `trace_read_retries` or
 *   `trace_read_retry_delay_ms`.
 * - **The live sources** (`src/__tests__/integration`, `src/__tests__/admin`)
 *   read none of them, name neither `getTimeout` nor `getOperationDelay`, and
 *   pause nowhere: no `setTimeout` or `setInterval`, no call of a `delay`,
 *   `pause` or `sleep`, but at the named sites of the step-13B remainder
 *   below, which wait on asynchronous SAP state and are measured live in
 *   step 19 before they change.
 *
 * The sources are parsed with TypeScript, so comments and strings cannot hide
 * or fake a read or a call; the templates with js-yaml, as the tests read
 * them.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as yaml from 'js-yaml';
import * as ts from 'typescript';
import { repositoryRoot } from '../../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);

const TEMPLATES = [
  'tests/test-config.yaml.template',
  'docs/development/tests/test-config.yaml.template',
];
const LIVE_ROOTS = ['src/__tests__/integration', 'src/__tests__/admin'];

/** Refused under `test_settings`. */
const SETTINGS_KEYS = [
  'timeout',
  'timeouts',
  'operation_delays',
  'retry_on_failure',
  'max_retries',
];
/** Refused anywhere. */
const CASE_KEYS = [
  'operation_delays',
  'poll_interval_ms',
  'poll_timeout_ms',
  'trace_read_retries',
  'trace_read_retry_delay_ms',
];
/** The keys a live source may not read (by name, as a property or a string). */
const READ_KEYS = [
  'timeouts',
  'operation_delays',
  'retry_on_failure',
  'max_retries',
  ...CASE_KEYS,
];
const HELPERS = ['getTimeout', 'getOperationDelay'];
const TIMERS = ['setTimeout', 'setInterval'];
const PAUSES = ['delay', 'pause', 'sleep'];

/**
 * The step-13B remainder: the retries on asynchronous SAP state, left as
 * they are until step 19 measures them (the owner's decision), each by its
 * file and the function, method or case it sits in.
 */
const RETRY_REMAINDER = [
  'src/__tests__/integration/helpers/testers/HighTester.ts#retryOnConflict',
  'src/__tests__/integration/helpers/rapFixtures.ts#activateAndConfirm',
  'src/__tests__/admin/shared-deps/setup.test.ts#should create all shared dependencies and group-activate',
];
/** Step 13B's feed part: the runtime suite's trace and dump feed reads. */
const FEED_REMAINDER = [
  'src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts#delay',
  'src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts#runs the shared program under the profiler and gets the id of its trace (on-prem)',
  'src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts#should create dump by division by zero and read/analyze created dump',
];
/** The pause the retry remainder calls; it goes with it. */
const REMAINDER_PAUSE =
  'src/__tests__/integration/helpers/testHelpers.ts#delay';
const ALLOWED_SITES = new Set([
  ...RETRY_REMAINDER,
  ...FEED_REMAINDER,
  REMAINDER_PAUSE,
]);

/** Every key path of a parsed YAML value: `a.b.c`. */
function keyPaths(value: unknown, prefix: string[] = []): string[][] {
  if (typeof value !== 'object' || value === null) return [];
  const found: string[][] = [];
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((item, at): [string, unknown] => [String(at), item])
    : Object.entries(value);
  for (const [key, member] of entries) {
    const at = [...prefix, key];
    if (!Array.isArray(value)) found.push(at);
    found.push(...keyPaths(member, at));
  }
  return found;
}

/** The time keys a template names, as `path.to.key`. */
function templateTimeKeys(text: string): string[] {
  const parsed: unknown = yaml.load(text);
  return keyPaths(parsed)
    .filter((at) => {
      const key = at[at.length - 1] ?? '';
      if (CASE_KEYS.includes(key)) return true;
      return (
        at.length === 2 &&
        at[0] === 'test_settings' &&
        SETTINGS_KEYS.includes(key)
      );
    })
    .map((at) => at.join('.'));
}

/** Every `.ts` file under `root`, relative to the repository, `/`-separated. */
function sourcesUnder(root: string): string[] {
  return fs
    .readdirSync(path.join(REPO, root), {
      withFileTypes: true,
      recursive: true,
    })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) =>
      path
        .relative(REPO, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    );
}

/** The innermost named function, method, variable or `it` case around `node`. */
function siteOf(node: ts.Node): string {
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if (
      (ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at)) &&
      at.name !== undefined &&
      ts.isIdentifier(at.name)
    ) {
      return at.name.text;
    }
    if (
      ts.isVariableDeclaration(at) &&
      ts.isIdentifier(at.name) &&
      at.initializer !== undefined &&
      (ts.isArrowFunction(at.initializer) ||
        ts.isFunctionExpression(at.initializer))
    ) {
      return at.name.text;
    }
    if (
      ts.isCallExpression(at) &&
      ts.isIdentifier(at.expression) &&
      at.expression.text === 'it'
    ) {
      const [title] = at.arguments;
      if (title !== undefined && ts.isStringLiteralLike(title))
        return title.text;
    }
  }
  return '';
}

/**
 * Counted repetitions that are no poll, each by its site and its loop's
 * condition: the AMDP chain steps over `repeats` times — a count of steps
 * it measures — and leaves early when the run leaves its breaks.
 */
const REPETITIONS = new Set([
  'src/__tests__/integration/debugger/DebuggerHandlers.test.ts#AMDP chain: start, break, table, steps, continue to the end; then a stop, and the event read open at it ends (waited for)#i < repeats',
]);

/** The comparisons a counted loop's condition bounds its counter with. */
const COUNT_COMPARISONS = [
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
];

/** Whether `node` holds a counter comparison (`i < rounds`), through `&&`. */
function comparesCount(node: ts.Expression): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return comparesCount(node.left) || comparesCount(node.right);
  }
  return COUNT_COMPARISONS.includes(node.operatorToken.kind);
}

/** Whether the loop's body leaves it early: a `break` or `return` of its own (not a nested function's or loop's). */
function leavesEarly(body: ts.Node): boolean {
  let leaves = false;
  const visit = (node: ts.Node): void => {
    if (leaves || ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) leaves = true;
    if (ts.isBreakStatement(node) && node.label === undefined) {
      leaves = !isInnerLoopOrSwitch(node, body);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return leaves;
}

/** Whether the loop's body awaits (not inside a nested function): a poll waits. */
function awaits(body: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found || ts.isFunctionLike(node)) return;
    if (ts.isAwaitExpression(node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** Whether `node` sits in a loop or `switch` nested inside `body`. */
function isInnerLoopOrSwitch(node: ts.Node, body: ts.Node): boolean {
  for (let at = node.parent; at !== undefined && at !== body; at = at.parent) {
    if (ts.isIterationStatement(at, false) || ts.isSwitchStatement(at)) {
      return true;
    }
  }
  return false;
}

/**
 * A polling loop with a counted cap: a `for` whose condition bounds a
 * counter (`i < rounds`), whose body awaits, and which ends early on what
 * it waits for — a second condition beside the count (`&& !caught`), or a
 * `break` or `return` of its own. A loop that repeats a step a fixed number
 * of times, leaving only at its count, is no poll; nor is a search that
 * awaits nothing.
 */
function isCappedPoll(node: ts.Node): boolean {
  if (!ts.isForStatement(node) || node.condition === undefined) return false;
  if (!comparesCount(node.condition) || !awaits(node.statement)) return false;
  const secondCondition =
    ts.isBinaryExpression(node.condition) &&
    node.condition.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
  return secondCondition || leavesEarly(node.statement);
}

/** What a live source reads or calls that this scan refuses, by site. */
function liveSourceFindings(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const report = (node: ts.Node, what: string, allowed: boolean) => {
    const site = `${file}#${siteOf(node)}`;
    if (allowed && ALLOWED_SITES.has(site)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${file}:${line + 1} ${what} (${site})`);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      if (HELPERS.includes(node.text)) report(node, node.text, false);
      if (TIMERS.includes(node.text)) report(node, node.text, true);
      if (READ_KEYS.includes(node.text))
        report(node, `reads ${node.text}`, false);
    }
    if (ts.isStringLiteralLike(node) && READ_KEYS.includes(node.text)) {
      report(node, `reads '${node.text}'`, false);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'timeout' &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'test_settings'
    ) {
      report(node, 'reads test_settings.timeout', false);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      PAUSES.includes(node.expression.text)
    ) {
      report(node, `calls ${node.expression.text}`, true);
    }
    if (
      isCappedPoll(node) &&
      ts.isForStatement(node) &&
      !REPETITIONS.has(
        `${file}#${siteOf(node)}#${node.condition?.getText(source) ?? ''}`,
      )
    ) {
      report(node, 'a poll with a counted cap', true);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('no bound, delay or poll limit in a live test', () => {
  it('the template names no bound, delay or poll limit', () => {
    for (const template of TEMPLATES) {
      const text = fs.readFileSync(path.join(REPO, template), 'utf8');
      assert.deepEqual(templateTimeKeys(text), [], template);
    }
  });

  it('no live source reads a bound, a delay or a poll limit, or pauses, but the named 13B remainder', () => {
    const found = LIVE_ROOTS.flatMap(sourcesUnder).flatMap((file) =>
      liveSourceFindings(file, fs.readFileSync(path.join(REPO, file), 'utf8')),
    );
    assert.deepEqual(found, []);
  });

  it('every named remainder site still holds its pause: the list names what is there', () => {
    const sites = new Set<string>();
    for (const file of LIVE_ROOTS.flatMap(sourcesUnder)) {
      const text = fs.readFileSync(path.join(REPO, file), 'utf8');
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          (ts.isIdentifier(node) && TIMERS.includes(node.text)) ||
          (ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            PAUSES.includes(node.expression.text))
        ) {
          sites.add(`${file}#${siteOf(node)}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    assert.deepEqual(
      [...ALLOWED_SITES].filter((site) => !sites.has(site)),
      [],
    );
  });

  it('refuses a time key in a template, and a read, a helper or a pause in a source', () => {
    assert.deepEqual(
      templateTimeKeys(
        'test_settings:\n  timeout: 1\n  fail_fast: false\nx:\n  test_cases:\n    - params:\n        poll_timeout_ms: 2\n',
      ),
      ['test_settings.timeout', 'x.test_cases.0.params.poll_timeout_ms'],
    );
    const file = 'src/__tests__/integration/x.test.ts';
    assert.equal(
      liveSourceFindings(
        file,
        [
          "it('a', async () => {",
          '  const t = config.test_settings.timeout;',
          "  const d = params['poll_interval_ms'];",
          "  getOperationDelay('create');",
          '  await new Promise((r) => setTimeout(r, 1));',
          '  await delay(1);',
          '});',
        ].join('\n'),
      ).length,
      5,
    );
  });

  it('refuses a poll with a counted cap, not a counted repetition or a search', () => {
    const file = 'src/__tests__/integration/x.test.ts';
    const findings = (body: string) =>
      liveSourceFindings(file, `it('a', async () => {\n${body}\n});`);
    // Capped polls: a second condition beside the count, or an early return.
    assert.equal(
      findings('for (let i = 0; i < 4 && !done; i++) { done = await poll(); }')
        .length,
      1,
    );
    assert.equal(
      findings('for (let i = 0; i < 4; i++) { if (await poll()) return; }')
        .length,
      1,
    );
    // A repetition leaves only at its count; a search awaits nothing.
    assert.deepEqual(
      findings('for (let i = 0; i < 3; i++) { await step(); }'),
      [],
    );
    assert.deepEqual(
      findings(
        'for (let i = 0; i < xs.length; i++) { if (xs[i] === 1) return i; }',
      ),
      [],
    );
  });
});
