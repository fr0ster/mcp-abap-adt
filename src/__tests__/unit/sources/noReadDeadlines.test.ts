/**
 * No built-in deadline on the server's reads (the owner's rule: a wait ends on
 * the result, SAP's answer, or the consumer's own choice). The reads off the
 * approved list of long tools carry no client deadline and race no timer:
 *
 * - every `makeAdtRequest(` call in every package's `src` passes `0` — no
 *   deadline — as its timeout;
 * - no package names `makeAdtRequestWithTimeout`, `getTimeout` or
 *   `getTimeoutConfig` — removed in 19.0.0 with connection 17, which no longer
 *   exports the latter two — and none reads a `SAP_TIMEOUT_*` variable;
 * - the reads that had a deadline before hold no `setTimeout(`, no
 *   `Promise.race(` and read no `timeout` argument.
 *
 * The sources are parsed with TypeScript, so comments, strings and regular
 * expression literals cannot hide or fake a call.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const REPO = path.resolve(__dirname, '../../../..');
const PACKAGES = [
  'src',
  'compact/src',
  'compact-http/src',
  'compact-sse/src',
  'compact-readonly-entries/src',
  'compact-modify/src',
  'server/src',
  'http/src',
  'sse/src',
];

/** The reads that took a fixed deadline before, file by file. */
const READS = [
  'src/handlers/include/readonly/handleGetInclude.ts',
  'src/handlers/transport/readonly/handleGetTransport.ts',
  'src/handlers/system/readonly/handleGetTypeInfo.ts',
  'src/handlers/system/readonly/handleGetObjectNodeFromCache.ts',
  'src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts',
  'src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts',
  'src/handlers/enhancement/readonly/enhancementAvailability.ts',
  'src/handlers/enhancement/readonly/handleGetEnhancements.ts',
  'src/lib/sessionUtils.ts',
  'src/lib/search-source/sourceReader.ts',
];

/** The deadline helpers removed in 19.0.0; no package may name them. */
const REMOVED = new Set([
  'makeAdtRequestWithTimeout',
  'getTimeout',
  'getTimeoutConfig',
]);

/** The environment variables of the removed deadlines. */
const TIMEOUT_VARIABLE = 'SAP_TIMEOUT_';

function sourceFiles(dir: string): string[] {
  const root = path.join(REPO, dir);
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...sourceFiles(rel));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(rel);
    }
  }
  return out;
}

interface Call {
  /** `name` for a plain call, `object.name` for a property call. */
  callee: string;
  line: number;
  args: string[];
  /** The function declaration the call sits in, if any. */
  inside: string | undefined;
}

interface Scan {
  calls: Call[];
  /** Every `args.timeout` / `args?.timeout` read. */
  timeoutReads: number;
  /** Every identifier, and every string literal's text, with its line. */
  names: { text: string; line: number }[];
}

function scan(text: string): Scan {
  const source = ts.createSourceFile(
    'x.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const calls: Call[] = [];
  const names: { text: string; line: number }[] = [];
  let timeoutReads = 0;
  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const visit = (node: ts.Node, inside: string | undefined) => {
    let here = inside;
    if (
      ts.isIdentifier(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      names.push({ text: node.text, line: lineOf(node) });
    }
    if (ts.isFunctionDeclaration(node) && node.name) here = node.name.text;
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      const callee = ts.isIdentifier(e)
        ? e.text
        : ts.isPropertyAccessExpression(e)
          ? `${e.expression.getText(source)}.${e.name.text}`
          : undefined;
      if (callee !== undefined) {
        calls.push({
          callee,
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          args: node.arguments.map((a) => a.getText(source)),
          inside: here,
        });
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'timeout' &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'args'
    ) {
      timeoutReads += 1;
    }
    ts.forEachChild(node, (child) => visit(child, here));
  };
  visit(source, undefined);
  return { calls, timeoutReads, names };
}

const scanFile = (file: string) =>
  scan(fs.readFileSync(path.join(REPO, file), 'utf8'));

describe('no built-in deadline on the server reads', () => {
  const files = PACKAGES.flatMap(sourceFiles);
  const scans = files.map((file) => ({ file, ...scanFile(file) }));

  it('sees the sources, so the checks below are not vacuous', () => {
    expect(files.length).toBeGreaterThan(300);
    const reads = scans.flatMap((s) =>
      s.calls.filter((c) => c.callee === 'makeAdtRequest'),
    );
    expect(reads.length).toBeGreaterThanOrEqual(13);
  });

  it('every makeAdtRequest call passes no deadline (0)', () => {
    const offending = scans.flatMap(({ file, calls }) =>
      calls
        .filter((c) => c.callee === 'makeAdtRequest')
        .filter((c) => c.args[3] !== '0')
        .map((c) => `${file}:${c.line} timeout=${c.args[3]}`),
    );
    expect(offending).toEqual([]);
  });

  it('no package names a removed deadline helper or reads SAP_TIMEOUT_*', () => {
    const offending = scans.flatMap(({ file, names }) =>
      names
        .filter(
          (n) => REMOVED.has(n.text) || n.text.startsWith(TIMEOUT_VARIABLE),
        )
        .map((n) => `${file}:${n.line} ${n.text}`),
    );
    expect(offending).toEqual([]);
  });

  it('the reads race no timer and read no timeout argument', () => {
    const offending = READS.flatMap((file) => {
      const { calls, timeoutReads } = scanFile(file);
      return [
        ...calls
          .filter(
            (c) => c.callee === 'setTimeout' || c.callee === 'Promise.race',
          )
          .map((c) => `${file}:${c.line} ${c.callee}`),
        ...(timeoutReads > 0 ? [`${file}: args.timeout`] : []),
      ];
    });
    expect(offending).toEqual([]);
  });

  it('the scan sees what it checks, and nothing in comments or literals (load-bearing)', () => {
    const { calls, timeoutReads, names } = scan(
      [
        'const r = /dtcore:name="([^"]*)"[^>]*$/; // makeAdtRequest(a, b, c, 1)',
        'await makeAdtRequest(',
        '  connection,',
        '  `/x/${f(a, b)}`,',
        "  'GET',",
        "  // a comment, with a comma, 'and a quote",
        '  15000,',
        '  { Accept: "a,b" },',
        ');',
        'function makeAdtRequestWithTimeout() { return getTimeout("default"); }',
        'await Promise.race([p, new Promise((r) => setTimeout(r, 1))]);',
        'const t = args?.timeout ?? args.timeout;',
        "const v = process.env['SAP_TIMEOUT_LONG'] ?? process.env.SAP_TIMEOUT_CSRF;",
      ].join('\n'),
    );
    const named = (callee: string) => calls.filter((c) => c.callee === callee);
    expect(named('makeAdtRequest').map((c) => c.args)).toEqual([
      ['connection', '`/x/${f(a, b)}`', "'GET'", '15000', '{ Accept: "a,b" }'],
    ]);
    expect(named('getTimeout').map((c) => c.inside)).toEqual([
      'makeAdtRequestWithTimeout',
    ]);
    expect(named('Promise.race')).toHaveLength(1);
    expect(named('setTimeout')).toHaveLength(1);
    expect(timeoutReads).toBe(2);
    const flagged = names
      .filter((n) => REMOVED.has(n.text) || n.text.startsWith(TIMEOUT_VARIABLE))
      .map((n) => n.text);
    // Comments name `makeAdtRequest(` only; the code names each once.
    expect(flagged).toEqual([
      'makeAdtRequestWithTimeout',
      'getTimeout',
      'SAP_TIMEOUT_LONG',
      'SAP_TIMEOUT_CSRF',
    ]);
  });
});
