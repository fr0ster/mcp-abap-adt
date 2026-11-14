/**
 * The `unknown` audit (spec §4): where every value written `unknown` in
 * production code comes from, decided by the compiler, site by site.
 *
 * A site is a parameter, a variable, a function's return or a property whose
 * declared type is `unknown` or holds it: an element of an array or a tuple,
 * a value of a `Record` or an index signature, a type argument of `Map`,
 * `Set` or `Promise`, a function type's return, or an alias of `unknown`
 * (`type V = unknown`). A function type's parameter written `unknown` is a
 * parameter site of its own, fed by the calls of that type. Each position is
 * read as a plain `unknown` is: by the values that reach it, the source's
 * type projected to the position (an array literal's elements, an object
 * literal's members, a function expression's returns are followed one by
 * one). Its sources are found in the program: a
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
 * A value followed back to where it was made is read there at the position
 * asked for. A runtime object of the language (`Error`) is its contract, as a
 * third party's is: its members are no positions.
 *
 * Classes: `boundary` (every source a boundary), `typed` (every source a
 * contract-typed value of the repository), `mixed` (both), `sink` (a member of
 * a contract named in `SINK_CONTRACTS`, or a position under a slot named in
 * `SINK_SLOTS`), `reader` (a reader of thrown values: a caught value — a
 * `catch` binding, a rejection handler's parameter — among its sources, or
 * `Error`s of ours beside values from outside, typed values beside it),
 * `callback` (a function no code of the repository calls, whose contract types
 * the parameter `unknown` at each position it writes so), `entry` (a function
 * nothing in the program calls or hands on). `typed` and `mixed` are refused,
 * and so is a callback whose contract types a position it writes `unknown`,
 * and a reader not named in `THROWN_READERS`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, rel } from './failureScan';

/**
 * Contracts whose members take a value of any type by design: a site in a
 * function that implements one of them is a sink. Named by contract, not by
 * site: the logger's (`ILogger`), the serializer of a value into a tool
 * answer's text (`IAnswerSerializer`, `src/lib/answerSerializer.ts`), and a
 * registered tool callback as the MCP SDK calls it, whose arguments go on to
 * the SDK's callback (`RegisteredToolCallback`, `src/embeddable/BaseMcpServer.ts`).
 */
export const SINK_CONTRACTS: readonly string[] = [
  'ILogger',
  'IAnswerSerializer',
  'RegisteredToolCallback',
];

/**
 * Slots of a contract whose value only leaves the program (the owner's
 * decision, the sink rule by reading): what is written there is handed
 * outward — serialized to JSON, given to the MCP SDK — and never read back,
 * so a position under one is a sink. Named `Contract.member`, each with the
 * one function that reads the slot to hand it out (`file#function`); a read
 * of the slot anywhere else reads a typed value back, and is refused
 * (`sinkSlotReads`): its contract is then typed instead.
 */
export const SINK_SLOTS: ReadonlyMap<string, string> = new Map([
  ['ToolContentItem.json', 'src/lib/toolResult.ts#normalizeToolContent'],
  ['ToolContentItem.text', 'src/lib/toolResult.ts#normalizeToolContent'],
]);

/**
 * The readers of thrown values (spec §4, the owner's decision): whatever is
 * thrown reaches them through `catch` untyped, so they take `unknown` and
 * narrow it in plain code, even where a caller hands one of our own errors
 * to them directly. Named `file#function(parameter)`, never by line; a reader
 * missing here is refused, and an entry no reader has is stale.
 */
export const THROWN_READERS: ReadonlySet<string> = new Set<string>([
  'src/embeddable/BaseMcpServer.ts#backgroundAnswer(t)',
  'src/embeddable/BaseMcpServer.ts#readFailure(thrown)',
  'src/embeddable/BaseMcpServer.ts#refusalAnswer(error)',
  'src/embeddable/BaseMcpServer.ts#refusalAnswer(t)',
  'src/embeddable/BaseMcpServer.ts#runConnectionless(t)',
  'src/embeddable/BaseMcpServer.ts#track(t)',
  'src/handlers/search/readonly/handleGetObjectsList.ts#Thrown(thrown)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#WhereUsedOutcome(lastErr)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#candidatesOf(outcome)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#findExtensions(lastErr)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#messageOf(thrown)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#outcomeOf((anonymous))',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#outcomeOf(lastErr)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#outcomeOf(outcome)',
  'src/handlers/system/high/handleGetPackageTree.ts#walkOf(walkOf)',
  'src/handlers/system/readonly/handleGetObjectInfo.ts#Thrown(thrown)',
  'src/handlers/system/readonly/handleGetObjectInfo.ts#Trees(failures)',
  'src/handlers/system/readonly/handleGetObjectInfo.ts#buildTrees(buildTrees)',
  'src/handlers/system/readonly/handleGetWhereUsed.ts#whereUsedInEnvelopes(read)',
  'src/handlers/system/readonly/handleRuntimeListFeeds.ts#end(error)',
  'src/handlers/system/readonly/handleRuntimeListFeeds.ts#feedsInRounds(answers)',
  'src/handlers/transport/readonly/handleListTransports.ts#listTransportsInEnvelopes(lists)',
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
  'src/lib/batch/execute.ts#split(split)',
  'src/lib/batch/phases.ts#PhaseOutcome(envelope)',
  'src/lib/batch/phases.ts#PhaseOutcome(error)',
  'src/lib/batch/phases.ts#PhaseOutcome(results)',
  'src/lib/batch/phases.ts#PhaseResult(error)',
  'src/lib/batch/phases.ts#runPhase(runPhase)',
  'src/lib/batch/phases.ts#runPhaseOutcome(runPhaseOutcome)',
  'src/lib/debugger/AmdpSession.ts#withNotUndone(withNotUndone)',
  'src/lib/debugger/failures.ts#thrownFailure(thrown)',
  'src/lib/search-source/orchestrator.ts#runSearchSourceInPhases(levels)',
  'src/lib/search-source/readFailure.ts#DecidedPrimitive(value)',
  'src/lib/search-source/readFailure.ts#classify(failure)',
  'src/lib/search-source/readFailure.ts#decidedFailure(decidedFailure)',
  'src/lib/search-source/readFailure.ts#decidedFailure(failure)',
  'src/lib/search-source/readFailure.ts#decisionOf(failure)',
  'src/lib/search-source/readFailure.ts#envelopeFailure(error)',
  'src/lib/search-source/readFailure.ts#failedRead(failure)',
  'src/lib/search-source/readFailure.ts#failedRead(key)',
  'src/lib/search-source/readFailure.ts#isCredential(failure)',
  'src/lib/search-source/readFailure.ts#isObject(value)',
  'src/lib/search-source/readFailure.ts#isSapAnswer(failure)',
  'src/lib/search-source/sourceReader.ts#readOne(failure)',
  'src/lib/search-source/sourceReader.ts#readOne(key)',
  'src/lib/search-source/sourceReader.ts#readSourceUnits(failure)',
  'src/lib/search-source/sourceReader.ts#readSourceUnits(key)',
  'src/lib/strategies/packageWalk.ts#batchReader(batchReader)',
  'src/lib/strategies/packageWalk.ts#endsTheCall(thrown)',
  'src/lib/strategies/packageWalk.ts#walkPackages(read)',
  'src/lib/strategies/step.ts#methodFailureOf(thrown)',
  'src/lib/strategies/step.ts#payloadCarriedBy(thrown)',
  'src/lib/strategies/step.ts#stepOf(value)',
  'src/lib/utils.ts#httpFailureOf(error)',
  'src/lib/utils.ts#return_error(error)',
  'src/lib/thrownValue.ts#child(value)',
  'src/lib/thrownValue.ts#isElement(value)',
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
  /**
   * Where `unknown` stands in the declared type: `''` for the type itself,
   * else each position, e.g. `[]` for an array's element, `{}` for a
   * `Record`'s value, `Map<1>` for a type argument, `()` for a return.
   */
  readonly position: string;
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
type Origin =
  | {
      readonly typed: string;
      /** An `Error`, the language's or one extending it. */
      readonly error: boolean;
    }
  | 'boundary'
  | 'thrown'
  | 'opaque';

/**
 * One step from a type to a position inside it: an array's or a tuple's
 * element (`at` for one tuple member), a `Record`'s or an index signature's
 * value, a type argument of a named generic, a function's return.
 */
type Step =
  | { readonly kind: 'element'; readonly at?: number }
  | { readonly kind: 'index' }
  | { readonly kind: 'argument'; readonly of: string; readonly at: number }
  | { readonly kind: 'return' }
  | {
      readonly kind: 'member';
      readonly name: string;
      /** A slot named in `SINK_SLOTS`: what is under it is a sink. */
      readonly sink?: true;
    };

/** The path from a declared type to one `unknown` inside it. */
type Path = readonly Step[];

/**
 * The generics whose type arguments are positions, each with its family: a
 * value of one member of a family projects onto another's arguments
 * (`Map` onto `ReadonlyMap`).
 */
const GENERIC_FAMILIES: ReadonlyMap<string, string> = new Map([
  ['Map', 'Map'],
  ['ReadonlyMap', 'Map'],
  ['WeakMap', 'Map'],
  ['Set', 'Set'],
  ['ReadonlySet', 'Set'],
  ['WeakSet', 'Set'],
  ['Promise', 'Promise'],
  ['PromiseLike', 'Promise'],
]);

/** Generics that keep the shape of their argument. */
const SHAPE_KEEPING = new Set([
  'Readonly',
  'Partial',
  'Required',
  'NonNullable',
]);

function stepText(step: Step): string {
  switch (step.kind) {
    case 'element':
      return step.at === undefined ? '[]' : `[${step.at}]`;
    case 'index':
      return '{}';
    case 'argument':
      return `${step.of}<${step.at}>`;
    case 'return':
      return '()';
    case 'member':
      return `.${step.name}`;
  }
}

/** Each origin once: a site reached along many paths names each once. */
function distinctOrigins(origins: readonly Origin[]): Origin[] {
  const seen = new Set<string>();
  return origins.filter((origin) => {
    const key = typeof origin === 'object' ? `typed:${origin.typed}` : origin;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Whether a written value's step fills a path's first: an element any
 * element (a tuple's included), a type argument its family's.
 */
function sameStep(position: Step, written: Step): boolean {
  if (position.kind !== written.kind) return false;
  if (position.kind === 'element' && written.kind === 'element') {
    return (
      position.at === undefined ||
      written.at === undefined ||
      position.at === written.at
    );
  }
  if (position.kind === 'member' && written.kind === 'member') {
    return position.name === written.name;
  }
  if (position.kind === 'argument' && written.kind === 'argument') {
    return (
      position.at === written.at &&
      GENERIC_FAMILIES.get(position.of) === GENERIC_FAMILIES.get(written.of)
    );
  }
  return true;
}

function pathText(path: Path): string {
  return path.map(stepText).join('');
}

/** A reference to a generic type, whose arguments the checker answers. */
function isReference(type: ts.Type): type is ts.TypeReference {
  return (type.flags & ts.TypeFlags.Object) !== 0 && 'target' in type;
}

/** The declared type of a site's declaration, when it writes one. */
function declaredTypeOf(node: ts.Node): ts.TypeNode | undefined {
  if (
    ts.isParameter(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isFunctionLike(node)
  ) {
    return node.type;
  }
  return undefined;
}

function isAsync(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    )
  );
}

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
 * The types of the program's inputs: the environment (`NodeJS.ProcessEnv`),
 * the program's arguments (`ProgramArguments`, a reader's parameter declared
 * so) and a tool's arguments before their schema (`ToolArgs`, what a tool
 * entry's `call` parses). A value read from one is a boundary, like
 * `process.env`, and so is a site declared with one.
 */
const INPUT_TYPES = new Set(['ProcessEnv', 'ProgramArguments', 'ToolArgs']);

/**
 * A file's one spelling: TypeScript names a file with `/` on every platform,
 * `path` with the platform's separator, so names are compared resolved.
 */
function fileKey(name: string): string {
  return path.resolve(name);
}

const OWN_REPO = fileKey(REPO) + path.sep;

/**
 * A file of the repository's own: any package's sources and the root's,
 * never an installed dependency or a build's output.
 */
export function ownFile(name: string): boolean {
  const key = fileKey(name);
  return (
    key.startsWith(OWN_REPO) &&
    !key.includes(`${path.sep}node_modules${path.sep}`) &&
    !key.includes(`${path.sep}dist${path.sep}`)
  );
}

function external(node: ts.Node): boolean {
  const file = node.getSourceFile();
  return file.isDeclarationFile && !ownFile(file.fileName);
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

/** Whether a declaration is the language's own (`lib.*.d.ts`). */
function languageFile(declaration: ts.Node): boolean {
  const file = declaration.getSourceFile();
  return (
    file.isDeclarationFile && path.basename(file.fileName).startsWith('lib.')
  );
}

/**
 * A runtime object the language declares with no type parameter (`Error`,
 * `AbortSignal`): an interface or a class with none.
 */
function languageObject(declaration: ts.Node): boolean {
  return (
    (ts.isInterfaceDeclaration(declaration) ||
      ts.isClassDeclaration(declaration)) &&
    (declaration.typeParameters ?? []).length === 0
  );
}

/**
 * A property name as the checker names it: an identifier's text, a string
 * or a number literal's value (`'value'` is `value`), a computed key's
 * literal; `undefined` for a computed key of no literal.
 */
function propertyName(
  name: ts.PropertyName | ts.BindingName,
): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const key = name.expression;
    return ts.isStringLiteral(key) ||
      ts.isNumericLiteral(key) ||
      ts.isNoSubstitutionTemplateLiteral(key)
      ? key.text
      : undefined;
  }
  return undefined;
}

/** Whether a path passes through a slot of `SINK_SLOTS`. */
function intoSink(path: Path): boolean {
  return path.some((step) => step.kind === 'member' && step.sink === true);
}

/**
 * `Contract.member` for a property its contract of the repository declares:
 * an interface's, a class's or a type alias's object type's.
 */
function slotName(declaration: ts.Node): string | undefined {
  if (
    !(
      ts.isPropertySignature(declaration) ||
      ts.isPropertyDeclaration(declaration)
    ) ||
    !ownFile(declaration.getSourceFile().fileName)
  ) {
    return undefined;
  }
  const holder = declaration.parent;
  const owner = ts.isTypeLiteralNode(holder) ? holder.parent : holder;
  if (
    (ts.isInterfaceDeclaration(owner) ||
      ts.isClassDeclaration(owner) ||
      ts.isTypeAliasDeclaration(owner)) &&
    owner.name !== undefined
  ) {
    const member = propertyName(declaration.name);
    return member === undefined ? undefined : `${owner.name.text}.${member}`;
  }
  return undefined;
}

export class ProvenanceScan {
  private readonly checker: ts.TypeChecker;
  /** Declaration (a function or a contract member) → argument lists. */
  private readonly calls = new Map<ts.Node, ts.NodeArray<ts.Expression>[]>();
  /** Declaration (a variable or a property) → the expressions written to it. */
  private readonly writes = new Map<ts.Node, ts.Expression[]>();
  /**
   * Declaration (a container) → what is written into it: an element or a
   * member assigned (`items[0] = v`, `bag.k = v`), a mutator's argument
   * (`push`, `unshift`, `splice`, `fill`, `set`, `add`), each with the step
   * it fills.
   */
  private readonly contents = new Map<
    ts.Node,
    {
      /** The steps from the container to the position written. */
      readonly path: Path;
      readonly value: ts.Expression;
      /**
       * The steps into `value` before the position is read: none for the
       * value itself, `[]` for a spread array's elements, `[k]` for a spread
       * tuple's member `k`.
       */
      readonly inside: Path;
    }[]
  >();
  /** Functions handed on as a value (an argument, an initializer, a member). */
  private readonly handedOn = new Set<ts.Node>();
  /** A named function → the expressions that hand it on by name. */
  private readonly handedAt = new Map<ts.Node, ts.Expression[]>();
  private readonly memo = new Map<ts.Node, readonly Origin[]>();
  /** Origins of a declaration's values at one position, by node and path. */
  private readonly memoAt = new Map<ts.Node, Map<string, readonly Origin[]>>();
  private readonly typePathMemo = new Map<ts.Type, Path[]>();
  /** How many times a walk was cut where a type repeats: a cut walk is not kept. */
  private cuts = 0;
  private readonly active = new Set<ts.Node>();
  private readonly readers: ReadonlySet<string>;
  private readonly slots: ReadonlyMap<string, string>;

  constructor(
    program: ts.Program,
    own: (file: ts.SourceFile) => boolean,
    readers: ReadonlySet<string>,
    slots: ReadonlyMap<string, string> = SINK_SLOTS,
  ) {
    this.checker = program.getTypeChecker();
    this.readers = readers;
    this.slots = slots;
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
        if (ts.isCallExpression(node)) this.indexMutator(node);
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
        this.indexContent(node.left, node.right);
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

  /**
   * The containers a write's receiver is read from, each with the steps from
   * the container to the receiver: `items[0].push(v)` writes into `items`
   * at `[]`. A variable written without a type, made from another
   * container (`const alias = items`), is that container.
   */
  private containersOf(
    expression: ts.Expression,
    seen: ReadonlySet<ts.Node> = new Set(),
  ): { readonly node: ts.Node; readonly prefix: Path }[] {
    const inner = strip(expression);
    if (ts.isElementAccessExpression(inner)) {
      const step = this.writeStep(inner);
      return this.containersOf(inner.expression, seen).map((found) => ({
        node: found.node,
        prefix: [...found.prefix, step],
      }));
    }
    if (!ts.isIdentifier(inner) && !ts.isPropertyAccessExpression(inner)) {
      return [];
    }
    const declarations = this.declarationsOf(this.symbolOf(inner));
    // A member of a container with no declaration of its own (`bag.k`):
    // the container's, at its index.
    if (declarations.length === 0 && ts.isPropertyAccessExpression(inner)) {
      return this.containersOf(inner.expression, seen).map((found) => ({
        node: found.node,
        prefix: [...found.prefix, { kind: 'index' }],
      }));
    }
    return declarations.flatMap((node) => {
      if (seen.has(node)) return [];
      if (
        ts.isVariableDeclaration(node) &&
        node.type === undefined &&
        node.initializer !== undefined
      ) {
        const made = strip(node.initializer);
        if (
          ts.isIdentifier(made) ||
          ts.isPropertyAccessExpression(made) ||
          ts.isElementAccessExpression(made)
        ) {
          const deeper = new Set([...seen, node]);
          return [{ node, prefix: [] }, ...this.containersOf(made, deeper)];
        }
      }
      return [{ node, prefix: [] }];
    });
  }

  /** The step an element write fills: an array's element, a tuple's `at`, else an index. */
  private writeStep(target: ts.ElementAccessExpression): Step {
    const type = this.checker.getTypeAtLocation(target.expression);
    if (this.checker.isTupleType(type)) {
      const index = strip(target.argumentExpression);
      return ts.isNumericLiteral(index)
        ? { kind: 'element', at: Number(index.text) }
        : { kind: 'element' };
    }
    return this.checker.isArrayType(type)
      ? { kind: 'element' }
      : { kind: 'index' };
  }

  /** Record `value` written into every container `receiver` is read from. */
  private writeInto(
    receiver: ts.Expression,
    step: Step,
    value: ts.Expression,
    inside: Path = [],
  ): void {
    for (const found of this.containersOf(receiver)) {
      this.push(this.contents, found.node, {
        path: [...found.prefix, step],
        value,
        inside,
      });
    }
  }

  /** `items[i] = v` and `bag.k = v`: `v` written into the container. */
  private indexContent(left: ts.Expression, value: ts.Expression): void {
    const target = strip(left);
    if (ts.isElementAccessExpression(target)) {
      this.writeInto(target.expression, this.writeStep(target), value);
      return;
    }
    if (!ts.isPropertyAccessExpression(target)) return;
    // A declared member is its property's write, and a write into the
    // container at that member; an undeclared one fills its index.
    const declared =
      this.declarationsOf(this.checker.getSymbolAtLocation(target)).length > 0;
    this.writeInto(
      target.expression,
      declared ? { kind: 'member', name: target.name.text } : { kind: 'index' },
      value,
    );
  }

  /**
   * A mutator's arguments written into its receiver: an array's `push`,
   * `unshift`, `splice` and `fill` (a spread argument's elements too), a
   * map's `set` (its key and its value), a set's `add`.
   */
  private indexMutator(call: ts.CallExpression): void {
    const callee = strip(call.expression);
    if (!ts.isPropertyAccessExpression(callee)) return;
    const receiver = callee.expression;
    const method = callee.name.text;
    const type = this.checker.getTypeAtLocation(receiver);
    const name = isReference(type)
      ? type.target.getSymbol()?.getName()
      : undefined;
    const family = name === undefined ? undefined : GENERIC_FAMILIES.get(name);
    if (this.checker.isArrayType(type) || this.checker.isTupleType(type)) {
      const values =
        method === 'push' || method === 'unshift'
          ? call.arguments
          : method === 'splice'
            ? call.arguments.slice(2)
            : method === 'fill'
              ? call.arguments.slice(0, 1)
              : [];
      for (const value of values) {
        if (ts.isSpreadElement(value)) {
          this.writeInto(receiver, { kind: 'element' }, value.expression, [
            { kind: 'element' },
          ]);
        } else this.writeInto(receiver, { kind: 'element' }, value);
      }
      return;
    }
    if (name === undefined) return;
    // `set(key, value)` and `add(value)`: each argument position the type
    // argument it fills, a spread's members counted at their places.
    const filled =
      family === 'Map' && method === 'set'
        ? 2
        : family === 'Set' && method === 'add'
          ? 1
          : 0;
    for (let at = 0; at < filled; at += 1) {
      for (const reached of this.argumentAt(call.arguments, at, false)) {
        this.writeInto(
          receiver,
          { kind: 'argument', of: name, at },
          reached.value,
          reached.inside,
        );
      }
    }
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
        this.push(this.handedAt, declaration, inner);
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
      const key = propertyName(element.name);
      const members =
        key === undefined
          ? []
          : owners.map((owner) => this.checker.getPropertyOfType(owner, key));
      for (const member of members) {
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
    if (!this.holdsUnknown(node)) return undefined;
    if (ts.isParameter(node)) {
      return hasBody(node.parent) ? 'parameter' : undefined;
    }
    if (ts.isVariableDeclaration(node) && !ts.isCatchClause(node.parent)) {
      return 'variable';
    }
    if (ts.isFunctionLike(node) && hasBody(node)) return 'return';
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      return 'property';
    }
    return undefined;
  }

  /**
   * The type written for a declaration: its own annotation, or — for a
   * parameter of a function expression written without one — the parameter
   * the expression's contextual function type writes in the repository
   * (`(visited: unknown) => void`): where that `unknown` is read.
   */
  private writtenTypeOf(node: ts.Node): ts.TypeNode | undefined {
    const own = declaredTypeOf(node);
    if (own !== undefined || !ts.isParameter(node)) return own;
    const fn = node.parent;
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
      return undefined;
    }
    const contract = this.contextualDeclaration(fn);
    const parameter = contract?.parameters[fn.parameters.indexOf(node)];
    return parameter === undefined ? undefined : declaredTypeOf(parameter);
  }

  /**
   * The function type of the repository a function expression is written
   * to (an argument's, a member's, an initializer's), when it has one.
   */
  private contextualDeclaration(
    fn: ts.ArrowFunction | ts.FunctionExpression,
  ): ts.SignatureDeclaration | undefined {
    const declaration = this.checker
      .getContextualType(fn)
      ?.getCallSignatures()[0]?.declaration;
    if (
      declaration === undefined ||
      ts.isJSDocSignature(declaration) ||
      !ownFile(declaration.getSourceFile().fileName)
    ) {
      return undefined;
    }
    return declaration;
  }

  /**
   * The paths to `unknown` a declaration's type holds: those its written
   * type writes, or — for a function expression's parameter whose
   * repository function type is generic (`Visit<unknown>`) — the parameter
   * itself when its instantiated type is `unknown`.
   */
  private writtenPaths(node: ts.Node): readonly Path[] {
    const type = this.instantiatedTypeOf(node);
    return type === undefined ? [] : this.typePaths(type, new Set());
  }

  /**
   * The type the checker gives a declaration, written or inferred: a
   * variable's, a parameter's, a property's; a function's return, what its
   * promise holds for an async one.
   */
  private instantiatedTypeOf(node: ts.Node): ts.Type | undefined {
    if (ts.isFunctionLike(node)) {
      const returned = this.checker
        .getSignatureFromDeclaration(node)
        ?.getReturnType();
      if (returned === undefined) return undefined;
      return isAsync(node)
        ? (this.checker.getAwaitedType(returned) ?? returned)
        : returned;
    }
    if (
      ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node)
    ) {
      return this.checker.getTypeAtLocation(node.name);
    }
    return undefined;
  }

  /**
   * Every path to an `unknown` anywhere in a type: an array's or a tuple's
   * element, a `Map` / `Set` / `Promise` argument, an index signature's
   * value (own or inherited, as instantiated), a member, a function's
   * return, through union and intersection members. A third party's type
   * is its contract and is not walked; a type met again on the way is not
   * walked again (a recursive type).
   */
  private typePaths(type: ts.Type, seen: ReadonlySet<ts.Type>): Path[] {
    if (type.flags & ts.TypeFlags.Unknown) return [[]];
    // A type met again on the way (a recursive type) is not walked again;
    // a walk cut so is kept for no other site.
    if (seen.has(type)) {
      this.cuts += 1;
      return [];
    }
    const known = this.typePathMemo.get(type);
    if (known !== undefined) return known;
    const cutsBefore = this.cuts;
    const deeper = new Set([...seen, type]);
    const under = (step: Step, inner: ts.Type): Path[] =>
      this.typePaths(inner, deeper).map((path) => [step, ...path]);
    let out: Path[] = [];
    if (type.isUnionOrIntersection()) {
      out = type.types.flatMap((member) => this.typePaths(member, deeper));
    } else if ((type.flags & ts.TypeFlags.Object) === 0) {
      return [];
    } else if (this.checker.isTupleType(type) && isReference(type)) {
      out = this.checker
        .getTypeArguments(type)
        .flatMap((member, at) => under({ kind: 'element', at }, member));
    } else if (this.checker.isArrayType(type)) {
      const element = this.checker.getIndexTypeOfType(
        type,
        ts.IndexKind.Number,
      );
      out = element === undefined ? [] : under({ kind: 'element' }, element);
    } else {
      const name = isReference(type)
        ? type.target.getSymbol()?.getName()
        : undefined;
      if (
        name !== undefined &&
        GENERIC_FAMILIES.has(name) &&
        isReference(type)
      ) {
        out = this.checker
          .getTypeArguments(type)
          .flatMap((argument, at) =>
            under({ kind: 'argument', of: name, at }, argument),
          );
      } else {
        // A third party's type (an interface, a class, an alias it
        // declares) is its contract: what it types `unknown` is a boundary.
        // The language's own (`Record`, `Readonly`) is structure, walked;
        // a member of a runtime object it declares (`Error.cause`) is not.
        const declarations = [
          ...(type.aliasSymbol?.declarations ?? []),
          ...(type.getSymbol()?.declarations ?? []),
        ];
        if (
          declarations.length > 0 &&
          declarations.every(
            (declaration) =>
              !ownFile(declaration.getSourceFile().fileName) &&
              !languageFile(declaration),
          )
        ) {
          return [];
        }
        for (const signature of type.getCallSignatures()) {
          out.push(...under({ kind: 'return' }, signature.getReturnType()));
        }
        for (const info of this.checker.getIndexInfosOfType(type)) {
          out.push(...under({ kind: 'index' }, info.type));
        }
        for (const member of this.checker.getPropertiesOfType(type)) {
          // A member a third party declares, or a runtime object of the
          // language (`Error.cause`, of an `Error` or a class of ours
          // extending it), is that contract's.
          const inherited = member.declarations ?? [];
          if (
            inherited.length > 0 &&
            inherited.every(
              (declaration) =>
                !ownFile(declaration.getSourceFile().fileName) &&
                (!languageFile(declaration) ||
                  languageObject(declaration.parent)),
            )
          ) {
            continue;
          }
          const step: Step = this.sinkSlot(member)
            ? { kind: 'member', name: member.getName(), sink: true }
            : { kind: 'member', name: member.getName() };
          out.push(...under(step, this.checker.getTypeOfSymbol(member)));
        }
      }
    }
    const texts = new Set<string>();
    const paths = out.filter((path) => {
      const text = pathText(path);
      if (texts.has(text)) return false;
      texts.add(text);
      return true;
    });
    if (this.cuts === cutsBefore) this.typePathMemo.set(type, paths);
    return paths;
  }

  /**
   * Whether a declaration is a site: it writes its type (or its function
   * type writes it), and that type holds `unknown`. A declaration that
   * writes none is followed by its inferred type's positions all the same.
   */
  private holdsUnknown(node: ts.Node): boolean {
    return (
      this.writtenTypeOf(node) !== undefined &&
      this.writtenPaths(node).length > 0
    );
  }

  /**
   * Every path from a written type to an `unknown` in it. A function type's
   * parameters are sites of their own, and an object type's members too:
   * neither is a position of the type that holds them.
   */
  private unknownPaths(
    node: ts.TypeNode,
    seen: ReadonlySet<ts.Node>,
    /** A generic alias's parameters: the paths of the arguments written for them. */
    bound: ReadonlyMap<string, readonly Path[]> = new Map(),
  ): readonly Path[] {
    const under = (step: Step, inner: ts.TypeNode | undefined): Path[] =>
      inner === undefined
        ? []
        : this.unknownPaths(inner, seen, bound).map((path) => [step, ...path]);
    if (isUnknownNode(node)) return [[]];
    if (
      ts.isParenthesizedTypeNode(node) ||
      ts.isTypeOperatorNode(node) ||
      ts.isOptionalTypeNode(node) ||
      ts.isRestTypeNode(node)
    ) {
      return this.unknownPaths(node.type, seen, bound);
    }
    if (ts.isNamedTupleMember(node))
      return this.unknownPaths(node.type, seen, bound);
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      return node.types.flatMap((member) =>
        this.unknownPaths(member, seen, bound),
      );
    }
    if (ts.isArrayTypeNode(node))
      return under({ kind: 'element' }, node.elementType);
    if (ts.isTupleTypeNode(node)) {
      return node.elements.flatMap((element, at) =>
        under({ kind: 'element', at }, element),
      );
    }
    if (ts.isFunctionTypeNode(node))
      return under({ kind: 'return' }, node.type);
    if (ts.isMappedTypeNode(node)) return under({ kind: 'index' }, node.type);
    if (ts.isTypeLiteralNode(node)) {
      return node.members.flatMap((member) =>
        ts.isIndexSignatureDeclaration(member)
          ? under({ kind: 'index' }, member.type)
          : [],
      );
    }
    if (!ts.isTypeReferenceNode(node)) return [];
    if (ts.isIdentifier(node.typeName) && node.typeArguments === undefined) {
      const argument = bound.get(node.typeName.text);
      if (argument !== undefined) return argument;
    }
    if (this.checker.getTypeFromTypeNode(node).flags & ts.TypeFlags.Unknown) {
      return [[]];
    }
    const name = ts.isIdentifier(node.typeName)
      ? node.typeName.text
      : node.typeName.right.text;
    const args = node.typeArguments ?? [];
    if (name === 'Array' || name === 'ReadonlyArray') {
      return under({ kind: 'element' }, args[0]);
    }
    if (name === 'Record') return under({ kind: 'index' }, args[1]);
    if (SHAPE_KEEPING.has(name)) {
      const [inner] = args;
      return inner === undefined ? [] : this.unknownPaths(inner, seen, bound);
    }
    if (GENERIC_FAMILIES.has(name)) {
      return args.flatMap((arg, at) =>
        under({ kind: 'argument', of: name, at }, arg),
      );
    }
    // An alias or an interface of the repository's own, written without
    // arguments: what the alias stands for, the interface's index
    // signatures (its members are property sites of their own).
    const declarations = this.declarationsOf(
      this.checker.getSymbolAtLocation(node.typeName),
    ).filter(
      (declaration) =>
        !seen.has(declaration) && ownFile(declaration.getSourceFile().fileName),
    );
    const deeper = new Set([...seen, ...declarations]);
    // A generic interface's parameters stand for the arguments written here
    // when it is the one referenced; an inherited one's are not followed.
    const interfaceBound = (
      owner: ts.InterfaceDeclaration,
    ): ReadonlyMap<string, readonly Path[]> =>
      declarations.includes(owner)
        ? new Map(
            (owner.typeParameters ?? []).map((parameter, at) => {
              const argument = args[at] ?? parameter.default;
              return [
                parameter.name.text,
                argument === undefined
                  ? []
                  : this.unknownPaths(argument, seen, bound),
              ];
            }),
          )
        : new Map();
    // A generic alias's parameters stand for the arguments written here.
    const aliasBound = (
      declaration: ts.TypeAliasDeclaration,
    ): ReadonlyMap<string, readonly Path[]> =>
      new Map(
        (declaration.typeParameters ?? []).map((parameter, at) => {
          const argument = args[at] ?? parameter.default;
          return [
            parameter.name.text,
            argument === undefined
              ? []
              : this.unknownPaths(argument, seen, bound),
          ];
        }),
      );
    return declarations.flatMap((declaration) => {
      if (ts.isTypeAliasDeclaration(declaration)) {
        return this.unknownPaths(
          declaration.type,
          deeper,
          aliasBound(declaration),
        );
      }
      if (ts.isInterfaceDeclaration(declaration)) {
        // An index signature its arguments make `unknown` (`Derived<unknown>`
        // of `[key: string]: T`, inherited or not), and every index signature
        // that writes `unknown` itself, its own and those it inherits.
        const instantiated = this.checker
          .getIndexInfosOfType(this.checker.getTypeFromTypeNode(node))
          .some((info) => (info.type.flags & ts.TypeFlags.Unknown) !== 0);
        return [
          ...(instantiated ? [[{ kind: 'index' } satisfies Step]] : []),
          ...this.checker
            .getIndexInfosOfType(this.checker.getTypeAtLocation(declaration))
            .flatMap((info) => {
              const signature = info.declaration;
              return signature !== undefined &&
                ownFile(signature.getSourceFile().fileName)
                ? this.unknownPaths(
                    signature.type,
                    deeper,
                    ts.isInterfaceDeclaration(signature.parent)
                      ? interfaceBound(signature.parent)
                      : new Map(),
                  ).map((path) => [{ kind: 'index' } satisfies Step, ...path])
                : [];
            }),
        ];
      }
      return [];
    });
  }

  /**
   * The paths a declaration's values are read along: each `unknown` in its
   * written type, or the value itself (`[]`) when it writes none. An async
   * function's returns are the values its `Promise` holds.
   */
  private pathsOf(node: ts.Node): readonly Path[] {
    const paths = this.writtenPaths(node);
    return paths.length === 0 ? [[]] : paths.filter((path) => !intoSink(path));
  }

  /** The slot of `SINK_SLOTS` a property symbol is, when it is one. */
  sinkSlot(symbol: ts.Symbol | undefined): string | undefined {
    for (const declaration of symbol?.declarations ?? []) {
      const slot = slotName(declaration);
      if (slot !== undefined && this.slots.has(slot)) return slot;
    }
    return undefined;
  }

  /**
   * Whether a site is a sink by its slots: a slot's own declaration, or a
   * site every `unknown` of which stands under a slot.
   */
  private underSinkSlot(node: ts.Node): boolean {
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      const slot = slotName(node);
      if (slot !== undefined && this.slots.has(slot)) return true;
    }
    const paths = this.writtenPaths(node);
    return paths.length > 0 && paths.every(intoSink);
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
    if (this.declaredInput(node)) {
      cls = 'boundary';
      refused = false;
    } else if (this.underSinkSlot(node)) {
      cls = 'sink';
      refused = false;
    } else if (
      (types.length > 0 || (kind === 'parameter' && origins.length === 0)) &&
      this.inSinkContract(node)
    ) {
      cls = 'sink';
      refused = false;
    } else if (
      types.length > 0 &&
      (origins.includes('thrown') ||
        // A failure slot: `Error`s of ours beside values from outside (a
        // promise's rejection reached through a library's combinator).
        (hasBoundary &&
          origins.every(
            (origin) => typeof origin !== 'object' || origin.error,
          )))
    ) {
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
    const position = this.writtenPaths(node).map(pathText).join(' ');
    return {
      kind,
      position,
      where: lineOf(node),
      name: nameOf(node),
      key,
      cls,
      types,
      refused,
    };
  }

  /**
   * Whether a function is a promise's rejection handler (`catch`'s, or
   * `then`'s second): what its parameter takes is a thrown value.
   */
  private rejectionHandler(fn: ts.Node): boolean {
    const call = fn.parent;
    if (!ts.isCallExpression(call)) return false;
    const callee = strip(call.expression);
    if (!ts.isPropertyAccessExpression(callee)) return false;
    const at = call.arguments.findIndex((argument) => strip(argument) === fn);
    const method = callee.name.text;
    if (
      !((method === 'catch' && at === 0) || (method === 'then' && at === 1))
    ) {
      return false;
    }
    const receiver = this.checker.getTypeAtLocation(callee.expression);
    const name = (receiver.aliasSymbol ?? receiver.getSymbol())?.getName();
    return name !== undefined && GENERIC_FAMILIES.get(name) === 'Promise';
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
    // A function expression handed to a function type of the repository:
    // that type, whose calls hand it its arguments.
    if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
      const contract = this.contextualDeclaration(fn);
      if (contract !== undefined && contract !== fn) out.push(contract);
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

  /**
   * Whether a site is declared with an input type (`INPUT_TYPES`): a tool's
   * arguments before their schema, the environment, the program's
   * arguments. What reaches it is input, whoever hands it on.
   */
  private declaredInput(node: ts.Node): boolean {
    const type = this.writtenTypeOf(node);
    if (type === undefined) return false;
    const input = (member: ts.TypeNode): boolean => {
      if (!ts.isTypeReferenceNode(member)) return false;
      const name = ts.isIdentifier(member.typeName)
        ? member.typeName.text
        : member.typeName.right.text;
      return INPUT_TYPES.has(name);
    };
    if (input(type)) return true;
    // An input type intersected with typed members (`{ object_type?: T } &
    // ToolArgs`): its every `unknown` is the input's.
    return (
      ts.isIntersectionTypeNode(type) &&
      type.types.some(input) &&
      type.types.every(
        (member) =>
          input(member) ||
          this.typePaths(this.checker.getTypeFromTypeNode(member), new Set())
            .length === 0,
      )
    );
  }

  /** The names of the interfaces and types a function's aliases belong to. */
  private inSinkContract(node: ts.Node): boolean {
    const fn = ts.isFunctionLike(node) ? node : this.parameterPlace(node)?.fn;
    if (!fn) return false;
    for (const alias of this.aliasesOf(fn)) {
      if (alias === fn) continue;
      // The contract the member belongs to: the interface, class or type
      // alias that holds it, however deep (a function type of a member).
      let owner: ts.Node | undefined = alias.parent;
      while (
        owner !== undefined &&
        !ts.isInterfaceDeclaration(owner) &&
        !ts.isClassDeclaration(owner) &&
        !ts.isTypeAliasDeclaration(owner)
      ) {
        owner = owner.parent;
      }
      if (
        owner !== undefined &&
        owner.name !== undefined &&
        SINK_CONTRACTS.includes(owner.name.text)
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
    // The contracts it is handed to: a function expression's own context,
    // or the context of every place a named function is handed on by name.
    const contexts =
      ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)
        ? [this.checker.getContextualType(fn)]
        : this.aliasesOf(fn).flatMap((alias) =>
            (this.handedAt.get(alias) ?? []).map((handed) =>
              this.checker.getContextualType(handed),
            ),
          );
    const signatures = contexts.flatMap((contextual) => {
      const signature =
        contextual === undefined
          ? undefined
          : this.checker.getNonNullableType(contextual).getCallSignatures()[0];
      return signature === undefined ? [] : [signature];
    });
    if (signatures.length > 0) {
      // The contract's type at each position the site writes `unknown`: a
      // callback typed as its contract instantiates it is open, wherever
      // the instantiation put `unknown`; one that writes `unknown` where
      // the contract has a type is refused with that type.
      const typed = signatures.flatMap((signature) => {
        const parameter = signature.parameters[at];
        if (!parameter) return [];
        return this.pathsOf(node).flatMap((path) =>
          this.typesAlong(this.checker.getTypeOfSymbol(parameter), path).filter(
            (each) => !this.absent(each) && !this.contractless(each),
          ),
        );
      });
      return typed.length === 0
        ? 'open'
        : [...new Set(typed.map((each) => this.checker.typeToString(each)))]
            .sort()
            .join(' | ');
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
      // Whole arguments only; the rest is `argumentSources`'.
      return this.argumentSources(node).flatMap((reached) =>
        reached.inside.length === 0 && !reached.element ? [reached.value] : [],
      );
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

  /**
   * What a call's arguments hand parameter `at` (`rest`: a rest parameter,
   * which takes every argument from `at` on as its elements). Each reached
   * value comes with the steps into it before the parameter's own position:
   * none for a plain argument, `[k]` for a fixed tuple spread's member,
   * `[]` for an array spread's element. Positions are counted through fixed
   * tuple spreads; after an array spread, every later argument may reach
   * any parameter at or after the spread's place.
   */
  private argumentAt(
    args: ts.NodeArray<ts.Expression>,
    at: number,
    rest: boolean,
  ): {
    readonly value: ts.Expression;
    readonly inside: Path;
    readonly element: boolean;
  }[] {
    const out: { value: ts.Expression; inside: Path; element: boolean }[] = [];
    let place = 0;
    // The place an array spread opened at: from there on, places are not known.
    let openFrom: number | undefined;
    // A rest parameter takes every argument from its place on, wherever a
    // spread left the count; another parameter, once an array spread made
    // the places unknown, any argument after it.
    const reaches = (position: number): boolean =>
      rest
        ? openFrom !== undefined || position >= at
        : openFrom !== undefined
          ? at >= openFrom
          : position === at;
    for (const argument of args) {
      if (!ts.isSpreadElement(argument)) {
        if (reaches(place))
          out.push({ value: argument, inside: [], element: rest });
        place += 1;
        continue;
      }
      const type = this.checker.getTypeAtLocation(argument.expression);
      const fixed =
        this.checker.isTupleType(type) && isReference(type)
          ? this.checker.getTypeArguments(type).length
          : undefined;
      if (fixed === undefined) {
        if (rest || (openFrom === undefined ? at >= place : at >= openFrom)) {
          // Its elements: a rest parameter's elements, or the parameter itself.
          out.push({
            value: argument.expression,
            inside: [{ kind: 'element' }],
            element: rest,
          });
        }
        openFrom ??= place;
        continue;
      }
      for (let member = 0; member < fixed; member += 1) {
        if (reaches(place + member)) {
          out.push({
            value: argument.expression,
            inside: [{ kind: 'element', at: member }],
            element: rest,
          });
        }
      }
      place += fixed;
    }
    return out;
  }

  /** Every value the calls of a parameter's function hand it ({@link argumentAt}). */
  private argumentSources(node: ts.Node): {
    readonly value: ts.Expression;
    readonly inside: Path;
    readonly element: boolean;
  }[] {
    const place = this.parameterPlace(node);
    if (!place || !ts.isParameter(node)) return [];
    const rest = node.dotDotDotToken !== undefined;
    const out: { value: ts.Expression; inside: Path; element: boolean }[] = [];
    for (const alias of this.aliasesOf(place.fn)) {
      for (const args of this.calls.get(alias) ?? []) {
        out.push(...this.argumentAt(args, place.at, rest));
      }
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
    const distinct = this.collectOrigins(node, this.pathsOf(node));
    this.active.delete(node);
    this.memo.set(node, distinct);
    return distinct;
  }

  /**
   * The origins of what a declaration holds at `path`, whatever its own
   * positions: a value followed to where it was made is read there at the
   * position asked for, not as a whole.
   */
  private originsOfSiteAt(node: ts.Node, path: Path): readonly Origin[] {
    const key = pathText(path);
    let byPath = this.memoAt.get(node);
    const known = byPath?.get(key);
    if (known) return known;
    if (byPath === undefined) {
      byPath = new Map();
      this.memoAt.set(node, byPath);
    }
    // A cycle reached again adds nothing.
    byPath.set(key, []);
    const distinct = this.collectOrigins(node, [path]);
    byPath.set(key, distinct);
    return distinct;
  }

  /** What reaches a declaration at each of `paths`: its arguments, sources and contents. */
  private collectOrigins(node: ts.Node, paths: readonly Path[]): Origin[] {
    const origins = [
      // An argument reached inside a spread, or an element of a rest
      // parameter: read at the parameter's position, below the element.
      ...this.argumentSources(node).flatMap(({ value, inside, element }) =>
        inside.length === 0 && !element
          ? []
          : paths.flatMap((path) => {
              const [first, ...below] = path;
              const own = element
                ? first?.kind === 'element'
                  ? below
                  : undefined
                : path;
              return own === undefined
                ? this.originsAt(value, [...inside, ...path])
                : this.originsAt(value, [...inside, ...own]);
            }),
      ),
      ...this.sourcesOf(node).flatMap((source) =>
        paths.flatMap((path) => this.originsAt(source, path)),
      ),
      // What is written into the container, at the position it fills.
      ...(this.contents.get(node) ?? []).flatMap((written) =>
        paths.flatMap((path) => {
          const at = written.path.length;
          if (
            path.length < at ||
            !written.path.every((step, i) => {
              const position = path[i];
              return position !== undefined && sameStep(position, step);
            })
          ) {
            return [];
          }
          return this.originsAt(written.value, [
            ...written.inside,
            ...path.slice(at),
          ]);
        }),
      ),
    ];
    return distinctOrigins(origins);
  }

  /** A typed origin: its type's text, and whether it is an `Error`. */
  private typedOrigin(type: ts.Type): Origin {
    return {
      typed: this.checker.typeToString(
        this.checker.getBaseTypeOfLiteralType(type),
      ),
      error: this.errorType(type),
    };
  }

  /** Whether a type is the language's `Error` or extends it (each member of a union). */
  private errorType(
    type: ts.Type,
    seen: ReadonlySet<ts.Type> = new Set(),
  ): boolean {
    if (seen.has(type)) return false;
    const deeper = new Set([...seen, type]);
    if (type.isUnion()) {
      return type.types.every(
        (member) => this.absent(member) || this.errorType(member, deeper),
      );
    }
    const target = isReference(type) ? type.target : type;
    const symbol = target.getSymbol();
    if (
      symbol?.getName() === 'Error' &&
      (symbol.declarations ?? []).some(languageFile)
    ) {
      return true;
    }
    return (
      target.isClassOrInterface() &&
      (this.checker.getBaseTypes(target) ?? []).some((base) =>
        this.errorType(base, deeper),
      )
    );
  }

  /** No contract beyond "a value": unknown, any, or a bag of them. */
  private contractless(
    type: ts.Type,
    seen: ReadonlySet<ts.Type> = new Set(),
  ): boolean {
    if (type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return true;
    // A recursive type (a JSON value, say) is read once.
    if (seen.has(type)) return false;
    const deeper = new Set([...seen, type]);
    const inner = (t: ts.Type) => this.contractless(t, deeper);
    // A type parameter, or a type computed from one (`Awaited<T>`, `T[K]`):
    // what its constraint allows.
    if (type.flags & ts.TypeFlags.Instantiable) {
      const constraint = this.checker.getBaseConstraintOfType(type);
      return (
        constraint === undefined || constraint === type || inner(constraint)
      );
    }
    if (type.isUnion()) return type.types.some(inner);
    if (this.checker.isTupleType(type) && isReference(type)) {
      return this.checker.getTypeArguments(type).some(inner);
    }
    if (isReference(type)) {
      const name = type.target.getSymbol()?.getName();
      if (name !== undefined && GENERIC_FAMILIES.has(name)) {
        return this.checker.getTypeArguments(type).some(inner);
      }
    }
    if (this.checker.isArrayType(type)) {
      const element = this.checker.getIndexTypeOfType(
        type,
        ts.IndexKind.Number,
      );
      return element !== undefined && inner(element);
    }
    if (type.getProperties().length > 0 || type.getCallSignatures().length) {
      return false;
    }
    const index = this.checker.getIndexInfosOfType(type);
    return index.length > 0 && index.every((info) => inner(info.type));
  }

  /**
   * `undefined`, `null`, `void` or `never` alone: no value, so no origin
   * (an empty array literal holds `never`).
   */
  private absent(type: ts.Type): boolean {
    const parts = type.isUnion() ? type.types : [type];
    return parts.every(
      (part) =>
        (part.flags &
          (ts.TypeFlags.Undefined |
            ts.TypeFlags.Null |
            ts.TypeFlags.Void |
            ts.TypeFlags.Never)) !==
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

  /**
   * The types a type holds along a path; where a step has no such position,
   * the types reached before it.
   */
  private typesAlong(type: ts.Type, path: Path): ts.Type[] {
    let at: ts.Type[] = [type];
    for (const step of path) {
      const reached: ts.Type[] = [];
      for (const each of at) {
        if (this.absent(each)) continue;
        const projected = this.project(each, step);
        if (projected === undefined) return at;
        reached.push(...projected);
      }
      at = reached;
    }
    return at;
  }

  /** The types at `step` inside `type`; `undefined` where it has no such position. */
  private project(type: ts.Type, step: Step): ts.Type[] | undefined {
    if (type.isUnion()) {
      const parts = type.types
        .filter((part) => !this.absent(part))
        .map((part) => this.project(part, step));
      return parts.every((part) => part === undefined)
        ? undefined
        : parts.flatMap((part) => part ?? []);
    }
    // A value that is no object holds no position: it is read whole.
    if ((type.flags & ts.TypeFlags.Object) === 0) return undefined;
    switch (step.kind) {
      case 'element': {
        if (this.checker.isTupleType(type) && isReference(type)) {
          const members = this.checker.getTypeArguments(type);
          const one = step.at === undefined ? undefined : members[step.at];
          return one === undefined ? [...members] : [one];
        }
        const element = this.checker.getIndexTypeOfType(
          type,
          ts.IndexKind.Number,
        );
        return element === undefined ? undefined : [element];
      }
      case 'index': {
        // A list read by key holds its elements, not its methods.
        if (this.checker.isArrayType(type) || this.checker.isTupleType(type)) {
          return this.project(type, { kind: 'element' });
        }
        const index =
          this.checker.getIndexTypeOfType(type, ts.IndexKind.String) ??
          this.checker.getIndexTypeOfType(type, ts.IndexKind.Number);
        const members = this.checker
          .getPropertiesOfType(type)
          .map((member) => this.checker.getTypeOfSymbol(member));
        if (index === undefined && members.length === 0) {
          return type.getCallSignatures().length > 0 ? undefined : [];
        }
        return index === undefined ? members : [index, ...members];
      }
      case 'argument': {
        const family = GENERIC_FAMILIES.get(step.of);
        if (family === 'Promise')
          return [this.checker.getAwaitedType(type) ?? type];
        if (!isReference(type)) return undefined;
        const name = type.target.getSymbol()?.getName();
        if (name === undefined || GENERIC_FAMILIES.get(name) !== family) {
          return undefined;
        }
        const argument = this.checker.getTypeArguments(type)[step.at];
        return argument === undefined ? undefined : [argument];
      }
      case 'member': {
        const member = this.checker.getPropertyOfType(type, step.name);
        return member === undefined
          ? undefined
          : [this.checker.getTypeOfSymbol(member)];
      }
      case 'return': {
        const signatures = type.getCallSignatures();
        return signatures.length === 0
          ? undefined
          : signatures.map((signature) => signature.getReturnType());
      }
    }
  }

  /**
   * The origins of what `source` puts at `path`: an array literal's
   * elements, an object literal's members and a function expression's
   * returns one by one; any other value by its type at that position, typed
   * where the position has a contract, else followed to where the value
   * was made.
   */
  private originsAt(source: ts.Expression, path: Path): readonly Origin[] {
    const [step, ...rest] = path;
    if (step === undefined) return this.originsOf(source);
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
      return parts.flatMap((part) => this.originsAt(part, path));
    }
    if (step.kind === 'element' && ts.isArrayLiteralExpression(expression)) {
      const spread = expression.elements.some(ts.isSpreadElement);
      return expression.elements.flatMap((element, at) => {
        if (ts.isSpreadElement(element)) {
          return this.originsAt(element.expression, path);
        }
        if (ts.isOmittedExpression(element)) return [];
        if (step.at !== undefined && !spread && at !== step.at) return [];
        return this.originsAt(element, rest);
      });
    }
    if (
      (step.kind === 'index' || step.kind === 'member') &&
      ts.isObjectLiteralExpression(expression)
    ) {
      return expression.properties.flatMap((member) => {
        // A member position takes its own member's value alone.
        if (
          step.kind === 'member' &&
          !ts.isSpreadAssignment(member) &&
          member.name !== undefined &&
          // A computed key of no literal may be any member.
          propertyName(member.name) !== undefined &&
          propertyName(member.name) !== step.name
        ) {
          return [];
        }
        if (ts.isPropertyAssignment(member)) {
          return this.originsAt(member.initializer, rest);
        }
        if (ts.isShorthandPropertyAssignment(member)) {
          return this.originsAt(member.name, rest);
        }
        if (ts.isSpreadAssignment(member)) {
          return this.originsAt(member.expression, path);
        }
        return [];
      });
    }
    if (
      step.kind === 'return' &&
      (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression))
    ) {
      return this.returnsOf(expression).flatMap((value) =>
        this.originsAt(value, rest),
      );
    }
    // A container made empty (`new Map()`) holds nothing yet.
    if (
      ts.isNewExpression(expression) &&
      (expression.arguments === undefined || expression.arguments.length === 0)
    ) {
      return [];
    }
    // A map, a set or a promise made from values: what it was made from.
    if (ts.isNewExpression(expression) && step.kind === 'argument') {
      const made = this.constructorContents(expression, step, rest);
      if (made !== undefined) return made;
    }
    const boundary = this.boundaryOrigin(expression);
    if (boundary) return [boundary];
    const type = awaits(source)
      ? this.checker.getTypeAtLocation(source)
      : this.checker.getTypeAtLocation(expression);
    if (this.absent(type)) return [];
    let at: ts.Type[] | undefined = [type];
    for (const next of path) {
      const reached: ts.Type[] = [];
      for (const each of at ?? []) {
        if (this.absent(each)) continue;
        const projected = this.project(each, next);
        if (projected === undefined) {
          at = undefined;
          break;
        }
        reached.push(...projected);
      }
      if (at === undefined) break;
      at = reached;
    }
    // A value whose type the position cannot be projected through (a class
    // that holds one, a type the walk reached by another way): followed to
    // where it was made, whose own positions say what it holds.
    if (at === undefined) return this.madeAt(source, path);
    const present = at.filter((each) => !this.absent(each));
    if (present.length === 0) return [];
    const typed = present.filter((each) => !this.contractless(each));
    if (typed.length > 0) {
      return typed.map((each) => this.typedOrigin(each));
    }
    return this.madeAt(source, path);
  }

  /**
   * A value whose type has no contract at `path`: followed to where it was
   * made, and read there at `path`.
   */
  private madeAt(source: ts.Expression, path: Path): readonly Origin[] {
    const expression = strip(source);
    if (
      !this.absent(this.checker.getTypeAtLocation(expression)) &&
      this.fromProgramInput(expression, new Set())
    ) {
      return ['boundary'];
    }
    const root = accessRoot(expression);
    if (root !== expression && this.declaredContractless(root)) {
      return this.followed(root).map((origin) =>
        origin === 'boundary' || origin === 'thrown' ? origin : 'opaque',
      );
    }
    return this.followed(expression, path);
  }

  /**
   * What a library container constructor puts at `step`: a `Map`'s entries
   * (`[key, value]` each), a `Set`'s elements, what a `Promise`'s executor
   * resolves it with. `undefined` for any other constructor.
   */
  private constructorContents(
    made: ts.NewExpression,
    step: Extract<Step, { kind: 'argument' }>,
    rest: Path,
  ): readonly Origin[] | undefined {
    const family = GENERIC_FAMILIES.get(step.of);
    const [first] = made.arguments ?? [];
    if (first === undefined || ts.isSpreadElement(first)) return undefined;
    if (family === 'Map') {
      return this.originsAt(first, [
        { kind: 'element' },
        { kind: 'element', at: step.at },
        ...rest,
      ]);
    }
    if (family === 'Set') {
      return this.originsAt(first, [{ kind: 'element' }, ...rest]);
    }
    const executor = strip(first);
    if (
      family !== 'Promise' ||
      (!ts.isArrowFunction(executor) && !ts.isFunctionExpression(executor))
    ) {
      return undefined;
    }
    const resolve = executor.parameters[0];
    if (resolve === undefined || !ts.isIdentifier(resolve.name)) return [];
    // The resolver, and every variable it is copied to (`const finish =
    // resolve`), by symbol: a name shadowed in a nested function is another.
    const resolver = this.checker.getSymbolAtLocation(resolve.name);
    if (resolver === undefined) return [];
    const symbols = new Set([resolver]);
    const collect = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        const made = strip(node.initializer);
        const source = ts.isIdentifier(made)
          ? this.checker.getSymbolAtLocation(made)
          : undefined;
        const copy = this.checker.getSymbolAtLocation(node.name);
        if (source !== undefined && symbols.has(source) && copy !== undefined) {
          symbols.add(copy);
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(executor.body);
    const out: Origin[] = [];
    const visit = (node: ts.Node): void => {
      const callee =
        ts.isCallExpression(node) && ts.isIdentifier(node.expression)
          ? this.checker.getSymbolAtLocation(node.expression)
          : undefined;
      if (
        ts.isCallExpression(node) &&
        callee !== undefined &&
        symbols.has(callee)
      ) {
        for (const reached of this.argumentAt(node.arguments, 0, false)) {
          out.push(
            ...this.originsAt(reached.value, [...reached.inside, ...rest]),
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(executor.body);
    return out;
  }

  /**
   * Where a value comes from. `contentless`: its own type has a contract
   * (a `Map`, an object) but what it holds at the position read has none,
   * so it is followed to where it was made rather than typed.
   */
  private originsOf(
    source: ts.Expression,
    contentless = false,
  ): readonly Origin[] {
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
      return parts.flatMap((part) => this.originsOf(part, contentless));
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
    if (!contentless && !this.contractless(type)) {
      return [this.typedOrigin(type)];
    }
    return this.followed(expression);
  }

  /**
   * A contract-less value: follow it to where it was made — read at `path`
   * when a position is asked for, else at the declaration's own positions.
   */
  private followed(expression: ts.Expression, path?: Path): readonly Origin[] {
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
    if (external(target)) {
      // A library call widened to `unknown` by its written type arguments
      // (`Promise.resolve<unknown>(order)`): what it holds is its arguments.
      if (
        ts.isCallExpression(expression) &&
        (expression.typeArguments ?? []).some(
          (argument) => this.unknownPaths(argument, new Set()).length > 0,
        )
      ) {
        return expression.arguments.flatMap((argument) =>
          ts.isSpreadElement(argument) ? [] : this.originsOf(argument),
        );
      }
      return ['boundary'];
    }
    if (ts.isVariableDeclaration(target) && ts.isCatchClause(target.parent)) {
      return ['thrown'];
    }
    // A name destructured from a variable's value (`const { error } =
    // rejected`): that value, at the member or element it names.
    if (
      ts.isBindingElement(target) &&
      ts.isVariableDeclaration(target.parent.parent) &&
      target.parent.parent.initializer !== undefined &&
      target.dotDotDotToken === undefined
    ) {
      const pattern = target.parent;
      const key = propertyName(target.propertyName ?? target.name);
      const step: Step | undefined = ts.isObjectBindingPattern(pattern)
        ? key === undefined
          ? undefined
          : { kind: 'member', name: key }
        : { kind: 'element', at: pattern.elements.indexOf(target) };
      if (step !== undefined) {
        return this.originsAt(target.parent.parent.initializer, [
          step,
          ...(path ?? []),
        ]);
      }
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
      // An async function's returns are what its promise holds.
      const [first, ...below] = path ?? [];
      const at =
        ts.isFunctionLike(target) &&
        isAsync(target) &&
        first?.kind === 'argument' &&
        GENERIC_FAMILIES.get(first.of) === 'Promise'
          ? below
          : path;
      const origins =
        at === undefined
          ? this.originsOfSite(target)
          : this.originsOfSiteAt(target, at);
      if (origins.length > 0) return origins;
      if (ts.isParameter(target)) {
        if (this.rejectionHandler(target.parent)) return ['thrown'];
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
  slots: ReadonlyMap<string, string> = SINK_SLOTS,
): UnknownSite[] {
  const own = new Set([...files].map(fileKey));
  const owned = (file: ts.SourceFile) => own.has(fileKey(file.fileName));
  const scan = new ProvenanceScan(program, owned, readers, slots);
  return program
    .getSourceFiles()
    .filter(owned)
    .flatMap((file) => scan.sitesOf(file));
}

/** A read of a sink slot by a function other than the slot's reader. */
export interface SlotRead {
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  readonly slot: string;
  /** `file#function`: the function that reads it. */
  readonly reader: string;
}

/**
 * Every read of a slot of `slots` in `files` outside the function the slot
 * names, and the slots found declared: a property read (`item.json`, with
 * `?.` or by a literal key) that is not the target of an assignment.
 */
export function sinkSlotReads(
  program: ts.Program,
  files: ReadonlySet<string>,
  slots: ReadonlyMap<string, string> = SINK_SLOTS,
): { readonly reads: SlotRead[]; readonly declared: ReadonlySet<string> } {
  const own = new Set([...files].map(fileKey));
  const checker = program.getTypeChecker();
  const reads: SlotRead[] = [];
  const declared = new Set<string>();
  for (const file of program.getSourceFiles()) {
    if (!own.has(fileKey(file.fileName))) continue;
    /** Each member read at `node` that is a slot, read outside its reader. */
    const noteReads = (
      node: ts.Node,
      members: readonly (ts.Symbol | undefined)[],
    ): void => {
      const reader = `${rel(file.fileName)}#${ownerOf(node)}`;
      for (const member of members) {
        for (const declaration of member?.declarations ?? []) {
          const read = slotName(declaration);
          if (
            read !== undefined &&
            slots.has(read) &&
            slots.get(read) !== reader
          ) {
            reads.push({ where: lineOf(node), slot: read, reader });
          }
        }
      }
    };
    const visit = (node: ts.Node): void => {
      const slot = slotName(node);
      if (slot !== undefined && slots.has(slot)) declared.add(slot);
      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        !(
          ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          node.parent.left === node
        )
      ) {
        // A read by a computed key reads every member its key may name: a
        // literal's, each of a union of literals', any for another key.
        const members = ts.isPropertyAccessExpression(node)
          ? [checker.getSymbolAtLocation(node.name)]
          : keyedMembers(
              checker,
              checker.getTypeAtLocation(node.expression),
              checker.getTypeAtLocation(node.argumentExpression),
            );
        noteReads(node, members);
      }
      // An assignment destructuring (`({ json: value } = item)`).
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isObjectLiteralExpression(strip(node.left))
      ) {
        const pattern = strip(node.left);
        const source = checker.getTypeAtLocation(node.right);
        if (ts.isObjectLiteralExpression(pattern)) {
          for (const element of pattern.properties) {
            if (
              !ts.isPropertyAssignment(element) &&
              !ts.isShorthandPropertyAssignment(element)
            ) {
              continue;
            }
            const key = propertyName(element.name);
            noteReads(
              element,
              key === undefined
                ? checker.getPropertiesOfType(source)
                : [checker.getPropertyOfType(source, key)],
            );
          }
        }
      }
      // A destructured read: `const { json } = item`.
      if (
        ts.isBindingElement(node) &&
        ts.isObjectBindingPattern(node.parent) &&
        node.dotDotDotToken === undefined
      ) {
        const key = propertyName(node.propertyName ?? node.name);
        const source = checker.getTypeAtLocation(node.parent);
        noteReads(
          node,
          key === undefined
            ? checker.getPropertiesOfType(source)
            : [source.getProperty(key)],
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { reads, declared };
}

/**
 * The members a computed key may read on a receiver: the member a literal
 * key names, each a union of literals names, every member for any other key.
 */
function keyedMembers(
  checker: ts.TypeChecker,
  receiver: ts.Type,
  key: ts.Type,
): (ts.Symbol | undefined)[] {
  const holders = checker.getNonNullableType(receiver);
  const keys = key.isUnion() ? key.types : [key];
  if (keys.every((each) => each.isStringLiteral() || each.isNumberLiteral())) {
    return keys.flatMap((each) =>
      each.isStringLiteral() || each.isNumberLiteral()
        ? [checker.getPropertyOfType(holders, String(each.value))]
        : [],
    );
  }
  return checker.getPropertiesOfType(holders);
}

/** Every stray read of a sink slot in every production project, and the slots declared. */
export function productionSinkSlotReads(): {
  readonly reads: SlotRead[];
  readonly declared: ReadonlySet<string>;
} {
  const declared = new Set<string>();
  const reads = eachProductionProject((program, own) => {
    const found = sinkSlotReads(program, own);
    for (const slot of found.declared) declared.add(slot);
    return found.reads;
  });
  return { reads, declared };
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
        // `satisfies` gives its operand a contextual type but leaves the
        // expression's own type: what counts is where the whole lands.
        let outer: ts.Expression = node;
        while (
          ts.isParenthesizedExpression(outer.parent) ||
          ts.isAwaitExpression(outer.parent) ||
          ts.isSatisfiesExpression(outer.parent)
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

/**
 * Every production project: its configuration and the files it owns. The
 * root's TypeScript scripts are checked by `tsconfig.test.json`, the one
 * project whose `include` reaches them. A JavaScript source (`bin`, the
 * `.mjs` scripts and tools) carries no type for the audit to follow.
 */
export function productionProjects(): { tsconfig: string; dir: string }[] {
  const out = [
    { tsconfig: 'tsconfig.json', dir: 'src' },
    { tsconfig: 'tsconfig.test.json', dir: 'scripts' },
  ];
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
            !file.includes(`${path.sep}__fixtures__${path.sep}`) &&
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
