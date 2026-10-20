/**
 * Every served tool's description is purely functional (spec §3, "Wording"):
 * what the tool does, its parameters and its result — no negation, no
 * pointer to replaced or migrated work.
 *
 * The descriptions are taken as a client receives them: every set, every
 * transport, every system type, served by a `BaseMcpServer` with a batch
 * owner, so the sentence appended at registration is checked too.
 *
 * Words are split with plain code, no regular expression: letters and
 * apostrophes are word characters, anything else a separator.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import type { ToolSetKind } from '../../../lib/config/binaries';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ServedTransport,
  type ToolSet,
} from '../../../lib/toolSet';

const FORBIDDEN: ReadonlySet<string> = new Set([
  'not',
  'no',
  'never',
  'nothing',
  'none',
  'neither',
  'nor',
  'without',
  'cannot',
  "can't",
  "doesn't",
  "don't",
  "isn't",
  "won't",
  'instead',
  'formerly',
  'deprecated',
  'removed',
  'replaces',
  'migrate',
]);

/** A letter of any script, or an apostrophe (straight or typographic). */
function isWordCharacter(character: string): boolean {
  if (character === "'" || character === '’') return true;
  return character.toLowerCase() !== character.toUpperCase();
}

/** The description's word tokens, lower-cased, typographic apostrophes straightened. */
function wordsOf(text: string): string[] {
  const words: string[] = [];
  let current = '';
  for (const character of text) {
    if (isWordCharacter(character)) {
      current += character === '’' ? "'" : character;
      continue;
    }
    if (current !== '') words.push(current.toLowerCase());
    current = '';
  }
  if (current !== '') words.push(current.toLowerCase());
  return words;
}

const silent = { info() {}, debug() {}, warn() {}, error() {} };

const SETS: ReadonlyArray<readonly [ToolSetKind, ToolSet]> = [
  ['core', fullToolSet],
  ['core-ro', fullReadOnlyToolSet],
  [
    'compact',
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      modify: compactModifyEntries,
    }),
  ],
  ['compact-ro', compactReadOnlyToolSetOf(compactReadOnlyEntries)],
];
const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];
const SYSTEM_TYPES = ['onprem', 'cloud', 'legacy'] as const;

class DescribedServer extends BaseMcpServer {
  constructor(
    registry: IHandlersRegistry,
    systemType: (typeof SYSTEM_TYPES)[number],
  ) {
    super({
      name: 'descriptions-functional',
      version: '1.0.0',
      logger: silent as never,
      systemType,
      batch: new InstanceBatch({ keepRawParts: false }),
    });
    this.registerHandlers(registry);
  }
}

async function servedDescriptions(
  set: ToolSet,
  transport: ServedTransport,
  systemType: (typeof SYSTEM_TYPES)[number],
): Promise<Array<{ name: string; description: string }>> {
  const server = new DescribedServer(registryOf(set, transport), systemType);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'descriptions', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
  }));
}

describe('tool descriptions are purely functional', () => {
  it('splits words with letters and apostrophes, everything else a separator', () => {
    expect(wordsOf("Doesn't lock; (not)-given, can’t x2y")).toEqual([
      "doesn't",
      'lock',
      'not',
      'given',
      "can't",
      'x',
      'y',
    ]);
  });

  it.each(SETS.map(([kind, set]) => [kind, set] as const))(
    'every served tool of %s states only what it does, its parameters and its result',
    async (kind, set) => {
      const offenders: string[] = [];
      let seen = 0;
      for (const transport of TRANSPORTS) {
        for (const systemType of SYSTEM_TYPES) {
          for (const tool of await servedDescriptions(
            set,
            transport,
            systemType,
          )) {
            seen += 1;
            for (const word of new Set(wordsOf(tool.description))) {
              if (!FORBIDDEN.has(word)) continue;
              const finding = `${tool.name}: "${word}"`;
              if (!offenders.includes(finding)) offenders.push(finding);
            }
          }
        }
      }
      expect(seen).toBeGreaterThan(10);
      expect({ set: kind, offenders }).toEqual({ set: kind, offenders: [] });
    },
  );
});
