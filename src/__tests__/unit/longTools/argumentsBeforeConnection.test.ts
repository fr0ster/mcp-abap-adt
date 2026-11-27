/**
 * A listed long tool's arguments its call would refuse are refused before
 * the call takes a connection, in the words its call answers: with
 * `background` true and false, with a fresh-connection factory and without
 * one — no fresh connection opened, no logon, nothing sent, no run started.
 * Both registration paths: the server instance (`BaseMcpServer`) and a
 * group registered on a plain `McpServer` (`BaseHandlerGroup`).
 * (`HandlerSystem`'s actions: `../handlerSystem/argumentsBeforeConnection`.)
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CompactDataHandlersGroup,
  CompactReadOnlyHandlersGroup,
} from '../../../../compact-readonly-entries/src/group';
import { notATableType } from '../../../lib/adtTypeCode';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import { DataHandlersGroup } from '../../../lib/handlers/groups/DataHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import * as packageSessions from '../../../lib/packageSessions';
import { adtStandIn } from '../../helpers/adtStandIn';
import { assertRejects } from '../../helpers/assertions';
import { stateSystemKind } from '../../helpers/systemKind';
import { type CallAnswer, longStand } from './harness';

beforeEach(() => {
  mock.method(console, 'error', () => {});
  mock.method(process.stderr, 'write', () => true);
});

afterEach(() => mock.restoreAll());

/** A tool, arguments its call refuses, and the words it refuses them in. */
type Case = readonly [string, Record<string, unknown>, string];

/** The cases measured to log on before refusing (placeholder names only). */
const CASES: readonly Case[] = [
  ['GetWhereUsed', { object_type: 'class' }, 'Object name is required'],
  ['GetWhereUsed', { object_name: 'ZCL_A' }, 'Object type is required'],
  [
    'GetWhereUsed',
    { object_name: 'ZCL_A', object_type: 'class', objects: [] },
    'Give exactly one of object_name and object_type, or objects',
  ],
  ['GetPackageContents', {}, 'Package name is required'],
  [
    'GetPackageContents',
    { package_name: 'ZPKG_A', package_names: ['ZPKG_B'] },
    'Give exactly one of package_name or package_names',
  ],
  ['GetPackageTree', {}, 'package_name is required'],
  [
    'GetObjectsList',
    { parent_tech_name: 'ZPROG_A', parent_type: 'PROG/P' },
    'Parameter "parent_name" (string) is required and cannot be empty.',
  ],
  [
    'GetObjectsList',
    { parent_name: 'ZPROG_A', parent_type: 'PROG/P' },
    'Parameter "parent_tech_name" (string) is required and cannot be empty.',
  ],
  [
    'GetObjectsList',
    { parent_name: 'ZPROG_A', parent_tech_name: 'ZPROG_A' },
    'Parameter "parent_type" (string) is required and cannot be empty.',
  ],
  [
    'GetObjectsList',
    { objects: [{ parent_type: 'PROG/P', parent_name: '' }] },
    'Each entry of objects needs parent_type and parent_name (non-empty strings).',
  ],
  ['GetStructuresList', {}, 'structure_name is required'],
  [
    'GetStructuresList',
    { structure_names: [] },
    'Give exactly one of structure_name or structure_names',
  ],
  [
    'GetIncludesList',
    { object_type: 'PROG/P' },
    'Parameter "object_name" (string) is required and cannot be empty.',
  ],
  [
    'GetIncludesList',
    { object_name: 'ZPROG_A' },
    'Parameter "object_type" (string) is required.',
  ],
  [
    'GetObjectInfo',
    { parent_type: 'PROG/P' },
    'parent_type and parent_name are required',
  ],
  ['HandlerGetData', { max_rows: 5 }, 'object_name or sql_query is required'],
  ['HandlerGet', {}, 'object_type is required'],
  [
    'HandlerGet',
    { object_type: 'CLASS' },
    'HandlerGet: GetClass: class_name is required at class_name',
  ],
  [
    'HandlerGet',
    { object_type: 'FUNCTION_MODULE' },
    'FUNCTION_MODULE is named GROUP|MODULE, or with function_group_name: the function group and the module are both required',
  ],
  [
    'HandlerGet',
    { object_type: 'PACKAGE', part: 'contents' },
    'Package name is required',
  ],
  [
    'HandlerGet',
    { part: 'node_structure' },
    'part=node_structure requires object_adt_type and object_name',
  ],
  [
    'HandlerGet',
    { object_type: 'DOMAIN', part: 'urls' },
    'part=urls is not available for object_type=DOMAIN',
  ],
  [
    'HandlerGet',
    { object_type: 'INCLUDE', part: 'main_programs' },
    'HandlerGet: GetMainPrograms: Include name is required at include_name',
  ],
  // A blank value is refused as a missing one, and a type outside the
  // variant's list as the handler refused it (Codex, 24.0.0 re-review).
  [
    'HandlerGet',
    { object_type: 'CLASS', class_name: '' },
    'HandlerGet: GetClass: class_name is required at class_name',
  ],
  [
    'GetObjectInfo',
    { parent_type: 'NOT_A_TYPE', parent_name: 'ZOBJ' },
    notATableType('parent_type', 'NOT_A_TYPE', 'onprem'),
  ],
  [
    'GetObjectsList',
    {
      parent_name: 'ZPROG_A',
      parent_tech_name: 'ZPROG_A',
      parent_type: 'NOT_A_TYPE',
    },
    notATableType('parent_type', 'NOT_A_TYPE', 'onprem'),
  ],
  [
    'GetWhereUsed',
    { object_name: 'ZCL_A', object_type: 'NOT_A_TYPE' },
    'object_type',
  ],
  ['GetPackageTree', { package_name: ' ' }, 'package_name is required'],
  ['SearchObject', { object_name: '' }, 'object_name is required'],
  ['GetSqlQuery', { sql_query: ' ', row_number: 5 }, 'SQL query is required'],
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
  describe(format('on the server, %s', _n), () => {
    for (const [tool, args, words] of CASES) {
      it(
        format('%s %j: refused in its words before any connection', tool, args),
        async (t) => {
          const fresh = t.mock.method(packageSessions, 'openFreshConnection');
          const stand = await longStand(tool, {
            injected,
            backgroundRuns: new InMemoryBackgroundRuns(),
          });
          try {
            const answer = await stand.call(tool, { ...args, background: bg });
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

/** The group of the shipped binaries that serves `tool`. */
function groupOf(tool: string, context: HandlerContext): BaseHandlerGroup {
  const groups: BaseHandlerGroup[] = [
    new ReadOnlyHandlersGroup(context),
    new SystemHandlersGroup(context),
    new SearchHandlersGroup(context),
    new CompactReadOnlyHandlersGroup(context),
    new CompactDataHandlersGroup(context),
    new DataHandlersGroup(context),
  ];
  const group = groups.find((g) =>
    g.getHandlers().some((e) => e.toolDefinition.name === tool),
  );
  if (group === undefined) throw new Error(`no group serves ${tool}`);
  return group;
}

describe('registered on a plain McpServer', () => {
  for (const [tool, args, words] of CASES) {
    it(
      format(
        '%s %j: refused in its words before the call’s context',
        tool,
        args,
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
        const group = groupOf(tool, context);
        const entry = group
          .getHandlers()
          .find((e) => e.toolDefinition.name === tool);
        if (entry === undefined) throw new Error(`no ${tool}`);
        const server = new McpServer({ name: 'plain', version: '1.0.0' });
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
            name: tool,
            arguments: args,
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

/** The full tools of CASES, as `HandlerExporter` hands them out. */
const EXPORTED = CASES.filter(([tool]) => !tool.startsWith('Handler'));

describe('handed out by HandlerExporter', () => {
  for (const [tool, args, words] of EXPORTED) {
    it(
      format(
        '%s %j: refused in its words before any scope, resolver or send',
        tool,
        args,
      ),
      async () => {
        const requests: string[] = [];
        const connection = {
          getBaseUrl: async () => 'https://system.example.invalid',
          makeAdtRequest: async (options: { url: string }) => {
            requests.push(options.url);
            return { status: 200, data: '' };
          },
        };
        const resolved: string[] = [];
        const exporter = new HandlerExporter({
          systemType: 'onprem',
          includeData: true,
          systemContextResolver: async () => {
            resolved.push('asked');
            return null;
          },
        });
        const entry = exporter
          .getHandlerEntries()
          .find((e) => e.toolDefinition.name === tool);
        if (entry === undefined) throw new Error(`no ${tool}`);
        await assertRejects(
          entry.call({ connection, logger: undefined } as never, args),
          words,
        );
        assert.deepStrictEqual(resolved, []);
        assert.deepStrictEqual(requests, []);
      },
    );
  }
});
