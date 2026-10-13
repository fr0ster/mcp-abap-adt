/**
 * Background runs, around the run itself: an embedder's injected connection
 * (its fresh-connection factory decides), where the tools are served, which
 * tools take `background`, a group registered on its own (no strategy), and
 * the in-memory store's own rules.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { FRESH_CONNECTION_UNAVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import {
  BACKGROUND_RUNS_PER_CALLER,
  InMemoryBackgroundRuns,
} from '../../../lib/backgroundRuns/InMemoryBackgroundRuns';
import {
  BACKGROUND_TOOLS,
  readBackground,
  withoutBackground,
} from '../../../lib/backgroundRuns/tools';
import { compactDebugEntries } from '../../../lib/compact/debug/group';
import type { HandlerSet } from '../../../lib/config/IServerConfig';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type {
  HandlerContext,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { registryForExposition } from '../../../lib/handlers/registry/expositionRegistry';
import { compactToolSetOf, registryOf } from '../../../lib/toolSet';
import { adtStandIn } from '../../helpers/adtStandIn';
import { clientOf, isClassRun, shippedGroups, silent, until } from './harness';

const RUN = { class_name: 'PLACEHOLDER_CLASS', background: true };

const placeholder = {
  connection: null,
  logger: undefined,
} as unknown as HandlerContext;

describe('an embedder', () => {
  it('runs in the background on its injected connection’s fresh connection, its caller the user SAP answers', async () => {
    const standIn = await adtStandIn();
    standIn.body(
      (r) => r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
      JSON.stringify({ systemID: 'SID', userName: 'embedded_user' }),
    );
    const built = createAbapConnection(
      { url: standIn.url, client: '100', authType: 'basic' },
      new BasicAuthProvider('EMBEDDED_USER', 'embedded-password'),
    );
    await built.connect();
    const strategy = new InMemoryBackgroundRuns({ prefix: 'replica-1.' });
    const server = new EmbeddableMcpServer({
      connection: built as never,
      handlersRegistry: shippedGroups(),
      systemType: 'onprem',
      logger: silent,
      backgroundRuns: strategy,
    });
    const client = await clientOf(server);
    try {
      const started = await client.call('RuntimeRunClass', RUN);
      expect(started.isError).toBe(false);
      const handle = started.payload.run_handle as string;
      // The host's instance id leads the handle: routing it is the host's.
      expect(handle.startsWith('replica-1.')).toBe(true);
      await until(async () => {
        const read = await client.call('GetBackgroundRun', {
          run_handle: handle,
        });
        return read.payload.state === 'finished';
      });
      expect(
        strategy.list({
          url: standIn.url,
          client: '',
          user: 'EMBEDDED_USER',
        }),
      ).toHaveLength(1);
    } finally {
      await client.close();
      await (built as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
      await standIn.close();
    }
  });

  it('without freshConnection on an injected connection, the start is refused in D20’s words and nothing is kept', async () => {
    const standIn = await adtStandIn();
    const built = createAbapConnection(
      { url: standIn.url, client: '100', authType: 'basic' },
      new BasicAuthProvider('EMBEDDED_USER', 'embedded-password'),
    );
    standIn.body(
      (r) => r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
      JSON.stringify({ systemID: 'SID', userName: 'embedded_user' }),
    );
    await built.connect();
    // Not the factory's own object: no sibling record, no host factory.
    const bare = new Proxy({} as IAbapConnection, {
      get: (_target, property) => {
        const value = Reflect.get(built as object, property);
        return typeof value === 'function' ? value.bind(built) : value;
      },
    });
    const strategy = new InMemoryBackgroundRuns();
    const server = new EmbeddableMcpServer({
      connection: bare as never,
      handlersRegistry: shippedGroups(),
      systemType: 'onprem',
      logger: silent,
      backgroundRuns: strategy,
    });
    const client = await clientOf(server);
    try {
      const refused = await client.call('RuntimeRunClass', RUN);
      expect(refused.isError).toBe(true);
      expect(refused.payload).toMatchObject({
        error: 'fresh_connection_unavailable',
        message: FRESH_CONNECTION_UNAVAILABLE_WORDS,
      });
      expect(standIn.requests.some(isClassRun)).toBe(false);
      // Refused before the caller was asked of the system.
      expect(
        standIn.requests.some((r) => r.url.includes('systeminformation')),
      ).toBe(false);
      expect((await client.call('ListBackgroundRuns')).payload).toEqual({
        runs: [],
      });
    } finally {
      await client.close();
      await (built as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
      await standIn.close();
    }
  });
});

describe('a group registered on its own (no server instance, no strategy)', () => {
  it('refuses background: true instead of running in the foreground', async () => {
    const group = new SystemHandlersGroup(placeholder);
    const tools = new Map<
      string,
      (args: unknown) => Promise<{ isError?: boolean; content: unknown[] }>
    >();
    const fake = {
      registerTool: (
        name: string,
        _config: unknown,
        callback: (args: unknown) => Promise<{
          isError?: boolean;
          content: unknown[];
        }>,
      ) => {
        tools.set(name, callback);
      },
    } as unknown as McpServer;
    group.registerHandlers(fake);
    const run = tools.get('RuntimeRunClass');
    if (run === undefined) throw new Error('not registered');
    const answer = await run(RUN);
    expect(answer.isError).toBe(true);
    expect(JSON.stringify(answer.content)).toContain(
      'background runs are not available here',
    );
    expect(McpServer).toBeDefined();
  });
});

describe('where the background-run tools are served: beside the run tools', () => {
  const FULL = [
    'GetBackgroundRun',
    'ListBackgroundRuns',
    'DiscardBackgroundRun',
  ];
  const COMPACT = [
    'HandlerBackgroundRunGet',
    'HandlerBackgroundRunList',
    'HandlerBackgroundRunDiscard',
  ];
  const namesOf = (
    groups: { getHandlers(): { toolDefinition: { name: string } }[] }[],
  ) => groups.flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));

  it.each<[HandlerSet[], boolean]>([
    [['readonly'], true],
    [['readonly', 'high'], true],
    [['readonly', 'low'], true],
    [['readonly', 'debug'], true],
    [['high'], false],
    [['low'], false],
    [['debug'], false],
  ])('full %j: served %s, as RuntimeRunClass is', (exposition, served) => {
    const tools = namesOf(registryForExposition(exposition).getHandlerGroups());
    expect(tools.includes('RuntimeRunClass')).toBe(served);
    for (const name of FULL) expect(tools.includes(name)).toBe(served);
  });

  const compact = compactToolSetOf({
    readOnly: compactReadOnlyEntries,
    modify: compactModifyEntries,
  });
  it.each<[string[], boolean]>([
    [['ro'], false],
    [['ro', 'debug'], false],
    [['rw'], true],
    [['rw', 'debug'], true],
  ])('compact %j: served %s, as HandlerProfileRun is', (exposition, served) => {
    const tools = namesOf(registryOf(compact, exposition).getHandlerGroups());
    expect(tools.includes('HandlerProfileRun')).toBe(served);
    for (const name of COMPACT) expect(tools.includes(name)).toBe(served);
  });

  it('an embedder’s exporter serves them beside the system group', () => {
    const names = new HandlerExporter().getToolNames();
    expect(names).toEqual(expect.arrayContaining(['RuntimeRunClass', ...FULL]));
    expect(
      new HandlerExporter({ includeSystem: false }).getToolNames(),
    ).not.toContain('GetBackgroundRun');
  });
});

describe('which tools take background', () => {
  /** Every tool definition the packages ship: full groups and compact. */
  const definitions: ToolDefinition[] = [
    ...new HandlerExporter({
      includeReadOnly: true,
      includeHighLevel: true,
      includeLowLevel: true,
      includeSystem: true,
      includeSearch: true,
      includeDebug: true,
    })
      .getHandlerEntries()
      .map((e) => e.toolDefinition),
    ...new CompactReadOnlyHandlersGroup(placeholder)
      .getHandlers()
      .map((e) => e.toolDefinition),
    ...new CompactModifyHandlersGroup(placeholder)
      .getHandlers()
      .map((e) => e.toolDefinition),
    ...compactDebugEntries().map((e) => e.toolDefinition),
  ];
  const declares = (definition: ToolDefinition) => {
    const schema = definition.inputSchema as {
      properties?: Record<string, unknown>;
    };
    return Object.hasOwn(schema?.properties ?? {}, 'background');
  };

  it('exactly the listed run tools declare it, optional, a boolean with no default', () => {
    const declaring = [
      ...new Set(definitions.filter(declares).map((d) => d.name)),
    ].sort();
    expect(declaring).toEqual(Object.keys(BACKGROUND_TOOLS).sort());
    for (const definition of definitions.filter(declares)) {
      const schema = definition.inputSchema as {
        properties: Record<string, { type: string; default?: unknown }>;
        required?: string[];
      };
      expect(schema.properties.background?.type).toBe('boolean');
      expect(schema.properties.background).not.toHaveProperty('default');
      expect(schema.required ?? []).not.toContain('background');
    }
  });

  it('is read as a boolean and never reaches the handler', () => {
    expect(readBackground({})).toBe(false);
    expect(readBackground({ background: false })).toBe(false);
    expect(readBackground({ background: true })).toBe(true);
    expect(readBackground({ background: 'yes' })).toBeNull();
    expect(withoutBackground({ a: 1, background: true })).toEqual({ a: 1 });
  });
});

describe('the in-memory store', () => {
  const alice = { url: 'http://sys', client: '100', user: 'ALICE' };
  const bob = { url: 'http://sys', client: '100', user: 'BOB' };
  const otherClient = { url: 'http://sys', client: '200', user: 'ALICE' };
  const run = { tool: 'RuntimeRunClass', object: 'X', started_at: 't0' };
  const answer = { content: [{ type: 'text' as const, text: 'out' }] };

  it('keeps each run for its caller only: URL, client and user', () => {
    const store = new InMemoryBackgroundRuns();
    const started = store.start(alice, run);
    if (!('handle' in started)) throw new Error('refused');
    for (const someone of [bob, otherClient]) {
      expect(store.get(started.handle, someone)).toBeUndefined();
      expect(store.list(someone)).toEqual([]);
      expect(store.discard(started.handle, someone)).toBe('not-available');
    }
    expect(store.get(started.handle, alice)).toMatchObject({
      state: 'running',
    });
  });

  it('a finished run keeps its answer until discarded; a running one is not discarded', () => {
    const store = new InMemoryBackgroundRuns();
    const started = store.start(alice, run);
    if (!('handle' in started)) throw new Error('refused');
    expect(store.discard(started.handle, alice)).toBe('running');
    store.finish(started.handle, answer, 't1');
    expect(store.get(started.handle, alice)).toEqual({
      ...run,
      run_handle: started.handle,
      state: 'finished',
      finished_at: 't1',
      answer,
    });
    expect(store.discard(started.handle, alice)).toBe('discarded');
    expect(store.get(started.handle, alice)).toBeUndefined();
  });

  it(`refuses the ${BACKGROUND_RUNS_PER_CALLER + 1}th run of a caller, running and kept counted; others are not limited`, () => {
    const store = new InMemoryBackgroundRuns();
    const handles: string[] = [];
    for (let i = 0; i < BACKGROUND_RUNS_PER_CALLER; i += 1) {
      const started = store.start(alice, run);
      if (!('handle' in started)) throw new Error('refused early');
      handles.push(started.handle);
    }
    expect(store.start(alice, run)).toEqual({
      refused: 'limit',
      limit: BACKGROUND_RUNS_PER_CALLER,
    });
    expect('handle' in store.start(bob, run)).toBe(true);
    const first = handles[0] ?? '';
    store.finish(first, answer, 't1');
    // Kept still counts.
    expect('refused' in store.start(alice, run)).toBe(true);
    store.discard(first, alice);
    expect('handle' in store.start(alice, run)).toBe(true);
  });

  it('handles are 128 random bits after the prefix', () => {
    const store = new InMemoryBackgroundRuns({ prefix: 'i7-' });
    const a = store.start(alice, run);
    const b = store.start(alice, run);
    if (!('handle' in a) || !('handle' in b)) throw new Error('refused');
    expect(a.handle).toMatch(/^i7-[0-9a-f]{32}$/);
    expect(a.handle).not.toBe(b.handle);
  });
});
