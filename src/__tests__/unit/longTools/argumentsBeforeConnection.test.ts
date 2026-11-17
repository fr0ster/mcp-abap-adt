/**
 * A listed long tool's arguments its call would refuse are refused before
 * the call takes a connection, in the words its call answers: with
 * `background` true and false, with a fresh-connection factory and without
 * one — no fresh connection opened, no logon, nothing sent, no run started.
 * Both registration paths: the server instance (`BaseMcpServer`) and a
 * group registered on a plain `McpServer` (`BaseHandlerGroup`).
 * (`HandlerSystem`'s actions: `../handlerSystem/argumentsBeforeConnection`.)
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CompactDataHandlersGroup,
  CompactReadOnlyHandlersGroup,
} from '../../../../compact-readonly-entries/src/group';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import * as packageSessions from '../../../lib/packageSessions';
import { adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import { type CallAnswer, longStand } from './harness';

jest.setTimeout(120_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

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
  ['HandlerGetData', {}, 'object_name or sql_query is required'],
];

const textOf = (answer: CallAnswer): string =>
  (answer.content ?? []).map((c) => c.text ?? '').join('\n');

const SETUPS = [
  ['a factory, background true', 'built', true],
  ['a factory, background false', 'built', false],
  ['no factory, background true', 'bare', true],
  ['no factory, background false', 'bare', false],
] as const;

describe.each(SETUPS)('on the server, %s', (_n, injected, bg) => {
  it.each(CASES)(
    '%s %j: refused in its words before any connection',
    async (tool, args, words) => {
      const fresh = jest.spyOn(packageSessions, 'openFreshConnection');
      const stand = await longStand(tool, {
        injected,
        backgroundRuns: new InMemoryBackgroundRuns(),
      });
      try {
        const answer = await stand.call(tool, { ...args, background: bg });
        expect(answer.isError).toBe(true);
        expect(textOf(answer)).toContain(words);
        expect(textOf(answer)).not.toContain('run_handle');
        expect(fresh).not.toHaveBeenCalled();
        expect(stand.standIn.requests.filter(stand.isToolRequest)).toEqual([]);
        expect(stand.standIn.loggedOff()).toEqual([]);
      } finally {
        await stand.close();
      }
    },
  );
});

/** The group of the shipped binaries that serves `tool`. */
function groupOf(tool: string, context: HandlerContext): BaseHandlerGroup {
  const groups: BaseHandlerGroup[] = [
    new ReadOnlyHandlersGroup(context),
    new SystemHandlersGroup(context),
    new SearchHandlersGroup(context),
    new CompactReadOnlyHandlersGroup(context),
    new CompactDataHandlersGroup(context),
  ];
  const group = groups.find((g) =>
    g.getHandlers().some((e) => e.toolDefinition.name === tool),
  );
  if (group === undefined) throw new Error(`no group serves ${tool}`);
  return group;
}

describe('registered on a plain McpServer', () => {
  it.each(CASES)(
    '%s %j: refused in its words before the call’s context',
    async (tool, args, words) => {
      const fresh = jest.spyOn(packageSessions, 'openFreshConnection');
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
        expect(answer.isError).toBe(true);
        expect(textOf(answer)).toContain(words);
        expect(asked).toEqual([]);
        expect(fresh).not.toHaveBeenCalled();
        expect(standIn.requests.length).toBe(before);
      } finally {
        await client.close().catch(() => undefined);
        await standIn.close();
      }
    },
  );
});
