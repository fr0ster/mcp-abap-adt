/**
 * The harness the batch eligibility proof runs on: a counting connection, the
 * served tools of the full and compact sets, and a run of one sample call.
 *
 * A call is batchable when none of its requests needs another's answer
 * (the owner, 2026-10-16): held open (`pending`), the handler sends k
 * requests before any answer; answered (a document, and `404`) it sends n.
 * k === n >= 1 means every request goes out without waiting for one.
 */

import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { CompactModifyHandlersGroup } from '../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../compact-readonly-entries/src/group';
import { corpusBody } from '../../lib/adtCorpus';
import { requestKind, type SessionKind } from '../../lib/batch/sessionKind';
import {
  HighLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../../lib/handlers/groups';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../lib/handlers/interfaces';
import type { BatchEntryCase } from './batchEntryCases';
import { LOCK_SUCCESS_XML } from './recordingConnection';

/** A captured metadata document per ADT address prefix (not a source or include read). */
const METADATA_DOCUMENTS: Array<[string, string]> = [
  [
    '/sap/bc/adt/functions/groups/fugr_a/fmodules/',
    'read-metadata-function-module--01-fmodules-zmcpshrfm',
  ],
  [
    '/sap/bc/adt/functions/groups/',
    'read-metadata-function-group--01-groups-zmcpshrfgrp',
  ],
  ['/sap/bc/adt/oo/classes/', 'read-metadata-class--01-classes-zbpmcpshriroot'],
  ['/sap/bc/adt/packages/', 'read-metadata-package--01-packages-zmcpshrpkg'],
  ['/sap/bc/adt/ddic/domains/', 'create-domain--01-ddic-domains'],
  [
    '/sap/bc/adt/ddic/dataelements/',
    'read-metadata-data-element--01-ddic-dataelements',
  ],
  [
    '/sap/bc/adt/ddic/ddl/sources/',
    'read-metadata-ddl--01-sources-zmcpshriroot',
  ],
  [
    '/sap/bc/adt/ddic/srvd/sources/',
    'read-metadata-service-definition--01-sources-zmcpshrsrvd01',
  ],
  [
    '/sap/bc/adt/ddic/structures/',
    'read-metadata-structure--01-structures-zmcpshrstru',
  ],
  [
    '/sap/bc/adt/ddic/tables/',
    'read-table-metadata-structure--01-tables-zmcpshrrtabl',
  ],
  [
    '/sap/bc/adt/bo/behaviordefinitions/',
    'read-metadata-behavior-definition--01-behaviordefinitions-zmcpshriroot',
  ],
];

/** How the fake answers: a document, a `404`, or never. */
export type Mode = 'document' | 'not-found' | 'pending';

/**
 * A run's address, as SAP answers a started activation or unit test run in
 * `Location`: a handler that polls the run shows it here.
 */
function runLocation(method: string, url: string): Record<string, string> {
  if (method !== 'POST') return {};
  const path = url.split('?')[0];
  if (path === '/sap/bc/adt/activation/runs') {
    return { location: '/sap/bc/adt/activation/runs/RUN_PLACEHOLDER' };
  }
  if (path === '/sap/bc/adt/abapunit/runs') {
    return { location: '/sap/bc/adt/abapunit/runs/RUN_PLACEHOLDER' };
  }
  return {};
}

export interface Counting {
  connection: IAbapConnection;
  sent: string[];
  /** Each sent request's session kind, as a batch reads it (`requestKind`). */
  kinds: SessionKind[];
}

/**
 * A connection that counts what it is asked to send and answers per `mode`;
 * `pending` holds every request open, so a handler sends only what needs
 * no answer.
 */
export function countingConnection(
  mode: Mode,
  body: string | undefined,
  headers: Record<string, string> = {},
): Counting {
  const sent: string[] = [];
  const kinds: SessionKind[] = [];
  let session: 'stateful' | 'stateless' = 'stateless';
  const documentFor = (method: string, url: string): string => {
    if (url.includes('_action=LOCK')) return LOCK_SUCCESS_XML;
    if (body !== undefined) return body;
    const lower = url.toLowerCase();
    if (
      method !== 'GET' ||
      lower.includes('/source/') ||
      lower.includes('/includes/')
    ) {
      return '';
    }
    const hit = METADATA_DOCUMENTS.find(([prefix]) => lower.startsWith(prefix));
    return hit ? corpusBody(hit[1]) : '';
  };
  const connection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType(type: 'stateful' | 'stateless') {
      session = type;
    },
    getSessionType() {
      return session;
    },
    async makeAdtRequest(options: IAbapRequestOptions) {
      sent.push(`${options.method} ${options.url}`);
      kinds.push(requestKind(options, session, 'communication'));
      if (mode === 'pending') return new Promise<never>(() => {});
      if (mode === 'not-found') {
        const error = new Error(
          'Request failed with status code 404',
        ) as Error & {
          response?: unknown;
        };
        error.response = {
          status: 404,
          statusText: 'Not Found',
          data: '',
          headers: {},
        };
        throw error;
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: {
          ...runLocation(options.method, String(options.url)),
          ...headers,
        },
        data: documentFor(options.method, String(options.url)),
      };
    },
  };
  return { connection: connection as unknown as IAbapConnection, sent, kinds };
}

/** The served tools of the full and compact sets, each reading the context at call time. */
export function servedTools(
  context: HandlerContext,
): Map<string, HandlerEntry> {
  const entries = [
    new ReadOnlyHandlersGroup(context),
    new SearchHandlersGroup(context),
    new SystemHandlersGroup(context),
    new HighLevelHandlersGroup(context),
    new CompactReadOnlyHandlersGroup(context),
    new CompactModifyHandlersGroup(context),
  ].flatMap((group) => group.getHandlers());
  return new Map(entries.map((e) => [e.toolDefinition.name, e]));
}

export type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

export interface Ran {
  sent: string[];
  kinds: SessionKind[];
  answer?: Answer;
  threw?: unknown;
}

/** Lets every queued callback and immediate run, so a held handler sends all it can. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * Runs one sample call through its served handler. `pending` returns what was
 * sent once nothing more moves; the other modes await the handler's answer.
 */
export async function runCase(
  tools: Map<string, HandlerEntry>,
  context: HandlerContext,
  c: BatchEntryCase,
  mode: Mode,
): Promise<Ran> {
  const entry = tools.get(c.tool);
  if (!entry) throw new Error(`no served tool ${c.tool}`);
  const counting = countingConnection(mode, c.body, c.headers);
  (context as { connection: IAbapConnection }).connection = counting.connection;
  const call = (entry.handler as unknown as (a: unknown) => Promise<Answer>)(
    structuredClone(c.args),
  );
  if (mode === 'pending') {
    call.catch(() => undefined);
    await settle();
    return { sent: [...counting.sent], kinds: [...counting.kinds] };
  }
  try {
    return { sent: counting.sent, kinds: counting.kinds, answer: await call };
  } catch (threw) {
    return { sent: counting.sent, kinds: counting.kinds, threw };
  }
}
