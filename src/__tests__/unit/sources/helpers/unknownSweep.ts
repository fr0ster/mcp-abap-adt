/**
 * The `unknown` audit (spec §4), a sweep of every node: whatever static type
 * checking can verify is verified statically, so a value is typed by its
 * contract and `unknown` (or `any`) stays only where the compiler cannot see
 * the value — a caught value, a parsed document, the environment, a tool's
 * arguments before their schema — or where a named contract types it so.
 *
 * Every declaration and every expression of production code is visited. Its
 * type is taken from the checker and walked to any depth: array and tuple
 * elements, type arguments, index signatures (own and inherited, as
 * instantiated), union and intersection members, a function's parameters
 * and return, an object's members; a recursive type is cut where it repeats.
 * A third party's type (declared outside the repository) is its contract and
 * is not walked: what it types `unknown` is the boundary itself. The type
 * arguments the repository writes for one (`IAdtResponse<unknown, …>`) are
 * ours, and are walked where they are written. The
 * language's own structure (`Record`, `Readonly`, `Array`, `Promise`, `Map`)
 * is walked; a member of a runtime object of the language (`Error.cause`) is
 * not a position.
 *
 * Each `unknown` found is charged to the node that writes it, once: a
 * member, a parameter or a return whose own declared type holds it is that
 * declaration's site, not every holder's; an object literal's member is its
 * expression's; an inferred instantiation (`new Set()`, `Promise.resolve<
 * unknown>(order)`) is the call's, unless an argument or the receiver
 * brought the `unknown` in. A site is refused unless it is one of the
 * boundaries (`BoundaryKind`): no flow is followed, so a form the sweep does
 * not know is refused, never passed.
 *
 * Three checks run beside the holding check:
 * - **any**: an expression of type `any` (a library's answer) lands only
 *   where `unknown` or `any` is expected, is discarded or only inspected
 *   (`typeof`, a comparison); an `any` inside a type does not land where
 *   the contract has a type;
 * - **widening**: a typed value put where `unknown` is expected is charged
 *   to that slot (its `types`); into a listed parse site it is refused, into
 *   a third party's member it is remembered, and a read of that member back
 *   by the repository is refused (`read-back`);
 * - **sink slots** (`sinkSlotReads`): a slot of `SINK_SLOTS` is read only by
 *   its one reader.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, rel } from './failureScan';

/**
 * The boundary kinds, the one list a site may pass under. A kind that needs
 * an exact site names it `file#owner(name)` in `ListedSites`; every other
 * kind is recognised by its form.
 * - `caught`: a `catch` binding, a promise's rejection handler's parameter;
 * - `thrown`: a reader of thrown values or a failure slot (`THROWN_READERS`);
 * - `parse`: a parse result up to the function that checks it, listed;
 * - `program-input`: a value of `process.argv` / `process.env`, listed;
 * - `tool-args`: tool-argument input until it is checked — a declaration
 *   written `ToolArgs` or `X & ToolArgs` with a typed `X`, a value read out
 *   of them (`ToolArgValue`: a member, a nested object's, a list's element),
 *   and a function returning them;
 * - `sink-contract`: a member of a contract of `SINK_CONTRACTS`, a function
 *   implementing one, or a listed sink site;
 * - `sink-slot`: a slot of `SINK_SLOTS`;
 * - `callback`: a parameter or a return a contract outside the repository
 *   (or a boundary of the repository's) types `unknown` at every place the
 *   function is handed to it.
 */
export type BoundaryKind =
  | 'caught'
  | 'thrown'
  | 'parse'
  | 'program-input'
  | 'tool-args'
  | 'sink-contract'
  | 'sink-slot'
  | 'callback';

/** The kinds named by exact site: `file#owner(name)` each. */
export interface ListedSites {
  readonly thrown: ReadonlySet<string>;
  readonly parse: ReadonlySet<string>;
  readonly programInput: ReadonlySet<string>;
  readonly sink: ReadonlySet<string>;
}

/**
 * Contracts whose members take a value of any type by design: the logger's
 * (`ILogger`), the serializer of a value into a tool answer's text
 * (`IAnswerSerializer`, `src/lib/answerSerializer.ts`), and a registered tool
 * callback as the MCP SDK calls it (`RegisteredToolCallback`,
 * `src/embeddable/BaseMcpServer.ts`).
 */
export const SINK_CONTRACTS: readonly string[] = [
  'ILogger',
  'IAnswerSerializer',
  'RegisteredToolCallback',
];

/**
 * Slots of a contract whose value only leaves the program — serialized to
 * JSON, given to the MCP SDK — and is never read back, each with the one
 * function that reads it to hand it out (`file#function`).
 */
export const SINK_SLOTS: ReadonlyMap<string, string> = new Map([
  ['ToolContentItem.json', 'src/lib/toolResult.ts#normalizeToolContent'],
  ['ToolContentItem.text', 'src/lib/toolResult.ts#normalizeToolContent'],
]);

/**
 * The readers of thrown values and the failure slots (the owner's
 * decision): whatever is thrown reaches them untyped. Named
 * `file#owner(name)`; an entry no site has is stale.
 */
export const THROWN_READERS: ReadonlySet<string> = new Set<string>([
  'server-runtime/src/http/InstancePool.ts#failureWordsOf(e)',
  'server-runtime/src/http/InstancePool.ts#ownFailures(e)',
  'server-runtime/src/http/InstancePool.ts#ownFailures(value)',
  'server-runtime/src/http/StreamableHttpServer.ts#createRequestHandler(error)',
  'server-runtime/src/sse/SseServer.ts#answerFailure(error)',
  'server-runtime/src/sse/SseServer.ts#failureWords(error)',
  'server-runtime/src/stdio/StdioServer.ts#noConnectionOf(thrown)',
  'server-runtime/src/stdio/StdioServer.ts#readFailure(thrown)',
  'server-runtime/src/stdio/auth/brokerFactory.ts#ownValue(ownValue)',
  'server-runtime/src/stdio/auth/brokerFactory.ts#ownValue(value)',
  'server-runtime/src/stdio/auth/brokerFactory.ts#unstoredLines(error)',
  'server-runtime/src/stdio/auth/destinationFailure.ts#destinationConfigFailure(thrown)',
  'server-runtime/src/stdio/auth/destinationFailure.ts#destinationFailureOf(thrown)',
  'server-runtime/src/stdio/auth/destinationFailure.ts#destinationFailureWords(thrown)',
  'server-runtime/src/stdio/auth/destinationFailure.ts#recordFormatFailure(thrown)',
  'server-runtime/src/stdio/launcher.ts#launcherFailedLine(thrown)',
  'server-runtime/src/stdio/launcher.ts#startConnectionWords(error)',
  'server-runtime/src/stdio/launcher.ts#startupWords(error)',
  'src/embeddable/BaseMcpServer.ts#readFailure(thrown)',
  'src/embeddable/BaseMcpServer.ts#refusalAnswer(error)',
  'src/handlers/enhancement/readonly/handleGetEnhancements.ts#Resolved(error)',
  'src/handlers/enhancement/readonly/handleGetEnhancements.ts#carriedFailures(error)',
  'src/handlers/enhancement/readonly/handleGetEnhancements.ts#credentialFailure(thrown)',
  'src/handlers/enhancement/readonly/handleGetEnhancements.ts#enhancementsAnswerFrom(thrown)',
  'src/handlers/enhancement/readonly/handleGetEnhancements.ts#enhancementsInPhases(thrown)',
  'src/handlers/search/readonly/handleGetObjectsList.ts#Thrown(thrown)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#WhereUsedOutcome(lastErr)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#findExtensions(lastErr)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#messageOf(thrown)',
  'src/handlers/structure/readonly/handleGetStructuresList.ts#outcomeOf(lastErr)',
  'src/handlers/system/readonly/handleGetObjectInfo.ts#Thrown(thrown)',
  'src/handlers/system/readonly/handleRuntimeListFeeds.ts#Asked(error)',
  'src/handlers/system/readonly/handleRuntimeListFeeds.ts#end(error)',
  'src/lib/adtHeaders/withAdtHeaders.ts#Settled(error)',
  'src/lib/adtHeaders/withAdtHeaders.ts#correctedPair(failure)',
  'src/lib/adtHeaders/withAdtHeaders.ts#failureOf(failureOf)',
  'src/lib/adtHeaders/withAdtHeaders.ts#failureOfAnswer(failureOfAnswer)',
  'src/lib/adtHeaders/withAdtHeaders.ts#readSafely(read)',
  'src/lib/adtHeaders/withAdtHeaders.ts#readSafely(readSafely)',
  'src/lib/adtHeaders/withAdtHeaders.ts#readSafely(value)',
  'src/lib/answer.ts#answerCaught(thrown)',
  'src/lib/answer.ts#answerRequestThrown(thrown)',
  'src/lib/answer.ts#answerThrown(thrown)',
  'src/lib/answer.ts#isCredentialFailure(thrown)',
  'src/lib/answer.ts#local(thrown)',
  'src/lib/answer.ts#messageCarriedBy(thrown)',
  'src/lib/answer.ts#messageOf(thrown)',
  'src/lib/answer.ts#requestErrorOf(thrown)',
  'src/lib/answer.ts#requestFailureOf(thrown)',
  'src/lib/answer.ts#requestThrownEntry(thrown)',
  'src/lib/answer.ts#thrownEntry(thrown)',
  'src/lib/auth/connectionCause.ts#connectionCauseOf(code)',
  'src/lib/auth/connectionCause.ts#connectionCauseOf(thrown)',
  'src/lib/auth/errors.ts#errorClassOf(error)',
  'src/lib/auth/errors.ts#errorClassOf(name)',
  'src/lib/auth/failures.ts#chainErrorOf(thrown)',
  'src/lib/auth/failures.ts#failureOf(thrown)',
  'src/lib/auth/failures.ts#isClosedInstanceRefusal(value)',
  'src/lib/auth/failures.ts#readGuarded(thrown)',
  'src/lib/auth/failures.ts#readOwn(readOwn)',
  'src/lib/auth/failures.ts#readOwn(value)',
  'src/lib/auth/serverRefusal.ts#serverRefusalOf(value)',
  'src/lib/batch/InstanceBatch.ts#PartSettlement(error)',
  'src/lib/batch/envelopeWatch.ts#EnvelopeWatch(thrown)',
  'src/lib/batch/envelopeWatch.ts#threw(error)',
  'src/lib/batch/execute.ts#Rejection(error)',
  'src/lib/batch/execute.ts#cameBack(envelopeError)',
  'src/lib/batch/execute.ts#failureAnswer(error)',
  'src/lib/batch/phases.ts#PartAnswer(error)',
  'src/lib/batch/phases.ts#PhaseOutcome(error)',
  'src/lib/batch/phases.ts#PhaseResult(error)',
  'src/lib/batch/phases.ts#isNoBatchEndpoint(error)',
  'src/lib/batch/phases.ts#runPhaseOutcome(error)',
  'src/lib/batch/phases.ts#statusOf(response)',
  'src/lib/batch/recorder.ts#thrownRawPart(response)',
  'src/lib/debugger/AmdpSession.ts#thrown(e)',
  'src/lib/debugger/AmdpSession.ts#withNotUndone(error)',
  'src/lib/debugger/AmdpSession.ts#withNotUndone(withNotUndone)',
  'src/lib/debugger/DebugSession.ts#credentialEntryOf(error)',
  'src/lib/debugger/DebugSession.ts#listenerThrown(e)',
  'src/lib/debugger/DebugSession.ts#thrown(e)',
  'src/lib/debugger/failures.ts#(module)(thrownBehind)',
  'src/lib/debugger/failures.ts#messageOf(e)',
  'src/lib/debugger/failures.ts#thrownFailure(thrown)',
  'src/lib/draft/readDraftEtags.ts#DraftReads(thrown)',
  'src/lib/draft/readDraftEtags.ts#VersionRead(thrown)',
  'src/lib/httpTransport/headerSource.ts#requestFailureAnswer(error)',
  'src/lib/json.ts#answerObjectOf(value)',
  'src/lib/json.ts#answerValueOf(value)',
  'src/lib/leftoverSessions/port.ts#sapAnswerOf(thrown)',
  'src/lib/requestSystemResolution.ts#isCredentialFailure(error)',
  'src/lib/search-source/orchestrator.ts#runWithLimit(error)',
  'src/lib/search-source/readFailure.ts#DecidedPrimitive(value)',
  'src/lib/search-source/readFailure.ts#classify(failure)',
  'src/lib/search-source/readFailure.ts#decide(failure)',
  'src/lib/search-source/readFailure.ts#decidedFailure(decidedFailure)',
  'src/lib/search-source/readFailure.ts#decidedFailure(failure)',
  'src/lib/search-source/readFailure.ts#decisionOf(failure)',
  'src/lib/search-source/readFailure.ts#envelopeFailure(error)',
  'src/lib/search-source/readFailure.ts#failedRead(failure)',
  'src/lib/search-source/readFailure.ts#failedRead(key)',
  'src/lib/search-source/readFailure.ts#isCredential(failure)',
  'src/lib/search-source/readFailure.ts#isObject(value)',
  'src/lib/search-source/readFailure.ts#isSapAnswer(failure)',
  'src/lib/search-source/readFailure.ts#statusOf(response)',
  'src/lib/search-source/readFailure.ts#undecided(thrown)',
  'src/lib/search-source/readFailure.ts#undecided(undecided)',
  'src/lib/search-source/sourceReader.ts#readable(failure)',
  'src/lib/search-source/sourceReader.ts#readable(key)',
  'src/lib/shutdownSequence.ts#crash(thrown)',
  'src/lib/shutdownSequence.ts#pipeError(error)',
  'src/lib/shutdownSequence.ts#pipeGone(error)',
  'src/lib/shutdownSequence.ts#processFailedLine(thrown)',
  'src/lib/state/InstanceState.ts#messageOf(e)',
  'src/lib/strategies/packageWalk.ts#endsTheCall(thrown)',
  'src/lib/strategies/packageWalk.ts#onFailure(failure)',
  'src/lib/strategies/packageWalk.ts#reader(error)',
  'src/lib/strategies/packageWalk.ts#walkPackages(failures)',
  'src/lib/strategies/safeFields.ts#requestRead(value)',
  'src/lib/strategies/safeFields.ts#safeLockedObject(value)',
  'src/lib/strategies/safeFields.ts#thrownCleanup(value)',
  'src/lib/strategies/step.ts#StepThrew(cause)',
  'src/lib/strategies/step.ts#StepThrew(cleanup)',
  'src/lib/strategies/step.ts#StepThrew(operation)',
  'src/lib/strategies/step.ts#methodFailureOf(thrown)',
  'src/lib/strategies/step.ts#payloadCarriedBy(thrown)',
  'src/lib/strategies/step.ts#stepOf(value)',
  'src/lib/strategies/withLock.ts#LockNotReleased(cause)',
  'src/lib/strategies/withLock.ts#Released(thrown)',
  'src/lib/strategies/withLock.ts#withLock(thrown)',
  'src/lib/systemInformation.ts#isCredentialRefusedStatus(error)',
  'src/lib/systemInformation.ts#isSystemInformationUnavailable(error)',
  'src/lib/systemInformation.ts#statusOf(error)',
  'src/lib/systemInformation.ts#statusOf(statusOf)',
  'src/lib/thrownValue.ts#Element([index])',
  'src/lib/thrownValue.ts#attr(value)',
  'src/lib/thrownValue.ts#child(child)',
  'src/lib/thrownValue.ts#child(value)',
  'src/lib/thrownValue.ts#childAt(childAt)',
  'src/lib/thrownValue.ts#childAt(value)',
  'src/lib/thrownValue.ts#entries(entries)',
  'src/lib/thrownValue.ts#entries(value)',
  'src/lib/thrownValue.ts#isElement(value)',
  'src/lib/thrownValue.ts#isList(value)',
  'src/lib/thrownValue.ts#listOf(listOf)',
  'src/lib/thrownValue.ts#listOf(value)',
  'src/lib/utils.ts#_safeStringifyError(error)',
  'src/lib/utils.ts#extractAdtErrorMessage(error)',
  'src/lib/utils.ts#httpFailureOf(code)',
  'src/lib/utils.ts#httpFailureOf(error)',
  'src/lib/utils.ts#httpFailureOf(response)',
  'src/lib/utils.ts#isAlreadyExistsError(error)',
  'src/lib/utils.ts#logErrorSafely(error)',
  'src/lib/utils.ts#logErrorSafely(responseHeaders)',
  'src/lib/utils.ts#logErrorSafely(status)',
  'src/lib/utils.ts#logErrorSafely(statusText)',
  'src/lib/utils.ts#return_error(error)',
  'src/lib/wireResponse.ts#headerValueOf(value)',
  'src/lib/wireResponse.ts#headersOf(value)',
  'src/lib/wireResponse.ts#wireResponseOf(value)',
]);

/** Parse results held up to the function that checks them, by exact site. */
export const PARSE_SITES: ReadonlySet<string> = new Set<string>([
  // A request's `params`: the connection contract (`IAbapRequestOptions`)
  // types them `unknown` and they are the caller's (adt-clients'), so the
  // batch reads `_action` out of them as a parse. Typing `params` is a
  // contract change of its own, after 24.0.0 (the owner, 2026-11-14).
  'src/lib/batch/sessionKind.ts#paramAction(params)',
  'src/lib/config/yamlConfig.ts#loadYamlConfig(parsed)',
  'src/lib/instance.ts#isRegistry(value)',
  'src/lib/instance.ts#registry(found)',
  'src/lib/json.ts#jsonOf(value)',
  'src/lib/json.ts#jsonValueOf(value)',
  'src/lib/json.ts#parseJson(parsed)',
  'src/lib/packageManifest.ts#packageManifestOf(value)',
  'src/lib/systemInformation.ts#bodyOf(data)',
  'src/lib/utils.ts#parseActivationResponse(responseData)',
  'src/lib/xml/node.ts#parseXml(parsed)',
  'src/lib/xml/node.ts#xmlNodeOf(value)',
]);

/** Slots holding a value of `process.argv` / `process.env`, by exact site. */
export const PROGRAM_INPUT_SITES: ReadonlySet<string> = new Set<string>([]);

/** Functions of a sink contract's own, by exact site. */
export const SINK_SITES: ReadonlySet<string> = new Set<string>([
  'src/embeddable/BaseMcpServer.ts#registrationOf(args)',
  'src/embeddable/BaseMcpServer.ts#withSearchMeta(name)',
  'src/embeddable/BaseMcpServer.ts#withSearchMeta(registered)',
  'src/embeddable/BaseMcpServer.ts#withSearchMeta(withSearchMeta)',
]);

export const PRODUCTION_LISTS: ListedSites = {
  thrown: THROWN_READERS,
  parse: PARSE_SITES,
  programInput: PROGRAM_INPUT_SITES,
  sink: SINK_SITES,
};

const NO_LISTS: ListedSites = {
  thrown: new Set(),
  parse: new Set(),
  programInput: new Set(),
  sink: new Set(),
};

/** The type names of a tool's arguments, and of a value read out of them, before they are checked. */
const INPUT_TYPES = new Set(['ToolArgs', 'ToolArgValue']);

/** The type names of the program's own inputs. */
const PROGRAM_TYPES = new Set(['ProcessEnv', 'ProgramArguments']);

export type SiteKind =
  | 'parameter'
  | 'variable'
  | 'property'
  | 'return'
  | 'index'
  | 'alias'
  | 'heritage'
  | 'type-parameter'
  | 'expression'
  | 'any'
  | 'widening'
  | 'read-back';

export interface SweepSite {
  readonly kind: SiteKind;
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  readonly name: string;
  /** `file#owner(name)`: the site by name, as the lists name it. */
  readonly key: string;
  /** Each position of `unknown` (or `any`) charged to the site. */
  readonly position: string;
  /** The boundary it passes under, when it does. */
  readonly boundary: BoundaryKind | undefined;
  /** The typed values put where it holds `unknown`. */
  readonly types: readonly string[];
  readonly refused: boolean;
  /** Why it is refused, in a word: `holds`, `any`, `widening`, `read-back`, `callback`. */
  readonly reason: string;
}

/** One step from a type to a position inside it. */
type Step =
  | { readonly kind: 'element'; readonly at?: number }
  | { readonly kind: 'index' }
  | { readonly kind: 'argument'; readonly of: string; readonly at: number }
  | { readonly kind: 'parameter'; readonly at: number }
  | { readonly kind: 'return' }
  | { readonly kind: 'member'; readonly name: string };

type Path = readonly Step[];

/** A position of `unknown` or `any` in a type. */
interface Held {
  readonly path: Path;
  readonly any: boolean;
  /**
   * The declaration of the repository whose own type writes it, when the
   * walk stopped there (a member, a parameter, a return): charged to it.
   */
  readonly owner?: ts.Node;
}

function stepText(step: Step): string {
  switch (step.kind) {
    case 'element':
      return step.at === undefined ? '[]' : `[${step.at}]`;
    case 'index':
      return '{}';
    case 'argument':
      return `${step.of}<${step.at}>`;
    case 'parameter':
      return `(${step.at})`;
    case 'return':
      return '()';
    case 'member':
      return `.${step.name}`;
  }
}

function pathText(path: Path): string {
  return path.map(stepText).join('');
}

function isReference(type: ts.Type): type is ts.TypeReference {
  return (type.flags & ts.TypeFlags.Object) !== 0 && 'target' in type;
}

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

function ownNode(node: ts.Node): boolean {
  return ownFile(node.getSourceFile().fileName);
}

/** Whether a declaration is the language's own (`lib.*.d.ts`). */
function languageFile(declaration: ts.Node): boolean {
  const file = declaration.getSourceFile();
  return (
    file.isDeclarationFile && path.basename(file.fileName).startsWith('lib.')
  );
}

/** A declaration outside the repository and outside the language. */
function thirdParty(declaration: ts.Node): boolean {
  return !ownNode(declaration) && !languageFile(declaration);
}

function lineOf(node: ts.Node): string {
  const file = node.getSourceFile();
  const at = file.getLineAndCharacterOfPosition(node.getStart());
  return `${rel(file.fileName)}:${at.line + 1}`;
}

function nameOf(node: ts.Node): string {
  if (
    (ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isTypeParameterDeclaration(node) ||
      ts.isGetAccessorDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText();
  }
  if (ts.isIndexSignatureDeclaration(node)) return '[index]';
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
        ts.isMethodSignature(current) ||
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

/** The entries of `listed` no site of `sites` passes under. */
export function staleEntries(
  sites: readonly SweepSite[],
  listed: ReadonlySet<string>,
): string[] {
  const found = new Set(sites.map((site) => site.key));
  return [...listed].filter((entry) => !found.has(entry));
}

/**
 * A property name as the checker names it: an identifier's text, a string
 * or a number literal's value, a computed key's literal.
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
    !ownNode(declaration)
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

/** The wrappers a value passes through unchanged. */
function carrierParent(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isParenthesizedExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isNonNullExpression(parent) ||
    ts.isAsExpression(parent) ||
    (ts.isConditionalExpression(parent) && parent.condition !== node) ||
    (ts.isBinaryExpression(parent) &&
      (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        (parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
          parent.right === node)))
  );
}

/** The name a generic is called by: its callee's, its tag's, its element's. */
function calleeName(node: ts.Node): string {
  const callee =
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isExpressionWithTypeArguments(node)
      ? node.expression
      : ts.isTaggedTemplateExpression(node)
        ? node.tag
        : ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
          ? node.tagName
          : undefined;
  if (callee === undefined) return 'Generic';
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return 'Generic';
}

/** The outermost expression a value is carried to unchanged. */
function outermost(node: ts.Expression): ts.Expression {
  let current: ts.Expression = node;
  while (carrierParent(current) && ts.isExpression(current.parent)) {
    current = current.parent;
  }
  return current;
}

/**
 * The expressions whose type is their operands', or whose `unknown` is
 * charged elsewhere: a name (to its declaration), a member read (to the
 * member's declaration, or the receiver), a literal (to its members), a
 * function (to its parameters and returns).
 */
function carried(node: ts.Expression): boolean {
  return (
    ts.isIdentifier(node) ||
    node.kind === ts.SyntaxKind.ThisKeyword ||
    node.kind === ts.SyntaxKind.SuperKeyword ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isObjectLiteralExpression(node) ||
    ts.isArrayLiteralExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isConditionalExpression(node) ||
    ts.isBinaryExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSpreadElement(node) ||
    ts.isPrefixUnaryExpression(node) ||
    ts.isPostfixUnaryExpression(node) ||
    ts.isTypeOfExpression(node) ||
    ts.isVoidExpression(node) ||
    ts.isDeleteExpression(node) ||
    ts.isTemplateExpression(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isBigIntLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    ts.isOmittedExpression(node) ||
    ts.isPrivateIdentifier(node) ||
    node.kind === ts.SyntaxKind.ImportKeyword
  );
}

/**
 * Whether an expression names a type: inside an interface's `extends` or a
 * class's `implements`, whose expressions are types, not values.
 */
function typeHeritage(node: ts.Node): boolean {
  // A module's name (`from 'zod'`) is no value.
  if (
    ts.findAncestor(
      node,
      (each) =>
        ts.isImportDeclaration(each) ||
        ts.isExportDeclaration(each) ||
        ts.isExternalModuleReference(each) ||
        ts.isImportTypeNode(each),
    ) !== undefined
  ) {
    return true;
  }
  const written = ts.findAncestor(
    node,
    (each) => ts.isTypeNode(each) && !ts.isExpressionWithTypeArguments(each),
  );
  if (written !== undefined) return true;
  const clause = ts.findAncestor(node, ts.isHeritageClause);
  if (clause === undefined) return false;
  return (
    ts.isInterfaceDeclaration(clause.parent) ||
    clause.token === ts.SyntaxKind.ImplementsKeyword
  );
}

/** Whether an identifier is read as a value here (not a name being declared). */
function valueReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPartOfTypeNode(node)) return false;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isImportEqualsDeclaration(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent) ||
    ts.isJsxAttribute(parent) ||
    ts.isMetaProperty(parent)
  ) {
    return false;
  }
  if (
    'name' in parent &&
    parent.name === node &&
    !ts.isShorthandPropertyAssignment(parent)
  ) {
    return false;
  }
  return true;
}

/**
 * The call signatures of a contextual type: its own, or each union member's
 * that has some (`replacer?: ((key, value) => any) | string[] | null`).
 */
function callSignatures(
  checker: ts.TypeChecker,
  type: ts.Type | undefined,
): ts.Signature[] {
  if (type === undefined) return [];
  const holder = checker.getNonNullableType(type);
  const parts = holder.isUnion() ? holder.types : [holder];
  return parts.flatMap((part) => part.getCallSignatures());
}

const signaturesOf = callSignatures;

export class UnknownSweep {
  private readonly checker: ts.TypeChecker;
  private readonly lists: ListedSites;
  private readonly slots: ReadonlyMap<string, string>;
  private readonly heldMemo = new Map<ts.Type, readonly Held[]>();
  private readonly ownsMemo = new Map<ts.Node, boolean>();
  private readonly activeOwns = new Set<ts.Node>();
  private cuts = 0;
  /** Every value reference to a symbol, for the hand-offs of a function. */
  private readonly references = new Map<ts.Symbol, ts.Expression[]>();
  /** Slot declaration → the typed values put where it holds `unknown`. */
  private readonly putInto = new Map<ts.Node, Set<string>>();
  /** A third party's member declarations a typed value was put into. */
  private readonly putIntoThirdParty = new Set<ts.Node>();
  private readonly found: SweepSite[] = [];
  /** Expressions charged with the types written inside them. */
  private readonly writtenCharged = new Set<ts.Node>();
  private readonly boundaryMemo = new Map<
    ts.Node,
    { kind: BoundaryKind | undefined; types: string[] }
  >();

  constructor(
    program: ts.Program,
    private readonly files: readonly ts.SourceFile[],
    lists: ListedSites = PRODUCTION_LISTS,
    slots: ReadonlyMap<string, string> = SINK_SLOTS,
  ) {
    this.checker = program.getTypeChecker();
    this.lists = lists;
    this.slots = slots;
  }

  /** Every site of the files, refused or passing under its boundary. */
  sweep(): SweepSite[] {
    for (const file of this.files) this.indexReferences(file);
    const declarations: ts.Node[] = [];
    const expressions: ts.Expression[] = [];
    const jsxOpenings: ts.JsxOpeningElement[] = [];
    for (const file of this.files) {
      const visit = (node: ts.Node): void => {
        if (
          ts.isExpression(node) &&
          !ts.isPartOfTypeNode(node) &&
          !typeHeritage(node)
        ) {
          if (!ts.isIdentifier(node) || valueReference(node)) {
            expressions.push(node);
          }
        }
        if (ts.isJsxOpeningElement(node)) jsxOpenings.push(node);
        declarations.push(node);
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    // Widening first: it charges the typed values to their slots.
    for (const expression of expressions) this.widening(expression);
    for (const node of declarations) this.declaration(node);
    for (const node of declarations) this.readBack(node);
    for (const opening of jsxOpenings) this.writtenInExpression(opening);
    for (const expression of expressions) {
      this.writtenInExpression(expression);
      this.expression(expression);
      this.anyLanding(expression);
    }
    return this.found;
  }

  private indexReferences(file: ts.SourceFile): void {
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && valueReference(node)) {
        const symbol = this.valueSymbol(node);
        if (symbol !== undefined) {
          const list = this.references.get(symbol);
          if (list) list.push(node);
          else this.references.set(symbol, [node]);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  /** The symbol a name reads: a shorthand member's value, an alias's target. */
  private valueSymbol(node: ts.Identifier): ts.Symbol | undefined {
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? this.checker.getShorthandAssignmentValueSymbol(node.parent)
      : this.checker.getSymbolAtLocation(node);
    if (symbol === undefined) return undefined;
    return symbol.flags & ts.SymbolFlags.Alias
      ? this.checker.getAliasedSymbol(symbol)
      : symbol;
  }

  // ── The type walk ────────────────────────────────────────────────────

  /**
   * Every position of `unknown` or `any` in a type. A third party's type is
   * not walked; a member, a parameter or a return a declaration of the
   * repository writes `unknown` itself is not walked further but reported
   * with that declaration as its owner.
   */
  held(type: ts.Type, seen: ReadonlySet<ts.Type> = new Set()): readonly Held[] {
    if (type.flags & ts.TypeFlags.Unknown) return [{ path: [], any: false }];
    if (type.flags & ts.TypeFlags.Any) return [{ path: [], any: true }];
    if (seen.has(type)) {
      this.cuts += 1;
      return [];
    }
    const known = this.heldMemo.get(type);
    if (known !== undefined) return known;
    const cutsBefore = this.cuts;
    const deeper = new Set([...seen, type]);
    const under = (step: Step, inner: ts.Type): Held[] =>
      this.held(inner, deeper).map((each) => ({
        ...each,
        path: [step, ...each.path],
      }));
    let out: Held[] = [];
    if (type.isUnionOrIntersection()) {
      out = type.types.flatMap((member) => [...this.held(member, deeper)]);
    } else if ((type.flags & ts.TypeFlags.Object) === 0) {
      out = [];
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
      out = this.objectHeld(type, under);
    }
    if (this.cuts === cutsBefore) this.heldMemo.set(type, out);
    return out;
  }

  private objectHeld(
    type: ts.Type,
    under: (step: Step, inner: ts.Type) => Held[],
  ): Held[] {
    // The declarations of the type itself, not of an alias naming it: an
    // alias of ours for a library's `Map` is still the library's `Map`.
    const declarations = type.getSymbol()?.declarations ?? [];
    // A third party's type is its contract.
    if (
      declarations.length > 0 &&
      declarations.every((declaration) => thirdParty(declaration))
    ) {
      return [];
    }
    // A generic of the language (`Map`, `Set`, `Promise`, `Iterable`):
    // its type arguments are its positions; a runtime object it declares
    // with none (`Error`, `URL`) holds none. Its aliases and mapped types
    // (`Record`, `Readonly`, `Omit`) are structure, walked below.
    if (
      declarations.length > 0 &&
      declarations.every(
        (declaration) =>
          languageFile(declaration) &&
          (ts.isInterfaceDeclaration(declaration) ||
            ts.isClassDeclaration(declaration) ||
            ts.isVariableDeclaration(declaration)),
      )
    ) {
      if (!isReference(type)) return [];
      const name = type.target.getSymbol()?.getName() ?? 'Generic';
      return this.checker
        .getTypeArguments(type)
        .flatMap((argument, at) =>
          under({ kind: 'argument', of: name, at }, argument),
        );
    }
    const out: Held[] = [];
    for (const signature of [
      ...type.getCallSignatures(),
      ...type.getConstructSignatures(),
    ]) {
      out.push(...this.signatureHeld(signature, under));
    }
    for (const info of this.checker.getIndexInfosOfType(type)) {
      const declaration = info.declaration;
      if (declaration !== undefined && ownNode(declaration)) {
        if (this.ownsUnknown(declaration)) {
          out.push({
            path: [{ kind: 'index' }],
            any: false,
            owner: declaration,
          });
          continue;
        }
      } else if (declaration !== undefined && thirdParty(declaration)) {
        continue;
      }
      out.push(...under({ kind: 'index' }, info.type));
    }
    for (const member of this.checker.getPropertiesOfType(type)) {
      const memberDeclarations = member.declarations ?? [];
      // A third party's member, or one the language declares (`Error.cause`,
      // an inherited `ReadonlyArray` method), is that contract's: the
      // language's generics hold their positions in their type arguments.
      if (
        memberDeclarations.length > 0 &&
        memberDeclarations.every((declaration) => !ownNode(declaration))
      ) {
        continue;
      }
      const step: Step = { kind: 'member', name: member.getName() };
      const own = memberDeclarations.find(
        (declaration) =>
          ownNode(declaration) &&
          (ts.isPropertySignature(declaration) ||
            ts.isPropertyDeclaration(declaration) ||
            ts.isGetAccessorDeclaration(declaration) ||
            ts.isParameter(declaration) ||
            ts.isPropertyAssignment(declaration) ||
            ts.isShorthandPropertyAssignment(declaration) ||
            ts.isSpreadAssignment(declaration)),
      );
      if (own !== undefined) {
        // An object literal's member is its expression's; a declared
        // member that writes `unknown` itself is its own site.
        if (
          ts.isPropertyAssignment(own) ||
          ts.isShorthandPropertyAssignment(own) ||
          ts.isSpreadAssignment(own)
        ) {
          out.push(
            ...this.chargedTo(
              own,
              under(step, this.checker.getTypeOfSymbol(member)),
            ),
          );
          continue;
        }
        if (this.ownsUnknown(own)) {
          out.push({ path: [step], any: false, owner: own });
          continue;
        }
      }
      out.push(...under(step, this.checker.getTypeOfSymbol(member)));
    }
    return out;
  }

  private signatureHeld(
    signature: ts.Signature,
    under: (step: Step, inner: ts.Type) => Held[],
  ): Held[] {
    const out: Held[] = [];
    const declaration = signature.getDeclaration();
    signature.getParameters().forEach((parameter, at) => {
      const step: Step = { kind: 'parameter', at };
      const own = parameter.valueDeclaration;
      if (own !== undefined && ownNode(own) && ts.isParameter(own)) {
        if (own.type === undefined) {
          // Its contract's, or its initializer's.
          out.push(
            ...this.chargedTo(
              own,
              under(step, this.checker.getTypeOfSymbol(parameter)),
            ),
          );
          return;
        }
        if (this.ownsUnknown(own)) {
          out.push({ path: [step], any: false, owner: own });
          return;
        }
      }
      out.push(...under(step, this.checker.getTypeOfSymbol(parameter)));
    });
    if (
      declaration !== undefined &&
      ownNode(declaration) &&
      ts.isFunctionLike(declaration)
    ) {
      // An inferred return is its return expressions'.
      if (declaration.type === undefined) {
        out.push(
          ...this.chargedTo(
            declaration,
            under({ kind: 'return' }, signature.getReturnType()),
          ),
        );
        return out;
      }
      if (this.ownsUnknown(declaration)) {
        out.push({
          path: [{ kind: 'return' }],
          any: false,
          owner: declaration,
        });
        return out;
      }
    }
    out.push(...under({ kind: 'return' }, signature.getReturnType()));
    return out;
  }

  /**
   * Positions found under a node that answers for them itself (a literal's
   * member, an inferred parameter or return): kept, charged to it, so a
   * holder knows they are there without being charged.
   */
  private chargedTo(owner: ts.Node, found: readonly Held[]): Held[] {
    return found.length === 0
      ? []
      : [{ path: found[0]?.path.slice(0, 1) ?? [], any: false, owner }];
  }

  /** The type a declaration writes for itself, when it writes one. */
  private writtenType(node: ts.Node): ts.Type | undefined {
    if (ts.isFunctionLike(node)) {
      return node.type === undefined
        ? undefined
        : this.checker.getTypeFromTypeNode(node.type);
    }
    if (
      (ts.isParameter(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isPropertyDeclaration(node)) &&
      node.type !== undefined
    ) {
      return this.checker.getTypeFromTypeNode(node.type);
    }
    if (ts.isGetAccessorDeclaration(node) && node.type !== undefined) {
      return this.checker.getTypeFromTypeNode(node.type);
    }
    if (ts.isTypeAliasDeclaration(node)) {
      return this.checker.getTypeAtLocation(node.name);
    }
    if (ts.isExpressionWithTypeArguments(node)) {
      return this.checker.getTypeAtLocation(node);
    }
    if (ts.isTypeParameterDeclaration(node)) {
      const written = node.constraint ?? node.default;
      return written === undefined
        ? undefined
        : this.checker.getTypeFromTypeNode(written);
    }
    return undefined;
  }

  /** The type node a declaration writes for itself, when it writes one. */
  private writtenTypeNode(node: ts.Node): ts.Node | undefined {
    if (ts.isExpressionWithTypeArguments(node)) return node;
    if (ts.isTypeParameterDeclaration(node)) {
      return node.constraint ?? node.default;
    }
    if (
      ts.isFunctionLike(node) ||
      ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isIndexSignatureDeclaration(node)
    ) {
      return node.type;
    }
    return undefined;
  }

  /**
   * The positions of `unknown` in the type arguments a written type supplies
   * to a third party's generic type (`IAdtResponse<unknown, IAdtError>`):
   * the third party's type is its contract and is not walked, but what we
   * write as its arguments is ours, at any depth of the written type. A
   * declaration of the repository nested in it (a type literal's member, a
   * function type's parameter) is its own site and is not entered.
   */
  private suppliedHeld(root: ts.Node | undefined): Held[] {
    if (root === undefined) return [];
    const walk = (node: ts.Node, prefix: Path): Held[] => {
      if (node !== root && this.siteKind(node) !== undefined) return [];
      if (ts.isArrayTypeNode(node)) {
        return walk(node.elementType, [...prefix, { kind: 'element' }]);
      }
      if (ts.isTupleTypeNode(node)) {
        return node.elements.flatMap((element, at) =>
          walk(element, [...prefix, { kind: 'element', at }]),
        );
      }
      const generic =
        ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)
          ? node
          : undefined;
      if (generic?.typeArguments !== undefined) {
        const target = this.referencedSymbol(generic);
        const name = target?.getName() ?? 'Generic';
        const theirs =
          target !== undefined &&
          (target.declarations ?? []).length > 0 &&
          (target.declarations ?? []).every((each) => thirdParty(each));
        return generic.typeArguments.flatMap((argument, at) => {
          const path: Path = [...prefix, { kind: 'argument', of: name, at }];
          const own = theirs
            ? this.held(this.checker.getTypeFromTypeNode(argument))
                .filter((each) => each.owner === undefined)
                .map((each) => ({ ...each, path: [...path, ...each.path] }))
            : [];
          return [...own, ...walk(argument, path)];
        });
      }
      const out: Held[] = [];
      ts.forEachChild(node, (child) => {
        out.push(...walk(child, prefix));
      });
      return out;
    };
    return walk(root, []);
  }

  /** The type a reference names, through an import's alias. */
  private referencedSymbol(
    node: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments,
  ): ts.Symbol | undefined {
    const symbol = this.checker.getSymbolAtLocation(
      ts.isTypeReferenceNode(node) ? node.typeName : node.expression,
    );
    if (symbol === undefined) return undefined;
    return symbol.flags & ts.SymbolFlags.Alias
      ? this.checker.getAliasedSymbol(symbol)
      : symbol;
  }

  /** The positions of `unknown` a declaration's own written type holds. */
  private ownHeld(node: ts.Node): readonly Held[] {
    const supplied = this.suppliedHeld(this.writtenTypeNode(node));
    if (ts.isIndexSignatureDeclaration(node)) {
      return [
        ...this.held(this.checker.getTypeFromTypeNode(node.type)).filter(
          (each) => each.owner === undefined,
        ),
        ...supplied,
      ];
    }
    const type = this.writtenType(node);
    return [
      ...(type === undefined
        ? []
        : this.held(type).filter((each) => each.owner === undefined)),
      ...supplied,
    ];
  }

  /** Whether a declaration's own written type holds `unknown` or `any`. */
  private ownsUnknown(node: ts.Node): boolean {
    const known = this.ownsMemo.get(node);
    if (known !== undefined) return known;
    if (this.activeOwns.has(node)) return false;
    this.activeOwns.add(node);
    const owns = this.ownHeld(node).length > 0;
    this.activeOwns.delete(node);
    this.ownsMemo.set(node, owns);
    return owns;
  }

  // ── Declarations ─────────────────────────────────────────────────────

  private siteKind(node: ts.Node): SiteKind | undefined {
    if (ts.isParameter(node)) return 'parameter';
    if (ts.isVariableDeclaration(node)) return 'variable';
    if (
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isGetAccessorDeclaration(node)
    ) {
      return 'property';
    }
    if (ts.isIndexSignatureDeclaration(node)) return 'index';
    if (ts.isFunctionLike(node)) return 'return';
    if (ts.isTypeAliasDeclaration(node)) return 'alias';
    if (
      ts.isExpressionWithTypeArguments(node) &&
      ts.isHeritageClause(node.parent)
    ) {
      return 'heritage';
    }
    if (ts.isTypeParameterDeclaration(node)) return 'type-parameter';
    return undefined;
  }

  private declaration(node: ts.Node): void {
    const kind = this.siteKind(node);
    if (kind === undefined) return;
    // Bound by the caller (the owner's decision): a type parameter's
    // constraint and default are not positions. Each instantiation is
    // judged where it is written — an explicit `unknown` argument, or the
    // default it falls back to, holds `unknown` in the instantiated type.
    if (kind === 'type-parameter') return;
    if (ts.isVariableDeclaration(node) && ts.isCatchClause(node.parent)) {
      this.report(node, kind, "''", 'caught', false, 'holds');
      return;
    }
    const held = this.ownHeld(node);
    if (held.length === 0) return;
    const decided = this.boundaryOf(node, held);
    this.report(
      node,
      kind,
      held.map((each) => pathText(each.path) || "''").join(' '),
      decided.kind,
      decided.kind === undefined,
      'holds',
      [
        ...new Set([...decided.types, ...(this.putInto.get(node) ?? [])]),
      ].sort(),
    );
  }

  private report(
    node: ts.Node,
    kind: SiteKind,
    position: string,
    boundary: BoundaryKind | undefined,
    refused: boolean,
    reason: string,
    types: readonly string[] = [],
  ): void {
    this.found.push({
      kind,
      where: lineOf(node),
      name:
        ts.isExpression(node) && !ts.isIdentifier(node)
          ? node.getText().slice(0, 60)
          : nameOf(node),
      key: keyOf(node),
      position,
      boundary,
      types,
      refused,
      reason,
    });
  }

  /** The boundary a declaration passes under, if any. */
  private boundaryOf(
    node: ts.Node,
    held: readonly Held[] = this.ownHeld(node),
  ): { kind: BoundaryKind | undefined; types: string[] } {
    const known = this.boundaryMemo.get(node);
    if (known !== undefined) return known;
    // Guard against a cycle through callbacks' contracts.
    this.boundaryMemo.set(node, { kind: undefined, types: [] });
    const decided = this.decideBoundary(node, held);
    this.boundaryMemo.set(node, decided);
    return decided;
  }

  private decideBoundary(
    node: ts.Node,
    held: readonly Held[],
  ): { kind: BoundaryKind | undefined; types: string[] } {
    const none = { kind: undefined, types: [] };
    const key = keyOf(node);
    if (this.lists.thrown.has(key)) return { kind: 'thrown', types: [] };
    if (this.lists.parse.has(key)) return { kind: 'parse', types: [] };
    if (this.lists.programInput.has(key)) {
      return { kind: 'program-input', types: [] };
    }
    if (this.lists.sink.has(key)) return { kind: 'sink-contract', types: [] };
    if (this.toolArgs(node)) return { kind: 'tool-args', types: [] };
    const slot = slotName(node);
    if (slot !== undefined && this.slots.has(slot)) {
      return { kind: 'sink-slot', types: [] };
    }
    if (this.inSinkContract(node)) return { kind: 'sink-contract', types: [] };
    const place = this.functionPlace(node);
    if (place === undefined) return none;
    if (this.implementsSinkContract(place.fn)) {
      return { kind: 'sink-contract', types: [] };
    }
    if (
      place.at !== 'return' &&
      place.at === 0 &&
      this.rejectionHandler(place.fn)
    ) {
      return { kind: 'caught', types: [] };
    }
    return this.callback(place.fn, place.at, held);
  }

  /**
   * Tool-argument input until it is checked (the owner's decision): a
   * declaration written `ToolArgs` — a call's arguments, a nested object read
   * out of them — or `ToolArgValue`, a value read out of them and not yet
   * checked, a list's element included; a function that returns them, which
   * passes the same input on. The written type may combine them with typed
   * members (`X & ToolArgs`, `readonly ToolArgValue[]`, `ToolArgValue |
   * undefined`): every `unknown` it holds is reached through one of them.
   */
  private toolArgs(node: ts.Node): boolean {
    if (ts.isTypeAliasDeclaration(node)) return INPUT_TYPES.has(node.name.text);
    const written =
      ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isFunctionLike(node)
        ? node.type
        : undefined;
    if (written === undefined) return false;
    return this.inputOnly(written) === 'input';
  }

  /**
   * Whether a written type holds `unknown` only through the tool-argument
   * types: `input` when it names one, `typed` when it holds no `unknown`,
   * `other` when it holds one of its own.
   */
  private inputOnly(written: ts.TypeNode): 'input' | 'typed' | 'other' {
    if (ts.isTypeReferenceNode(written)) {
      const name = ts.isIdentifier(written.typeName)
        ? written.typeName.text
        : written.typeName.right.text;
      if (INPUT_TYPES.has(name)) return 'input';
    }
    const parts: readonly ts.TypeNode[] | undefined =
      ts.isUnionTypeNode(written) || ts.isIntersectionTypeNode(written)
        ? written.types
        : ts.isArrayTypeNode(written)
          ? [written.elementType]
          : ts.isTypeOperatorNode(written) ||
              ts.isParenthesizedTypeNode(written)
            ? [written.type]
            : undefined;
    if (parts !== undefined) {
      const each = parts.map((part) => this.inputOnly(part));
      if (each.includes('other')) return 'other';
      return each.includes('input') ? 'input' : 'typed';
    }
    return this.held(this.checker.getTypeFromTypeNode(written)).every(
      (each) => each.owner !== undefined,
    )
      ? 'typed'
      : 'other';
  }

  /** A declaration inside a contract named in `SINK_CONTRACTS`. */
  private inSinkContract(node: ts.Node): boolean {
    let current: ts.Node | undefined = node;
    while (current !== undefined) {
      if (
        (ts.isInterfaceDeclaration(current) ||
          ts.isTypeAliasDeclaration(current) ||
          ts.isClassDeclaration(current)) &&
        current.name !== undefined &&
        SINK_CONTRACTS.includes(current.name.text)
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /** The function a parameter or a return belongs to, and which it is. */
  private functionPlace(
    node: ts.Node,
  ): { fn: ts.SignatureDeclaration; at: number | 'return' } | undefined {
    if (ts.isParameter(node) && ts.isFunctionLike(node.parent)) {
      return { fn: node.parent, at: node.parent.parameters.indexOf(node) };
    }
    if (ts.isFunctionLike(node)) return { fn: node, at: 'return' };
    return undefined;
  }

  /** Whether a function is a promise's rejection handler. */
  private rejectionHandler(fn: ts.Node): boolean {
    const handed = this.handOffs(fn);
    return (
      handed.length > 0 &&
      handed.every((expression) => this.rejectionPosition(expression))
    );
  }

  private rejectionPosition(expression: ts.Expression): boolean {
    const outer = outermost(expression);
    const call = outer.parent;
    if (!ts.isCallExpression(call)) return false;
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) return false;
    const at = call.arguments.indexOf(outer);
    const method = callee.name.text;
    if (
      !((method === 'catch' && at === 0) || (method === 'then' && at === 1))
    ) {
      return false;
    }
    const receiver = this.checker.getTypeAtLocation(callee.expression);
    const name = (receiver.aliasSymbol ?? receiver.getSymbol())?.getName();
    return name === 'Promise' || name === 'PromiseLike';
  }

  /**
   * Every expression that hands a function on: a function expression
   * itself, else each value reference to its name (a variable's, a
   * function's, a member's). Calls of it by name are included: they are
   * direct calls, not hand-offs, and refuse a callback.
   */
  private handOffs(fn: ts.Node): ts.Expression[] {
    if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
      const parent = outermost(fn).parent;
      if (ts.isVariableDeclaration(parent) && parent.type === undefined) {
        return this.referencesOf(parent.name);
      }
      return [fn];
    }
    if (ts.isFunctionDeclaration(fn) && fn.name !== undefined) {
      return this.referencesOf(fn.name);
    }
    if (ts.isMethodDeclaration(fn) && ts.isObjectLiteralExpression(fn.parent)) {
      return [];
    }
    if (ts.isMethodDeclaration(fn)) return this.referencesOf(fn.name);
    return [];
  }

  private referencesOf(name: ts.Node): ts.Expression[] {
    const raw = this.checker.getSymbolAtLocation(name);
    if (raw === undefined) return [];
    const out: ts.Expression[] = [];
    out.push(...(this.references.get(raw) ?? []));
    // A member is read by property access, whose name the index keeps out.
    for (const file of this.files) {
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(node) &&
          this.checker.getSymbolAtLocation(node.name) === raw
        ) {
          out.push(node);
        }
        ts.forEachChild(node, visit);
      };
      if (ts.isMethodDeclaration(name.parent)) visit(file);
    }
    return out;
  }

  /** Whether a function implements a member of a sink contract. */
  private implementsSinkContract(fn: ts.SignatureDeclaration): boolean {
    return this.contracts(fn).some(
      (contract) =>
        contract.declaration !== undefined &&
        this.inSinkContract(contract.declaration),
    );
  }

  /**
   * The signatures a function is written to: its contextual type's (a
   * function expression, an object literal's member), a class member's
   * heritage, and the contextual type at each place it is handed on by name.
   */
  private contracts(fn: ts.SignatureDeclaration): ts.Signature[] {
    const out: ts.Signature[] = [];
    const signaturesOf = (type: ts.Type | undefined): ts.Signature[] =>
      callSignatures(this.checker, type);
    if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
      out.push(...signaturesOf(this.checker.getContextualType(fn)));
    }
    if (ts.isMethodDeclaration(fn) && ts.isObjectLiteralExpression(fn.parent)) {
      const contextual = this.checker.getContextualType(fn.parent);
      const name = propertyName(fn.name);
      const member =
        contextual !== undefined && name !== undefined
          ? this.checker.getPropertyOfType(
              this.checker.getNonNullableType(contextual),
              name,
            )
          : undefined;
      if (member !== undefined) {
        out.push(...signaturesOf(this.checker.getTypeOfSymbol(member)));
      }
    }
    if (ts.isMethodDeclaration(fn) && ts.isClassLike(fn.parent)) {
      const name = propertyName(fn.name);
      for (const clause of fn.parent.heritageClauses ?? []) {
        for (const heritage of clause.types) {
          const base = this.checker.getTypeAtLocation(heritage);
          const member =
            name === undefined
              ? undefined
              : this.checker.getPropertyOfType(base, name);
          if (member !== undefined) {
            out.push(...signaturesOf(this.checker.getTypeOfSymbol(member)));
          }
        }
      }
    }
    return out;
  }

  /**
   * A callback: every place the function is handed to, a contract that
   * types the position `unknown` (or `any`) there — a third party's or the
   * language's, or a declaration of the repository that is itself a
   * boundary. A direct call by the repository, or no place at all, is no
   * callback.
   */
  private callback(
    fn: ts.SignatureDeclaration,
    at: number | 'return',
    held: readonly Held[],
  ): { kind: BoundaryKind | undefined; types: string[] } {
    const signatures: ts.Signature[] = [...this.contracts(fn)];
    const handed = this.handOffs(fn);
    for (const expression of handed) {
      if (expression === fn) continue;
      const outer = outermost(expression);
      const parent = outer.parent;
      if (
        (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
        parent.expression === outer
      ) {
        return { kind: undefined, types: [] };
      }
      if (this.rejectionPosition(expression) && at === 0) continue;
      const contextual = this.checker.getContextualType(outer);
      const found = callSignatures(this.checker, contextual);
      if (found.length === 0) return { kind: undefined, types: [] };
      signatures.push(...found);
    }
    if (signatures.length === 0) {
      const rejectionOnly =
        handed.length > 0 &&
        handed.every((expression) => this.rejectionPosition(expression));
      return rejectionOnly && at === 0
        ? { kind: 'caught', types: [] }
        : { kind: undefined, types: [] };
    }
    const types = new Set<string>();
    for (const signature of signatures) {
      const declaration = signature.getDeclaration();
      let position: ts.Type | undefined;
      let positionDeclaration: ts.Node | undefined;
      if (at === 'return') {
        position = signature.getReturnType();
        positionDeclaration = declaration;
      } else {
        const parameters = signature.getParameters();
        const last = parameters.at(-1)?.valueDeclaration;
        const rest =
          last !== undefined &&
          ts.isParameter(last) &&
          last.dotDotDotToken !== undefined;
        const parameter =
          parameters[at] ?? (rest ? parameters.at(-1) : undefined);
        if (parameter === undefined) continue;
        position = this.checker.getTypeOfSymbol(parameter);
        positionDeclaration = parameter.valueDeclaration;
      }
      if (
        positionDeclaration !== undefined &&
        ownNode(positionDeclaration) &&
        positionDeclaration !== fn &&
        !ts.isArrowFunction(positionDeclaration) &&
        !ts.isFunctionExpression(positionDeclaration)
      ) {
        // A contract of the repository's: a boundary itself, or none.
        const decided = this.boundaryOf(positionDeclaration);
        if (decided.kind === undefined) return { kind: undefined, types: [] };
        continue;
      }
      for (const each of held) {
        for (const reached of this.along(position, each.path)) {
          if (this.concrete(reached)) {
            types.add(this.typeText(reached));
          }
        }
      }
    }
    return types.size > 0
      ? { kind: undefined, types: [...types].sort() }
      : { kind: 'callback', types: [] };
  }

  // ── Expressions ──────────────────────────────────────────────────────

  /**
   * An expression charged with an `unknown` of its own: an instantiation no
   * argument or receiver brought `unknown` into, or a form the sweep does
   * not know.
   */
  private expression(node: ts.Expression): void {
    if (this.writtenCharged.has(node)) return;
    if (carried(node)) return;
    if (this.initialisesWrittenSite(node)) return;
    const type = this.checker.getTypeAtLocation(node);
    const held = this.held(type).filter((each) => each.owner === undefined);
    if (held.length === 0) return;
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      ts.isDecorator(node)
    ) {
      const signature = ts.isDecorator(node)
        ? undefined
        : this.checker.getResolvedSignature(node);
      const declaration = signature?.getDeclaration();
      if (declaration !== undefined) {
        const declared = this.checker
          .getSignatureFromDeclaration(declaration)
          ?.getReturnType();
        // The declaration's own return holds it: charged there (or the
        // third party's contract).
        if (declared !== undefined && this.held(declared).length > 0) return;
      }
      const inputs: ts.Expression[] = [];
      if (!ts.isTaggedTemplateExpression(node) && !ts.isDecorator(node)) {
        inputs.push(...(node.arguments ?? []));
        const callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) ||
          ts.isElementAccessExpression(callee)
        ) {
          inputs.push(callee.expression);
        }
        // A class or a function the repository declares brings nothing in
        // by being named: its type parameters are bound at this call (a
        // class's `prototype` is typed with `any` for them).
        if (!this.declaredCallable(callee)) inputs.push(callee);
      }
      if (
        inputs.some(
          (input) =>
            this.held(this.checker.getTypeAtLocation(input)).length > 0,
        )
      ) {
        return;
      }
    }
    this.report(
      node,
      'expression',
      held.map((each) => pathText(each.path) || "''").join(' '),
      undefined,
      true,
      'holds',
    );
  }

  /**
   * The types written inside an expression are ours, as a declaration's
   * written type is (the owner's rule): every type node an expression holds
   * as its own child — `x satisfies T`, `x as T` (not `as const`), `<T>x`,
   * the type arguments of a call, a `new`, a tagged template, an
   * instantiation expression (`f<T>`) and a JSX element — is walked as
   * `ownHeld` walks a declaration's, and the expression is charged with what
   * it holds, once. A function expression's own parameters and return are
   * declarations of their own. An instantiation that initialises a
   * boundary's declaration writing the same type is the declaration's.
   */
  private writtenInExpression(
    node: ts.Expression | ts.JsxOpeningElement,
  ): void {
    if (ts.isFunctionLike(node)) return;
    if (
      ts.isExpressionWithTypeArguments(node) &&
      ts.isHeritageClause(node.parent)
    ) {
      return;
    }
    const typeArguments: readonly ts.TypeNode[] =
      'typeArguments' in node && node.typeArguments !== undefined
        ? node.typeArguments
        : [];
    const held: Held[] = [];
    ts.forEachChild(node, (child) => {
      if (!ts.isTypeNode(child) || ts.isConstTypeReference(child)) return;
      const at = typeArguments.indexOf(child);
      const prefix: Path =
        at < 0 ? [] : [{ kind: 'argument', of: calleeName(node), at }];
      held.push(
        ...[
          ...this.held(this.checker.getTypeFromTypeNode(child)).filter(
            (each) => each.owner === undefined,
          ),
          ...this.suppliedHeld(child),
        ].map((each) => ({ ...each, path: [...prefix, ...each.path] })),
      );
    });
    if (held.length === 0) return;
    if (ts.isExpression(node) && this.initialisesWrittenSite(node)) return;
    this.writtenCharged.add(node);
    this.report(
      node,
      'expression',
      held.map((each) => pathText(each.path) || "''").join(' '),
      undefined,
      true,
      'holds',
    );
  }

  /** Whether `callee` names a class, a function or a method the repository declares. */
  private declaredCallable(callee: ts.Expression): boolean {
    const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    if (!ts.isIdentifier(name)) return false;
    const symbol = this.valueSymbol(name);
    return (
      symbol !== undefined &&
      (symbol.flags &
        (ts.SymbolFlags.Class |
          ts.SymbolFlags.Function |
          ts.SymbolFlags.Method)) !==
        0 &&
      (symbol.declarations ?? []).some((declaration) => ownNode(declaration))
    );
  }

  /**
   * An expression of type `any` lands only where `unknown` or `any` is
   * expected, or is discarded or inspected; an `any` inside its type lands
   * nowhere the contract has a type.
   */
  /**
   * An instantiation that initialises a boundary's declaration writing its
   * own type with `unknown` in it (a listed failure slot `thrown:
   * Set<unknown> = new Set()`) only builds that type: the boundary answers
   * for it. Any other declaration's initializer is charged as before.
   */
  private initialisesWrittenSite(node: ts.Expression): boolean {
    if (!ts.isNewExpression(node) && !ts.isCallExpression(node)) return false;
    const outer = outermost(node);
    const parent = outer.parent;
    if (
      (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
      parent.initializer === outer &&
      parent.type !== undefined
    ) {
      return (
        this.ownsUnknown(parent) && this.boundaryOf(parent).kind !== undefined
      );
    }
    return false;
  }

  private anyLanding(node: ts.Expression): void {
    if (carrierParent(node)) return;
    // A name is no value of its own (`#field`, `import(…)`).
    if (
      ts.isPrivateIdentifier(node) ||
      node.kind === ts.SyntaxKind.ImportKeyword
    ) {
      return;
    }
    const type = this.checker.getTypeAtLocation(node);
    const contextual = this.contextualOf(node);
    if (type.flags & ts.TypeFlags.Any) {
      if (this.inspected(node)) return;
      if (
        contextual !== undefined &&
        contextual.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)
      ) {
        return;
      }
      this.report(node, 'any', "''", undefined, true, 'any');
      return;
    }
    if (contextual === undefined) return;
    const anys = this.held(type).filter(
      (each) => each.any && each.owner === undefined && each.path.length > 0,
    );
    for (const each of anys) {
      if (this.along(contextual, each.path).some((t) => this.concrete(t))) {
        this.report(node, 'any', pathText(each.path), undefined, true, 'any');
        return;
      }
    }
  }

  /** Discarded, or read only to inspect it. */
  private inspected(node: ts.Expression): boolean {
    const parent = node.parent;
    if (ts.isExpressionStatement(parent)) return true;
    if (
      ts.isTypeOfExpression(parent) ||
      ts.isVoidExpression(parent) ||
      (ts.isPrefixUnaryExpression(parent) &&
        parent.operator === ts.SyntaxKind.ExclamationToken)
    ) {
      return true;
    }
    if (ts.isBinaryExpression(parent)) {
      const operator = parent.operatorToken.kind;
      if (
        operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        operator === ts.SyntaxKind.EqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsToken ||
        (operator === ts.SyntaxKind.InstanceOfKeyword &&
          parent.left === node) ||
        (operator === ts.SyntaxKind.InKeyword && parent.right === node)
      ) {
        return true;
      }
    }
    if (
      (ts.isIfStatement(parent) ||
        ts.isWhileStatement(parent) ||
        ts.isDoStatement(parent)) &&
      parent.expression === node
    ) {
      return true;
    }
    if (ts.isConditionalExpression(parent) && parent.condition === node) {
      return true;
    }
    return false;
  }

  /**
   * A typed value put where `unknown` is expected: charged to the slot that
   * writes it; refused into a listed parse site, remembered into a third
   * party's member.
   */
  private widening(node: ts.Expression): void {
    // A carrier's operands land one by one, and so do a literal's members
    // where they have a type expected of their own; a container literal
    // landing whole where `unknown` is expected is a typed value itself.
    const literal =
      ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node);
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isConditionalExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAsExpression(node) ||
      (ts.isBinaryExpression(node) && carrierParent(node.right)) ||
      ts.isSpreadElement(node.parent) ||
      ts.isAwaitExpression(node.parent)
    ) {
      return;
    }
    if (this.checkedOnly(node)) return;
    for (const landing of this.landings(node)) {
      for (const each of this.held(landing.contextual)) {
        // An `any` only a library writes: its slot is the library's.
        if (each.any) continue;
        // Deeper in, the literal's own member or element lands there.
        if (literal && each.path.length > 0) continue;
        const reached = this.along(landing.type, each.path).filter((t) =>
          this.concrete(t),
        );
        if (reached.length === 0) continue;
        this.charge(node, each, landing.slot, reached);
      }
    }
  }

  /**
   * A value only checked against a type (`x satisfies T`), whole or as a
   * member or an element of a literal so checked: it lands nowhere.
   */
  private checkedOnly(node: ts.Expression): boolean {
    let current: ts.Node = node;
    while (
      ts.isPropertyAssignment(current.parent) ||
      ts.isShorthandPropertyAssignment(current.parent) ||
      ts.isObjectLiteralExpression(current.parent) ||
      ts.isArrayLiteralExpression(current.parent) ||
      ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent)
    ) {
      current = current.parent;
    }
    return ts.isSatisfiesExpression(current.parent);
  }

  /** Where a value lands: the type expected there, its own, and the slot. */
  private landings(
    node: ts.Expression,
  ): { contextual: ts.Type; type: ts.Type; slot: () => ts.Node | undefined }[] {
    if (!ts.isSpreadElement(node)) {
      const contextual = this.contextualOf(node);
      return contextual === undefined
        ? []
        : [
            {
              contextual,
              type: this.checker.getTypeAtLocation(node),
              slot: () => this.slotOf(outermost(node)),
            },
          ];
    }
    const type = this.checker.getTypeAtLocation(node.expression);
    const parent = node.parent;
    if (ts.isArrayLiteralExpression(parent)) {
      const contextual = this.checker.getContextualType(parent);
      return contextual === undefined
        ? []
        : [{ contextual, type, slot: () => this.slotOf(outermost(parent)) }];
    }
    if (!ts.isCallExpression(parent) && !ts.isNewExpression(parent)) return [];
    const signature = this.checker.getResolvedSignature(parent);
    if (signature === undefined) return [];
    const parameters = signature.getParameters();
    const args: readonly ts.Expression[] = parent.arguments ?? [];
    const at = args.indexOf(node);
    const last = parameters.at(-1);
    const lastDeclaration = last?.valueDeclaration;
    const rest =
      lastDeclaration !== undefined &&
      ts.isParameter(lastDeclaration) &&
      lastDeclaration.dotDotDotToken !== undefined;
    const out: {
      contextual: ts.Type;
      type: ts.Type;
      slot: () => ts.Node | undefined;
    }[] = [];
    const members =
      this.checker.isTupleType(type) && isReference(type)
        ? this.checker.getTypeArguments(type)
        : undefined;
    if (members === undefined) {
      // An array spread: its elements reach the rest, or every parameter
      // from its place on.
      const element =
        this.checker.getIndexTypeOfType(type, ts.IndexKind.Number) ?? type;
      parameters.slice(at).forEach((parameter, offset) => {
        const isRest = rest && at + offset === parameters.length - 1;
        out.push({
          contextual: this.checker.getTypeOfSymbol(parameter),
          type: isRest ? type : element,
          slot: () => parameter.valueDeclaration,
        });
      });
      return out;
    }
    members.forEach((member, offset) => {
      const place = at + offset;
      const parameter =
        parameters[place] ?? (rest ? parameters.at(-1) : undefined);
      if (parameter === undefined) return;
      const isRest = rest && parameter === last;
      const contextual = this.checker.getTypeOfSymbol(parameter);
      const expected = isRest
        ? (this.checker.getIndexTypeOfType(contextual, ts.IndexKind.Number) ??
          contextual)
        : contextual;
      out.push({
        contextual: expected,
        type: member,
        slot: () => parameter.valueDeclaration,
      });
    });
    return out;
  }

  /** A typed value charged to the slot that holds `unknown` where it lands. */
  private charge(
    node: ts.Expression,
    each: Held,
    landing: () => ts.Node | undefined,
    reached: readonly ts.Type[],
  ): void {
    const types = reached.map((t) => this.typeText(t));
    const where = pathText(each.path) || "''";
    const slots =
      each.owner === undefined
        ? (this.keyedSlots(outermost(node)) ?? [landing()])
        : [each.owner];
    for (const slot of slots) {
      if (slot === undefined) {
        this.report(
          node,
          'widening',
          where,
          undefined,
          true,
          'widening',
          types,
        );
        continue;
      }
      this.chargeSlot(node, slot, where, types);
    }
  }

  /**
   * The members a write by a computed key lands in (`box[key] = value`):
   * each member the key's literal type names, a union of literals naming
   * each; `undefined` for any other write.
   */
  private keyedSlots(node: ts.Expression): ts.Node[] | undefined {
    const parent = node.parent;
    if (
      !ts.isBinaryExpression(parent) ||
      parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
      parent.right !== node ||
      !ts.isElementAccessExpression(parent.left)
    ) {
      return undefined;
    }
    const key = this.checker.getTypeAtLocation(parent.left.argumentExpression);
    const keys = key.isUnion() ? key.types : [key];
    if (
      !keys.every((each) => each.isStringLiteral() || each.isNumberLiteral())
    ) {
      return undefined;
    }
    return keyedMembers(
      this.checker,
      this.checker.getTypeAtLocation(parent.left.expression),
      key,
    ).flatMap((member) => {
      const declaration = member?.valueDeclaration ?? member?.declarations?.[0];
      return declaration === undefined ? [] : [declaration];
    });
  }

  /** A typed value charged to `slot`. */
  private chargeSlot(
    node: ts.Expression,
    slot: ts.Node,
    where: string,
    types: readonly string[],
  ): void {
    if (!ownNode(slot)) {
      if (
        thirdParty(slot) &&
        (ts.isPropertySignature(slot) || ts.isPropertyDeclaration(slot))
      ) {
        this.putIntoThirdParty.add(slot);
      }
      return;
    }

    const into = this.putInto.get(slot) ?? new Set<string>();
    for (const text of types) into.add(text);
    this.putInto.set(slot, into);
    const target = ts.isSpreadElement(node) ? node.expression : node;
    if (this.lists.parse.has(keyOf(slot)) && !this.programInput(target)) {
      this.report(node, 'widening', where, 'parse', true, 'widening', types);
    }
  }

  /**
   * The type a value is expected to have where it stands: the checker's
   * contextual type, a shorthand member's from its literal's.
   */
  private contextualOf(node: ts.Expression): ts.Type | undefined {
    const parent = node.parent;
    if (ts.isShorthandPropertyAssignment(parent)) {
      const literal = this.checker.getContextualType(parent.parent);
      const member =
        literal === undefined
          ? undefined
          : this.checker.getPropertyOfType(
              this.checker.getNonNullableType(literal),
              parent.name.text,
            );
      return member === undefined
        ? undefined
        : this.checker.getTypeOfSymbol(member);
    }
    return this.checker.getContextualType(node);
  }

  /** The declaration a value lands in: a parameter, a variable, a member. */
  private slotOf(node: ts.Expression): ts.Node | undefined {
    const parent = node.parent;
    if (
      (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      parent.expression !== node
    ) {
      const signature = this.checker.getResolvedSignature(parent);
      const args: readonly ts.Expression[] = parent.arguments ?? [];
      const at = args.indexOf(node);
      if (signature === undefined || at < 0) return undefined;
      const parameters = signature.getParameters();
      const parameter = parameters[at] ?? parameters.at(-1);
      return parameter?.valueDeclaration;
    }
    if (
      (ts.isVariableDeclaration(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isParameter(parent)) &&
      parent.initializer === node
    ) {
      return parent;
    }
    if (ts.isReturnStatement(parent) || ts.isArrowFunction(parent)) {
      const fn = ts.isArrowFunction(parent)
        ? parent
        : ts.findAncestor(parent, ts.isFunctionLike);
      if (fn === undefined) return undefined;
      if (fn.type !== undefined) return fn;
      const contract =
        ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)
          ? signaturesOf(
              this.checker,
              this.checker.getContextualType(fn),
            )[0]?.getDeclaration()
          : ts.isMethodDeclaration(fn)
            ? this.contracts(fn)[0]?.getDeclaration()
            : undefined;
      return contract;
    }
    if (
      (ts.isPropertyAssignment(parent) && parent.initializer === node) ||
      ts.isShorthandPropertyAssignment(parent)
    ) {
      const literal = parent.parent;
      const contextual = this.checker.getContextualType(literal);
      const name = propertyName(parent.name);
      if (contextual === undefined || name === undefined) return undefined;
      const member = this.checker.getPropertyOfType(
        this.checker.getNonNullableType(contextual),
        name,
      );
      // No member of that name: the literal's index signature, or where
      // the literal itself lands.
      return (
        member?.valueDeclaration ??
        member?.declarations?.[0] ??
        this.checker
          .getIndexInfosOfType(this.checker.getNonNullableType(contextual))
          .find((info) => info.declaration !== undefined)?.declaration ??
        this.slotOf(outermost(literal))
      );
    }
    if (ts.isSpreadAssignment(parent)) {
      return this.slotOf(outermost(parent.parent));
    }
    if (ts.isArrayLiteralExpression(parent)) {
      return this.slotOf(outermost(parent));
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.right === node
    ) {
      const left = parent.left;
      const symbol = ts.isElementAccessExpression(left)
        ? (this.checker.getSymbolAtLocation(left.argumentExpression) ??
          this.checker.getSymbolAtLocation(left))
        : this.checker.getSymbolAtLocation(left);
      return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    }
    return undefined;
  }

  /** A read of `process.argv` / `process.env`, or of a value so typed. */
  private programInput(node: ts.Expression): boolean {
    let current: ts.Expression = node;
    while (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      const text = current.getText();
      if (text === 'process.env' || text === 'process.argv') return true;
      current = current.expression;
    }
    const type = this.checker.getTypeAtLocation(current);
    const name = (type.aliasSymbol ?? type.getSymbol())?.getName();
    return name !== undefined && PROGRAM_TYPES.has(name);
  }

  /**
   * A read back of a third party's member a typed value was put into, in
   * every form `memberReads` knows: by name, by a key, by destructuring.
   * By reading (the owner's rule): a read whose value only passes on —
   * where `unknown` or `any` is expected (a parse site, a sink such as
   * `JSON.stringify`), or discarded or only inspected — reads nothing back.
   */
  private readBack(node: ts.Node): void {
    if (this.putIntoThirdParty.size === 0) return;
    memberReads(this.checker, node, (at, members) => {
      if (ts.isExpression(at) && this.passesOn(outermost(at))) return;
      if (
        members.some((member) =>
          (member?.declarations ?? []).some((declaration) =>
            this.putIntoThirdParty.has(declaration),
          ),
        )
      ) {
        this.report(at, 'read-back', "''", undefined, true, 'read-back');
      }
    });
  }

  /**
   * Whether a value only passes on: inspected, or put where `unknown` or
   * `any` is expected by its declaration — a parameter, a member or a return
   * written `unknown` / `any` (a third party's sink such as `JSON.stringify`,
   * a listed site). A type parameter instantiated to `unknown` is no sink:
   * the function it belongs to uses the value, so the read is a read-back,
   * checked like any other (bound by the caller).
   */
  private passesOn(node: ts.Expression): boolean {
    if (this.inspected(node)) return true;
    const contextual = this.contextualOf(node);
    if (
      contextual === undefined ||
      (contextual.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) === 0
    ) {
      return false;
    }
    const declared = this.declaredTypeOf(this.slotOf(node));
    return (
      declared !== undefined &&
      (declared.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) !== 0
    );
  }

  /**
   * The type a slot's declaration writes, before any instantiation: a
   * parameter's (a rest parameter's element), a member's, a variable's, an
   * index signature's, a function's return.
   */
  private declaredTypeOf(slot: ts.Node | undefined): ts.Type | undefined {
    if (slot === undefined) return undefined;
    if (ts.isFunctionLike(slot) && !ts.isIndexSignatureDeclaration(slot)) {
      return this.checker.getSignatureFromDeclaration(slot)?.getReturnType();
    }
    if (
      !ts.isParameter(slot) &&
      !ts.isPropertySignature(slot) &&
      !ts.isPropertyDeclaration(slot) &&
      !ts.isVariableDeclaration(slot) &&
      !ts.isIndexSignatureDeclaration(slot) &&
      !ts.isPropertyAssignment(slot) &&
      !ts.isShorthandPropertyAssignment(slot)
    ) {
      return undefined;
    }
    if (ts.isIndexSignatureDeclaration(slot)) {
      return this.checker.getTypeFromTypeNode(slot.type);
    }
    const symbol = this.checker.getSymbolAtLocation(slot.name);
    if (symbol === undefined) return undefined;
    const type = this.checker.getTypeOfSymbol(symbol);
    if (ts.isParameter(slot) && slot.dotDotDotToken !== undefined) {
      return this.checker.getIndexTypeOfType(type, ts.IndexKind.Number) ?? type;
    }
    return type;
  }

  // ── Projection ───────────────────────────────────────────────────────

  /** The types a type holds along a path. */
  private along(type: ts.Type, path: Path): ts.Type[] {
    let at: ts.Type[] = [type];
    for (const step of path) {
      const reached: ts.Type[] = [];
      for (const each of at) {
        if (this.absent(each)) continue;
        reached.push(...this.project(each, step));
      }
      at = reached;
    }
    return at;
  }

  private project(type: ts.Type, step: Step): ts.Type[] {
    if (type.isUnion()) {
      return type.types.flatMap((part) =>
        this.absent(part) ? [] : this.project(part, step),
      );
    }
    if (type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return [];
    if ((type.flags & ts.TypeFlags.Object) === 0) return [];
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
        return element === undefined ? [] : [element];
      }
      case 'index': {
        if (this.checker.isArrayType(type) || this.checker.isTupleType(type)) {
          return this.project(type, { kind: 'element' });
        }
        const index =
          this.checker.getIndexTypeOfType(type, ts.IndexKind.String) ??
          this.checker.getIndexTypeOfType(type, ts.IndexKind.Number);
        const members = this.checker
          .getPropertiesOfType(type)
          .map((member) => this.checker.getTypeOfSymbol(member));
        return index === undefined ? members : [index, ...members];
      }
      case 'argument': {
        if (step.of === 'Promise' || step.of === 'PromiseLike') {
          return [this.checker.getAwaitedType(type) ?? type];
        }
        if (!isReference(type)) return [];
        const argument = this.checker.getTypeArguments(type)[step.at];
        return argument === undefined ? [] : [argument];
      }
      case 'member': {
        const member = this.checker.getPropertyOfType(type, step.name);
        return member === undefined
          ? []
          : [this.checker.getTypeOfSymbol(member)];
      }
      case 'parameter':
        return type.getCallSignatures().flatMap((signature) => {
          const parameter = signature.getParameters()[step.at];
          return parameter === undefined
            ? []
            : [this.checker.getTypeOfSymbol(parameter)];
        });
      case 'return':
        return type
          .getCallSignatures()
          .map((signature) => signature.getReturnType());
    }
  }

  /** `undefined`, `null`, `void` or `never` alone: no value. */
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
   * A type with a contract: not absent, and not what has none — `unknown`,
   * `any`, a type parameter, `object`, `{}` (what plain code narrows an
   * `unknown` to), or a container of them alone (`any[]`).
   */
  private concrete(type: ts.Type): boolean {
    if (this.absent(type)) return false;
    if (type.isUnion()) return type.types.some((part) => this.concrete(part));
    return !this.contractless(type, new Set());
  }

  private contractless(type: ts.Type, seen: ReadonlySet<ts.Type>): boolean {
    if (
      type.flags &
      (ts.TypeFlags.Unknown |
        ts.TypeFlags.Any |
        ts.TypeFlags.TypeParameter |
        ts.TypeFlags.NonPrimitive)
    ) {
      return true;
    }
    if (seen.has(type)) return false;
    const deeper = new Set([...seen, type]);
    const inner = (t: ts.Type): boolean =>
      this.absent(t) || this.contractless(t, deeper);
    if (type.isUnion()) return type.types.every(inner);
    if (type.isIntersection()) return type.types.every(inner);
    if ((type.flags & ts.TypeFlags.Object) === 0) return false;
    if (this.checker.isTupleType(type) && isReference(type)) {
      return this.checker.getTypeArguments(type).every(inner);
    }
    if (this.checker.isArrayType(type)) {
      const element = this.checker.getIndexTypeOfType(
        type,
        ts.IndexKind.Number,
      );
      return element !== undefined && inner(element);
    }
    if (
      type.getProperties().length > 0 ||
      type.getCallSignatures().length > 0 ||
      type.getConstructSignatures().length > 0
    ) {
      return false;
    }
    return this.checker
      .getIndexInfosOfType(type)
      .every((info) => inner(info.type));
  }

  private typeText(type: ts.Type): string {
    return this.checker.typeToString(
      this.checker.getBaseTypeOfLiteralType(type),
    );
  }
}

/** What a sweep of these files reports, one entry per site. */
export function sweepFiles(
  program: ts.Program,
  files: ReadonlySet<string>,
  lists: ListedSites = NO_LISTS,
  slots: ReadonlyMap<string, string> = SINK_SLOTS,
): SweepSite[] {
  const own = new Set([...files].map(fileKey));
  const sources = program
    .getSourceFiles()
    .filter((file) => own.has(fileKey(file.fileName)));
  return new UnknownSweep(program, sources, lists, slots).sweep();
}

/** A read of a sink slot by a function other than the slot's reader. */
export interface SlotRead {
  readonly where: string;
  readonly slot: string;
  readonly reader: string;
}

/**
 * Every read of a slot of `slots` in `files` outside the function the slot
 * names, and the slots found declared: a member read (by name, by a computed
 * key that may name it), a destructuring in a declaration or an assignment,
 * nested or by array pattern.
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
      memberReads(checker, node, noteReads);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { reads, declared };
}

/**
 * The members a node reads, handed to `read` with the node that reads
 * them: a member read (by name, by a computed key that may name it, never
 * the target of `=`), a destructuring in a declaration or a parameter
 * (renamed, with a default, nested, a rest reading every member) and in an
 * assignment or a `for … of` head, nested or by array pattern; and a call
 * of the language's reflective or whole-object reads (`REFLECTIVE_READS`),
 * reading every member of the value it is given.
 */
function memberReads(
  checker: ts.TypeChecker,
  node: ts.Node,
  read: (at: ts.Node, members: readonly (ts.Symbol | undefined)[]) => void,
): void {
  /** Each member an assignment pattern reads off `source`, at any depth. */
  const notePattern = (pattern: ts.Expression, source: ts.Type): void => {
    const holder = checker.getNonNullableType(source);
    if (ts.isObjectLiteralExpression(pattern)) {
      for (const element of pattern.properties) {
        if (ts.isSpreadAssignment(element)) {
          read(element, checker.getPropertiesOfType(holder));
          continue;
        }
        if (
          !ts.isPropertyAssignment(element) &&
          !ts.isShorthandPropertyAssignment(element)
        ) {
          continue;
        }
        const key = propertyName(element.name);
        const member =
          key === undefined
            ? undefined
            : checker.getPropertyOfType(holder, key);
        read(
          element,
          key === undefined ? checker.getPropertiesOfType(holder) : [member],
        );
        const inner = ts.isPropertyAssignment(element)
          ? element.initializer
          : undefined;
        if (inner !== undefined && member !== undefined) {
          const target =
            ts.isBinaryExpression(inner) &&
            inner.operatorToken.kind === ts.SyntaxKind.EqualsToken
              ? inner.left
              : inner;
          notePattern(target, checker.getTypeOfSymbol(member));
        }
      }
    } else if (ts.isArrayLiteralExpression(pattern)) {
      const element =
        checker.getIndexTypeOfType(holder, ts.IndexKind.Number) ?? holder;
      pattern.elements.forEach((item, at) => {
        const tuple =
          checker.isTupleType(holder) && isReference(holder)
            ? checker.getTypeArguments(holder)[at]
            : undefined;
        const target = ts.isSpreadElement(item)
          ? item.expression
          : ts.isBinaryExpression(item) &&
              item.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ? item.left
            : item;
        notePattern(target, tuple ?? element);
      });
    }
  };
  if (
    (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) &&
    !(
      ts.isBinaryExpression(node.parent) &&
      node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.parent.left === node
    )
  ) {
    const members = ts.isPropertyAccessExpression(node)
      ? [checker.getSymbolAtLocation(node.name)]
      : keyedMembers(
          checker,
          checker.getTypeAtLocation(node.expression),
          checker.getTypeAtLocation(node.argumentExpression),
        );
    read(node, members);
  }
  if (ts.isCallExpression(node)) {
    const members = reflectiveReads(checker, node);
    if (members !== undefined && members.length > 0) read(node, members);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    (ts.isObjectLiteralExpression(node.left) ||
      ts.isArrayLiteralExpression(node.left))
  ) {
    notePattern(node.left, checker.getTypeAtLocation(node.right));
  }
  if (
    ts.isForOfStatement(node) &&
    (ts.isObjectLiteralExpression(node.initializer) ||
      ts.isArrayLiteralExpression(node.initializer))
  ) {
    const iterated = checker.getTypeAtLocation(node.expression);
    notePattern(
      node.initializer,
      checker.getIndexTypeOfType(iterated, ts.IndexKind.Number) ?? iterated,
    );
  }
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const source = checker.getTypeAtLocation(node.parent);
    if (node.dotDotDotToken !== undefined) {
      read(node, checker.getPropertiesOfType(source));
    } else {
      const key = propertyName(node.propertyName ?? node.name);
      read(
        node,
        key === undefined
          ? checker.getPropertiesOfType(source)
          : [checker.getNonNullableType(source).getProperty(key)],
      );
    }
  }
}

/**
 * The language's reflective and whole-object reads (a closed list): each
 * reads every member of the value it is given, the values whose arguments
 * it names — `first`, the first argument; `sources`, every argument after
 * the first (`Object.assign`'s sources); `keyed`, the first argument by the
 * key the second names. `Object.keys`, `Reflect.ownKeys` and `for … in`
 * read keys alone.
 */
const REFLECTIVE_READS: ReadonlyMap<string, 'first' | 'sources' | 'keyed'> =
  new Map([
    ['Object.entries', 'first'],
    ['Object.values', 'first'],
    ['Object.getOwnPropertyDescriptors', 'first'],
    ['Object.getOwnPropertyDescriptor', 'keyed'],
    ['Object.assign', 'sources'],
    ['Reflect.get', 'keyed'],
    ['Reflect.getOwnPropertyDescriptor', 'keyed'],
    ['structuredClone', 'first'],
  ]);

/** The members a call of `REFLECTIVE_READS` reads, or `undefined`. */
function reflectiveReads(
  checker: ts.TypeChecker,
  call: ts.CallExpression,
): (ts.Symbol | undefined)[] | undefined {
  const callee = call.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression)
      ? `${callee.expression.text}.${callee.name.text}`
      : undefined;
  const reads = name === undefined ? undefined : REFLECTIVE_READS.get(name);
  if (reads === undefined) return undefined;
  // The language's own, never a function of ours so named.
  const declarations = checker.getSymbolAtLocation(callee)?.declarations ?? [];
  if (
    declarations.length === 0 ||
    declarations.some((declaration) => ownNode(declaration))
  ) {
    return undefined;
  }
  const membersOf = (argument: ts.Expression): ts.Symbol[] => {
    const type = checker.getNonNullableType(
      checker.getTypeAtLocation(argument),
    );
    return (type.isUnion() ? type.types : [type]).flatMap((part) =>
      checker.getPropertiesOfType(part),
    );
  };
  const [first, second] = call.arguments;
  if (first === undefined) return undefined;
  if (reads === 'first') return membersOf(first);
  if (reads === 'sources') return call.arguments.slice(1).flatMap(membersOf);
  return second === undefined
    ? membersOf(first)
    : keyedMembers(
        checker,
        checker.getTypeAtLocation(first),
        checker.getTypeAtLocation(second),
      );
}

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
 * Every production project: its configuration and the directory it owns —
 * the root's `src`, the root's TypeScript scripts (checked by
 * `tsconfig.test.json`) and every package's `src`.
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

/** `scan` over each production project's program and the files it owns. */
export function eachProductionProject<T>(
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

/** Every site of every production project. */
export function sweepProduction(): SweepSite[] {
  return eachProductionProject((program, own) =>
    sweepFiles(program, own, PRODUCTION_LISTS),
  );
}

/** Every stray read of a sink slot in every production project. */
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
