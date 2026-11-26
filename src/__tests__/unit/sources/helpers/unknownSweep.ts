/**
 * The type gate (`unknownSweep.test.ts`), over every production project the
 * repository builds, each program checked by the compiler first:
 *
 * - **`any` is an error.** The keyword `any` written in production, and every
 *   expression the checker types `any` (`JSON.parse`'s answer, an element of
 *   `Array.isArray`'s `any[]`, `Reflect.get`'s, a third party's declaration),
 *   unless it is inside a listed boundary or handed on whole into a slot
 *   declared `unknown` or `any` (an argument, a return, an initializer, an
 *   assignment, through parentheses, a conditional's branch, the right
 *   operand of `??` or `||`, an `await`).
 * - **`unknown` written by us is a warning.** The keyword in a type position
 *   (an annotation, a parameter, a return, a field, an alias, an interface,
 *   a type argument, a constraint, a default, an `as` target) is listed by
 *   `file:line`, with its class (`UNKNOWN_CLASSES`), and fails nothing; a site
 *   inside a listed boundary or forced by a contract (`FORCED_BY_CONTRACT`)
 *   is not warned.
 *
 * No analysis of who brought a value in: the type and the written text say.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, rel } from './failureScan';

/**
 * Contracts whose members take a value of any type by design: the logger's
 * (`ILogger`), and a registered tool callback as the MCP SDK calls it
 * (`RegisteredToolCallback`, `src/embeddable/BaseMcpServer.ts`).
 */
export const SINK_CONTRACTS: readonly string[] = [
  'ILogger',
  'RegisteredToolCallback',
];

/**
 * Slots of a contract whose value only leaves the program — serialized to
 * JSON, given to the MCP SDK — and is never read back, each with the one
 * function that reads it to hand it out (`file#function`). None today: a
 * tool result's content is typed (`ToolContentItem`).
 */
export const SINK_SLOTS: ReadonlyMap<string, string> = new Map<string, string>(
  [],
);

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
  'src/lib/batch/phases.ts#runEnvelope(error)',
  'src/lib/batch/phases.ts#statusOf(response)',
  'src/lib/batch/recorder.ts#thrownRawPart(response)',
  'src/lib/debugger/AmdpSession.ts#thrown(e)',
  'src/lib/debugger/AmdpSession.ts#withNotUndone(error)',
  'src/lib/debugger/AmdpSession.ts#withNotUndone(withNotUndone)',
  'src/lib/debugger/DebugSession.ts#credentialEntryOf(error)',
  'src/lib/debugger/DebugSession.ts#listenerThrown(e)',
  'src/lib/debugger/DebugSession.ts#thrown(e)',
  'src/lib/debugger/DebuggerInstance.ts#cleanupErrorOf(thrown)',
  'src/lib/debugger/failures.ts#asFailure(e)',
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
  'src/lib/thrownValue.ts#asError(thrown)',
  'src/lib/thrownValue.ts#isList(value)',
  'src/lib/thrownValue.ts#listOf(listOf)',
  'src/lib/thrownValue.ts#listOf(value)',
  'src/lib/thrownValue.ts#thrownAs(thrown)',
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
  // A registry entry, handed by the language's `every` over a list read off
  // the global: checked here.
  'src/lib/instance.ts#isEntry(entry)',
  'src/lib/instance.ts#isRegistry(value)',
  'src/lib/instance.ts#registry(found)',
  'src/lib/json.ts#jsonOf(value)',
  'src/lib/json.ts#jsonValueOf(value)',
  'src/lib/json.ts#parseJson(parsed)',
  'src/lib/packageManifest.ts#packageManifestOf(value)',
  'src/lib/systemInformation.ts#bodyOf(data)',
  'src/lib/utils.ts#parseActivationResponse(responseData)',
  // A value a wire contract types `unknown` (an answer's `data`, a request's
  // `params`, the transport's `request`), told apart once.
  'src/lib/wireValue.ts#wireValueOf(value)',
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
  // A log line's replacer, which `JSON.stringify` hands every value it
  // serialises: only serialised on.
  'src/lib/logger.ts#safeStringify(value)',
]);

/**
 * Sites where a contract of a third party forces `unknown`, each with the
 * member that forces it: written `unknown` here is the contract's, not ours.
 * They go once the contract is typed. Keyed `file#owner(name)`.
 */
export const FORCED_BY_CONTRACT: ReadonlyMap<string, string> = new Map<
  string,
  string
>([
  ['src/lib/logger.ts#debug(data)', "ILogger: a log line's meta"],
  ['src/lib/logger.ts#info(data)', "ILogger: a log line's meta"],
  ['src/lib/logger.ts#warn(data)', "ILogger: a log line's meta"],
  ['src/lib/logger.ts#error(data)', "ILogger: a log line's meta"],
  ['src/lib/loggerAdapter.ts#info(meta)', "ILogger: a log line's meta"],
  ['src/lib/loggerAdapter.ts#error(meta)', "ILogger: a log line's meta"],
  ['src/lib/loggerAdapter.ts#warn(meta)', "ILogger: a log line's meta"],
  ['src/lib/loggerAdapter.ts#debug(meta)', "ILogger: a log line's meta"],
  [
    'src/lib/batch/sessionKind.ts#paramAction(params)',
    'IAbapRequestOptions.params',
  ],
  ['src/lib/systemInformation.ts#bodyOf(data)', 'IAdtWireResponse.data'],
  [
    'src/lib/wireValue.ts#wireValueOf(value)',
    "IAdtWireResponse.data, IAbapRequestOptions.params and .data, the transport's request",
  ],
  [
    'src/lib/logger.ts#safeStringify(value)',
    "JSON.stringify: a replacer's value",
  ],
  [
    'src/lib/utils.ts#return_error(value)',
    "JSON.stringify: a replacer's value",
  ],
]);

/** Why a warned site is still `unknown`. */
export type UnknownClass = 'entry point' | 'generic carry' | 'missing own type';

/**
 * The class of each warned site, keyed `file#function` (the function the
 * site is in, or the type it is declared on); a site with none is
 * `unclassified`.
 */
export const UNKNOWN_CLASSES: ReadonlyMap<string, UnknownClass> = new Map<
  string,
  UnknownClass
>([
  // A thrown value, as the language hands it: a catch binding's, a
  // rejection's reason, a failure slot's.
  ['src/embeddable/BaseMcpServer.ts#enterMainFlow', 'entry point'],
  [
    'src/handlers/system/readonly/handleRuntimeListFeeds.ts#feedsInRounds',
    'entry point',
  ],
  ['src/lib/answer.ts#unlessCredentialFailure', 'entry point'],
  ['src/lib/batch/envelopeWatch.ts#over', 'entry point'],
  ['src/lib/batch/phases.ts#makeAdtRequest', 'entry point'],
  ['src/lib/batch/phases.ts#settledOf', 'entry point'],
  ['src/lib/batch/recorder.ts#makeAdtRequest', 'entry point'],
  ['src/lib/connectionFactory.ts#withHttpWireLog', 'entry point'],
  ['src/lib/debugger/DebugSession.ts#attachTo', 'entry point'],
  ['src/lib/requestSignal.ts#raceRequestSignal', 'entry point'],
  // A tool's arguments as the MCP SDK hands them, until its schema reads them.
  ['src/lib/handlers/interfaces.ts#(module)', 'entry point'],
  // A member of the proxied server, handed back whole.
  ['src/embeddable/BaseMcpServer.ts#get', 'entry point'],
  // Arguments handed on whole to a function of the caller's type.
  ['src/embeddable/BaseMcpServer.ts#wrapLast', 'generic carry'],
  ['src/lib/criticalSection.ts#withCriticalSection', 'generic carry'],
  ['src/lib/strategies/step.ts#atStep', 'generic carry'],
]);

/** The lists of boundaries, together. */
const LISTED: readonly string[] = [
  ...THROWN_READERS,
  ...PARSE_SITES,
  ...PROGRAM_INPUT_SITES,
  ...SINK_SITES,
  ...[...SINK_SLOTS.values()].map((reader) => `${reader}(`),
];

/** One site the gate reports. */
export interface GateSite {
  /** `any-keyword`, `any` (an expression typed `any`), or `unknown`. */
  readonly kind: 'any-keyword' | 'any' | 'unknown';
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  /** `file#owner(name)`, as the lists name a site. */
  readonly key: string;
  /** The text at the site: the expression, or the type written. */
  readonly text: string;
  /** The function or type the site is in. */
  readonly owner: string;
  /** For `unknown`: why it is still `unknown`. */
  readonly why: UnknownClass | 'unclassified';
  /** For `unknown`: where it comes from. */
  readonly origin?: UnknownOrigin;
  /**
   * For `unknown`: what brought it — `file:line` of the written keyword, a
   * package's `name@version Member`, the language's member.
   */
  readonly from?: string;
  /** For `unknown`: how it enters — written, a call's answer, a read, a callback's parameter, a catch. */
  readonly entry?: 'written' | 'call' | 'read' | 'callback' | 'catch';
  /** For `unknown`: the list that covers it, or `none`. */
  readonly boundary?: string;
  /** For a forced site: the member that forces it. */
  readonly forcedBy?: string;
}

/** Where an `unknown` comes from. */
export type UnknownOrigin = 'OURS' | 'EXTERNAL' | 'LANGUAGE' | 'UNRESOLVED';

function fileKey(name: string): string {
  return path.resolve(name);
}

const OWN_REPO = fileKey(REPO) + path.sep;

/**
 * Whether a file is the repository's own: inside it, outside
 * `node_modules` and `dist` (a sibling's built declarations included).
 */
export function ownFile(name: string): boolean {
  const key = fileKey(name);
  return (
    key.startsWith(OWN_REPO) &&
    !key.includes(`${path.sep}node_modules${path.sep}`) &&
    !key.includes(`${path.sep}dist${path.sep}`)
  );
}

/** The name a declaration writes, as the lists name a site. */
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

/** The declaration a type position belongs to: the nearest named one. */
function declarationOf(node: ts.Node): ts.Node {
  for (let at: ts.Node | undefined = node; at; at = at.parent) {
    if (nameOf(at) !== '(anonymous)' || ts.isFunctionLike(at)) return at;
  }
  return node;
}

/** `file#owner(name)` of the declaration a node belongs to. */
function keyOf(node: ts.Node): string {
  const declaration = declarationOf(node);
  return `${rel(node.getSourceFile().fileName)}#${ownerOf(declaration)}(${nameOf(declaration)})`;
}

/** Whether a node is inside a listed boundary: a function or a type the lists name. */
function listed(node: ts.Node): boolean {
  const file = rel(node.getSourceFile().fileName);
  if (LISTED.includes(keyOf(node))) return true;
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if (!ts.isFunctionLike(at)) continue;
    const owner = ownerOf(at);
    if (owner === '(module)') continue;
    const prefix = `${file}#${owner}(`;
    if (LISTED.some((entry) => entry.startsWith(prefix))) return true;
  }
  return false;
}

/**
 * Whether a node is inside a sink contract (`SINK_CONTRACTS`): the contract's
 * own declaration, a class implementing it, or a declaration whose written
 * type names it (an implementation written as a literal).
 */
function inSinkContract(node: ts.Node): boolean {
  // The declaration's written type is the contract itself, not a type that
  // merely holds it somewhere (`{ sink?: ILogger; answer: boolean }`).
  const names = (type: ts.TypeNode | undefined): boolean =>
    type !== undefined &&
    ts.isTypeReferenceNode(type) &&
    SINK_CONTRACTS.includes(type.typeName.getText());
  for (let at: ts.Node | undefined = node; at; at = at.parent) {
    if (
      (ts.isInterfaceDeclaration(at) || ts.isTypeAliasDeclaration(at)) &&
      SINK_CONTRACTS.includes(at.name.text)
    ) {
      return true;
    }
    if (
      ts.isClassLike(at) &&
      (at.heritageClauses ?? []).some((clause) =>
        clause.types.some((type) =>
          SINK_CONTRACTS.includes(type.expression.getText()),
        ),
      )
    ) {
      return true;
    }
    if (
      (ts.isVariableDeclaration(at) ||
        ts.isPropertyDeclaration(at) ||
        ts.isParameter(at)) &&
      names(at.type)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a name is a value read: not a declaration's own name, a member's
 * name, an import or an export, a label.
 */
function valueNode(node: ts.Expression): boolean {
  if (ts.isPartOfTypeNode(node)) return false;
  const parent = node.parent;
  if (
    ts.isLiteralTypeNode(parent) ||
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isExternalModuleReference(parent) ||
    ts.isModuleDeclaration(parent) ||
    ts.isImportTypeNode(parent)
  ) {
    return false;
  }
  if (ts.isPrivateIdentifier(node)) return false;
  if (node.kind === ts.SyntaxKind.ImportKeyword) return false;
  if (!ts.isIdentifier(node)) return true;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    ts.isQualifiedName(parent) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) &&
      (parent.propertyName === node || parent.name === node)) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent) ||
    ts.isJsxAttribute(parent) ||
    ts.isMetaProperty(parent) ||
    ts.isExpressionWithTypeArguments(parent)
  ) {
    return false;
  }
  return (
    !('name' in parent && parent.name === node) ||
    ts.isShorthandPropertyAssignment(parent)
  );
}

/** Whether a type node writes `unknown` or `any`. */
function writesUnknownOrAny(type: ts.TypeNode | undefined): boolean {
  return (
    type !== undefined &&
    (type.kind === ts.SyntaxKind.UnknownKeyword ||
      type.kind === ts.SyntaxKind.AnyKeyword)
  );
}

/**
 * Whether an `any` expression is handed on whole into a slot declared
 * `unknown` or `any`: through the carriers (parentheses, a conditional's
 * branch, the right operand of `??` or `||`, an `await`), as an argument
 * whose parameter is so declared, a return of a function so declared, an
 * initializer or an assignment into a declaration so written.
 */
function handedOnWhole(checker: ts.TypeChecker, node: ts.Expression): boolean {
  let current: ts.Expression = node;
  for (;;) {
    const parent = current.parent;
    if (ts.isParenthesizedExpression(parent) || ts.isAwaitExpression(parent)) {
      current = parent;
      continue;
    }
    if (ts.isConditionalExpression(parent) && parent.condition !== current) {
      current = parent;
      continue;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.right === current &&
      (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        parent.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      current = parent;
      continue;
    }
    break;
  }
  const parent = current.parent;
  if (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    parent.expression !== current
  ) {
    const handed: readonly ts.Expression[] = parent.arguments ?? [];
    const at = handed.indexOf(current);
    const parameters =
      checker.getResolvedSignature(parent)?.getParameters() ?? [];
    const last = parameters.at(-1)?.valueDeclaration;
    const rest =
      last !== undefined &&
      ts.isParameter(last) &&
      last.dotDotDotToken !== undefined;
    const declaration = (
      parameters[at] ?? (rest ? parameters.at(-1) : undefined)
    )?.valueDeclaration;
    if (declaration === undefined || !ts.isParameter(declaration)) return false;
    const type = declaration.type;
    if (writesUnknownOrAny(type)) return true;
    // A rest parameter written `unknown[]` or `any[]`.
    return (
      declaration.dotDotDotToken !== undefined &&
      type !== undefined &&
      ts.isArrayTypeNode(type) &&
      writesUnknownOrAny(type.elementType)
    );
  }
  if (
    ts.isReturnStatement(parent) ||
    (ts.isArrowFunction(parent) && parent.body === current)
  ) {
    const fn = ts.isReturnStatement(parent)
      ? ts.findAncestor(parent, ts.isFunctionLike)
      : parent;
    if (fn === undefined) return false;
    if (fn.type !== undefined) return writesUnknownOrAny(fn.type);
    // Written without a return type, a function expression returns into its
    // contract's (`ProxyHandler.get`'s `any`), as its contract declares it.
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
    const contextual = checker.getContextualType(fn);
    const signatures =
      contextual === undefined
        ? []
        : checker.getNonNullableType(contextual).getCallSignatures();
    return (
      signatures.length > 0 &&
      signatures.every((signature) => {
        const declaration = signature.getDeclaration();
        return writesUnknownOrAny(declaration.type);
      })
    );
  }
  if (
    (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
    parent.initializer === current
  ) {
    return writesUnknownOrAny(parent.type);
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.right === current &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    const target = parent.left;
    const symbol = checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(target) ? target.name : target,
    );
    const declaration = symbol?.valueDeclaration;
    return (
      declaration !== undefined &&
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyDeclaration(declaration) ||
        ts.isPropertySignature(declaration) ||
        ts.isParameter(declaration)) &&
      writesUnknownOrAny(declaration.type)
    );
  }
  return false;
}

/** The text of a node, on one line. */
function oneLine(node: ts.Node): string {
  return node
    .getText()
    .split('\n')
    .map((part) => part.trim())
    .join(' ')
    .slice(0, 80);
}

/** The class of a warned site: by its function, or its key's owner. */
function classOf(node: ts.Node): UnknownClass | 'unclassified' {
  const file = rel(node.getSourceFile().fileName);
  for (let at: ts.Node | undefined = node; at; at = at.parent) {
    const owner = ownerOf(at);
    const found = UNKNOWN_CLASSES.get(`${file}#${owner}`);
    if (found !== undefined) return found;
    if (owner === '(module)') break;
  }
  return 'unclassified';
}

/** Every site of the gate in `files` of `program`. */
export function gateSites(
  program: ts.Program,
  files: ReadonlySet<string>,
): GateSite[] {
  const checker = program.getTypeChecker();
  const own = new Set([...files].map(fileKey));
  const out: GateSite[] = [];
  for (const source of program.getSourceFiles()) {
    if (!own.has(fileKey(source.fileName))) continue;
    const at = (node: ts.Node): string => {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      return `${rel(source.fileName)}:${line + 1}`;
    };
    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        out.push({
          kind: 'any-keyword',
          where: at(node),
          key: keyOf(node),
          text: oneLine(node.parent),
          owner: ownerOf(declarationOf(node)),
          why: 'unclassified',
        });
      } else if (node.kind === ts.SyntaxKind.UnknownKeyword) {
        // Every `unknown` written is reported, a list covering it or not.
        const key = keyOf(node);
        const forcedBy = FORCED_BY_CONTRACT.get(key);
        out.push({
          kind: 'unknown',
          where: at(node),
          key,
          text: oneLine(node.parent),
          owner: ownerOf(declarationOf(node)),
          why: classOf(node),
          origin: 'OURS',
          from: at(node),
          entry: 'written',
          boundary: boundaryOf(node, forcedBy),
          ...(forcedBy === undefined ? {} : { forcedBy }),
        });
      } else if (
        ts.isExpression(node) &&
        valueNode(node) &&
        checker.getTypeAtLocation(node).flags & ts.TypeFlags.Any &&
        !listed(node) &&
        !handedOnWhole(checker, node)
      ) {
        out.push({
          kind: 'any',
          where: at(node),
          key: keyOf(node),
          text: oneLine(node),
          owner: ownerOf(declarationOf(node)),
          why: 'unclassified',
        });
      }
      const entered = entryOf(checker, node);
      if (entered !== undefined) {
        out.push({
          kind: 'unknown',
          where: at(node),
          key: keyOf(node),
          text: oneLine(node),
          owner: ownerOf(declarationOf(node)),
          why: classOf(node),
          origin: entered.origin,
          from: entered.from,
          entry: entered.entry,
          boundary: boundaryOf(node, undefined),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

/**
 * Whether a declaration itself brings the `unknown` its use holds: its
 * declared type (a call's declared return) holds it, or — no type argument
 * written at the use — a type parameter of it or of its holder defaults to
 * one (`IAdtWireResponse<T = unknown>`). One instantiated by type arguments
 * or values of the caller's brings nothing of its own: the `unknown` is
 * where the caller wrote it.
 */
function declaredUnknown(
  checker: ts.TypeChecker,
  declaration: ts.Node,
  defaultsApply: boolean,
): boolean {
  const declared = ts.isFunctionLike(declaration)
    ? checker.getSignatureFromDeclaration(declaration)?.getReturnType()
    : checker.getTypeAtLocation(declaration);
  if (declared !== undefined && holdsUnknown(checker, declared)) return true;
  if (!defaultsApply) return false;
  const holders: ts.Node[] = [declaration];
  const container = declaration.parent;
  if (
    container !== undefined &&
    (ts.isClassLike(container) || ts.isInterfaceDeclaration(container))
  ) {
    holders.push(container);
  }
  if (
    ts.isConstructorDeclaration(declaration) &&
    ts.isClassLike(declaration.parent)
  ) {
    holders.push(declaration.parent);
  }
  return holders.some((holder) => {
    const parameters =
      ts.isClassLike(holder) ||
      ts.isInterfaceDeclaration(holder) ||
      ts.isFunctionLike(holder)
        ? holder.typeParameters
        : undefined;
    return (parameters ?? []).some(
      (parameter) =>
        parameter.default !== undefined &&
        holdsUnknown(checker, checker.getTypeAtLocation(parameter.default)),
    );
  });
}

/** Whether a type holds `unknown`: itself, a union's or an intersection's member, a type argument. */
function holdsUnknown(
  checker: ts.TypeChecker,
  type: ts.Type,
  seen: Set<ts.Type> = new Set(),
): boolean {
  if (type.flags & ts.TypeFlags.Unknown) return true;
  if (seen.has(type)) return false;
  seen.add(type);
  if (type.isUnionOrIntersection()) {
    return type.types.some((part) => holdsUnknown(checker, part, seen));
  }
  return (
    isReference(type) &&
    checker
      .getTypeArguments(type)
      .some((argument) => holdsUnknown(checker, argument, seen))
  );
}

function isReference(type: ts.Type): type is ts.TypeReference {
  return (type.flags & ts.TypeFlags.Object) !== 0 && 'target' in type;
}

/** The name a declaration writes, when it is a plain one. */
function writtenName(node: ts.Node): string | undefined {
  if (
    (ts.isInterfaceDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isGetAccessorDeclaration(node)) &&
    node.name !== undefined &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  ) {
    return node.name.text;
  }
  return undefined;
}

/** `Holder.member(parameter)` of a declaration in a declaration file. */
function memberName(declaration: ts.Node): string {
  const parts: string[] = [];
  let parameter: string | undefined;
  if (ts.isParameter(declaration) && ts.isIdentifier(declaration.name)) {
    parameter = declaration.name.text;
  }
  for (let at: ts.Node | undefined = declaration; at; at = at.parent) {
    if (ts.isSourceFile(at)) break;
    const name = writtenName(at);
    if (name !== undefined && name !== 'global') parts.unshift(name);
    if (
      ts.isInterfaceDeclaration(at) ||
      ts.isClassDeclaration(at) ||
      ts.isTypeAliasDeclaration(at)
    ) {
      break;
    }
  }
  const base = parts.join('.') || '(anonymous)';
  return parameter === undefined ? base : `${base}(${parameter})`;
}

/** The manifest of the package a declaration file belongs to: `name@version`, else nothing. */
function packageOf(file: string): string | undefined {
  const marker = `${path.sep}node_modules${path.sep}`;
  const normal = path.resolve(file);
  const at = normal.lastIndexOf(marker);
  if (at < 0) return undefined;
  const rest = normal.slice(at + marker.length).split(path.sep);
  const first = rest[0] ?? '';
  const name = first.startsWith('@')
    ? `${first}${path.sep}${rest[1] ?? ''}`
    : first;
  const root = normal.slice(0, at + marker.length) + name;
  try {
    const manifest: { name?: unknown; version?: unknown } = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    return typeof manifest.name === 'string' &&
      typeof manifest.version === 'string'
      ? `${manifest.name}@${manifest.version}`
      : undefined;
  } catch {
    return undefined;
  }
}

/** Where a declaration outside the repository is: the language's, a package's, or unknown. */
function originOf(
  declaration: ts.Node | undefined,
  suffix: string,
): { origin: UnknownOrigin; from: string } | undefined {
  if (declaration === undefined) {
    return { origin: 'UNRESOLVED', from: 'no declaration' };
  }
  const source = declaration.getSourceFile();
  if (ownFile(source.fileName)) return undefined;
  // Our own packages' built declarations (a sibling's `dist`): ours, reported
  // where their source writes it.
  const built = path.resolve(source.fileName);
  if (
    built.startsWith(OWN_REPO) &&
    !built.includes(`${path.sep}node_modules${path.sep}`)
  ) {
    return undefined;
  }
  const member = `${memberName(declaration)}${suffix}`;
  const file = path.resolve(source.fileName);
  if (
    source.isDeclarationFile &&
    (path.basename(file).startsWith('lib.') ||
      file.includes(`${path.sep}typescript${path.sep}lib${path.sep}`))
  ) {
    return { origin: 'LANGUAGE', from: member };
  }
  const manifest = packageOf(file);
  if (manifest === undefined) {
    return { origin: 'UNRESOLVED', from: `${rel(file)} ${member}` };
  }
  return { origin: 'EXTERNAL', from: `${manifest} ${member}` };
}

/**
 * Where an `unknown` enters our code at a node, if it does: a call's or a
 * `new`'s answer, a read of a member, a callback's parameter its contract
 * types, a catch binding — each declared outside the repository. A value
 * that only flows on within our code enters nowhere.
 */
function entryOf(
  checker: ts.TypeChecker,
  node: ts.Node,
):
  | {
      origin: UnknownOrigin;
      from: string;
      entry: 'call' | 'read' | 'callback' | 'catch';
    }
  | undefined {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isCatchClause(node.parent) &&
    node.type === undefined
  ) {
    return { origin: 'LANGUAGE', from: 'catch binding', entry: 'catch' };
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    if (!holdsUnknown(checker, checker.getTypeAtLocation(node)))
      return undefined;
    const declaration = checker.getResolvedSignature(node)?.getDeclaration();
    if (
      declaration !== undefined &&
      !declaredUnknown(checker, declaration, node.typeArguments === undefined)
    ) {
      return undefined;
    }
    const found = originOf(declaration, '()');
    return found === undefined ? undefined : { ...found, entry: 'call' };
  }
  if (
    (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) &&
    !(
      (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) &&
      node.parent.expression === node
    )
  ) {
    if (!holdsUnknown(checker, checker.getTypeAtLocation(node)))
      return undefined;
    const name = ts.isPropertyAccessExpression(node)
      ? node.name
      : node.argumentExpression;
    const found0 = checker.getSymbolAtLocation(name);
    const symbol =
      found0 !== undefined && found0.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(found0)
        : found0;
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (declaration === undefined) {
      // An element of a list, a member of an index signature: it entered
      // with its holder.
      return undefined;
    }
    if (
      declaration !== undefined &&
      !declaredUnknown(checker, declaration, true)
    ) {
      return undefined;
    }
    const found = originOf(declaration, '');
    return found === undefined ? undefined : { ...found, entry: 'read' };
  }
  if (
    ts.isIdentifier(node) &&
    valueNode(node) &&
    !(
      (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) &&
      node.parent.expression === node
    ) &&
    !ts.isPropertyAccessExpression(node.parent)
  ) {
    // A name a declaration outside the repository gives a value of: read here.
    const found0 = checker.getSymbolAtLocation(node);
    const symbol =
      found0 !== undefined && found0.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(found0)
        : found0;
    const declaration = symbol?.valueDeclaration;
    if (
      declaration === undefined ||
      ownFile(declaration.getSourceFile().fileName) ||
      !holdsUnknown(checker, checker.getTypeAtLocation(node))
    ) {
      return undefined;
    }
    const found = originOf(declaration, '');
    return found === undefined ? undefined : { ...found, entry: 'read' };
  }
  if (ts.isParameter(node) && node.type === undefined) {
    if (!holdsUnknown(checker, checker.getTypeAtLocation(node)))
      return undefined;
    const fn = node.parent;
    const at = fn.parameters.indexOf(node);
    const contract = contractParameter(checker, fn, at);
    if (contract === null) return undefined;
    const found = originOf(contract, '');
    return found === undefined ? undefined : { ...found, entry: 'callback' };
  }
  return undefined;
}

/**
 * The declaration of the parameter a contract types a callback's parameter
 * by: the callee's when the callback is handed straight to a call (the
 * slot that instantiates it), else the contextual signature's; `null` for a
 * function no contract types.
 */
function contractParameter(
  checker: ts.TypeChecker,
  fn: ts.SignatureDeclaration,
  at: number,
): ts.Node | undefined | null {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
    if (
      !ts.isMethodDeclaration(fn) ||
      !ts.isObjectLiteralExpression(fn.parent)
    ) {
      return null;
    }
  }
  const call = fn.parent;
  if (
    (ts.isCallExpression(call) || ts.isNewExpression(call)) &&
    call.expression !== fn
  ) {
    const handed: readonly ts.Expression[] = call.arguments ?? [];
    const index = handed.findIndex((argument) => argument === fn);
    const parameters =
      checker.getResolvedSignature(call)?.getParameters() ?? [];
    const slot = parameters[index]?.valueDeclaration;
    if (slot !== undefined) return slot;
  }
  const contextual = ts.isMethodDeclaration(fn)
    ? undefined
    : checker.getContextualType(fn);
  const signature =
    contextual === undefined
      ? undefined
      : checker.getNonNullableType(contextual).getCallSignatures()[0];
  if (signature === undefined)
    return ts.isMethodDeclaration(fn) ? null : undefined;
  return signature.getParameters()[at]?.valueDeclaration;
}

/**
 * The list that covers a site — `FORCED_BY_CONTRACT`, `THROWN_READERS`,
 * `PARSE_SITES`, `PROGRAM_INPUT_SITES`, `SINK_SITES`, `SINK_SLOTS`,
 * `SINK_CONTRACTS`, `ToolArgs` (a tool's arguments until checked) — or `none`.
 */
function boundaryOf(node: ts.Node, forcedBy: string | undefined): string {
  if (forcedBy !== undefined) return 'FORCED_BY_CONTRACT';
  const file = rel(node.getSourceFile().fileName);
  const owners: string[] = [keyOf(node)];
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if (!ts.isFunctionLike(at)) continue;
    const owner = ownerOf(at);
    if (owner !== '(module)') owners.push(`${file}#${owner}(`);
  }
  const lists: [string, readonly string[]][] = [
    ['THROWN_READERS', [...THROWN_READERS]],
    ['PARSE_SITES', [...PARSE_SITES]],
    ['PROGRAM_INPUT_SITES', [...PROGRAM_INPUT_SITES]],
    ['SINK_SITES', [...SINK_SITES]],
    ['SINK_SLOTS', [...SINK_SLOTS.values()].map((reader) => `${reader}(`)],
  ];
  for (const [name, entries] of lists) {
    if (
      owners.some((owner) =>
        entries.some((entry) =>
          owner.endsWith('(') ? entry.startsWith(owner) : entry === owner,
        ),
      )
    ) {
      return name;
    }
  }
  if (inSinkContract(node)) return 'SINK_CONTRACTS';
  if (toolArgs(node)) return 'ToolArgs';
  return 'none';
}

/** Whether a site is a tool's arguments: `ToolArgs` or `ToolArgValue`, by its alias or its written type. */
function toolArgs(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node; at; at = at.parent) {
    if (
      ts.isTypeAliasDeclaration(at) &&
      (at.name.text === 'ToolArgs' || at.name.text === 'ToolArgValue')
    ) {
      return true;
    }
    const written =
      ts.isParameter(at) ||
      ts.isVariableDeclaration(at) ||
      ts.isPropertyDeclaration(at) ||
      ts.isPropertySignature(at)
        ? at.type
        : undefined;
    if (written !== undefined) {
      const text = written.getText();
      return text.includes('ToolArgs') || text.includes('ToolArgValue');
    }
  }
  return false;
}

/** Every declaration key of `files`: what a list entry may name. */
export function declarationKeys(
  program: ts.Program,
  files: ReadonlySet<string>,
): Set<string> {
  const own = new Set([...files].map(fileKey));
  const keys = new Set<string>();
  for (const source of program.getSourceFiles()) {
    if (!own.has(fileKey(source.fileName))) continue;
    const visit = (node: ts.Node): void => {
      if (nameOf(node) !== '(anonymous)' || ts.isFunctionLike(node)) {
        keys.add(`${rel(source.fileName)}#${ownerOf(node)}(${nameOf(node)})`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return keys;
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
  return eachProject(productionProjects(), scan);
}

/** A diagnostic as one line: where, and the compiler's words. */
function diagnosticLine(diagnostic: ts.Diagnostic): string {
  const words = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  const file = diagnostic.file;
  if (file === undefined || diagnostic.start === undefined) return words;
  const { line } = file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${rel(file.fileName)}:${line + 1} ${words}`;
}

/**
 * `scan` over each project's program and the files it owns. A project whose
 * configuration does not parse, or whose program has a diagnostic before
 * emit, fails the sweep, naming the project and its first diagnostics: an
 * import left unresolved (a sibling's `dist` not built) types what it
 * names as the error type, which would read as `any` unnoticed.
 */
export function eachProject<T>(
  projects: readonly { tsconfig: string; dir: string }[],
  scan: (program: ts.Program, own: ReadonlySet<string>) => T[],
): T[] {
  const out: T[] = [];
  for (const project of projects) {
    const unrecoverable: ts.Diagnostic[] = [];
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path.join(REPO, project.tsconfig),
      { noEmit: true },
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          unrecoverable.push(diagnostic);
        },
      },
    );
    const configured = [...unrecoverable, ...(parsed?.errors ?? [])];
    if (parsed === undefined || configured.length > 0) {
      throw new Error(
        `the sweep cannot read ${project.tsconfig}: ${
          configured.slice(0, 3).map(diagnosticLine).join('; ') ||
          'no configuration'
        }`,
      );
    }
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
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length > 0) {
      throw new Error(
        `the sweep refuses ${project.tsconfig}: ${diagnostics.length} diagnostic(s) before emit, first ${diagnostics
          .slice(0, 3)
          .map(diagnosticLine)
          .join('; ')}`,
      );
    }
    out.push(...scan(program, own));
  }
  return out;
}

/** Every gate site of every production project. */
export function gateProduction(): GateSite[] {
  return eachProductionProject((program, own) => gateSites(program, own));
}

/** Every declaration key of every production project. */
export function productionKeys(): Set<string> {
  const keys = new Set<string>();
  eachProductionProject((program, own) => {
    for (const key of declarationKeys(program, own)) keys.add(key);
    return [];
  });
  return keys;
}
