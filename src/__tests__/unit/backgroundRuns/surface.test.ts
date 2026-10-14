/**
 * Background runs, around the run itself: an embedder's injected connection
 * (its fresh-connection factory decides), where the tools are served, which
 * tools take `background`, a group registered on its own (no strategy), and
 * that lib's entries carry no store (its own package's tests cover it).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { FRESH_CONNECTION_UNAVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
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
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ToolSet,
} from '../../../lib/toolSet';
import { adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import { clientOf, isClassRun, shippedGroups, silent, until } from './harness';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

const RUN = { class_name: 'PLACEHOLDER_CLASS', background: true };

const placeholder = {
  connection: null,
  logger: undefined,
} as unknown as HandlerContext;

describe('an embedder', () => {
  it('runs in the background on its injected connection’s fresh connection, its caller the user SAP answers', async () => {
    // On ABAP Cloud, where the caller is asked of the system (the kind of a
    // connection the factory built comes from `SAP_SYSTEM_TYPE`).
    const previousType = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = 'cloud';
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
      systemType: 'cloud',
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
      if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = previousType;
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
      // Refused before the caller was asked of the system: the one lookup
      // is the connection's own, before the tool.
      expect(
        standIn.requests.filter((r) => r.url.includes('systeminformation')),
      ).toHaveLength(1);
      // Nothing kept.
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
    [['readonly', 'debug'], true],
    [['high'], false],
    [['debug'], false],
  ])('full %j: served %s, as RuntimeRunClass is', (exposition, served) => {
    const tools = namesOf(registryForExposition(exposition).getHandlerGroups());
    expect(tools.includes('RuntimeRunClass')).toBe(served);
    for (const name of FULL) expect(tools.includes(name)).toBe(served);
  });

  // The binary fixes its set (C23): the four kinds of binary.
  it.each<[string, ToolSet, boolean]>([
    ['core', fullToolSet, true],
    ['core-ro', fullReadOnlyToolSet, false],
  ])('%s: served %s', (_kind, set, served) => {
    for (const transport of ['stdio', 'http', 'sse'] as const) {
      const tools = namesOf(registryOf(set, transport).getHandlerGroups());
      for (const name of FULL) expect(tools.includes(name)).toBe(served);
    }
    expect(set.backgroundRuns).toBe(served);
  });

  it.each<[string, ToolSet, boolean]>([
    ['compact-ro', compactReadOnlyToolSetOf(compactReadOnlyEntries), false],
    [
      'compact',
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        modify: compactModifyEntries,
      }),
      true,
    ],
  ])('%s: served %s, as HandlerProfileRun is', (_kind, set, served) => {
    expect(set.backgroundRuns).toBe(served);
    for (const transport of ['stdio', 'http', 'sse'] as const) {
      const tools = namesOf(registryOf(set, transport).getHandlerGroups());
      expect(tools.includes('HandlerProfileRun')).toBe(served);
      for (const name of COMPACT) expect(tools.includes(name)).toBe(served);
    }
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

describe('lib ships the contract only, no store', () => {
  const REPO = path.resolve(__dirname, '../../../..');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
  ) as { exports: Record<string, { types: string }> };
  /** Each entry's source module, from its published `types` path. */
  const entries = Object.entries(manifest.exports).map(([entry, target]) => [
    entry,
    path.join(
      REPO,
      target.types.replace('./dist/', 'src/').replace(/\.d\.ts$/, '.ts'),
    ),
  ]);

  it.each(entries)(
    '%s exports no IBackgroundRuns implementation',
    (_entry, file) => {
      const exported = require(file) as Record<string, unknown>;
      for (const [name, value] of Object.entries(exported)) {
        expect(name).not.toMatch(/InMemory|BACKGROUND_RUNS_PER_CALLER/);
        const proto = (value as { prototype?: Record<string, unknown> })
          ?.prototype;
        const isStore =
          typeof value === 'function' &&
          proto !== undefined &&
          ['start', 'finish', 'get', 'list', 'discard'].every(
            (method) => typeof proto[method] === 'function',
          );
        expect({ name, isStore }).toEqual({ name, isStore: false });
      }
    },
  );

  it('no lib source implements IBackgroundRuns', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (
          entry.name.endsWith('.ts') &&
          fs.readFileSync(full, 'utf8').includes('implements IBackgroundRuns')
        ) {
          offenders.push(path.relative(REPO, full));
        }
      }
    };
    walk(path.join(REPO, 'src'));
    expect(offenders).toEqual([]);
  });
});
