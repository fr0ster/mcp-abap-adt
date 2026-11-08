/**
 * The files production code reads by its own location (D27, spec §2, "Files
 * production code reads beside itself"), found with the TypeScript type
 * checker over the production program: every callee and every reference is
 * resolved to its symbol (aliases, re-exports and `.js` specifiers through
 * the checker's own module resolution), never matched by its name.
 *
 * The location values are the globals `__dirname` (the source's directory)
 * and `__filename` (the source itself). A location value is followed to what
 * is read:
 * - the first argument of `node:path`'s `join` or `resolve` (the checker's
 *   `PlatformPath` members, `posix` and `win32` included): with literal
 *   parts, the path grows; a computed part is taken only when the checker
 *   bounds its type to string literals with no `..` segment and no absolute
 *   form (each literal followed in turn); under `resolve` no computed part
 *   is, since `resolve` restarts at an absolute one;
 * - an argument of a `node:fs` function (`fs`, `fs/promises`): read whole,
 *   its target; the source's own file or directory is refused (the test build
 *   holds the compiled one);
 * - the value of a `const`: every reference to its symbol, in every
 *   production source, is followed in turn; one exported (`export`, an
 *   `export { … }` or an `export default`) is a target too, served whole to
 *   code the scan does not see;
 * - the operand of `typeof`: nothing is read.
 * One use is the owner's exception (`isOwnerGranted`): `src/lib/instance.ts`'s
 * display-only `__filename`.
 * Every other use of a location value is refused, and so is every other way
 * to the module's own location: `module`, `import.meta`, `createRequire`, a
 * `require` not called with one literal, an `import()` not called with one,
 * `process.argv` read where it can name the program (anything but
 * `.includes(<literal>)`, `.slice(<n ≥ 2>)` and `[<n ≥ 2>]`),
 * `process.mainModule`, and `process` handed where the receiving type has an
 * `argv` or a `mainModule`. A `require`, `import()`, `import` or
 * `export … from` of a relative file that is not code is a target.
 *
 * The placement list (`tools/node-test-placed.json`) is what the node:test
 * build places beside the compiled code; `placementFindings` holds the two
 * against each other: a target is placed when it or a directory above it is
 * listed. Uses no test runner.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export const PLACED_LIST = 'tools/node-test-placed.json';

/** What a module specifier names as code; anything else is a file read. */
const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  '',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
]);

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
  /** Every use of a location whose target is not stated, by source and line. */
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
export function productionSources(dir: string): string[] {
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
  return found.sort();
}

function configOptions(file: string): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    file,
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
  if (parsed === undefined) throw new Error(`${file}: unread`);
  return parsed.options;
}

/**
 * The program the scan reads: `files` under the options of `config` (its
 * `paths` too, so a sibling package resolves to its source), nothing emitted.
 */
export function programOver(
  config: string,
  files: readonly string[],
): ts.Program {
  return ts.createProgram({
    rootNames: [...files],
    options: { ...configOptions(config), noEmit: true },
  });
}

/** The production program of `root`, over `tsconfig.test.json`'s options. */
export function productionProgram(root: string): {
  program: ts.Program;
  sources: string[];
} {
  const sources = productionSourceDirs(root).flatMap(productionSources);
  return {
    program: programOver(path.join(root, 'tsconfig.test.json'), sources),
    sources,
  };
}

/** A relative specifier of a file that is not code. */
function nonCode(specifier: string): boolean {
  return (
    specifier.startsWith('.') && !CODE_EXTENSIONS.has(path.extname(specifier))
  );
}

/** A part that can neither be absolute nor climb: no `..` segment. */
function boundedPart(part: string): boolean {
  if (path.posix.isAbsolute(part) || path.win32.isAbsolute(part)) return false;
  return part
    .split('/')
    .flatMap((piece) => piece.split('\\'))
    .every((segment) => segment !== '..');
}

/** The node a use stands for: parentheses and a `!` around it included. */
function outermost(node: ts.Node): ts.Node {
  let current = node;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent;
  }
  return current;
}

/** A numeric literal's value. */
function integerLiteral(node: ts.Node | undefined): number | undefined {
  return node !== undefined && ts.isNumericLiteral(node)
    ? Number(node.text)
    : undefined;
}

/** The symbols the scan resolves callees and references to. */
interface Known {
  join: ts.Symbol | undefined;
  resolve: ts.Symbol | undefined;
  fs: ReadonlySet<ts.Symbol>;
  createRequire: ReadonlySet<ts.Symbol>;
  dirname: ts.Symbol | undefined;
  filename: ts.Symbol | undefined;
  module: ts.Symbol | undefined;
  require: ts.Symbol | undefined;
  process: ts.Symbol | undefined;
}

function knownSymbols(checker: ts.TypeChecker): Known {
  const resolved = (symbol: ts.Symbol): ts.Symbol =>
    (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const ambient = new Map(
    checker.getAmbientModules().map((symbol) => [symbol.name, symbol]),
  );
  const exportsOf = (names: readonly string[]): ts.Symbol[] =>
    names.flatMap((name) => {
      const module = ambient.get(`"${name}"`);
      return module === undefined
        ? []
        : checker.getExportsOfModule(module).map(resolved);
    });
  const platform = exportsOf(['path', 'node:path']).find(
    (symbol) => symbol.name === 'PlatformPath',
  );
  const platformType =
    platform === undefined
      ? undefined
      : checker.getDeclaredTypeOfSymbol(platform);
  const createRequire = new Set<ts.Symbol>();
  for (const symbol of exportsOf(['module', 'node:module'])) {
    if (symbol.name === 'createRequire') createRequire.add(symbol);
    // `Module.createRequire`, the class's static member.
    const member = checker.getTypeOfSymbol(symbol).getProperty('createRequire');
    if (member !== undefined) createRequire.add(member);
  }
  const global = (name: string) =>
    checker.resolveName(name, undefined, ts.SymbolFlags.Value, false);
  return {
    join: platformType?.getProperty('join'),
    resolve: platformType?.getProperty('resolve'),
    fs: new Set(
      exportsOf(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']),
    ),
    createRequire,
    dirname: global('__dirname'),
    filename: global('__filename'),
    module: global('module'),
    require: global('require'),
    process: global('process'),
  };
}

/**
 * The one use of a location the owner granted, by its file and its shape:
 * `typeof __filename === 'string' ? __filename : 'bundled'` in
 * `src/lib/instance.ts`. Owner-approved: the display-only location of a
 * second library copy, shown in the two-copies refusal
 * (`server-runtime/src/secondCopy.ts`) and never resolved or read. Any other
 * use of a location in that file, and this shape in any other file, stays a
 * finding.
 */
export const OWNER_GRANTED_FILE = 'src/lib/instance.ts';

export const WHY = {
  computedUnbounded: (base: string) =>
    `a computed part on ${base} the checker cannot bound to parts that stay under it`,
  computedResolve: 'a computed part under path.resolve',
  ownFile:
    'reads its own source or directory, which the test build holds compiled',
  unfollowed: 'a location used where the scan cannot follow it',
  call: 'a location passed to a call the scan does not follow',
  binding: 'a location bound other than by a const name',
  module: 'module, a location the scan does not resolve',
  importMeta: 'import.meta, a location the scan does not resolve',
  createRequire: 'createRequire, a location the scan does not resolve',
  require: 'require not called with one literal',
  importCall: 'import() not called with one literal',
  argv: 'process.argv read where it can name the program',
  mainModule: 'process.mainModule, a location the scan does not resolve',
  process: 'process handed where its argv or mainModule can be read',
} as const;

/** Every location read of `sources`, read through `program`'s checker. */
export function locationReads(
  root: string,
  program: ts.Program,
  sources: readonly string[],
): LocationReads {
  const checker = program.getTypeChecker();
  const symbols = knownSymbols(checker);
  const byTarget = new Map<string, string>();
  const unstated: UnstatedRead[] = [];
  const parsed = [...sources].sort().map((file) => {
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`${file}: not in the program`);
    return source;
  });
  const scanned: ReadonlySet<ts.SourceFile> = new Set(parsed);

  const resolved = (symbol: ts.Symbol | undefined): ts.Symbol | undefined =>
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  /** The symbol an identifier refers to, its alias resolved. */
  const symbolOf = (node: ts.Identifier): ts.Symbol | undefined =>
    resolved(
      ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node),
    );
  /** The callee's symbol, its alias resolved. */
  const calleeOf = (call: ts.CallExpression): ts.Symbol | undefined => {
    const callee = call.expression;
    if (ts.isIdentifier(callee)) return symbolOf(callee);
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
      return symbolOf(callee.name);
    }
    return undefined;
  };

  // Every identifier of the production sources by the symbol it refers to.
  const references = new Map<ts.Symbol, ts.Identifier[]>();
  for (const source of parsed) {
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const symbol = symbolOf(node);
        if (symbol !== undefined) {
          const list = references.get(symbol);
          if (list === undefined) references.set(symbol, [node]);
          else list.push(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const referencesTo = (symbol: ts.Symbol | undefined): ts.Identifier[] =>
    symbol === undefined ? [] : (references.get(symbol) ?? []);

  const refuse = (node: ts.Node, why: string) => {
    const source = node.getSourceFile();
    const { line } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    unstated.push({ by: slashed(root, source.fileName), line: line + 1, why });
  };
  const read = (node: ts.Node, target: string) => {
    const file = path.resolve(node.getSourceFile().fileName);
    if (target === file || target === path.dirname(file)) {
      refuse(node, WHY.ownFile);
      return;
    }
    const relative = slashed(root, target);
    const by = slashed(root, file);
    const earlier = byTarget.get(relative);
    if (earlier === undefined || by < earlier) byTarget.set(relative, by);
  };

  /** The string literals the checker bounds `node` to, or none. */
  const literalsOf = (node: ts.Expression): string[] | undefined => {
    if (ts.isStringLiteralLike(node)) return [node.text];
    const type = checker.getTypeAtLocation(node);
    const members = type.isUnion() ? type.types : [type];
    const values: string[] = [];
    for (const member of members) {
      if (!member.isStringLiteral()) return undefined;
      values.push(member.value);
    }
    return values;
  };

  /** Whether `node` is the owner's exception (`OWNER_GRANTED_FILE`). */
  const isOwnerGranted = (node: ts.Node): boolean => {
    if (slashed(root, node.getSourceFile().fileName) !== OWNER_GRANTED_FILE) {
      return false;
    }
    const isFilename = (expression: ts.Expression) =>
      ts.isIdentifier(expression) && symbolOf(expression) === symbols.filename;
    const choice = node.parent;
    if (
      !ts.isIdentifier(node) ||
      !isFilename(node) ||
      !ts.isConditionalExpression(choice) ||
      choice.whenTrue !== node
    ) {
      return false;
    }
    const test = choice.condition;
    return (
      ts.isBinaryExpression(test) &&
      test.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isTypeOfExpression(test.left) &&
      isFilename(test.left.expression) &&
      ts.isStringLiteral(test.right) &&
      test.right.text === 'string' &&
      ts.isStringLiteral(choice.whenFalse) &&
      choice.whenFalse.text === 'bundled'
    );
  };

  /** `use` holds the location `target`: follow it to what is read. */
  const follow = (
    use: ts.Node,
    target: string,
    seen: ReadonlySet<ts.Symbol>,
  ): void => {
    const node = outermost(use);
    const parent = node.parent;
    if (ts.isTypeOfExpression(parent)) return;
    if (ts.isCallExpression(parent) && parent.expression !== node) {
      const callee = calleeOf(parent);
      const isJoin = callee !== undefined && callee === symbols.join;
      const isResolve = callee !== undefined && callee === symbols.resolve;
      if ((isJoin || isResolve) && parent.arguments[0] === node) {
        let combinations: string[][] = [[]];
        for (const argument of parent.arguments.slice(1)) {
          const literal = ts.isStringLiteralLike(argument);
          if (!literal && isResolve) {
            refuse(argument, WHY.computedResolve);
            return;
          }
          const values = literalsOf(argument);
          if (
            values === undefined ||
            (!literal && !values.every((value) => boundedPart(value)))
          ) {
            refuse(argument, WHY.computedUnbounded(slashed(root, target)));
            return;
          }
          combinations = combinations.flatMap((parts) =>
            values.map((value) => [...parts, value]),
          );
        }
        for (const parts of combinations) {
          follow(
            parent,
            isJoin
              ? path.resolve(path.join(target, ...parts))
              : path.resolve(target, ...parts),
            seen,
          );
        }
        return;
      }
      if (
        callee !== undefined &&
        symbols.fs.has(callee) &&
        parent.arguments.some((argument) => argument === node)
      ) {
        read(parent, target);
        return;
      }
      refuse(node, WHY.call);
      return;
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
      const list = parent.parent;
      if (
        !ts.isIdentifier(parent.name) ||
        !ts.isVariableDeclarationList(list) ||
        (list.flags & ts.NodeFlags.Const) === 0
      ) {
        refuse(parent, WHY.binding);
        return;
      }
      const symbol = checker.getSymbolAtLocation(parent.name);
      if (symbol === undefined || seen.has(symbol)) return;
      const next = new Set(seen).add(symbol);
      if (
        (ts.getCombinedModifierFlags(parent) & ts.ModifierFlags.Export) !==
        0
      ) {
        read(parent, target);
      }
      for (const reference of referencesTo(symbol)) {
        if (reference === parent.name) continue;
        const at = reference.parent;
        if (
          ts.isImportSpecifier(at) ||
          ts.isImportClause(at) ||
          ts.isNamespaceImport(at) ||
          ts.isImportEqualsDeclaration(at)
        ) {
          continue;
        }
        if (ts.isExportSpecifier(at) || ts.isExportAssignment(at)) {
          read(at, target);
          continue;
        }
        // `m.NAME` through a namespace import: the access holds the value.
        follow(
          ts.isPropertyAccessExpression(at) && at.name === reference
            ? at
            : reference,
          target,
          next,
        );
      }
      return;
    }
    if (isOwnerGranted(node)) return;
    refuse(node, WHY.unfollowed);
  };

  /** Whether `node` reaches a type with no `argv` and no `mainModule`. */
  const processContained = (node: ts.Node): boolean => {
    if (!ts.isExpression(node)) return false;
    const type = checker.getContextualType(node);
    if (type === undefined) return false;
    const members = type.isUnion() ? type.types : [type];
    return members.every(
      (member) =>
        (member.flags &
          (ts.TypeFlags.Any |
            ts.TypeFlags.Unknown |
            ts.TypeFlags.TypeParameter)) ===
          0 &&
        member.getProperty('argv') === undefined &&
        member.getProperty('mainModule') === undefined,
    );
  };

  const processUse = (reference: ts.Identifier): void => {
    const at = reference.parent;
    if (!ts.isPropertyAccessExpression(at) || at.expression !== reference) {
      if (!processContained(outermost(reference))) {
        refuse(reference, WHY.process);
      }
      return;
    }
    if (at.name.text === 'mainModule') {
      refuse(at, WHY.mainModule);
      return;
    }
    if (at.name.text !== 'argv') return;
    const use = at.parent;
    if (ts.isElementAccessExpression(use) && use.expression === at) {
      const index = integerLiteral(use.argumentExpression);
      if (index === undefined || index < 2) refuse(use, WHY.argv);
      return;
    }
    if (
      ts.isPropertyAccessExpression(use) &&
      use.expression === at &&
      ts.isCallExpression(use.parent) &&
      use.parent.expression === use
    ) {
      const call = use.parent;
      const first = call.arguments[0];
      if (call.arguments.length === 1 && first !== undefined) {
        if (use.name.text === 'includes' && ts.isStringLiteralLike(first)) {
          return;
        }
        const from = integerLiteral(first);
        if (use.name.text === 'slice' && from !== undefined && from >= 2) {
          return;
        }
      }
    }
    refuse(at, WHY.argv);
  };

  for (const source of parsed) {
    const here = path.dirname(path.resolve(source.fileName));
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        nonCode(node.moduleSpecifier.text)
      ) {
        read(node, path.resolve(here, node.moduleSpecifier.text));
      }
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression) &&
        nonCode(node.moduleReference.expression.text)
      ) {
        read(node, path.resolve(here, node.moduleReference.expression.text));
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const first = node.arguments[0];
        if (
          node.arguments.length !== 1 ||
          first === undefined ||
          !ts.isStringLiteralLike(first)
        ) {
          refuse(node, WHY.importCall);
        } else if (nonCode(first.text)) {
          read(node, path.resolve(here, first.text));
        }
      }
      if (
        ts.isMetaProperty(node) &&
        node.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        refuse(node, WHY.importMeta);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const ofScan = (references: ts.Identifier[]) =>
    references.filter((reference) => scanned.has(reference.getSourceFile()));
  for (const reference of ofScan(referencesTo(symbols.dirname))) {
    follow(
      reference,
      path.dirname(path.resolve(reference.getSourceFile().fileName)),
      new Set(),
    );
  }
  for (const reference of ofScan(referencesTo(symbols.filename))) {
    follow(
      reference,
      path.resolve(reference.getSourceFile().fileName),
      new Set(),
    );
  }
  for (const reference of referencesTo(symbols.module)) {
    refuse(reference, WHY.module);
  }
  for (const symbol of symbols.createRequire) {
    for (const reference of referencesTo(symbol)) {
      refuse(reference, WHY.createRequire);
    }
  }
  for (const reference of referencesTo(symbols.require)) {
    const call = reference.parent;
    const first = ts.isCallExpression(call) ? call.arguments[0] : undefined;
    if (
      !ts.isCallExpression(call) ||
      call.expression !== reference ||
      call.arguments.length !== 1 ||
      first === undefined ||
      !ts.isStringLiteralLike(first)
    ) {
      refuse(reference, WHY.require);
    } else if (nonCode(first.text)) {
      read(
        call,
        path.resolve(
          path.dirname(path.resolve(call.getSourceFile().fileName)),
          first.text,
        ),
      );
    }
  }
  for (const reference of referencesTo(symbols.process)) {
    processUse(reference);
  }

  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    targets: [...byTarget]
      .sort(([a], [b]) => order(a, b))
      .map(([target, reader]) => ({ target, by: reader })),
    unstated: unstated.sort(
      (a, b) => order(a.by, b.by) || a.line - b.line || order(a.why, b.why),
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

/** Whether `target` is `entry` or under it. */
function covers(entry: string, target: string): boolean {
  return target === entry || target.startsWith(`${entry}/`);
}

/**
 * A finding for every read the list does not place and every entry no read
 * needs: the list places exactly what production code reads, a directory
 * placing everything under it.
 */
export function placementFindings(
  reads: LocationReads,
  placed: readonly string[],
): string[] {
  return [
    ...reads.targets
      .filter((read) => !placed.some((entry) => covers(entry, read.target)))
      .map((read) => `${read.target}: read by ${read.by}, not placed`),
    ...placed
      .filter(
        (entry) => !reads.targets.some((read) => covers(entry, read.target)),
      )
      .map((entry) => `${entry}: placed, read by no production code`),
  ];
}
