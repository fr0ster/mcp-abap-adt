/**
 * `HandlerSystem`'s per-action arguments are checked by its schema, before
 * dispatch: a missing or blank required argument is refused in the
 * target's words, with `background` true and false, with a fresh-connection factory
 * and without one — no fresh connection opened, no logon, nothing sent, no
 * run started. Both registration paths: the server instance
 * (`BaseMcpServer`) and a group registered on a plain `McpServer`
 * (`BaseHandlerGroup`).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import type { SystemAction } from '../../../lib/compact';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import * as packageSessions from '../../../lib/packageSessions';
import { adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import { type CallAnswer, longStand } from '../longTools/harness';

beforeEach(() => {
  mock.method(console, 'error', () => {});
  mock.method(process.stderr, 'write', () => true);
});

afterEach(() => mock.restoreAll());

/** Each argument its full tool requires, missing, and the target's words. */
const MISSING: ReadonlyArray<
  readonly [SystemAction, string, Record<string, unknown>, string]
> = [
  [
    'search_source',
    'query',
    { packages: ['ZPKG_A'] },
    'HandlerSystem: SearchSource: Invalid input: expected string, received undefined at query',
  ],
  [
    'search_object',
    'object_name',
    {},
    'HandlerSystem: SearchObject: object_name is required at object_name',
  ],
  [
    'where_used',
    'object_name',
    { object_type: 'class' },
    'HandlerSystem: GetWhereUsed: Object name is required at object_name',
  ],
  [
    'where_used',
    'object_type',
    { object_name: 'ZCL_A' },
    'HandlerSystem: GetWhereUsed: Object type is required at object_type',
  ],
  [
    'package_tree',
    'package_name',
    {},
    'HandlerSystem: GetPackageTree: package_name is required at package_name',
  ],
  [
    'atc_findings',
    'worklist_id',
    {},
    'HandlerSystem: GetATCFindings: worklist_id is required. RunATC answers one on every run. at worklist_id',
  ],
  [
    'atc_results',
    'created_by',
    {},
    'HandlerSystem: ListATCResults: created_by is required: a user name, or * for every user. at created_by',
  ],
  [
    'atc_result',
    'display_id',
    {},
    'HandlerSystem: GetATCResult: display_id is required. ListATCResults answers one per result. at display_id',
  ],
  // A blank value is refused as a missing one (Codex, 24.0.0 re-review).
  [
    'search_object',
    'object_name blank',
    { object_name: '' },
    'HandlerSystem: SearchObject: object_name is required at object_name',
  ],
  [
    'where_used',
    'object_name blank',
    { object_name: '  ', object_type: 'class' },
    'HandlerSystem: GetWhereUsed: Object name is required at object_name',
  ],
  [
    'atc_result',
    'display_id blank',
    { display_id: ' ' },
    'HandlerSystem: GetATCResult: display_id is required. ListATCResults answers one per result. at display_id',
  ],
];

const textOf = (answer: CallAnswer): string =>
  (answer.content ?? []).map((c) => c.text ?? '').join('\n');

const SETUPS = [
  ['a factory, background true', 'built', true],
  ['a factory, background false', 'built', false],
  ['no factory, background true', 'bare', true],
  ['no factory, background false', 'bare', false],
] as const;

for (const [_n, injected, bg] of SETUPS) {
  describe(format('HandlerSystem on the server, %s', _n), () => {
    for (const [action, _argument, args, words] of MISSING) {
      it(
        format(
          "%s without %s: refused in the target's words before any connection",
          action,
          _argument,
        ),
        async (t) => {
          const fresh = t.mock.method(packageSessions, 'openFreshConnection');
          const stand = await longStand('HandlerSystem', {
            injected,
            backgroundRuns: new InMemoryBackgroundRuns(),
          });
          try {
            const answer = await stand.call('HandlerSystem', {
              action,
              background: bg,
              ...args,
            });
            assert.equal(answer.isError, true);
            assert.ok(textOf(answer).includes(words));
            assert.ok(!textOf(answer).includes('run_handle'));
            assert.equal(fresh.mock.callCount(), 0);
            assert.deepStrictEqual(
              stand.standIn.requests.filter(stand.isToolRequest),
              [],
            );
            assert.deepStrictEqual(stand.standIn.loggedOff(), []);
          } finally {
            await stand.close();
          }
        },
      );
    }
  });
}

describe('HandlerSystem registered on a plain McpServer', () => {
  for (const [action, _argument, args, words] of MISSING) {
    it(
      format(
        "%s without %s: refused in the target's words before any connection",
        action,
        _argument,
      ),
      async (t) => {
        const fresh = t.mock.method(packageSessions, 'openFreshConnection');
        const standIn = await adtStandIn();
        stateSystemKind();
        const connection = createAbapConnection(
          { url: standIn.url, client: '100', authType: 'basic' },
          new BasicAuthProvider('LONG_USER', 'long-password'),
        );
        const asked: string[] = [];
        const context: HandlerContext = {
          connection,
          logger: undefined,
          systemType: 'onprem',
        };
        const group = new CompactReadOnlyHandlersGroup(context);
        const server = new McpServer({ name: 'plain', version: '1.0.0' });
        const entry = group
          .getHandlers()
          .find((e) => e.toolDefinition.name === 'HandlerSystem');
        if (entry === undefined) throw new Error('no HandlerSystem');
        group.registerOneTool(server, entry, async () => {
          asked.push('context');
          return context;
        });
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'plain', version: '1.0.0' });
        try {
          await Promise.all([
            server.connect(serverSide),
            client.connect(clientSide),
          ]);
          const before = standIn.requests.length;
          const answer = (await client.callTool({
            name: 'HandlerSystem',
            arguments: { action, ...args },
          })) as CallAnswer;
          assert.equal(answer.isError, true);
          assert.ok(textOf(answer).includes(words));
          assert.deepStrictEqual(asked, []);
          assert.equal(fresh.mock.callCount(), 0);
          assert.equal(standIn.requests.length, before);
        } finally {
          await client.close().catch(() => undefined);
          await standIn.close();
        }
      },
    );
  }
});
