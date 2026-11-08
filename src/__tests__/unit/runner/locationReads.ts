/**
 * The files production code reads by its own location (D27, spec §2, "Files
 * production code reads beside itself"), found with the TypeScript parser:
 * - `require('<relative>')` of a file that is not code (a `.json` table, a
 *   manifest): code is compiled into the test build, anything else is not;
 * - `__dirname` as the first argument of a `join` or `resolve` whose other
 *   arguments are string literals.
 * Any other use of `__dirname` is a read whose target cannot be stated, and
 * fails the guard. The placement list (`tools/node-test-placed.json`) is what
 * the node:test build places beside the compiled code; `placementFindings`
 * holds the two against each other. Uses no test runner.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export const PLACED_LIST = 'tools/node-test-placed.json';

/** What `require` loads as code; anything else is a file read. */
const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  '',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
]);

/** A call's callee read for its own name: `join`, `path.join`. */
const JOINS: ReadonlySet<string> = new Set(['join', 'resolve']);

export interface LocationRead {
  /** The repository path read, written with `/`. */
  target: string;
  /** The production source that reads it, written with `/`. */
  by: string;
}

export interface LocationReads {
  /** Each target once, by the first source (in path order) that reads it. */
  targets: LocationRead[];
  /** `<source>:<line>: <why>` for every read whose target is not stated. */
  unstated: string[];
}

function slashed(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * `src` and the `src` of every package directory of `root` (a directory
 * holding a `package.json` and a `src`).
 */
export function productionSourceDirs(root: string): string[] {
  return [
    path.join(root, 'src'),
    ...fs
      .readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== 'node_modules' &&
          fs.existsSync(path.join(root, entry.name, 'package.json')) &&
          fs.existsSync(path.join(root, entry.name, 'src')),
      )
      .map((entry) => path.join(root, entry.name, 'src')),
  ];
}

/** The `.ts` sources under `dir`, outside every `__tests__` directory. */
function productionSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') {
        continue;
      }
      found.push(...productionSources(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** The literal parts after `__dirname` in a join, or none when one is not. */
function literalParts(call: ts.CallExpression): string[] | undefined {
  const parts: string[] = [];
  for (const argument of call.arguments.slice(1)) {
    if (!ts.isStringLiteral(argument)) return undefined;
    parts.push(argument.text);
  }
  return parts;
}

/** Every location read of the production sources under `dirs`. */
export function locationReads(
  root: string,
  dirs: readonly string[],
): LocationReads {
  const byTarget = new Map<string, string>();
  const unstated: string[] = [];
  const files = dirs.flatMap(productionSources).sort();
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const by = slashed(root, file);
    const here = path.dirname(file);
    const read = (target: string) => {
      const relative = slashed(root, target);
      if (!byTarget.has(relative)) byTarget.set(relative, by);
    };
    const refuse = (node: ts.Node, why: string) => {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      unstated.push(`${by}:${line + 1}: ${why}`);
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        const first = node.arguments[0];
        if (
          first !== undefined &&
          ts.isStringLiteral(first) &&
          first.text.startsWith('.') &&
          !CODE_EXTENSIONS.has(path.extname(first.text))
        ) {
          read(path.resolve(here, first.text));
        }
      }
      if (ts.isIdentifier(node) && node.text === '__dirname') {
        const call = node.parent;
        const name =
          ts.isCallExpression(call) && call.arguments[0] === node
            ? calleeName(call)
            : undefined;
        const parts =
          name !== undefined && JOINS.has(name) && ts.isCallExpression(call)
            ? literalParts(call)
            : undefined;
        if (parts === undefined) {
          refuse(node, '__dirname not joined with literal parts');
        } else {
          read(path.resolve(here, ...parts));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return {
    targets: [...byTarget]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([target, reader]) => ({ target, by: reader })),
    unstated,
  };
}

/**
 * The placement list of `root`: repository paths written with `/`. The file
 * is data, read as such; anything but a list of strings throws.
 */
export function readPlaced(root: string): string[] {
  const file = path.join(root, ...PLACED_LIST.split('/'));
  const listed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(listed)) throw new Error(`${PLACED_LIST}: not a list`);
  const placed: string[] = [];
  for (const entry of listed) {
    if (typeof entry !== 'string') {
      throw new Error(`${PLACED_LIST}: not a list of strings`);
    }
    placed.push(entry);
  }
  return placed;
}

/**
 * A finding for every read the list does not place and every entry no read
 * needs: the list places exactly the files production code reads.
 */
export function placementFindings(
  reads: LocationReads,
  placed: readonly string[],
): string[] {
  const listed = new Set(placed);
  const needed = new Set(reads.targets.map((read) => read.target));
  return [
    ...reads.targets
      .filter((read) => !listed.has(read.target))
      .map((read) => `${read.target}: read by ${read.by}, not placed`),
    ...[...listed]
      .filter((entry) => !needed.has(entry))
      .map((entry) => `${entry}: placed, read by no production code`),
  ];
}
