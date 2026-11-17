/**
 * `HandlerSystem`'s per-action arguments are checked before the call takes
 * a connection: a missing required argument is refused in the target's
 * words, with `background` true and false, with a fresh-connection factory
 * and without one — no fresh connection opened, no logon, nothing sent, no
 * run started. Both registration paths: the server instance
 * (`BaseMcpServer`) and a group registered on a plain `McpServer`
 * (`BaseHandlerGroup`).
 */

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

jest.setTimeout(60_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

/** Each argument its full tool requires, missing, and the target's words. */
const MISSING: ReadonlyArray<
  readonly [SystemAction, string, Record<string, unknown>, string]
> = [
  [
    'search_source',
    'query',
    { packages: ['ZPKG_A'] },
    'Invalid arguments for tool SearchSource: Invalid input: expected string, received undefined at query',
  ],
  [
    'search_object',
    'object_name',
    {},
    'Invalid arguments for tool SearchObject: Invalid input: expected string, received undefined at object_name',
  ],
  [
    'where_used',
    'object_name',
    { object_type: 'class' },
    'Object name is required',
  ],
  [
    'where_used',
    'object_type',
    { object_name: 'ZCL_A' },
    'Object type is required',
  ],
  ['package_tree', 'package_name', {}, 'package_name is required'],
  [
    'atc_findings',
    'worklist_id',
    {},
    'Invalid arguments for tool GetATCFindings: Invalid input: expected string, received undefined at worklist_id',
  ],
  [
    'atc_results',
    'created_by',
    {},
    'Invalid arguments for tool ListATCResults: Invalid input: expected string, received undefined at created_by',
  ],
  [
    'atc_result',
    'display_id',
    {},
    'Invalid arguments for tool GetATCResult: Invalid input: expected string, received undefined at display_id',
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

describe.each(SETUPS)('HandlerSystem on the server, %s', (_n, injected, bg) => {
  it.each(MISSING)(
    "%s without %s: refused in the target's words before any connection",
    async (action, _argument, args, words) => {
      const fresh = jest.spyOn(packageSessions, 'openFreshConnection');
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

describe('HandlerSystem registered on a plain McpServer', () => {
  it.each(MISSING)(
    "%s without %s: refused in the target's words before any connection",
    async (action, _argument, args, words) => {
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
