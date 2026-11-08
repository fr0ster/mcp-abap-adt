/**
 * The files production code reads by its own location (D27, spec §2, "Files
 * production code reads beside itself"), found with the TypeScript parser.
 *
 * What the scan resolves to a stated target:
 * - `require('<relative>')` and `import('<relative>')` (and a static import)
 *   of a file that is not code (a `.json` table, a manifest): code is
 *   compiled into the test build, anything else is not;
 * - a path from `__dirname`: `__dirname` as the first argument of a `join` or
 *   `resolve` whose other arguments are string literals, followed to what is
 *   read:
 *   - joined or resolved again with literal parts, the path grows;
 *   - joined or resolved with a computed part, the read is under the path,
 *     and the path must be a directory: the directory is placed whole, so
 *     whatever the code reads beneath it is placed by construction; a
 *     computed part on a file states nothing, and is refused;
 *   - an argument of any other call (`readFileSync`, `readdirSync`, …), the
 *     path is read whole: its target;
 *   - the value of a `const`, every use of that name is followed in turn; an
 *     exported one is served whole to code the scan does not see (its target),
 *     and its uses are followed in every production file that imports it by
 *     name.
 * Every other use is refused, as a location the scan does not resolve: a path
 * from `__dirname` anywhere else (a `let`, a concatenation, an object), any
 * `__filename`, `import.meta`, `createRequire`, a `require` or `import()` not
 * called with one literal (`require.resolve`, `require(name)`), and a module
 * exporting a path from `__dirname` imported other than by name. A use the
 * scan refuses that reads nothing is the guard's to allow, with its reason.
 * The placement list (`tools/node-test-placed.json`) is what the node:test
 * build places beside the compiled code; `placementFindings` holds the two
 * against each other. Uses no test runner.
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

export interface UnstatedRead {
  /** The production source, written with `/`. */
  by: string;
  /** Its 1-based line. */
  line: number;
  why: string;
}

export interface LocationReads {
  /** Each target once, by the first source (in path order) that reads it. */
  targets: LocationRead[];
  /** Every use of a location whose read target is not stated, by source and line. */
  unstated: UnstatedRead[];
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

/** The node a use stands for: a parenthesised use is the parentheses. */
function outermost(node: ts.Node): ts.Node {
  let current = node;
  while (ts.isParenthesizedExpression(current.parent)) {
    current = current.parent;
  }
  return current;
}

/** A relative specifier of a file that is not code. */
function nonCode(specifier: string): boolean {
  return (
    specifier.startsWith('.') && !CODE_EXTENSIONS.has(path.extname(specifier))
  );
}

/** Whether `node` is a name that refers to a binding (not a key, not a declaration). */
function isReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyAccessExpression(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  if (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent)
  ) {
    return false;
  }
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isQualifiedName(parent)) return false;
  return true;
}

/** The `.ts` source a relative import names, when it is one of `known`. */
function importedSource(
  from: string,
  specifier: string,
  known: ReadonlyMap<string, unknown>,
): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (known.has(candidate)) return candidate;
  }
  return undefined;
}

interface Parsed {
  file: string;
  source: ts.SourceFile;
}

/** Every location read of the production sources under `dirs`. */
export function locationReads(
  root: string,
  dirs: readonly string[],
): LocationReads {
  const byTarget = new Map<string, string>();
  const unstated: UnstatedRead[] = [];
  const parsed: Parsed[] = dirs
    .flatMap(productionSources)
    .sort()
    .map((file) => ({
      file,
      source: ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      ),
    }));
  /** Per source: its exported paths from `__dirname`, by name. */
  const exported = new Map<string, Map<string, string>>();
  for (const { file } of parsed) exported.set(file, new Map());

  const scannerOf = ({ file, source }: Parsed) => {
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
      unstated.push({ by, line: line + 1, why });
    };
    /** Every reference to `name` in this source. */
    const referencesTo = (name: string): ts.Identifier[] => {
      const found: ts.Identifier[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node.text === name && isReference(node)) {
          found.push(node);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    };
    /** `use` stands for the path `target`: follow it to what is read. */
    const follow = (use: ts.Node, target: string): void => {
      const node = outermost(use);
      const parent = node.parent;
      if (
        ts.isCallExpression(parent) &&
        parent.arguments[0] === node &&
        JOINS.has(calleeName(parent) ?? '')
      ) {
        const parts = literalParts(parent);
        if (parts !== undefined) {
          follow(parent, path.resolve(target, ...parts));
        } else if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
          read(target);
        } else {
          refuse(
            parent,
            `a computed part joined onto ${slashed(root, target)}, which is not a directory`,
          );
        }
        return;
      }
      if (
        (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
        parent.expression !== node &&
        (parent.arguments ?? []).some((argument) => argument === node)
      ) {
        read(target);
        return;
      }
      if (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === node &&
        ts.isIdentifier(parent.name)
      ) {
        const list = parent.parent;
        if (
          !ts.isVariableDeclarationList(list) ||
          (list.flags & ts.NodeFlags.Const) === 0
        ) {
          refuse(
            parent,
            'a path from __dirname bound by a non-const declaration',
          );
          return;
        }
        const name = parent.name.text;
        if (
          (ts.getCombinedModifierFlags(parent) & ts.ModifierFlags.Export) !==
          0
        ) {
          read(target);
          exported.get(file)?.set(name, target);
        }
        for (const reference of referencesTo(name)) follow(reference, target);
        return;
      }
      refuse(
        node,
        'a path from __dirname used where the scan cannot follow it',
      );
    };

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const first = node.arguments[0];
        const literal =
          node.arguments.length === 1 &&
          first !== undefined &&
          ts.isStringLiteralLike(first)
            ? first.text
            : undefined;
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          if (literal === undefined) {
            refuse(node, 'import() not called with one literal');
          } else if (nonCode(literal)) {
            read(path.resolve(here, literal));
          }
        }
      }
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        nonCode(node.moduleSpecifier.text)
      ) {
        read(path.resolve(here, node.moduleSpecifier.text));
      }
      if (
        ts.isMetaProperty(node) &&
        node.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        refuse(node, 'import.meta, a location the scan does not resolve');
      }
      // `createRequire` in any place — imported, renamed, read off `module`.
      if (ts.isIdentifier(node) && node.text === 'createRequire') {
        refuse(node, 'createRequire, a location the scan does not resolve');
      }
      if (ts.isIdentifier(node) && isReference(node)) {
        if (node.text === 'require') {
          const call = node.parent;
          const first = ts.isCallExpression(call)
            ? call.arguments[0]
            : undefined;
          if (
            !ts.isCallExpression(call) ||
            call.expression !== node ||
            call.arguments.length !== 1 ||
            first === undefined ||
            !ts.isStringLiteralLike(first)
          ) {
            refuse(node, 'require not called with one literal');
          } else if (nonCode(first.text)) {
            read(path.resolve(here, first.text));
          }
        } else if (node.text === '__filename') {
          refuse(node, '__filename, a location the scan does not resolve');
        } else if (node.text === '__dirname') {
          const call = node.parent;
          const parts =
            ts.isCallExpression(call) &&
            call.arguments[0] === node &&
            JOINS.has(calleeName(call) ?? '')
              ? literalParts(call)
              : undefined;
          if (parts === undefined || !ts.isCallExpression(call)) {
            refuse(node, '__dirname not joined with literal parts');
          } else {
            follow(call, path.resolve(here, ...parts));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    return {
      all: () => visit(source),
      imported: (names: ReadonlyMap<string, string>) => {
        for (const [name, target] of names) {
          for (const reference of referencesTo(name)) follow(reference, target);
        }
      },
    };
  };

  // First every source on its own, which finds the exported paths; then the
  // uses of those paths in the sources that import them.
  const scanners = parsed.map((one) => ({ one, scanner: scannerOf(one) }));
  for (const { scanner } of scanners) scanner.all();
  const known: ReadonlyMap<string, Map<string, string>> = new Map(
    [...exported].filter(([, names]) => names.size > 0),
  );
  for (const { one, scanner } of scanners) {
    const imported = new Map<string, string>();
    for (const statement of one.source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const from = importedSource(
        one.file,
        statement.moduleSpecifier.text,
        known,
      );
      const names = from === undefined ? undefined : known.get(from);
      if (names === undefined) continue;
      const bindings = statement.importClause?.namedBindings;
      if (
        statement.importClause?.name !== undefined ||
        (bindings !== undefined && !ts.isNamedImports(bindings))
      ) {
        const { line } = one.source.getLineAndCharacterOfPosition(
          statement.getStart(one.source),
        );
        unstated.push({
          by: slashed(root, one.file),
          line: line + 1,
          why: 'a module exporting a path from __dirname imported other than by name',
        });
        continue;
      }
      for (const element of bindings?.elements ?? []) {
        const target = names.get((element.propertyName ?? element.name).text);
        if (target !== undefined) imported.set(element.name.text, target);
      }
    }
    scanner.imported(imported);
  }
  return {
    targets: [...byTarget]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([target, reader]) => ({ target, by: reader })),
    // By source and line: the second pass's findings join the first's.
    unstated: unstated.sort((a, b) =>
      a.by === b.by ? a.line - b.line : a.by < b.by ? -1 : 1,
    ),
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
