/**
 * Each declared variant's tools carry that variant's description: the
 * description a client reads (`tools/list`, stdio over an in-memory
 * transport) is the one `servedDefinition` states for the declared variant,
 * beside the variant's `inputSchema` — and a compact tool's description
 * names only the members its own enum offers there.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { withBatchSentence } from '../../../lib/batch/sentence';
import type { ServerVariant } from '../../../lib/clients';
import type { ToolDefinition } from '../../../lib/handlers/interfaces';
import { fullToolSet, registryOf, type ToolSet } from '../../../lib/toolSet';
import { servedDefinition } from '../../../lib/variantToolSet';
import { PROJECTED_ARGUMENTS } from '../../helpers/projectedArguments';

jest.setTimeout(120_000);

const SETS: Readonly<Record<string, ToolSet>> = {
  core: fullToolSet,
  compact: compactToolSet,
  'compact-ro': compactRoSet,
};

const VARIANTS: readonly ServerVariant[] = ['onprem', 'cloud'];

type Listed = Awaited<ReturnType<Client['listTools']>>['tools'][number];

/** The tools `set` lists on a server declared `variant`. */
async function listed(
  set: ToolSet,
  variant: ServerVariant,
): Promise<readonly Listed[]> {
  process.env.SAP_SYSTEM_TYPE = variant;
  const server = new StdioServer(registryOf(set, 'stdio'), undefined);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  const client = new Client({ name: 'variant-descriptions', version: '1' });
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
  }
}

/** Every definition of `set`, by name. */
function definitionsOf(set: ToolSet): ReadonlyMap<string, ToolDefinition> {
  const byName = new Map<string, ToolDefinition>();
  for (const group of registryOf(set, 'stdio').getHandlerGroups()) {
    for (const entry of group.getHandlers()) {
      byName.set(entry.toolDefinition.name, entry.toolDefinition);
    }
  }
  return byName;
}

/** The members `tool`'s projected `object_type` / `target_type` names on any variant. */
function membersOf(tool: string): {
  readonly any: ReadonlySet<string>;
  readonly on: Readonly<Record<ServerVariant, ReadonlySet<string>>>;
} {
  const projected = PROJECTED_ARGUMENTS.filter(
    (argument) =>
      argument.tool === tool &&
      (argument.argument === 'object_type' ||
        argument.argument === 'target_type'),
  );
  const onprem = new Set(projected.flatMap((p) => p.values.onprem));
  const cloud = new Set(projected.flatMap((p) => p.values.cloud));
  return { any: new Set([...onprem, ...cloud]), on: { onprem, cloud } };
}

/** Whether `char` continues a member's name (`A`–`Z`, `a`–`z`, digits, `_`). */
function nameChar(char: string | undefined): boolean {
  if (char === undefined || char.length === 0) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    char === '_'
  );
}

/** The members `description` names as a whole word anywhere in its text. */
function membersNamed(description: string, any: ReadonlySet<string>): string[] {
  const named: string[] = [];
  for (const member of any) {
    let from = description.indexOf(member);
    while (from !== -1) {
      const before = description[from - 1];
      const after = description[from + member.length];
      if (!nameChar(before) && !nameChar(after)) {
        named.push(member);
        break;
      }
      from = description.indexOf(member, from + 1);
    }
  }
  return named;
}

describe('each declared variant’s tools carry that variant’s description', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  afterAll(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
    resetProcessLatchForTests();
  });

  for (const [kind, set] of Object.entries(SETS)) {
    for (const variant of VARIANTS) {
      it(`${kind} on ${variant}: every tool lists the description servedDefinition states for ${variant}`, async () => {
        const definitions = definitionsOf(set);
        const tools = await listed(set, variant);
        let varying = 0;
        for (const tool of tools) {
          const definition = definitions.get(tool.name);
          expect(definition).toBeDefined();
          if (definition === undefined) continue;
          const served = servedDefinition(definition, variant);
          expect(served).toBeDefined();
          if (served === undefined) continue;
          if (definition.variants !== undefined) varying += 1;
          expect([
            served.description,
            withBatchSentence(served.description, tool.name),
          ]).toContain(tool.description);
        }
        expect(varying).toBeGreaterThan(3);
      });
    }
  }

  for (const kind of ['compact', 'compact-ro']) {
    for (const variant of VARIANTS) {
      it(`${kind} on ${variant}: a compact tool's description names only members its enum offers on ${variant}`, async () => {
        const set = SETS[kind];
        expect(set).toBeDefined();
        if (set === undefined) return;
        const tools = await listed(set, variant);
        let checked = 0;
        for (const tool of tools) {
          const members = membersOf(tool.name);
          if (members.any.size === 0) continue;
          checked += 1;
          const outside = membersNamed(
            tool.description ?? '',
            members.any,
          ).filter((member) => !members.on[variant].has(member));
          expect({ tool: tool.name, outside }).toEqual({
            tool: tool.name,
            outside: [],
          });
        }
        expect(checked).toBeGreaterThan(3);
      });
    }
  }
});
