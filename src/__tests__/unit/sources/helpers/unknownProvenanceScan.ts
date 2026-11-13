/**
 * The `unknown` audit (spec §4): where every value written `unknown` in
 * production code comes from, decided by the compiler, site by site.
 *
 * A site is a parameter, a variable, a function's return or a property whose
 * declared type is `unknown`. Its sources are found in the program: a
 * parameter's arguments at every call resolved to its function (or to the
 * contract member that function implements), a variable's initializer and
 * assignments, a function's return expressions, a property's writers (object
 * literals contextually typed by its owner, assignments, initializers).
 *
 * Each source is typed with the type checker. A source that is itself an
 * `unknown` site (or a value of no contract: `Record<string, unknown>`,
 * `unknown[]`) is followed back to that one's sources, so an internal value
 * laundered through an `unknown` is seen. A boundary is decided by origin, not
 * by type: a `catch` binding, `JSON.parse`, `process.env`, a file read, a DOM
 * node of the XML parser, a value a third-party declaration types `unknown`.
 *
 * Classes: `boundary` (every source a boundary), `typed` (every source a
 * contract-typed value of the repository), `mixed` (both), `sink` (a member of
 * a contract named in `SINK_CONTRACTS`), `callback` (a function no code of the
 * repository calls, whose contract types the parameter `unknown`), `entry`
 * (a function nothing in the program calls or hands on). `typed` and `mixed`
 * are refused, and so is a callback whose contract types the parameter.
 *
 * Report mode (`npm run measure:unknown`) runs this file after the node:test
 * build and lists every refused site with the types that reach it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, rel } from './failureScan';

/**
 * Contracts whose members take a value of any type by design: a site in a
 * function that implements one of them is a sink. Named by contract, not by
 * site.
 */
export const SINK_CONTRACTS: readonly string[] = ['ILogger'];

export type SiteKind = 'parameter' | 'variable' | 'return' | 'property';
export type SiteClass =
  | 'boundary'
  | 'typed'
  | 'mixed'
  | 'sink'
  | 'callback'
  | 'entry';

export interface UnknownSite {
  readonly kind: SiteKind;
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  readonly name: string;
  readonly cls: SiteClass;
  /** The static types of the typed sources that reach it. */
  readonly types: readonly string[];
  readonly refused: boolean;
}

type Origin = { readonly typed: string } | 'boundary' | 'opaque';

type Declaration =
  | ts.ParameterDeclaration
  | ts.VariableDeclaration
  | ts.SignatureDeclaration
  | ts.PropertySignature
  | ts.PropertyDeclaration;

const DOM_TYPES = new Set([
  'Element',
  'Node',
  'Document',
  'Attr',
  'ChildNode',
  'ParentNode',
]);

const FILE_READS = new Set(['readFileSync', 'readFile']);

function external(node: ts.Node): boolean {
  const file = node.getSourceFile();
  return (
    file.isDeclarationFile && !file.fileName.startsWith(path.join(REPO, 'src'))
  );
}

function lineOf(node: ts.Node): string {
  const file = node.getSourceFile();
  const at = file.getLineAndCharacterOfPosition(node.getStart());
  return `${rel(file.fileName)}:${at.line + 1}`;
}

function strip(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isAwaitExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function nameOf(node: ts.Node): string {
  if (
    (ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText();
  }
  return '(anonymous)';
}

function isUnknownNode(type: ts.TypeNode | undefined): boolean {
  return type !== undefined && type.kind === ts.SyntaxKind.UnknownKeyword;
}

function hasBody(node: ts.SignatureDeclaration): boolean {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)) &&
    node.body !== undefined
  );
}

export class ProvenanceScan {
  private readonly checker: ts.TypeChecker;
  /** Declaration (a function or a contract member) → argument lists. */
  private readonly calls = new Map<ts.Node, ts.NodeArray<ts.Expression>[]>();
  /** Declaration (a variable or a property) → the expressions written to it. */
  private readonly writes = new Map<ts.Node, ts.Expression[]>();
  /** Functions handed on as a value (an argument, an initializer, a member). */
  private readonly handedOn = new Set<ts.Node>();
  private readonly memo = new Map<ts.Node, readonly Origin[]>();
  private readonly active = new Set<ts.Node>();

  constructor(program: ts.Program, own: (file: ts.SourceFile) => boolean) {
    this.checker = program.getTypeChecker();
    for (const file of program.getSourceFiles()) {
      if (own(file)) this.index(file);
    }
  }

  private push<V>(map: Map<ts.Node, V[]>, key: ts.Node, value: V): void {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  }

  private declarationsOf(symbol: ts.Symbol | undefined): readonly ts.Node[] {
    if (!symbol) return [];
    const target =
      symbol.flags & ts.SymbolFlags.Alias
        ? this.checker.getAliasedSymbol(symbol)
        : symbol;
    return target.declarations ?? [];
  }

  private index(file: ts.SourceFile): void {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const declaration =
          this.checker.getResolvedSignature(node)?.declaration;
        if (declaration && node.arguments) {
          this.push(this.calls, declaration, node.arguments);
        }
        for (const argument of node.arguments ?? []) this.handOn(argument);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        for (const declaration of this.declarationsOf(
          this.checker.getSymbolAtLocation(node.left),
        )) {
          this.push(this.writes, declaration, node.right);
        }
        this.handOn(node.right);
      }
      if (ts.isObjectLiteralExpression(node)) this.indexLiteral(node);
      if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
        this.handOn(node.initializer);
      }
      if (ts.isReturnStatement(node)) this.handOn(node.expression);
      if (ts.isExportAssignment(node)) this.handOn(node.expression);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  private handOn(expression: ts.Expression | undefined): void {
    if (!expression) return;
    const inner = strip(expression);
    if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) {
      this.handedOn.add(inner);
      return;
    }
    if (ts.isIdentifier(inner) || ts.isPropertyAccessExpression(inner)) {
      for (const declaration of this.declarationsOf(
        this.checker.getSymbolAtLocation(inner),
      )) {
        this.handedOn.add(declaration);
      }
    }
  }

  private indexLiteral(literal: ts.ObjectLiteralExpression): void {
    const contextual = this.checker.getContextualType(literal);
    if (!contextual) return;
    const owners = contextual.isUnion() ? contextual.types : [contextual];
    for (const element of literal.properties) {
      if (
        !(
          ts.isPropertyAssignment(element) ||
          ts.isShorthandPropertyAssignment(element) ||
          ts.isMethodDeclaration(element)
        )
      ) {
        continue;
      }
      const key = element.name.getText();
      for (const owner of owners) {
        const member = this.checker.getPropertyOfType(owner, key);
        for (const declaration of member?.declarations ?? []) {
          if (ts.isPropertyAssignment(element)) {
            this.push(this.writes, declaration, element.initializer);
          } else if (ts.isShorthandPropertyAssignment(element)) {
            this.push(this.writes, declaration, element.name);
          }
        }
      }
      if (ts.isPropertyAssignment(element)) this.handOn(element.initializer);
      if (ts.isMethodDeclaration(element)) this.handedOn.add(element);
    }
  }

  /** Every `unknown` site declared in `file`. */
  sitesOf(file: ts.SourceFile): UnknownSite[] {
    const out: UnknownSite[] = [];
    const visit = (node: ts.Node): void => {
      const kind = this.siteKind(node);
      if (kind) out.push(this.decide(node, kind));
      ts.forEachChild(node, visit);
    };
    visit(file);
    return out;
  }

  private siteKind(node: ts.Node): SiteKind | undefined {
    if (ts.isParameter(node) && isUnknownNode(node.type)) {
      return hasBody(node.parent) ? 'parameter' : undefined;
    }
    if (
      ts.isVariableDeclaration(node) &&
      isUnknownNode(node.type) &&
      !ts.isCatchClause(node.parent)
    ) {
      return 'variable';
    }
    if (ts.isFunctionLike(node) && isUnknownNode(node.type) && hasBody(node)) {
      return 'return';
    }
    if (
      (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) &&
      isUnknownNode(node.type)
    ) {
      return 'property';
    }
    return undefined;
  }

  private decide(node: ts.Node, kind: SiteKind): UnknownSite {
    const origins = this.originsOfSite(node);
    const types = [
      ...new Set(
        origins.flatMap((origin) =>
          typeof origin === 'object' ? [origin.typed] : [],
        ),
      ),
    ].sort();
    const hasBoundary = origins.some((origin) => typeof origin !== 'object');
    let cls: SiteClass;
    let refused: boolean;
    if (types.length > 0 && this.inSinkContract(node)) {
      cls = 'sink';
      refused = false;
    } else if (types.length > 0) {
      cls = hasBoundary ? 'mixed' : 'typed';
      refused = true;
    } else if (kind === 'parameter' && origins.length === 0) {
      const contract = this.callbackContract(node);
      cls = contract === undefined ? 'entry' : 'callback';
      refused = contract !== undefined && contract !== 'open';
      if (refused && contract !== undefined && contract !== 'open') {
        types.push(contract);
      }
    } else {
      cls = 'boundary';
      refused = false;
    }
    return {
      kind,
      where: lineOf(node),
      name: nameOf(node),
      cls,
      types,
      refused,
    };
  }

  /** The function a parameter belongs to and the parameter's index. */
  private parameterPlace(
    node: ts.Node,
  ): { fn: ts.SignatureDeclaration; at: number } | undefined {
    if (!ts.isParameter(node) || !ts.isFunctionLike(node.parent)) {
      return undefined;
    }
    return { fn: node.parent, at: node.parent.parameters.indexOf(node) };
  }

  /** The function and every contract member it implements. */
  private aliasesOf(fn: ts.SignatureDeclaration): ts.Node[] {
    const out: ts.Node[] = [fn];
    const name = fn.name?.getText();
    if (name && ts.isClassLike(fn.parent)) {
      for (const clause of fn.parent.heritageClauses ?? []) {
        for (const heritage of clause.types) {
          const base = this.checker.getTypeAtLocation(heritage);
          const member = this.checker.getPropertyOfType(base, name);
          out.push(...(member?.declarations ?? []));
        }
      }
    }
    if (name && ts.isObjectLiteralExpression(fn.parent)) {
      const contextual = this.checker.getContextualType(fn.parent);
      const member = contextual
        ? this.checker.getPropertyOfType(contextual, name)
        : undefined;
      out.push(...(member?.declarations ?? []));
    }
    if (
      ts.isVariableDeclaration(fn.parent) ||
      ts.isPropertyAssignment(fn.parent)
    ) {
      for (const declaration of this.declarationsOf(
        this.checker.getSymbolAtLocation(fn.parent.name),
      )) {
        out.push(declaration);
      }
    }
    return out;
  }

  /** The names of the interfaces and types a function's aliases belong to. */
  private inSinkContract(node: ts.Node): boolean {
    const fn = ts.isFunctionLike(node) ? node : this.parameterPlace(node)?.fn;
    if (!fn) return false;
    for (const alias of this.aliasesOf(fn)) {
      if (alias === fn) continue;
      const owner = alias.parent;
      if (
        (ts.isInterfaceDeclaration(owner) || ts.isClassDeclaration(owner)) &&
        owner.name &&
        SINK_CONTRACTS.includes(owner.name.text)
      ) {
        return true;
      }
      if (
        ts.isTypeLiteralNode(owner) &&
        ts.isTypeAliasDeclaration(owner.parent) &&
        SINK_CONTRACTS.includes(owner.parent.name.text)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * A parameter no code of the repository passes: `'open'` when the
   * contract that calls it types it `unknown` or `any`, that type's text when
   * the contract types it, `undefined` when nothing hands the function on.
   */
  private callbackContract(node: ts.Node): string | undefined {
    const place = this.parameterPlace(node);
    if (!place) return undefined;
    const { fn, at } = place;
    const contextual =
      ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)
        ? this.checker.getContextualType(fn)
        : undefined;
    const signature = contextual?.getCallSignatures()[0];
    if (signature) {
      const parameter = signature.parameters[at];
      if (!parameter) return 'open';
      const type = this.checker.getTypeOfSymbol(parameter);
      return type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)
        ? 'open'
        : this.checker.typeToString(type);
    }
    const handed =
      this.handedOn.has(fn) ||
      this.aliasesOf(fn).some(
        (alias) => alias !== fn && this.handedOn.has(alias),
      );
    return handed || this.aliasesOf(fn).length > 1 ? 'open' : undefined;
  }

  private sourcesOf(node: ts.Node): ts.Expression[] {
    const place = this.parameterPlace(node);
    if (place) {
      const out: ts.Expression[] = [];
      for (const alias of this.aliasesOf(place.fn)) {
        for (const args of this.calls.get(alias) ?? []) {
          const argument = args[place.at];
          if (argument && !ts.isSpreadElement(argument)) out.push(argument);
        }
      }
      return out;
    }
    if (ts.isFunctionLike(node)) return this.returnsOf(node);
    const out = [...(this.writes.get(node) ?? [])];
    if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      node.initializer
    ) {
      out.push(node.initializer);
    }
    return out;
  }

  private returnsOf(fn: ts.SignatureDeclaration): ts.Expression[] {
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
    const out: ts.Expression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionLike(node) && node !== fn) return;
      if (ts.isReturnStatement(node) && node.expression) {
        out.push(node.expression);
      }
      ts.forEachChild(node, visit);
    };
    visit(fn);
    return out;
  }

  private originsOfSite(node: ts.Node): readonly Origin[] {
    const known = this.memo.get(node);
    if (known) return known;
    if (this.active.has(node)) return [];
    this.active.add(node);
    const origins = this.sourcesOf(node).flatMap((source) =>
      this.originsOf(source),
    );
    this.active.delete(node);
    this.memo.set(node, origins);
    return origins;
  }

  /** No contract beyond "a value": unknown, any, or a bag of them. */
  private contractless(type: ts.Type): boolean {
    if (type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return true;
    if (type.flags & ts.TypeFlags.TypeParameter) {
      const constraint = this.checker.getBaseConstraintOfType(type);
      return constraint === undefined || this.contractless(constraint);
    }
    if (type.isUnion()) return type.types.some((t) => this.contractless(t));
    if (this.checker.isArrayType(type)) {
      const element = this.checker.getIndexTypeOfType(
        type,
        ts.IndexKind.Number,
      );
      return element !== undefined && this.contractless(element);
    }
    if (type.getProperties().length > 0 || type.getCallSignatures().length) {
      return false;
    }
    const index = this.checker.getIndexInfosOfType(type);
    return (
      index.length > 0 && index.every((info) => this.contractless(info.type))
    );
  }

  /** `undefined`, `null` or `void` alone: no value, so no origin. */
  private absent(type: ts.Type): boolean {
    const parts = type.isUnion() ? type.types : [type];
    return parts.every(
      (part) =>
        (part.flags &
          (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) !==
        0,
    );
  }

  /**
   * A name whose declared type has no contract, whatever plain code narrowed
   * it to here (`typeof`, `instanceof`, `!== null`): its origin is where the
   * declared value came from.
   */
  private declaredContractless(expression: ts.Expression): boolean {
    if (
      !ts.isIdentifier(expression) &&
      !ts.isPropertyAccessExpression(expression)
    ) {
      return false;
    }
    const symbol = this.checker.getSymbolAtLocation(expression);
    if (!symbol?.valueDeclaration) return false;
    return this.contractless(this.checker.getTypeOfSymbol(symbol));
  }

  private dom(type: ts.Type): boolean {
    const name = (type.aliasSymbol ?? type.getSymbol())?.getName();
    return name !== undefined && DOM_TYPES.has(name);
  }

  private boundaryExpression(expression: ts.Expression): boolean {
    if (
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)
    ) {
      const object = strip(expression.expression);
      if (object.getText() === 'process.env') return true;
      return this.boundaryExpression(object);
    }
    if (ts.isCallExpression(expression)) {
      const callee = strip(expression.expression);
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : callee.getText();
      if (callee.getText() === 'JSON.parse') return true;
      const declaration =
        this.checker.getResolvedSignature(expression)?.declaration;
      if (
        declaration &&
        FILE_READS.has(name) &&
        declaration.getSourceFile().fileName.includes('@types/node')
      ) {
        return true;
      }
    }
    if (ts.isIdentifier(expression)) {
      return this.declarationsOf(
        this.checker.getSymbolAtLocation(expression),
      ).some(
        (declaration) =>
          ts.isVariableDeclaration(declaration) &&
          ts.isCatchClause(declaration.parent),
      );
    }
    return false;
  }

  private originsOf(source: ts.Expression): readonly Origin[] {
    const expression = strip(source);
    if (
      ts.isConditionalExpression(expression) ||
      (ts.isBinaryExpression(expression) &&
        (expression.operatorToken.kind ===
          ts.SyntaxKind.QuestionQuestionToken ||
          expression.operatorToken.kind === ts.SyntaxKind.BarBarToken))
    ) {
      const parts = ts.isConditionalExpression(expression)
        ? [expression.whenTrue, expression.whenFalse]
        : [expression.left, expression.right];
      return parts.flatMap((part) => this.originsOf(part));
    }
    if (this.boundaryExpression(expression)) return ['boundary'];
    const type = this.checker.getTypeAtLocation(expression);
    if (this.absent(type)) return [];
    if (this.declaredContractless(expression)) return this.followed(expression);
    if (this.dom(type)) return ['boundary'];
    if (!this.contractless(type)) {
      return [
        {
          typed: this.checker.typeToString(
            this.checker.getBaseTypeOfLiteralType(type),
          ),
        },
      ];
    }
    return this.followed(expression);
  }

  /** A contract-less value: follow it to where it was made. */
  private followed(expression: ts.Expression): readonly Origin[] {
    const target = ts.isCallExpression(expression)
      ? this.checker.getResolvedSignature(expression)?.declaration
      : this.declarationsOf(
          this.checker.getSymbolAtLocation(
            ts.isPropertyAccessExpression(expression)
              ? expression.name
              : expression,
          ),
        )[0];
    if (!target) {
      if (
        ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression)
      ) {
        return this.originsOf(expression.expression).map((origin) =>
          origin === 'boundary' ? 'boundary' : 'opaque',
        );
      }
      return ['opaque'];
    }
    if (external(target)) return ['boundary'];
    if (ts.isVariableDeclaration(target) && ts.isCatchClause(target.parent)) {
      return ['boundary'];
    }
    if (
      ts.isParameter(target) ||
      ts.isVariableDeclaration(target) ||
      ts.isPropertySignature(target) ||
      ts.isPropertyDeclaration(target) ||
      ts.isFunctionLike(target)
    ) {
      if (ts.isParameter(target) && !hasBody(target.parent)) return ['opaque'];
      const origins = this.originsOfSite(target);
      if (origins.length > 0) return origins;
      if (ts.isParameter(target)) {
        const contract = this.callbackContract(target);
        return [
          contract === undefined || contract === 'open' ? 'boundary' : 'opaque',
        ];
      }
      return ['opaque'];
    }
    return ['opaque'];
  }
}

/** What a scan of these files reports, one entry per site. */
export function scanFiles(
  program: ts.Program,
  files: ReadonlySet<string>,
): UnknownSite[] {
  const scan = new ProvenanceScan(program, (file) => files.has(file.fileName));
  return program
    .getSourceFiles()
    .filter((file) => files.has(file.fileName))
    .flatMap((file) => scan.sitesOf(file));
}

/** A program over `files` with the root project's options. */
export function fixtureProgram(files: readonly string[]): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(REPO, 'tsconfig.json'),
    { noEmit: true },
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => undefined,
    },
  );
  return ts.createProgram({
    rootNames: [...files],
    options: parsed?.options ?? {},
  });
}

/** Every production project: its configuration and the files it owns. */
export function productionProjects(): { tsconfig: string; dir: string }[] {
  const out = [{ tsconfig: 'tsconfig.json', dir: 'src' }];
  for (const entry of fs.readdirSync(REPO, { withFileTypes: true })) {
    const tsconfig = path.join(entry.name, 'tsconfig.json');
    if (
      entry.isDirectory() &&
      entry.name !== 'node_modules' &&
      fs.existsSync(path.join(REPO, tsconfig)) &&
      fs.existsSync(path.join(REPO, entry.name, 'src'))
    ) {
      out.push({ tsconfig, dir: path.join(entry.name, 'src') });
    }
  }
  return out;
}

/** Every site of every production project. */
export function scanProduction(): UnknownSite[] {
  const out: UnknownSite[] = [];
  for (const project of productionProjects()) {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path.join(REPO, project.tsconfig),
      { noEmit: true },
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
    );
    if (!parsed) continue;
    const dir = path.join(REPO, project.dir) + path.sep;
    const own = new Set(
      parsed.fileNames.filter(
        (file) =>
          file.startsWith(dir) &&
          !file.includes(`${path.sep}__tests__${path.sep}`) &&
          !file.includes(`${path.sep}__typechecks__${path.sep}`),
      ),
    );
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
    });
    out.push(...scanFiles(program, own));
  }
  return out;
}

if (require.main === module) {
  const sites = scanProduction();
  const counts = new Map<string, number>();
  for (const site of sites) {
    const key = `${site.kind} ${site.cls}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...counts].sort()) {
    process.stdout.write(`${key}: ${count}\n`);
  }
  const refused = sites.filter((site) => site.refused);
  process.stdout.write(`refused: ${refused.length}\n`);
  for (const site of refused) {
    process.stdout.write(
      `${site.where} ${site.kind} ${site.name} ${site.cls}: ${site.types.join(' | ')}\n`,
    );
  }
}
