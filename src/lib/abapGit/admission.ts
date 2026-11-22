/**
 * One admission point for every abapGit call, full tool and compact action
 * alike (spec §4.3, §4.4, §4.5, §5.1), whether or not an `IAccessChecks` is
 * configured. In order:
 *
 * 1. a denied compact action: refused;
 * 1a. `background` on a call whose schema does not declare it (cloud, or
 *    another action): refused;
 * 1b. the run log on premise, whose R1 carries no `log_link`: refused;
 * 2. link and pull while an allowed-packages or allowed-requests entry is
 *    configured (the restriction signal): refused;
 * 3. a blank `package_name` on link and branch info: refused;
 * 4. availability: the system's discovery lists `/abapgit/repos`;
 * 5. the R1 pre-read (`listReposQuiet`), once, for a call addressed by
 *    `repository_key`; a key it does not list, an entry with a blank package
 *    or URL, or an unreadable list refuses the call (fail closed);
 * 6. the package check through `IAccessChecks`, when configured: the
 *    `package_name` argument for branch info, the R1 entry's package for
 *    push, unlink and branch switch;
 * 7. the run-log pairing: `app_log_key` must be the key of the entry's
 *    `log_link` (a matching `status_link` alone does not authorise);
 * 8. endpoint binding: the `url` argument (refused with userinfo, a query or
 *    a fragment) or the R1 entry's URL, matched against the call's approved
 *    endpoints.
 *
 * Batch: no abapGit-specific handling; the consumer decides what goes into
 * a batch (owner, 2026-11-22). An abapGit call in a batch goes the batch
 * path, and what the batch connection answers reaches the consumer as it is.
 *
 * Steps 1–3 read only the raw arguments (`rawAbapGitRefusal`): the server
 * runs them on the request as it came, before the SDK validates it, and
 * again at dispatch. What is admitted is handed on (`AbapGitAdmission`) to
 * the full handler and the compact action alike, and in memory to a
 * background run — never into its record.
 */

import { AdtAbapGitClient } from '@mcp-abap-adt/adt-clients/abapgit';
import type { IAbapGitRepoFacts } from '@mcp-abap-adt/adt-strategies';
import type { IAbapGitCredentials } from '@mcp-abap-adt/interfaces-adt';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { XMLParser } from 'fast-xml-parser';
import type {
  AccessCall,
  IAccessChecks,
  IPackageReader,
} from '../access/accessChecks';
import { accessRefusalWords, ServerRefusal } from '../auth/serverRefusal';
import type { ToolArgs } from '../handlers/interfaces';
import { wireValueOf } from '../wireValue';
import { parseXml } from '../xml/node';
import {
  attr,
  elements,
  entries,
  listOf,
  localName,
  text,
  type XmlElement,
  type XmlRead,
} from '../xml/tree';
import { argumentUrlFault, matchEndpoint } from './approvedEndpoints';
import type { CallEndpoints } from './endpointSources';

/**
 * Which access restrictions the launcher's configuration holds — computed
 * by the launcher (`restrictedStart`), which keeps the lists themselves
 * private, and handed to every instance.
 */
export interface AbapGitRestrictionSignal {
  /** An `allowed-packages` entry is configured. */
  readonly packages: boolean;
  /** An `allowed-requests` entry is configured. */
  readonly requests: boolean;
}

/** No restriction configured: everything is served (SAP's authorization decides). */
export const NO_ABAPGIT_RESTRICTIONS: AbapGitRestrictionSignal = {
  packages: false,
  requests: false,
};

/** One abapGit call: the tool, the compact action when it has one, its arguments. */
export interface AbapGitCall {
  readonly tool: string;
  readonly args: ToolArgs;
}

/** What admission hands the handler: the R1 entry, and what is sent with which credential. */
export interface AbapGitAdmission {
  /** The R1 entry for `repository_key` (key-addressed calls). */
  readonly repo?: IAbapGitRepoFacts | undefined;
  /** The URL SAP is sent (URL routes): the configured URL when an alias matched. */
  readonly sendUrl?: string | undefined;
  /** The bound credential, `null` for an anonymous call; absent where none is sent. */
  readonly credentials?: IAbapGitCredentials | null | undefined;
}

/** The abapGit operations, by what each needs. */
export type AbapGitOperation =
  | 'repos'
  | 'external_repo'
  | 'branch_info'
  | 'link'
  | 'unlink'
  | 'pull'
  | 'modified_objects'
  | 'staging'
  | 'push'
  | 'checks'
  | 'file'
  | 'switch_branch'
  | 'error_log';

const FULL_OPERATIONS: Readonly<Record<string, AbapGitOperation>> = {
  ListAbapGitRepos: 'repos',
  CheckAbapGitExternalRepo: 'external_repo',
  GetAbapGitBranchInfo: 'branch_info',
  LinkAbapGitRepo: 'link',
  UnlinkAbapGitRepo: 'unlink',
  PullAbapGitRepo: 'pull',
  GetAbapGitModifiedObjects: 'modified_objects',
  GetAbapGitStaging: 'staging',
  PushAbapGitRepo: 'push',
  CheckAbapGitRepo: 'checks',
  GetAbapGitFile: 'file',
  SwitchAbapGitBranch: 'switch_branch',
  GetAbapGitErrorLog: 'error_log',
};

/** The compact tools' actions, each named as its operation. */
const COMPACT_ACTIONS: Readonly<Record<string, readonly AbapGitOperation[]>> = {
  HandlerAbapGitGet: [
    'repos',
    'external_repo',
    'modified_objects',
    'staging',
    'checks',
    'file',
    'error_log',
  ],
  HandlerAbapGit: [
    'link',
    'unlink',
    'pull',
    'push',
    'switch_branch',
    'branch_info',
  ],
};

/**
 * The operation an abapGit call is: a full tool's, or a compact tool's
 * `action` (raw: read as a string, `undefined` otherwise).
 */
export function operationOf(call: AbapGitCall): AbapGitOperation | undefined {
  const full = FULL_OPERATIONS[call.tool];
  if (full !== undefined) return full;
  const actions = COMPACT_ACTIONS[call.tool];
  if (actions === undefined) return undefined;
  const action = call.args.action;
  return actions.find((each) => each === action);
}

/** The operations SAP's own import writes: refused under any restriction. */
const IMPORTS: ReadonlySet<AbapGitOperation> = new Set(['link', 'pull']);

/** The operations that take `background` on premise (spec §4.6). */
const BACKGROUND_OPERATIONS: ReadonlySet<AbapGitOperation> = new Set([
  'link',
  'pull',
  'push',
]);

/** The operations addressed by `repository_key`: each reads R1 first. */
const KEYED: ReadonlySet<AbapGitOperation> = new Set([
  'unlink',
  'pull',
  'modified_objects',
  'staging',
  'push',
  'checks',
  'file',
  'switch_branch',
  'error_log',
]);

/** The keyed operations checked against the repository's package. */
const PACKAGE_CHECKED: ReadonlySet<AbapGitOperation> = new Set([
  'push',
  'unlink',
  'switch_branch',
]);

/** The keyed operations that send a credential, bound to the R1 entry's URL. */
const KEYED_CREDENTIALED: ReadonlySet<AbapGitOperation> = new Set([
  'pull',
  'modified_objects',
  'staging',
  'push',
  'checks',
  'file',
  'switch_branch',
]);

/** The operations that send a `url` argument, bound to the approved endpoints. */
const URL_ROUTES: ReadonlySet<AbapGitOperation> = new Set([
  'external_repo',
  'branch_info',
  'link',
]);

/** A raw argument as a string; anything else `undefined`. */
function stringArg(args: ToolArgs, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' ? value : undefined;
}

/** What the raw steps read beside the call. */
export interface RawAdmissionContext {
  /** The system kind the instance serves; `undefined` when none is stated. */
  readonly kind: 'onprem' | 'cloud' | undefined;
  /**
   * The refusal of a denied compact action (the tool's registered schema
   * refusing the `action`), else `undefined`.
   */
  readonly deniedAction: (call: AbapGitCall) => string | undefined;
}

/**
 * Steps 1–3 on the raw arguments: the refusal, or `undefined` to go on.
 * Nothing is sent, no connection taken, no credential resolved.
 */
export function rawAbapGitRefusal(
  call: AbapGitCall,
  restrictions: AbapGitRestrictionSignal,
  context: RawAdmissionContext,
): ServerRefusal | Error | undefined {
  // 1. A denied compact action.
  const denied = context.deniedAction(call);
  if (denied !== undefined) return new Error(denied);
  const operation = operationOf(call);
  // 1a. `background` where the schema does not declare it.
  if (
    'background' in call.args &&
    !(
      context.kind === 'onprem' &&
      operation !== undefined &&
      BACKGROUND_OPERATIONS.has(operation)
    )
  ) {
    return new ServerRefusal('abapgit_background_not_declared');
  }
  if (operation === undefined) return undefined;
  // 1b. On premise no run log is served: its R1 carries no log_link
  // (measured 2026-11-22, 53 entries), so R8 is cloud's alone.
  if (operation === 'error_log' && context.kind === 'onprem') {
    return new ServerRefusal('abapgit_run_log_not_served');
  }
  // 2. The import refusal under any package or request restriction.
  if (
    IMPORTS.has(operation) &&
    (restrictions.packages || restrictions.requests)
  ) {
    return new ServerRefusal('abapgit_import_not_allowed');
  }
  // 3. A blank package on link and branch info.
  if (operation === 'link' || operation === 'branch_info') {
    const packageName = stringArg(call.args, 'package_name');
    if (packageName === undefined || packageName.trim() === '') {
      return new ServerRefusal('abapgit_package_required');
    }
  }
  return undefined;
}

/** What the steps after the raw ones read. */
export interface AdmissionContext extends RawAdmissionContext {
  /** The call's connection (taken once, on first need). */
  readonly connection: () => Promise<IAbapConnection>;
  /** Whether the system the connection reaches serves abapGit (step 4). */
  readonly served: (connection: IAbapConnection) => Promise<boolean>;
  /** The call's approved endpoints (step 8). */
  readonly endpoints: () => CallEndpoints;
  /** The configured access checks and their package reader (step 6). */
  readonly accessChecks: IAccessChecks | undefined;
  readonly packageReader: () => IPackageReader;
  readonly logger?: ILogger | undefined;
}

/** What admission answers: the handoff, or the refusal the call answers. */
export type AbapGitAdmissionVerdict =
  | { readonly admitted: AbapGitAdmission }
  | { readonly refused: ServerRefusal | Error };

/** Every step, in order (see the module comment). */
export async function admitAbapGitCall(
  call: AbapGitCall,
  restrictions: AbapGitRestrictionSignal,
  context: AdmissionContext,
): Promise<AbapGitAdmissionVerdict> {
  const raw = rawAbapGitRefusal(call, restrictions, context);
  if (raw !== undefined) return { refused: raw };
  // 4. Availability, on the call's connection.
  const connection = await context.connection();
  if (!(await context.served(connection))) {
    return { refused: new ServerRefusal('abapgit_not_served') };
  }
  const operation = operationOf(call);
  if (operation === undefined) return { admitted: {} };
  // 5. The R1 pre-read, once, for a call addressed by repository_key.
  let repo: IAbapGitRepoFacts | undefined;
  let logLinks: readonly LogLinkElement[] = [];
  if (KEYED.has(operation)) {
    const read = await repositoryOf(
      connection,
      stringArg(call.args, 'repository_key'),
      context.logger,
    );
    if (read === undefined) {
      return { refused: new ServerRefusal('abapgit_repository_unknown') };
    }
    repo = read.entry;
    logLinks = read.logLinks;
  }
  // 6. The package check, when access checks are configured.
  if (context.accessChecks !== undefined) {
    const checked = packageChecked(call, operation, repo);
    if (checked !== undefined) {
      const verdict = await context.accessChecks.check(
        checked,
        context.packageReader(),
      );
      if (!verdict.allowed) {
        return {
          refused: new ServerRefusal(
            verdict.code,
            accessRefusalWords(verdict.code, verdict.argument, verdict.value),
          ),
        };
      }
    }
  }
  // 7. The run-log pairing: the entry's one log_link, its repository
  // segment and its log key read from that same link; more than one is
  // ambiguous.
  if (operation === 'error_log') {
    if (logLinks.length > 1) {
      return { refused: new ServerRefusal('abapgit_run_log_ambiguous') };
    }
    const asked = stringArg(call.args, 'app_log_key');
    const link = logLinkParts(logLinks[0]?.href);
    if (
      repo === undefined ||
      link === undefined ||
      asked === undefined ||
      link.repository !== repo.key ||
      link.logKey !== asked
    ) {
      return { refused: new ServerRefusal('abapgit_run_log_not_paired') };
    }
    return { admitted: { repo } };
  }
  // 8. Endpoint binding.
  if (URL_ROUTES.has(operation)) {
    const url = stringArg(call.args, 'url') ?? '';
    if (argumentUrlFault(url) !== undefined) {
      return { refused: new ServerRefusal('abapgit_url_refused') };
    }
    const endpoints = context.endpoints();
    if ('refused' in endpoints) {
      return { refused: new ServerRefusal('abapgit_endpoint_refused') };
    }
    const bound = matchEndpoint(url, endpoints.endpoints);
    return {
      admitted:
        bound === undefined
          ? { sendUrl: url, credentials: null }
          : { sendUrl: bound.sendUrl, credentials: bound.credentials },
    };
  }
  if (repo !== undefined && KEYED_CREDENTIALED.has(operation)) {
    const endpoints = context.endpoints();
    if ('refused' in endpoints) {
      return { refused: new ServerRefusal('abapgit_endpoint_refused') };
    }
    const bound = matchEndpoint(repo.url, endpoints.endpoints);
    return { admitted: { repo, credentials: bound?.credentials ?? null } };
  }
  return { admitted: repo === undefined ? {} : { repo } };
}

/**
 * The R1 entry for `key`, read once with `listReposQuiet` (no credential,
 * stateless, no wire log); `undefined` — fail closed — when the list cannot
 * be read, does not list the key, or lists it with a blank package or URL.
 */
async function repositoryOf(
  connection: IAbapConnection,
  key: string | undefined,
  logger: ILogger | undefined,
): Promise<
  | {
      readonly entry: IAbapGitRepoFacts;
      readonly logLinks: readonly LogLinkElement[];
    }
  | undefined
> {
  if (key === undefined || key.trim() === '') return undefined;
  const observed = new AnswerKeepingConnection(connection);
  let repos: readonly IAbapGitRepoFacts[];
  try {
    const read = await AdtAbapGitClient.create(observed, {
      ...(logger !== undefined ? { logger } : {}),
    }).listReposQuiet();
    if (!read.ok) return undefined;
    repos = read.getResult().value.facts.repos;
  } catch {
    return undefined;
  }
  const entry = repos.find((repo) => repo.key === key);
  if (
    entry === undefined ||
    entry.package.trim() === '' ||
    entry.url.trim() === ''
  ) {
    return undefined;
  }
  // The entry's every log_link element, read from the same answer as it
  // came (R1 carries no credential, spec §5.3): the facts keep one log key
  // alone, and a reader drops a link with an empty href.
  return { entry, logLinks: logLinksOf(observed.answer, key) };
}

const r1Parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Every element a list, every attribute a string: an attribute and an
  // element of the same name never meet.
  isArray: (_name, _path, _leaf, isAttribute) => !isAttribute,
});

/** The Atom namespace R1's links are in (measured 2026-11-22). */
const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom';

/** One link of an R1 entry that names itself a log link, as it is written. */
interface LogLinkElement {
  /**
   * Its `href`, when it is the measured shape: an Atom `link` element with
   * an unprefixed `type="log_link"` attribute, a `rel` attribute and an
   * `href` attribute, and no `href` or `type` child; `undefined` otherwise.
   */
  readonly href: string | undefined;
}

/**
 * Every link of the R1 entry for `key` that names itself a log link — by a
 * `type` attribute of any prefix or a `type` child — read namespace-aware,
 * attribute and element kept apart, in document order; none when the
 * answer cannot be read.
 */
function logLinksOf(
  answer: IAdtWireResponse | undefined,
  key: string,
): readonly LogLinkElement[] {
  if (answer === undefined) return [];
  const body = wireValueOf(answer.data);
  if (body.kind !== 'text') return [];
  let parsed: ReturnType<typeof parseXml>;
  try {
    parsed = parseXml(r1Parser, body.text);
  } catch {
    return [];
  }
  const roots = childrenNamed(parsed, 'repositories');
  for (const root of roots) {
    for (const entry of childrenNamed(root, 'repository')) {
      if (!valuesNamed(entry, 'key').some((k) => text(k) === key)) continue;
      const out: LogLinkElement[] = [];
      for (const [name, member] of entries(entry)) {
        if (localName(name) !== 'link') continue;
        for (const link of elements(member)) {
          if (!namesLogLink(link)) continue;
          out.push({ href: measuredHref(link, name, [entry, root]) });
        }
      }
      return out;
    }
  }
  return [];
}

/** The element children of `node` whose local name is `local`, any prefix. */
function childrenNamed(node: XmlRead, local: string): XmlElement[] {
  return entries(node)
    .filter(([name]) => !name.startsWith('@_') && localName(name) === local)
    .flatMap(([, member]) => elements(member));
}

/** The values (texts or elements) of the children of `node` named `local`, any prefix. */
function valuesNamed(node: XmlRead, local: string): XmlRead[] {
  return entries(node)
    .filter(([name]) => !name.startsWith('@_') && localName(name) === local)
    .flatMap(([, member]) => [...listOf(member)]);
}

/** Whether a link names itself a log link: a `type` attribute of any prefix, or a `type` child. */
function namesLogLink(link: XmlElement): boolean {
  for (const [name, member] of entries(link)) {
    if (name.startsWith('@_')) {
      if (localName(name.slice(2)) === 'type' && member === 'log_link') {
        return true;
      }
    } else if (
      localName(name) === 'type' &&
      listOf(member).some((each) => text(each) === 'log_link')
    ) {
      return true;
    }
  }
  return false;
}

/** The `href` of a link of the measured shape (`LogLinkElement`), else `undefined`. */
function measuredHref(
  link: XmlElement,
  name: string,
  ancestors: readonly XmlElement[],
): string | undefined {
  const colon = name.indexOf(':');
  const prefix = colon < 0 ? '' : name.slice(0, colon);
  const declaration = prefix === '' ? '@_xmlns' : `@_xmlns:${prefix}`;
  const namespace = [link, ...ancestors]
    .map((scope) => attr(scope, declaration))
    .find((value) => value !== undefined);
  if (namespace !== ATOM_NAMESPACE) return undefined;
  if (attr(link, '@_type') !== 'log_link') return undefined;
  if (attr(link, '@_rel') === undefined) return undefined;
  for (const [member] of entries(link)) {
    if (member.startsWith('@_')) continue;
    const local = localName(member);
    if (local === 'href' || local === 'type') return undefined;
  }
  return attr(link, '@_href');
}

/**
 * The repository and the log key of a log link's raw `href`, before any URL
 * parsing: exactly `/sap/bc/adt/abapgit/repos/<digits>/log/<UPPER-HEX>`,
 * compared segment by segment as strings; anything else — a host, a dot
 * segment, an encoding, a query, a fragment, another segment — is
 * `undefined`. The shape is the measured one: every repository key 12
 * digits and every log key 32 uppercase hex characters (Measured
 * 2026-11-22, onprem 53 / cloud 446 entries; onprem carries no log_link).
 * No length rule of our own.
 */
function logLinkParts(
  href: string | undefined,
): { readonly repository: string; readonly logKey: string } | undefined {
  if (href === undefined) return undefined;
  const segments = href.split('/');
  if (segments.length !== 9) return undefined;
  const [empty, sap, bc, adt, abapgit, repos, repository, log, logKey] =
    segments;
  if (
    empty !== '' ||
    sap !== 'sap' ||
    bc !== 'bc' ||
    adt !== 'adt' ||
    abapgit !== 'abapgit' ||
    repos !== 'repos' ||
    log !== 'log' ||
    repository === undefined ||
    logKey === undefined ||
    !allIn(repository, isDigit) ||
    !allIn(logKey, isUpperHex)
  ) {
    return undefined;
  }
  return { repository, logKey };
}

/** Whether `text` is non-empty and every character passes `test`. */
function allIn(text: string, test: (code: number) => boolean): boolean {
  if (text === '') return false;
  for (let i = 0; i < text.length; i += 1) {
    if (!test(text.charCodeAt(i))) return false;
  }
  return true;
}

const isDigit = (code: number): boolean => code >= 48 && code <= 57;

const isUpperHex = (code: number): boolean =>
  isDigit(code) || (code >= 65 && code <= 70);

/** A connection's session type, as its contract declares it. */
type SessionType = Parameters<IAbapConnection['setSessionType']>[0];

/**
 * The instance's connection, keeping the answer of the request it forwards
 * last: the R1 pre-read's, read for the entry's links. Nothing else is
 * changed or kept.
 */
class AnswerKeepingConnection implements IAbapConnection {
  answer: IAdtWireResponse | undefined;
  constructor(private readonly connection: IAbapConnection) {}
  connect(): Promise<void> {
    return this.connection.connect();
  }
  getBaseUrl(): Promise<string | undefined> {
    return this.connection.getBaseUrl();
  }
  getSessionId(): string | null {
    return this.connection.getSessionId();
  }
  setSessionType(type: SessionType): void {
    this.connection.setSessionType(type);
  }
  async makeAdtRequest(
    options: IAbapRequestOptions,
  ): Promise<IAdtWireResponse> {
    const answer = await this.connection.makeAdtRequest(options);
    this.answer = answer;
    return answer;
  }
}

/** The access call of step 6, or `undefined` when the operation's package is not checked. */
function packageChecked(
  call: AbapGitCall,
  operation: AbapGitOperation,
  repo: IAbapGitRepoFacts | undefined,
): AccessCall | undefined {
  const requests = (() => {
    const request = stringArg(call.args, 'transport_request');
    return request === undefined || request.trim() === ''
      ? []
      : [{ argument: 'transport_request', value: request }];
  })();
  const dispatch = stringArg(call.args, 'action');
  if (operation === 'branch_info' || operation === 'link') {
    const packageName = stringArg(call.args, 'package_name') ?? '';
    return {
      tool: call.tool,
      dispatch,
      packages: [{ argument: 'package_name', value: packageName }],
      requests,
      tables: [],
      packageCreate: false,
    };
  }
  if (PACKAGE_CHECKED.has(operation) && repo !== undefined) {
    return {
      tool: call.tool,
      dispatch,
      packages: [{ argument: "repository_key's package", value: repo.package }],
      requests,
      tables: [],
      packageCreate: false,
    };
  }
  if (operation === 'pull' && requests.length > 0) {
    return {
      tool: call.tool,
      dispatch,
      packages: [],
      requests,
      tables: [],
      packageCreate: false,
    };
  }
  return undefined;
}
