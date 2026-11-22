/**
 * The data tools are served only when a set is asked to (spec §3): every set,
 * on every transport, serves with `{ dataTools: true }` exactly what it serves
 * with `{ dataTools: false }` plus the data tools — `GetSqlQuery` and
 * `GetTableContents` on the full sets, `HandlerGetData` on the compact ones —
 * and with `false` none of them. The one fixture set is the flag-on surface;
 * the flag-off surface is asserted as that fixture minus exactly the three
 * names. Off means absent on every registration path: a `BaseMcpServer`, a
 * plain registration of a registry, and a group registered on its own.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  CompactDataHandlersGroup,
  CompactReadOnlyHandlersGroup,
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import {
  BINARIES,
  type ServedTransport,
  type ToolSetKind,
} from '../../../lib/config/binaries';
import { DataHandlersGroup } from '../../../lib/handlers/groups/DataHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import type { IHandlerGroup } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ServedTools,
  type ToolSet,
} from '../../../lib/toolSet';
import { repositoryRoot } from '../../helpers/repoRoot';

const FULL_DATA = ['GetSqlQuery', 'GetTableContents'];
const COMPACT_DATA = ['HandlerGetData'];
const ALL_DATA = [...FULL_DATA, ...COMPACT_DATA];

const ON: ServedTools = { dataTools: true };
const OFF: ServedTools = { dataTools: false };

const SETS: ReadonlyArray<readonly [ToolSetKind, ToolSet, readonly string[]]> =
  [
    ['core', fullToolSet, FULL_DATA],
    ['core-ro', fullReadOnlyToolSet, FULL_DATA],
    [
      'compact',
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        data: compactDataEntries,
        modify: compactModifyEntries,
      }),
      COMPACT_DATA,
    ],
    [
      'compact-ro',
      compactReadOnlyToolSetOf({
        readOnly: compactReadOnlyEntries,
        data: compactDataEntries,
      }),
      COMPACT_DATA,
    ],
  ];

const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];

const namesOfGroups = (groups: readonly IHandlerGroup[]): string[] =>
  groups.flatMap((group) =>
    group.getHandlers().map((entry) => entry.toolDefinition.name),
  );

const served = (
  set: ToolSet,
  transport: ServedTransport,
  choice: ServedTools,
): string[] =>
  namesOfGroups(set.groups(noConnectionContext(), transport, choice));

const FIXTURES = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'tools',
);

/** A fixture file, read from outside the type system: an object of objects by binary. */
function readFixture(file: string): ReadonlyMap<string, readonly string[]> {
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, file), 'utf8'),
  );
  assert.ok(typeof parsed === 'object' && parsed !== null);
  const out = new Map<string, readonly string[]>();
  for (const [bin, tools] of Object.entries(parsed)) {
    assert.ok(typeof tools === 'object' && tools !== null);
    out.set(bin, Object.keys(tools).sort());
  }
  return out;
}

const HTTP_FIXTURE = readFixture('http-surface.json');
const STDIO_SSE_FIXTURE = readFixture('stdio-sse-surface.json');

/** The one fixture set: each binary's tool names, captured with the flag on. */
function fixtureNames(transport: ServedTransport, kind: ToolSetKind): string[] {
  const bin = BINARIES[transport][kind].bin;
  const names = (transport === 'http' ? HTTP_FIXTURE : STDIO_SSE_FIXTURE).get(
    bin,
  );
  assert.ok(names !== undefined, `no fixture for ${bin}`);
  return [...names];
}

describe('the data tools, by set and transport', () => {
  for (const [kind, set, data] of SETS) {
    for (const transport of TRANSPORTS) {
      describe(`${kind} on ${transport}`, () => {
        const on = served(set, transport, ON);
        const off = served(set, transport, OFF);

        it('serves exactly its data tools more with the flag on', () => {
          const added = on.filter((name) => !off.includes(name)).sort();
          assert.deepEqual(added, [...data].sort());
          assert.ok(off.every((name) => on.includes(name)));
        });

        it('serves none of the data tools with the flag off', () => {
          assert.deepEqual(
            off.filter((name) => ALL_DATA.includes(name)),
            [],
          );
        });

        it('serves the fixture with the flag on', () => {
          const listed = new Set(fixtureNames(transport, kind));
          assert.deepEqual(
            [...new Set(on)].filter((name) => !listed.has(name)),
            [],
          );
          assert.deepEqual(
            [...listed].filter((name) => !on.includes(name)),
            [],
          );
        });

        it('serves the fixture minus exactly the three names with the flag off', () => {
          const expected = fixtureNames(transport, kind).filter(
            (name) => !ALL_DATA.includes(name),
          );
          assert.deepEqual([...new Set(off)].sort(), expected);
        });

        it('a registry of the set serves what its groups serve', () => {
          for (const choice of [ON, OFF]) {
            assert.deepEqual(
              namesOfGroups(
                registryOf(set, transport, choice).getHandlerGroups(),
              ),
              served(set, transport, choice),
            );
          }
        });
      });
    }
  }
});

describe('the data groups', () => {
  const context = noConnectionContext();

  it('DataHandlersGroup serves exactly GetSqlQuery and GetTableContents', () => {
    assert.deepEqual(
      namesOfGroups([new DataHandlersGroup(context)]).sort(),
      FULL_DATA,
    );
  });

  it('CompactDataHandlersGroup serves exactly HandlerGetData', () => {
    assert.deepEqual(
      namesOfGroups([new CompactDataHandlersGroup(context)]),
      COMPACT_DATA,
    );
  });

  it('the read-only, system and compact read-only groups serve none of them', () => {
    assert.deepEqual(
      namesOfGroups([
        new ReadOnlyHandlersGroup(context),
        new SystemHandlersGroup(context),
        new CompactReadOnlyHandlersGroup(context),
      ]).filter((name) => ALL_DATA.includes(name)),
      [],
    );
  });
});

/** A client's view of `server`: the names `tools/list` carries, and a call's answer. */
async function clientOf(server: McpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'data-tools', version: '1' });
  await client.connect(clientSide);
  return client;
}

async function assertAbsent(client: Client, names: readonly string[]) {
  const listed = (await client.listTools()).tools.map((tool) => tool.name);
  assert.ok(listed.length > 0, 'the server lists no tool at all');
  assert.deepEqual(
    listed.filter((name) => ALL_DATA.includes(name)),
    [],
  );
  for (const name of names) {
    const answer = await client.callTool({ name, arguments: {} });
    assert.equal(answer.isError, true);
    const text = JSON.stringify(answer.content);
    assert.ok(text.includes(`Tool ${name} not found`), text);
  }
}

describe('the data tools off are absent on every registration path', () => {
  it('a BaseMcpServer instance lists none and answers each as not found', async () => {
    const server = new StdioServer(
      registryOf(fullReadOnlyToolSet, 'stdio', OFF),
      undefined,
      { backgroundRuns: new InMemoryBackgroundRuns() },
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.start(undefined, serverSide);
    const client = new Client({ name: 'data-tools', version: '1' });
    await client.connect(clientSide);
    try {
      await assertAbsent(client, FULL_DATA);
    } finally {
      await client.close();
    }
  });

  it('a registry registered on an SDK server lists none', async () => {
    const server = new McpServer({ name: 'plain', version: '1' });
    registryOf(fullReadOnlyToolSet, 'stdio', OFF).registerAllTools(server);
    const client = await clientOf(server);
    try {
      await assertAbsent(client, FULL_DATA);
    } finally {
      await client.close();
    }
  });

  it('the read-only and system groups registered on their own list none', async () => {
    const server = new McpServer({ name: 'groups', version: '1' });
    const context = noConnectionContext();
    new ReadOnlyHandlersGroup(context).registerHandlers(server);
    new SystemHandlersGroup(context).registerHandlers(server);
    new CompactReadOnlyHandlersGroup(context).registerHandlers(server);
    const client = await clientOf(server);
    try {
      await assertAbsent(client, ALL_DATA);
    } finally {
      await client.close();
    }
  });
});
