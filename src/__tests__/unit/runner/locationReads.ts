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
 *   production source, is followed in turn — by name, or as a namespace's
 *   member (`m.NAME`, `m['NAME']`, the checker's property of the namespace
 *   type); one exported (`export`, an `export { … }` or an
 *   `export default`) is a target too, served whole to code the scan does
 *   not see; a module exporting one, used other than for a literal member
 *   (a computed key, passed whole, destructured) or loaded by `require` /
 *   `import()`, is refused;
 * - the operand of `typeof`: nothing is read.
 * Every other use of a location value is refused, and so is every other way
 * to the module's own location: `module`, `import.meta`, `createRequire`, a
 * `require` not called with one literal, an `import()` not called with one,
 * a `require` / `import()` of `module`, `node:module`, `process` or
 * `node:process`, and the members of `process` that name the program, by
 * symbol however they are reached (the global, a default, namespace or named
 * import of `node:process`, a re-export, a literal key): `argv` read where it
 * can name the executable or the script (anything but `.includes(<literal>)`,
 * `.slice(<n ≥ 2>)` and `[<n ≥ 2>]`) and `mainModule`; and `process` used
 * other than for a named member (assigned, passed, spread, returned, given
 * to `Reflect` or `Object`, read by a computed key). `execPath`
 * and `argv0` name the Node executable, `cwd()` the working directory: none
 * is the module's location in the repository, so none is refused. A `require`, `import()`, `import` or
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
  /** The global `process`, and the `process` / `node:process` modules. */
  process: ReadonlySet<ts.Symbol>;
  /** `process.argv` and `process.mainModule`, the members naming the program. */
  argv: ts.Symbol | undefined;
  mainModule: ts.Symbol | undefined;
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
  const processGlobal = global('process');
  const processType =
    processGlobal === undefined
      ? undefined
      : checker.getTypeOfSymbol(processGlobal);
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
    process: new Set(
      [
        processGlobal,
        ambient.get('"process"'),
        ambient.get('"node:process"'),
      ].flatMap((symbol) => (symbol === undefined ? [] : [symbol])),
    ),
    argv: processType?.getProperty('argv'),
    mainModule: processType?.getProperty('mainModule'),
  };
}

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
  process: 'process used other than for a named member',
  moduleWhole:
    'a module exporting a location used other than by a literal member',
  builtinRequire: 'node:process or node:module loaded by require or import()',
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

  /** The member an element access with a literal key reads, its alias resolved. */
  const memberOf = (
    access: ts.ElementAccessExpression,
  ): ts.Symbol | undefined =>
    ts.isStringLiteralLike(access.argumentExpression)
      ? resolved(
          checker
            .getTypeAtLocation(access.expression)
            .getProperty(access.argumentExpression.text),
        )
      : undefined;

  // Every identifier of the production sources, and every element access
  // with a literal key, by the symbol it refers to.
  const references = new Map<ts.Symbol, ts.Node[]>();
  for (const source of parsed) {
    const visit = (node: ts.Node): void => {
      const symbol = ts.isIdentifier(node)
        ? symbolOf(node)
        : ts.isElementAccessExpression(node)
          ? memberOf(node)
          : undefined;
      if (symbol !== undefined) {
        const list = references.get(symbol);
        if (list === undefined) references.set(symbol, [node]);
        else list.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const referencesTo = (symbol: ts.Symbol | undefined): ts.Node[] =>
    symbol === undefined ? [] : (references.get(symbol) ?? []);

  /** Whether `node` names what an import, an export or a declaration binds. */
  const declares = (node: ts.Node): boolean => {
    const at = node.parent;
    return (
      ts.isImportSpecifier(at) ||
      ts.isImportClause(at) ||
      ts.isNamespaceImport(at) ||
      ts.isNamespaceExport(at) ||
      ts.isExportSpecifier(at) ||
      (ts.isImportEqualsDeclaration(at) && at.name === node)
    );
  };
  /** The node holding a referenced value: `m.NAME` for its name, else itself. */
  const valueAt = (reference: ts.Node): ts.Node => {
    const at = reference.parent;
    return ts.isPropertyAccessExpression(at) && at.name === reference
      ? at
      : reference;
  };
  /** Whether `node` is only read for a member: `node.x` or `node['x']`. */
  const memberRead = (node: ts.Node): boolean => {
    const at = node.parent;
    return (
      (ts.isPropertyAccessExpression(at) && at.expression === node) ||
      (ts.isElementAccessExpression(at) &&
        at.expression === node &&
        ts.isStringLiteralLike(at.argumentExpression))
    );
  };
  /** The const location bindings found, the exported among them. */
  const locations = new Set<ts.Symbol>();

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
      locations.add(symbol);
      if (
        (ts.getCombinedModifierFlags(parent) & ts.ModifierFlags.Export) !==
        0
      ) {
        read(parent, target);
      }
      for (const reference of referencesTo(symbol)) {
        if (reference === parent.name) continue;
        const at = reference.parent;
        if (ts.isExportSpecifier(at) || ts.isExportAssignment(at)) {
          read(at, target);
          continue;
        }
        if (declares(reference)) continue;
        // `m.NAME` or `m['NAME']` through a namespace: the access holds it.
        follow(valueAt(reference), target, next);
      }
      return;
    }
    refuse(node, WHY.unfollowed);
  };

  /**
   * A value of `process` (the global or a module): only a named member is
   * read (`process.x`, `process['x']`; `argv` and `mainModule` are judged by
   * their own symbols). Anywhere else — assigned, passed, spread, returned,
   * given to `Reflect` or `Object`, read by a computed key — it is refused.
   */
  const processUse = (reference: ts.Node): void => {
    if (declares(reference) || memberRead(reference)) return;
    refuse(reference, WHY.process);
  };

  /** `argv`, however reached: only past the executable and the script. */
  const argvUse = (reference: ts.Node): void => {
    if (declares(reference)) return;
    const at = outermost(valueAt(reference));
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

  /** The module a relative or package specifier of `from` names, if any. */
  const moduleNamed = (
    specifier: string,
    from: ts.SourceFile,
  ): ts.Symbol | undefined => {
    const file = ts.resolveModuleName(
      specifier,
      from.fileName,
      program.getCompilerOptions(),
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    const source = file === undefined ? undefined : program.getSourceFile(file);
    return source === undefined
      ? undefined
      : checker.getSymbolAtLocation(source);
  };
  /** `require` / `import()` of a builtin that reaches the program's location. */
  const BUILTINS: ReadonlySet<string> = new Set([
    'module',
    'node:module',
    'process',
    'node:process',
  ]);
  /** Module loads by a literal, checked once the locations are known. */
  const loads: { node: ts.Node; specifier: string }[] = [];

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
        } else {
          loads.push({ node, specifier: first.text });
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

  const ofScan = (references: ts.Node[]) =>
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
    } else {
      loads.push({ node: call, specifier: first.text });
    }
  }
  for (const symbol of symbols.process) {
    for (const reference of referencesTo(symbol)) processUse(reference);
  }
  for (const reference of referencesTo(symbols.argv)) argvUse(reference);
  for (const reference of referencesTo(symbols.mainModule)) {
    if (!declares(reference)) refuse(valueAt(reference), WHY.mainModule);
  }

  // A module exporting a location, used whole: by its namespace other than
  // for a literal member, or loaded by `require` / `import()`.
  const locationModules = new Set<ts.Symbol>();
  for (const source of program.getSourceFiles()) {
    const module = checker.getSymbolAtLocation(source);
    if (
      module !== undefined &&
      checker.getExportsOfModule(module).some((member) => {
        const target = resolved(member);
        return target !== undefined && locations.has(target);
      })
    ) {
      locationModules.add(module);
    }
  }
  for (const module of locationModules) {
    for (const reference of referencesTo(module)) {
      if (!declares(reference) && !memberRead(reference)) {
        refuse(reference, WHY.moduleWhole);
      }
    }
  }
  for (const { node, specifier } of loads) {
    if (BUILTINS.has(specifier)) {
      refuse(node, WHY.builtinRequire);
      continue;
    }
    const module = moduleNamed(specifier, node.getSourceFile());
    if (module !== undefined && locationModules.has(module)) {
      refuse(node, WHY.moduleWhole);
    }
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
