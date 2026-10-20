/**
 * The header probe's pure parts: what one answer records, the rows, the
 * summary and the report files. Nothing here sends a request.
 */

import {
  extractSupportedAccept,
  extractSupportedContentType,
} from '@mcp-abap-adt/adt-clients';
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';

/** The media type no ADT resource serves: what the two bad probes send. */
export const PROBE_TYPE = 'application/x-header-probe';

export type ProbeKind = 'known' | 'badAccept' | 'badContentType';

export const PROBE_KINDS: readonly ProbeKind[] = [
  'known',
  'badAccept',
  'badContentType',
];

/** What `--only` and `--operation` asked for. */
export interface IProbeFilters {
  only?: readonly string[];
  operation?: string;
}

/** The `--only` key an object type answers to: its includes and messages go with their parent. */
export function filterGroup(objectType: string): string {
  if (objectType.startsWith('local')) return 'class';
  if (objectType === 'messageClassMessage') return 'messageClass';
  return objectType;
}

/** Whether `--only` keeps this object type. */
export function keepsType(filters: IProbeFilters, objectType: string): boolean {
  return !filters.only || filters.only.includes(filterGroup(objectType));
}

/** Whether the filters ask for this row. */
export function wants(
  filters: IProbeFilters,
  objectType: string,
  member: string,
): boolean {
  if (!keepsType(filters, objectType)) return false;
  return !filters.operation || filters.operation === member;
}

/**
 * Whether the cycle needs this step whatever the filters say: every later
 * step works on what a create made, so a create always runs — the object's
 * and a message class message's alike.
 */
export function isPrerequisite(_objectType: string, member: string): boolean {
  return member === 'create';
}

/**
 * The probes one step sends: none for an object type `--only` leaves out; all
 * of them when the row is asked for; the known pair alone when it is only a
 * prerequisite (and not reported); none otherwise.
 */
export function plannedKinds(
  filters: IProbeFilters,
  objectType: string,
  member: string,
  kinds: readonly ProbeKind[] = PROBE_KINDS,
): readonly ProbeKind[] {
  if (!keepsType(filters, objectType)) return [];
  if (wants(filters, objectType, member)) return kinds;
  return isPrerequisite(objectType, member) ? ['known'] : [];
}

/** The pair each probe sends, built from the operation's default pair. */
export function probePair(kind: ProbeKind, known: IAdtHeaders): IAdtHeaders {
  if (kind === 'badAccept')
    return { accept: PROBE_TYPE, contentType: known.contentType };
  if (kind === 'badContentType')
    return { accept: known.accept, contentType: PROBE_TYPE };
  return { accept: known.accept, contentType: known.contentType };
}

/** What a read of the object said right after a write probe. */
export interface IObjectState {
  status?: number;
  exists: boolean | 'unknown';
  /** `adtcore:version` of the metadata document, when it names one. */
  version?: string;
}

/** The request that went out, as the member issued it. */
export interface ISentRequest {
  method: string;
  /** The URL path with the object's name as `{name}` and no query. */
  path: string;
  /** The query's `_action` (`LOCK`, `UNLOCK`, …), when it has one. */
  action?: string;
}

/**
 * The endpoint a request went to: its method, its path with the object's
 * names as `{name}`, and its `_action`, read from the query or the params.
 */
export function endpointOf(
  method: string,
  url: string,
  params: unknown,
  names: readonly string[],
): ISentRequest {
  const query = url.indexOf('?');
  const fromQuery =
    query === -1
      ? null
      : new URLSearchParams(url.slice(query + 1)).get('_action');
  const fromParams =
    params && typeof params === 'object'
      ? (params as Record<string, unknown>)._action
      : undefined;
  const action =
    fromQuery ?? (typeof fromParams === 'string' ? fromParams : undefined);
  const request: ISentRequest = {
    method: method.toUpperCase(),
    path: normalizePath(url, names),
  };
  if (action) request.action = action;
  return request;
}

/** One endpoint as text: `POST /path?_action=LOCK`. */
export function endpointKey(request: ISentRequest): string {
  return `${request.method} ${request.path}${request.action ? `?_action=${request.action}` : ''}`;
}

/** One call of the member with one pair, and what SAP answered it. */
export interface IAttempt {
  sent: IAdtHeaders;
  /** Every request the member issued (a chain issues several). */
  requests: ISentRequest[];
  status?: number;
  sapType?: string;
  sapMessage?: string;
  /** The answer's own `content-type` header. */
  responseContentType?: string;
  supportedAccept: string[];
  supportedContentType: string[];
  /** The raw `Accepted content types: …` text of the body, when present. */
  acceptedText?: string;
  /** The raw `Supported Media Types: …` text of the body, when present. */
  supportedText?: string;
  /** Why there is no answer: nothing came back, or the member threw. */
  failure?: string;
  /** The body of a non-2xx answer, cut at {@link BODY_LIMIT} characters. */
  body?: string;
}

export interface IProbeAnswer extends IAttempt {
  probe: ProbeKind;
  /** `batched`, or `sequential: <reason>`. */
  mode: string;
  /**
   * The server's correction (`withAdtHeaders`): the member called once more
   * with the pair SAP named, and what SAP answered that. Absent when the
   * server sent nothing again — the first answer named nothing usable, or
   * the call was recorded in a batch (a recorded call is made once).
   */
  correction?: IAttempt;
  /** The pair the server keeps for the operation after the call, when it changed. */
  kept?: IAdtHeaders;
  /** Read after a write probe. */
  stateAfter?: IObjectState;
}

export interface IOperationRow {
  objectType: string;
  member: string;
  /** The server's default pair (`DEFAULT_ADT_HEADERS`). */
  known?: IAdtHeaders;
  /** `skipped: <reason>` rows carry no probes. */
  skipped?: string;
  probes: IProbeAnswer[];
}

export interface IRemoval {
  label: string;
  removed: boolean;
  detail: string;
}

export interface IProbeReport {
  startedAt: string;
  finishedAt?: string;
  mode: 'batched' | 'sequential';
  filters: { only?: string[]; operation?: string };
  rows: IOperationRow[];
  removals: IRemoval[];
  /** What stopped the run, when something did. */
  error?: string;
}

export const BODY_LIMIT = 4000;

const ACCEPTED_CONTENT_TYPES = 'Accepted content types:';
const SUPPORTED_MEDIA_TYPES = 'Supported Media Types:';

/** The raw `<marker> …` text, up to the end of its element, attribute or line. */
function markedText(body: string, marker: string): string | undefined {
  const at = body.indexOf(marker);
  if (at === -1) return undefined;
  let end = body.length;
  for (const stop of ['<', '"', '\n']) {
    const found = body.indexOf(stop, at);
    if (found !== -1 && found < end) end = found;
  }
  return body.slice(at, end).trim();
}

/** The raw `Accepted content types: …` text. */
export function acceptedContentTypesText(body: string): string | undefined {
  return markedText(body, ACCEPTED_CONTENT_TYPES);
}

/** The raw `Supported Media Types: …` text. */
export function supportedMediaTypesText(body: string): string | undefined {
  return markedText(body, SUPPORTED_MEDIA_TYPES);
}

/** The text of the first `<tag …>…</tag>` element of `body`. */
function elementText(body: string, tag: string): string | undefined {
  let at = body.indexOf(`<${tag}`);
  while (at !== -1) {
    const next = body[at + tag.length + 1];
    if (next === '>' || next === ' ' || next === '/') break;
    at = body.indexOf(`<${tag}`, at + 1);
  }
  if (at === -1) return undefined;
  const open = body.indexOf('>', at);
  if (open === -1 || body[open - 1] === '/') return undefined;
  const close = body.indexOf(`</${tag}>`, open);
  if (close === -1) return undefined;
  return body.slice(open + 1, close).trim();
}

/** The `id` of the first `<type id="…"/>` of `body`. */
function typeId(body: string): string | undefined {
  const at = body.indexOf('<type id="');
  if (at === -1) return undefined;
  const start = at + '<type id="'.length;
  const end = body.indexOf('"', start);
  return end === -1 ? undefined : body.slice(start, end);
}

/** SAP's exception document: its type and message, when the body is one. */
export function sapExceptionOf(
  body: string,
): { type?: string; message?: string } | undefined {
  if (!body.includes('exception')) return undefined;
  const type = typeId(body);
  const message = elementText(body, 'message');
  if (type === undefined && message === undefined) return undefined;
  return {
    ...(type !== undefined ? { type } : {}),
    ...(message !== undefined ? { message } : {}),
  };
}

function headerValue(
  headers: IAdtWireResponse['headers'] | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name)
      return value == null ? undefined : String(value);
  }
  return undefined;
}

/** What one call of the member records, from the answer it got. */
export function readAttempt(input: {
  sent: IAdtHeaders;
  requests: ISentRequest[];
  wire?: IAdtWireResponse;
  failure?: string;
}): IAttempt {
  const { wire } = input;
  const attempt: IAttempt = {
    sent: { accept: input.sent.accept, contentType: input.sent.contentType },
    requests: input.requests,
    supportedAccept: [],
    supportedContentType: [],
  };
  if (!wire) {
    attempt.failure = input.failure ?? 'no answer';
    return attempt;
  }
  const body =
    typeof wire.data === 'string'
      ? wire.data
      : wire.data == null
        ? ''
        : JSON.stringify(wire.data);
  attempt.status = wire.status;
  const own = headerValue(wire.headers, 'content-type');
  if (own !== undefined) attempt.responseContentType = own;
  const refusal = sapExceptionOf(body);
  if (refusal?.type !== undefined) attempt.sapType = refusal.type;
  if (refusal?.message !== undefined) attempt.sapMessage = refusal.message;
  const asError = { response: wire };
  attempt.supportedAccept = extractSupportedAccept(asError);
  attempt.supportedContentType = extractSupportedContentType(asError);
  const accepted = acceptedContentTypesText(body);
  if (accepted !== undefined) attempt.acceptedText = accepted;
  const supported = supportedMediaTypesText(body);
  if (supported !== undefined) attempt.supportedText = supported;
  if (wire.status < 200 || wire.status >= 300) {
    attempt.body = body.slice(0, BODY_LIMIT);
  }
  if (input.failure) attempt.failure = input.failure;
  return attempt;
}

/** What a metadata read says about the object. */
export function readState(wire: IAdtWireResponse | undefined): IObjectState {
  if (!wire) return { exists: 'unknown' };
  if (wire.status === 404) return { status: 404, exists: false };
  if (wire.status < 200 || wire.status >= 300)
    return { status: wire.status, exists: 'unknown' };
  const body = typeof wire.data === 'string' ? wire.data : '';
  const marker = 'adtcore:version="';
  const at = body.indexOf(marker);
  const state: IObjectState = { status: wire.status, exists: true };
  if (at !== -1)
    state.version = body.slice(
      at + marker.length,
      body.indexOf('"', at + marker.length),
    );
  return state;
}

/**
 * The request's path with every given name replaced by `{name}`, no query.
 * Names are matched case-insensitively and in their URL-encoded form, as
 * whole path segments.
 */
export function normalizePath(url: string, names: readonly string[]): string {
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  const forms = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    forms.add(encodeURIComponent(name).toLowerCase());
    forms.add(name.toLowerCase());
  }
  return path
    .split('/')
    .map((segment) => (forms.has(segment.toLowerCase()) ? '{name}' : segment))
    .join('/');
}

const isRefusal = (status: number | undefined): status is 406 | 415 =>
  status === 406 || status === 415;

/** The types an answer names for its refusal: the Accept's for 406, the Content-Type's for 415. */
function namedFor(answer: IAttempt): string[] {
  return answer.status === 406
    ? answer.supportedAccept
    : answer.status === 415
      ? answer.supportedContentType
      : [];
}

/**
 * The server's column: whether the default pair was accepted, and what the
 * system named instead — with what the server's correction then got.
 */
export function defaultVerdict(row: IOperationRow): string {
  if (row.skipped) return '';
  const known = row.probes.find((probe) => probe.probe === 'known');
  if (!known) return 'not sent';
  if (known.status === undefined)
    return `no answer: ${known.failure ?? 'nothing came back'}`;
  if (!isRefusal(known.status)) return `accepted (${known.status})`;
  const named = namedFor(known);
  const parts = [
    `refused ${known.status}, named ${named.length ? named.join(', ') : 'nothing'}`,
  ];
  if (known.correction) {
    parts.push(
      `corrected: sent again → ${known.correction.status ?? `no answer (${known.correction.failure ?? ''})`}`,
    );
  } else if (known.mode === 'batched') {
    parts.push('not corrected: a recorded call is made once');
  } else {
    parts.push('not corrected: nothing usable named');
  }
  if (known.kept)
    parts.push(
      `kept accept: ${known.kept.accept}; content-type: ${known.kept.contentType}`,
    );
  return parts.join('; ');
}

export interface IRefusedPair {
  objectType: string;
  member: string;
  status: number;
  sent: IAdtHeaders;
  named: string[];
  sapMessage?: string;
  /** The server's resend and its answer, when there was one. */
  correction?: { sent: IAdtHeaders; status?: number };
  kept?: IAdtHeaders;
}

/** Every operation whose default pair SAP refused with 406 or 415. */
export function refusedDefaultPairs(
  rows: readonly IOperationRow[],
): IRefusedPair[] {
  const refused: IRefusedPair[] = [];
  for (const row of rows) {
    const known = row.probes.find((probe) => probe.probe === 'known');
    if (!known || !isRefusal(known.status)) continue;
    const entry: IRefusedPair = {
      objectType: row.objectType,
      member: row.member,
      status: known.status,
      sent: known.sent,
      named: namedFor(known),
    };
    if (known.sapMessage !== undefined) entry.sapMessage = known.sapMessage;
    if (known.correction) {
      entry.correction = { sent: known.correction.sent };
      if (known.correction.status !== undefined)
        entry.correction.status = known.correction.status;
    }
    if (known.kept) entry.kept = known.kept;
    refused.push(entry);
  }
  return refused;
}

/** One row's use of a shared endpoint: what it sent and what SAP answered. */
export interface IEndpointUse {
  /** `<object type>.<member>`. */
  user: string;
  known?: IAdtHeaders;
  /** Per probe: status, then the types SAP named. */
  answers: Record<ProbeKind, string>;
}

export interface IPathCollision {
  /** `METHOD path[?_action=…]`. */
  endpoint: string;
  uses: IEndpointUse[];
  /** True when the rows on this endpoint got different answers to the same probe. */
  answersDiffer: boolean;
}

function answerSignature(answer: IAttempt | undefined): string {
  if (!answer) return 'not sent';
  if (answer.status === undefined) return 'no answer';
  const named = [
    answer.supportedAccept.length
      ? `accept: ${answer.supportedAccept.join(', ')}`
      : '',
    answer.supportedContentType.length
      ? `content-type: ${answer.supportedContentType.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('; ');
  return named ? `${answer.status} (${named})` : String(answer.status);
}

/**
 * Every endpoint that two members, or two object types, both hit — read from
 * the known probe's first call, the requests each member sends as intended.
 * `answersDiffer` flags an endpoint whose rows got different answers to the
 * same probe.
 */
export function pathCollisions(
  rows: readonly IOperationRow[],
): IPathCollision[] {
  const byEndpoint = new Map<string, Map<string, IEndpointUse>>();
  for (const row of rows) {
    const known = row.probes.find((probe) => probe.probe === 'known');
    if (!known) continue;
    const user = `${row.objectType}.${row.member}`;
    const of = (kind: ProbeKind) =>
      answerSignature(row.probes.find((probe) => probe.probe === kind));
    for (const request of known.requests) {
      const key = endpointKey(request);
      const uses = byEndpoint.get(key) ?? new Map<string, IEndpointUse>();
      const use: IEndpointUse = {
        user,
        answers: {
          known: of('known'),
          badAccept: of('badAccept'),
          badContentType: of('badContentType'),
        },
      };
      if (row.known) use.known = row.known;
      uses.set(user, use);
      byEndpoint.set(key, uses);
    }
  }
  const collisions: IPathCollision[] = [];
  for (const [endpoint, users] of byEndpoint) {
    if (users.size < 2) continue;
    const uses = [...users.values()].sort((a, b) =>
      a.user.localeCompare(b.user),
    );
    const answersDiffer = PROBE_KINDS.some(
      (kind) => new Set(uses.map((use) => use.answers[kind])).size > 1,
    );
    collisions.push({ endpoint, uses, answersDiffer });
  }
  return collisions.sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

export interface IModeDifference {
  objectType: string;
  member: string;
  probe: ProbeKind;
  batched: string;
  sequential: string;
}

function outcome(answer: IAttempt | undefined): string {
  if (!answer) return 'absent';
  if (answer.status === undefined) return `no answer (${answer.failure ?? ''})`;
  return [
    String(answer.status),
    answer.sapType ?? '',
    answer.supportedAccept.join(', '),
    answer.supportedContentType.join(', '),
  ].join(' | ');
}

/**
 * Every probe whose first answer — status, SAP type or named types —
 * differs between a batched and a sequential report. The sequential run's
 * correction is not compared: a recorded call is never corrected.
 */
export function modeDifferences(
  batched: IProbeReport,
  sequential: IProbeReport,
): IModeDifference[] {
  const differences: IModeDifference[] = [];
  for (const row of batched.rows) {
    const twin = sequential.rows.find(
      (other) =>
        other.objectType === row.objectType && other.member === row.member,
    );
    if (!twin) continue;
    for (const probe of PROBE_KINDS) {
      const a = outcome(row.probes.find((answer) => answer.probe === probe));
      const b = outcome(twin.probes.find((answer) => answer.probe === probe));
      if (a !== b)
        differences.push({
          objectType: row.objectType,
          member: row.member,
          probe,
          batched: a,
          sequential: b,
        });
    }
  }
  return differences;
}

const cell = (value: string | undefined): string =>
  (value ?? '').split('|').join('\\|').split(/\r?\n/).join(' ').trim();

function probeCells(answer: IProbeAnswer | undefined): string[] {
  if (!answer) return ['', '', ''];
  const status =
    answer.status === undefined
      ? `no answer: ${answer.failure ?? ''}`
      : String(answer.status);
  const named = [
    ...(answer.supportedAccept.length
      ? [`accept: ${answer.supportedAccept.join(', ')}`]
      : []),
    ...(answer.supportedContentType.length
      ? [`content-type: ${answer.supportedContentType.join(', ')}`]
      : []),
  ].join('; ');
  const corrected = answer.correction
    ? ` → sent again: ${answer.correction.status ?? 'no answer'}`
    : '';
  const message = [answer.sapType, answer.sapMessage]
    .filter(Boolean)
    .join(': ');
  return [cell(`${status}${corrected}`), cell(named), cell(message)];
}

function stateCell(row: IOperationRow): string {
  return row.probes
    .filter((probe) => probe.stateAfter)
    .map((probe) => {
      const state = probe.stateAfter as IObjectState;
      const exists =
        state.exists === 'unknown'
          ? `unknown${state.status ? ` (${state.status})` : ''}`
          : state.exists
            ? `exists${state.version ? ` ${state.version}` : ''}`
            : 'absent';
      return `${probe.probe}: ${exists}`;
    })
    .join('; ');
}

function rowMode(row: IOperationRow): string {
  if (row.skipped) return row.skipped;
  return [...new Set(row.probes.map((probe) => probe.mode))].join('; ');
}

function rowRequest(row: IOperationRow): string {
  const known = row.probes.find((probe) => probe.probe === 'known');
  const requests = known?.requests ?? row.probes[0]?.requests ?? [];
  return requests.map(endpointKey).join('; ');
}

/** The Markdown report: a table per object type, then the summary. */
export function renderMarkdown(report: IProbeReport): string {
  const lines: string[] = [
    '# Header probe report (mcp-abap-adt)',
    '',
    `Started ${report.startedAt}${report.finishedAt ? `, finished ${report.finishedAt}` : ''}; mode: ${report.mode}.`,
    `The known probe sends the server's default pair (\`DEFAULT_ADT_HEADERS\`); the bad probes send \`${PROBE_TYPE}\` as the Accept (bad Accept) or as the Content-Type (bad Content-Type). Every probe goes through the server's \`withAdtHeaders\`: outside a batch a 406/415 naming a type is sent once more with it ("→ sent again").`,
    '',
  ];
  if (report.error)
    lines.push(`**The run stopped:** ${cell(report.error)}`, '');
  const types = [...new Set(report.rows.map((row) => row.objectType))];
  for (const type of types) {
    lines.push(
      `## ${type}`,
      '',
      '| operation | request | ran | default pair | known: status | known: accepted types | known: SAP message | bad Accept: status | bad Accept: accepted types | bad Accept: SAP message | bad Content-Type: status | bad Content-Type: accepted types | bad Content-Type: SAP message | state after the write |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    );
    for (const row of report.rows.filter(
      (entry) => entry.objectType === type,
    )) {
      const of = (kind: ProbeKind) =>
        probeCells(row.probes.find((probe) => probe.probe === kind));
      lines.push(
        `| ${cell(row.member)} | ${cell(rowRequest(row))} | ${cell(rowMode(row))} | ${cell(defaultVerdict(row))} | ${[
          ...of('known'),
          ...of('badAccept'),
          ...of('badContentType'),
        ].join(' | ')} | ${cell(stateCell(row))} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Summary', '', '### Default pairs refused', '');
  const refused = refusedDefaultPairs(report.rows);
  if (!refused.length)
    lines.push('None: SAP refused no default pair with 406 or 415.');
  else {
    lines.push(
      '| object type | operation | status | sent Accept | sent Content-Type | the system named | the correction | kept | SAP message |',
      '|---|---|---|---|---|---|---|---|---|',
    );
    for (const entry of refused)
      lines.push(
        `| ${cell(entry.objectType)} | ${cell(entry.member)} | ${entry.status} | ${cell(entry.sent.accept)} | ${cell(entry.sent.contentType)} | ${cell(entry.named.join(', ') || '(nothing)')} | ${cell(entry.correction ? `sent again → ${entry.correction.status ?? 'no answer'}` : 'none')} | ${cell(entry.kept ? `${entry.kept.accept} / ${entry.kept.contentType}` : '')} | ${cell(entry.sapMessage)} |`,
      );
  }

  lines.push(
    '',
    '### One endpoint, one member: endpoints several rows share',
    '',
  );
  const collisions = pathCollisions(report.rows);
  if (!collisions.length)
    lines.push('None: no two members or object types hit the same endpoint.');
  for (const entry of collisions) {
    lines.push(
      `#### \`${entry.endpoint}\`${entry.answersDiffer ? ' — **the answers differ between these rows**' : ''}`,
      '',
      '| used by | default Accept | default Content-Type | known | bad Accept | bad Content-Type |',
      '|---|---|---|---|---|---|',
    );
    for (const use of entry.uses)
      lines.push(
        `| ${cell(use.user)} | ${cell(use.known?.accept)} | ${cell(use.known?.contentType)} | ${cell(use.answers.known)} | ${cell(use.answers.badAccept)} | ${cell(use.answers.badContentType)} |`,
      );
    lines.push('');
  }

  const skipped = report.rows.filter((row) => row.skipped);
  if (skipped.length) {
    lines.push('', '### Skipped', '');
    for (const row of skipped)
      lines.push(`- ${row.objectType}.${row.member}: ${cell(row.skipped)}`);
  }

  lines.push('', '### Temporary objects', '');
  if (!report.removals.length) lines.push('The run created nothing.');
  for (const removal of report.removals)
    lines.push(
      `- ${removal.removed ? 'removed' : '**NOT REMOVED**'}: ${cell(removal.label)} — ${cell(removal.detail)}`,
    );
  const left = report.removals.filter((removal) => !removal.removed);
  if (left.length)
    lines.push(
      '',
      `**${left.length} temporary object(s) could not be removed; delete them by hand.**`,
    );
  lines.push('');
  return lines.join('\n');
}

/** The Markdown comparison of a batched and a sequential report. */
export function renderComparison(
  batched: IProbeReport,
  sequential: IProbeReport,
): string {
  const differences = modeDifferences(batched, sequential);
  const lines = [
    '# Header probe: batched against sequential (mcp-abap-adt)',
    '',
    `Batched run ${batched.startedAt}, sequential run ${sequential.startedAt}. The first answer of each probe is compared; the sequential run's correction is not.`,
    '',
  ];
  if (!differences.length) {
    lines.push('No probe differs in status, SAP type or named types.', '');
    return lines.join('\n');
  }
  lines.push(
    '| object type | operation | probe | batched | sequential |',
    '|---|---|---|---|---|',
  );
  for (const entry of differences)
    lines.push(
      `| ${cell(entry.objectType)} | ${cell(entry.member)} | ${entry.probe} | ${cell(entry.batched)} | ${cell(entry.sequential)} |`,
    );
  lines.push('');
  return lines.join('\n');
}

/**
 * The `skipped:` rows for every operation with a default pair that the
 * filters ask for and the run reported nothing for: none is left out
 * silently. `reasonOf` names why the cycle has no step for it; an operation
 * it has a step for and did not reach is "not reached".
 */
export function unreportedRows(
  operations: readonly string[],
  rows: readonly IOperationRow[],
  filters: IProbeFilters,
  reasonOf: (objectType: string, member: string) => string | undefined,
): IOperationRow[] {
  const reported = new Set(
    rows.map((row) => `${row.objectType}.${row.member}`),
  );
  const out: IOperationRow[] = [];
  for (const operation of operations) {
    if (reported.has(operation)) continue;
    const dot = operation.indexOf('.');
    const objectType = operation.slice(0, dot);
    const member = operation.slice(dot + 1);
    if (!wants(filters, objectType, member)) continue;
    out.push({
      objectType,
      member,
      skipped:
        reasonOf(objectType, member) ??
        'skipped: not reached — the run stopped before this step',
      probes: [],
    });
  }
  return out;
}
