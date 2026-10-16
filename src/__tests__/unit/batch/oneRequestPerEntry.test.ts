/**
 * Every entry of `tools/batch-handlers.json` sends exactly one request: its
 * served handler, run with each of its sample calls (`batchEntryCases.ts`)
 * against a counting connection, issues one `makeAdtRequest` — real
 * adt-clients code runs, nothing of it is doubled.
 *
 * Each case runs twice, because a recorded call's answer comes only at
 * `BatchEnd` and a handler must not need it to send more:
 *
 * - answered with a document (a captured metadata document where the corpus
 *   has one, a lock handle for a lock, the case's own body, else `200` with an
 *   empty body): the handler finishes without an error, having sent one
 *   request — a handler that reads a first document to build a second
 *   request shows it here;
 * - answered `404`: one request too — a handler that falls back to another
 *   request on a refusal shows it here.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { corpusBody } from '../../../lib/adtCorpus';
import { eligible } from '../../../lib/batch/eligibility';
import {
  HighLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../../../lib/handlers/groups';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { BATCH_ENTRY_CASES } from '../../helpers/batchEntryCases';
import { silentLogger } from '../../helpers/lowToCompact';
import { LOCK_SUCCESS_XML } from '../../helpers/recordingConnection';

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

type Mode = 'document' | 'not-found';

interface Counting {
  connection: IAbapConnection;
  sent: string[];
}

/** A connection that counts what it is asked to send and answers per `mode`. */
function countingConnection(mode: Mode, body: string | undefined): Counting {
  const sent: string[] = [];
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
    setSessionType() {},
    async makeAdtRequest(options: { method: string; url: string }) {
      sent.push(`${options.method} ${options.url}`);
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
        headers: {},
        data: documentFor(options.method, String(options.url)),
      };
    },
  };
  return { connection: connection as unknown as IAbapConnection, sent };
}

/** The served tools of the full and compact sets, each reading the context at call time. */
function servedTools(context: HandlerContext): Map<string, HandlerEntry> {
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

type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

describe('every batch entry sends exactly one request', () => {
  const context = {
    connection: undefined,
    logger: silentLogger,
  } as unknown as HandlerContext;
  const tools = servedTools(context);

  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  async function run(
    tool: string,
    args: Record<string, unknown>,
    mode: Mode,
    body?: string,
  ): Promise<{ sent: string[]; answer?: Answer; threw?: unknown }> {
    const entry = tools.get(tool);
    if (!entry) throw new Error(`no served tool ${tool}`);
    const counting = countingConnection(mode, body);
    context.connection = counting.connection;
    try {
      const answer = (await (
        entry.handler as unknown as (a: unknown) => Promise<Answer>
      )(structuredClone(args))) as Answer;
      return { sent: counting.sent, answer };
    } catch (threw) {
      return { sent: counting.sent, threw };
    }
  }

  const cases = BATCH_ENTRY_CASES.map(
    (c) => [`${c.tool} ${JSON.stringify(c.args)}`, c] as const,
  );

  it.each(cases)('%s: the table admits it', (_name, c) => {
    expect(eligible(c.tool, c.args, c.connection ?? 'http')).toEqual({
      ok: true,
    });
  });

  it.each(cases)(
    '%s: answered with a document, one request and no error',
    async (_name, c) => {
      const { sent, answer, threw } = await run(
        c.tool,
        c.args,
        'document',
        c.body,
      );
      expect({
        sent: sent.length,
        threw: threw === undefined ? undefined : String(threw),
        isError: answer?.isError === true ? answer.content?.[0]?.text : false,
      }).toEqual({ sent: 1, threw: undefined, isError: false });
    },
  );

  it.each(cases)('%s: answered 404, one request', async (_name, c) => {
    const { sent } = await run(c.tool, c.args, 'not-found');
    expect(sent).toHaveLength(1);
  });
});
