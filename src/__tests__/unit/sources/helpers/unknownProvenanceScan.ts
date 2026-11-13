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
 * a contract named in `SINK_CONTRACTS`), `reader` (a reader of thrown values:
 * a `catch` binding among its sources, typed values beside it), `callback` (a
 * function no code of the repository calls, whose contract types the
 * parameter `unknown`), `entry` (a function nothing in the program calls or
 * hands on). `typed` and `mixed` are refused, and so is a callback whose
 * contract types the parameter, and a reader not named in `THROWN_READERS`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, rel } from './failureScan';

/**
 * Contracts whose members take a value of any type by design: a site in a
 * function that implements one of them is a sink. Named by contract, not by
 * site: the logger's (`ILogger`), and the serializer of a value into a tool
 * answer's text (`IAnswerSerializer`, `src/lib/answerSerializer.ts`).
 */
export const SINK_CONTRACTS: readonly string[] = [
  'ILogger',
  'IAnswerSerializer',
];

/**
 * The readers of thrown values (spec §4, the owner's decision): whatever is
 * thrown reaches them through `catch` untyped, so they take `unknown` and
 * narrow it in plain code, even where a caller hands one of our own errors
 * to them directly. Named `file#function(parameter)`, never by line; a reader
 * missing here is refused, and an entry no reader has is stale.
 */
export const THROWN_READERS: ReadonlySet<string> = new Set<string>([
  'src/embeddable/BaseMcpServer.ts#refusalAnswer(error)',
  'src/handlers/search/readonly/handleGetObjectsList.ts#Thrown(thrown)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#WhereUsedOutcome(lastErr)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#findExtensions(lastErr)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#messageOf(thrown)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#outcomeOf(lastErr)',
  'src/handlers/system/readonly/handleGetObjectInfo.ts#Thrown(thrown)',
  'src/handlers/system/readonly/handleRuntimeListFeeds.ts#end(error)',
  'src/lib/adtHeaders/withAdtHeaders.ts#readSafely(value)',
  'src/lib/answer.ts#isCredentialFailure(thrown)',
  'src/lib/answer.ts#messageOf(thrown)',
  'src/lib/answer.ts#requestErrorOf(thrown)',
  'src/lib/answer.ts#thrownEntry(thrown)',
  'src/lib/auth/failures.ts#chainErrorOf(thrown)',
  'src/lib/auth/failures.ts#failureOf(thrown)',
  'src/lib/auth/failures.ts#isClosedInstanceRefusal(value)',
  'src/lib/auth/failures.ts#readGuarded(thrown)',
  'src/lib/auth/failures.ts#readOwn(value)',
  'src/lib/auth/serverRefusal.ts#serverRefusalOf(value)',
  'src/lib/batch/execute.ts#Rejection(error)',
  'src/lib/batch/execute.ts#cameBack(envelopeError)',
  'src/lib/batch/execute.ts#failureAnswer(error)',
  'src/lib/batch/phases.ts#PhaseOutcome(error)',
  'src/lib/batch/phases.ts#PhaseResult(error)',
  'src/lib/debugger/AmdpSession.ts#withNotUndone(withNotUndone)',
  'src/lib/debugger/failures.ts#thrownFailure(thrown)',
  'src/lib/logger.ts#createLogFn(data)',
  'src/lib/logger.ts#spreadable(data)',
  'src/lib/search-source/readFailure.ts#DecidedPrimitive(value)',
  'src/lib/search-source/readFailure.ts#decidedFailure(decidedFailure)',
  'src/lib/search-source/readFailure.ts#decidedFailure(failure)',
  'src/lib/search-source/readFailure.ts#envelopeFailure(error)',
  'src/lib/search-source/readFailure.ts#isCredential(failure)',
  'src/lib/search-source/readFailure.ts#isObject(value)',
  'src/lib/strategies/packageWalk.ts#endsTheCall(thrown)',
  'src/lib/strategies/step.ts#methodFailureOf(thrown)',
  'src/lib/strategies/step.ts#payloadCarriedBy(thrown)',
  'src/lib/strategies/step.ts#stepOf(value)',
  'src/lib/utils.ts#return_error(error)',
  'src/lib/xml/tree.ts#child(value)',
  'src/lib/xml/tree.ts#isElement(value)',
]);

export type SiteKind = 'parameter' | 'variable' | 'return' | 'property';
export type SiteClass =
  | 'boundary'
  | 'typed'
  | 'mixed'
  | 'sink'
  | 'reader'
  | 'callback'
  | 'entry';

export interface UnknownSite {
  readonly kind: SiteKind;
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  readonly name: string;
  /** `file#owner(name)`: the site by name, as `THROWN_READERS` lists it. */
  readonly key: string;
  readonly cls: SiteClass;
  /** The static types of the typed sources that reach it. */
  readonly types: readonly string[];
  readonly refused: boolean;
}

/** `thrown`: a caught value, a boundary of its own kind. */
type Origin = { readonly typed: string } | 'boundary' | 'thrown' | 'opaque';

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

/**
 * The types of the program's inputs: the environment (`NodeJS.ProcessEnv`)
 * and the program's arguments (`ProgramArguments`, a reader's parameter
 * declared so). A value read from one is a boundary, like `process.env`.
 */
const INPUT_TYPES = new Set(['ProcessEnv', 'ProgramArguments']);

/**
 * A file's one spelling: TypeScript names a file with `/` on every platform,
 * `path` with the platform's separator, so names are compared resolved.
 */
function fileKey(name: string): string {
  return path.resolve(name);
}

const OWN_SOURCES = fileKey(path.join(REPO, 'src')) + path.sep;

function external(node: ts.Node): boolean {
  const file = node.getSourceFile();
  return (
    file.isDeclarationFile && !fileKey(file.fileName).startsWith(OWN_SOURCES)
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

/** The value a chain of property and element reads starts from. */
function accessRoot(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = strip(current.expression);
  }
  return current;
}

/** Whether an `await` is among the wrappers `strip` takes off. */
function awaits(expression: ts.Expression): boolean {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isAwaitExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    if (ts.isAwaitExpression(current)) return true;
    current = current.expression;
  }
  return false;
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

/** The name of the function or type a site belongs to. */
function ownerOf(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  if (ts.isFunctionLike(node)) current = node;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isInterfaceDeclaration(current) ||
        ts.isClassDeclaration(current) ||
        ts.isTypeAliasDeclaration(current)) &&
      current.name
    ) {
      return current.name.getText();
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      (ts.isVariableDeclaration(current.parent) ||
        ts.isPropertyAssignment(current.parent))
    ) {
      return current.parent.name.getText();
    }
    current = current.parent;
  }
  return '(module)';
}

function keyOf(node: ts.Node): string {
  return `${rel(node.getSourceFile().fileName)}#${ownerOf(node)}(${nameOf(node)})`;
}

/** The entries of `readers` no site of `sites` is the reader of. */
export function staleReaders(
  sites: readonly UnknownSite[],
  readers: ReadonlySet<string>,
): string[] {
  const found = new Set(
    sites.filter((site) => site.cls === 'reader').map((site) => site.key),
  );
  return [...readers].filter((reader) => !found.has(reader));
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
  private readonly readers: ReadonlySet<string>;

  constructor(
    program: ts.Program,
    own: (file: ts.SourceFile) => boolean,
    readers: ReadonlySet<string>,
  ) {
    this.checker = program.getTypeChecker();
    this.readers = readers;
    for (const file of program.getSourceFiles()) {
      if (own(file)) this.index(file);
    }
  }

  private push<V>(map: Map<ts.Node, V[]>, key: ts.Node, value: V): void {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  }

  /**
   * The symbol an expression reads: for the name of a shorthand property
   * (`{ id }`), the value it writes, not the property.
   */
  private symbolOf(expression: ts.Node): ts.Symbol | undefined {
    if (ts.isShorthandPropertyAssignment(expression.parent)) {
      return this.checker.getShorthandAssignmentValueSymbol(expression.parent);
    }
    return this.checker.getSymbolAtLocation(expression);
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
    const key = keyOf(node);
    let cls: SiteClass;
    let refused: boolean;
    if (types.length > 0 && this.inSinkContract(node)) {
      cls = 'sink';
      refused = false;
    } else if (types.length > 0 && origins.includes('thrown')) {
      cls = 'reader';
      refused = !this.readers.has(key);
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
      key,
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
    // A property of a mapped type (`Omit<…>`) has no value declaration of
    // its own; its declared type is the symbol's all the same.
    const symbol = this.symbolOf(expression);
    if (!symbol?.valueDeclaration && !symbol?.declarations?.length) {
      return false;
    }
    return this.contractless(this.checker.getTypeOfSymbol(symbol));
  }

  private dom(type: ts.Type): boolean {
    const name = (type.aliasSymbol ?? type.getSymbol())?.getName();
    return name !== undefined && DOM_TYPES.has(name);
  }

  private boundaryOrigin(
    expression: ts.Expression,
  ): 'boundary' | 'thrown' | undefined {
    if (
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)
    ) {
      const object = strip(expression.expression);
      if (object.getText() === 'process.env') return 'boundary';
      return this.boundaryOrigin(object);
    }
    if (ts.isCallExpression(expression)) {
      const callee = strip(expression.expression);
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : callee.getText();
      if (callee.getText() === 'JSON.parse') return 'boundary';
      const declaration =
        this.checker.getResolvedSignature(expression)?.declaration;
      if (
        declaration &&
        FILE_READS.has(name) &&
        declaration.getSourceFile().fileName.includes('@types/node')
      ) {
        return 'boundary';
      }
    }
    if (
      ts.isIdentifier(expression) &&
      this.declarationsOf(this.checker.getSymbolAtLocation(expression)).some(
        (declaration) =>
          ts.isVariableDeclaration(declaration) &&
          ts.isCatchClause(declaration.parent),
      )
    ) {
      return 'thrown';
    }
    return undefined;
  }

  /**
   * Whether a value is read from the program's inputs, `process.argv` or
   * `process.env` or a value of an input type (`INPUT_TYPES`), however typed
   * the values it passed through: a read of
   * one of them, a built-in method called on one (`slice`, `trim`), a
   * variable every value written to which is one, a parameter every
   * argument of which is one. A value of no type (`undefined`) adds nothing.
   */
  private fromProgramInput(
    source: ts.Expression,
    seen: ReadonlySet<ts.Node>,
  ): boolean {
    const expression = strip(source);
    const text = expression.getText();
    if (text === 'process.argv' || text === 'process.env') return true;
    const type = this.checker.getTypeAtLocation(expression);
    const typeName = (type.aliasSymbol ?? type.getSymbol())?.getName();
    if (typeName !== undefined && INPUT_TYPES.has(typeName)) return true;
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
      return parts.every((part) => this.fromProgramInput(part, seen));
    }
    if (this.absent(this.checker.getTypeAtLocation(expression))) return true;
    if (
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)
    ) {
      return this.fromProgramInput(expression.expression, seen);
    }
    if (ts.isCallExpression(expression)) {
      const callee = strip(expression.expression);
      const declaration =
        this.checker.getResolvedSignature(expression)?.declaration;
      const builtIn =
        declaration !== undefined &&
        path
          .basename(declaration.getSourceFile().fileName)
          .startsWith('lib.') &&
        declaration.getSourceFile().isDeclarationFile;
      return (
        builtIn &&
        ts.isPropertyAccessExpression(callee) &&
        this.fromProgramInput(callee.expression, seen)
      );
    }
    if (!ts.isIdentifier(expression)) return false;
    const [declaration] = this.declarationsOf(this.symbolOf(expression));
    if (declaration === undefined || seen.has(declaration)) return false;
    const deeper = new Set([...seen, declaration]);
    let sources: ts.Expression[] = [];
    if (ts.isVariableDeclaration(declaration)) {
      sources = [...(this.writes.get(declaration) ?? [])];
      if (declaration.initializer) sources.push(declaration.initializer);
      const statement = declaration.parent.parent;
      if (ts.isForOfStatement(statement)) sources.push(statement.expression);
    } else if (ts.isParameter(declaration) && hasBody(declaration.parent)) {
      sources = this.sourcesOf(declaration);
    }
    return (
      sources.length > 0 &&
      sources.every((part) => this.fromProgramInput(part, deeper))
    );
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
    const boundary = this.boundaryOrigin(expression);
    if (boundary) return [boundary];
    if (
      !this.absent(this.checker.getTypeAtLocation(expression)) &&
      this.fromProgramInput(expression, new Set())
    ) {
      return ['boundary'];
    }
    // A property read of a value declared without a contract (a thrown
    // value narrowed by `instanceof`, say): its type is the narrowing's
    // claim, its origin the value's.
    const root = accessRoot(expression);
    if (root !== expression && this.declaredContractless(root)) {
      return this.followed(root).map((origin) =>
        origin === 'boundary' || origin === 'thrown' ? origin : 'opaque',
      );
    }
    // An awaited source is what its promise holds, not the promise.
    const type = awaits(source)
      ? this.checker.getTypeAtLocation(source)
      : this.checker.getTypeAtLocation(expression);
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
          this.symbolOf(
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
          origin === 'boundary' || origin === 'thrown' ? origin : 'opaque',
        );
      }
      return ['opaque'];
    }
    if (external(target)) return ['boundary'];
    if (ts.isVariableDeclaration(target) && ts.isCatchClause(target.parent)) {
      return ['thrown'];
    }
    if (
      ts.isParameter(target) ||
      ts.isVariableDeclaration(target) ||
      ts.isPropertySignature(target) ||
      ts.isPropertyDeclaration(target) ||
      ts.isFunctionLike(target)
    ) {
      if (ts.isParameter(target) && !hasBody(target.parent)) return ['opaque'];
      // What a sink took is of any type by its contract, and so is what it
      // hands on: not followed into every caller of the contract.
      if (ts.isParameter(target) && this.inSinkContract(target)) {
        return ['opaque'];
      }
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
  readers: ReadonlySet<string> = THROWN_READERS,
): UnknownSite[] {
  const own = new Set([...files].map(fileKey));
  const owned = (file: ts.SourceFile) => own.has(fileKey(file.fileName));
  const scan = new ProvenanceScan(program, owned, readers);
  return program
    .getSourceFiles()
    .filter(owned)
    .flatMap((file) => scan.sitesOf(file));
}

/** A library call answering `any`, not taken as `unknown` where it is made. */
export interface UntypedAnswer {
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  readonly text: string;
}

/**
 * Every call in `files` whose answer is `any` (`JSON.parse`, an XML parser's
 * `parse`, `Reflect.get`) and that lands neither where `unknown` is expected
 * (a declaration, a parameter, a return so typed) nor where a contract of a
 * third party types `any`, nor is discarded. Typed by the declaration it
 * lands in, a parse would skip the check its values pass (spec §4, JSON
 * values); held untyped, every read of it is `any`.
 */
export function untypedAnswers(
  program: ts.Program,
  files: ReadonlySet<string>,
): UntypedAnswer[] {
  const own = new Set([...files].map(fileKey));
  const checker = program.getTypeChecker();
  const out: UntypedAnswer[] = [];
  for (const file of program.getSourceFiles()) {
    if (!own.has(fileKey(file.fileName))) continue;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        checker.getTypeAtLocation(node).flags & ts.TypeFlags.Any
      ) {
        let outer: ts.Expression = node;
        while (
          ts.isParenthesizedExpression(outer.parent) ||
          ts.isAwaitExpression(outer.parent)
        ) {
          outer = outer.parent;
        }
        const expected = checker.getContextualType(outer);
        const taken =
          expected !== undefined &&
          (expected.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) !== 0;
        if (!taken && !ts.isExpressionStatement(outer.parent)) {
          out.push({ where: lineOf(node), text: node.getText() });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return out;
}

/** Every untyped answer of every production project. */
export function untypedProductionAnswers(): UntypedAnswer[] {
  return eachProductionProject((program, own) => untypedAnswers(program, own));
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
  return eachProductionProject((program, own) => scanFiles(program, own));
}

/** `scan` over each production project's program and the files it owns. */
function eachProductionProject<T>(
  scan: (program: ts.Program, own: ReadonlySet<string>) => T[],
): T[] {
  const out: T[] = [];
  for (const project of productionProjects()) {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path.join(REPO, project.tsconfig),
      { noEmit: true },
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
    );
    if (!parsed) continue;
    const dir = fileKey(path.join(REPO, project.dir)) + path.sep;
    const own = new Set(
      parsed.fileNames
        .map(fileKey)
        .filter(
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
    out.push(...scan(program, own));
  }
  return out;
}
