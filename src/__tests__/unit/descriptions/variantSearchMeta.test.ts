/**
 * A compact tool's search texts (`_meta["mcp-abap-adt/search"]`) name only
 * the members its variant offers: read from the server as a client reads it
 * (`tools/list`, stdio over an in-memory transport), on a server declared
 * ABAP cloud no keyword and no word of the semantic sentence names a member
 * the tool's enum offers on premise and not there; on premise the texts are
 * the table's own (`toolSearchText`). The members a tool's entry groups its
 * words under are its own, and each grouped keyword is one of its keywords.
 * A compact tool's keywords name no object kind (a word the table groups
 * under a member, in any entry) that none of its members is.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import type { ServerVariant } from '../../../lib/clients';
import { TOOL_SEARCH_META_KEY, toolSearchText } from '../../../lib/toolSearch';
import { registryOf, type ToolSet } from '../../../lib/toolSet';
import { PROJECTED_ARGUMENTS } from '../../helpers/projectedArguments';

jest.setTimeout(120_000);

/**
 * The words a user names a member with (this test's own reading, not the
 * table's): a member left out on a variant leaves all of them out.
 */
const MEMBER_WORDS: Readonly<Record<string, readonly string[]>> = {
  PROGRAM: ['program', 'report', 'run program', 'execute report'],
  INCLUDE: ['include'],
};

const SETS: Readonly<Record<string, ToolSet>> = {
  compact: compactToolSet,
  'compact-ro': compactRoSet,
};

type Listed = Awaited<ReturnType<Client['listTools']>>['tools'][number];

async function listed(
  set: ToolSet,
  variant: ServerVariant,
): Promise<readonly Listed[]> {
  process.env.SAP_SYSTEM_TYPE = variant;
  const server = new StdioServer(
    registryOf(set, 'stdio', { dataTools: true }),
    undefined,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  const client = new Client({ name: 'variant-search-meta', version: '1' });
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
  }
}

/** The members `tool`'s `object_type` / `target_type` offers on each variant. */
function membersOf(
  tool: string,
): Readonly<Record<ServerVariant, readonly string[]>> | undefined {
  const projected = PROJECTED_ARGUMENTS.find(
    (argument) =>
      argument.tool === tool &&
      (argument.argument === 'object_type' ||
        argument.argument === 'target_type'),
  );
  return projected?.values;
}

/** The search texts a listed tool carries. */
function searchOf(
  tool: Listed,
): { keywords: string[]; semantic: string } | undefined {
  const meta = tool._meta?.[TOOL_SEARCH_META_KEY];
  if (typeof meta !== 'object' || meta === null) return undefined;
  const keywords: unknown = Reflect.get(meta, 'keywords');
  const semantic: unknown = Reflect.get(meta, 'semantic');
  if (!Array.isArray(keywords) || typeof semantic !== 'string') return;
  return { keywords: keywords.map(String), semantic };
}

/** Whether `word` stands in `text` as a whole word, in any case. */
function namesWord(text: string, word: string): boolean {
  const haystack = text.toLowerCase();
  const needle = word.toLowerCase();
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    const before = haystack[from - 1] ?? ' ';
    const after = haystack[from + needle.length] ?? ' ';
    const letter = (c: string) => (c >= 'a' && c <= 'z') || c === '_';
    if (!letter(before) && !letter(after)) return true;
    from = haystack.indexOf(needle, from + 1);
  }
  return false;
}

/** `tools/tool-search.json` as the file states it (data from outside the types). */
function searchTable(): object {
  const table: unknown = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'tools', 'tool-search.json'),
      'utf8',
    ),
  );
  if (typeof table !== 'object' || table === null) throw new Error('table');
  return table;
}

/** The words an entry groups under each member, as the file states them. */
function groupsOf(entry: unknown): ReadonlyMap<string, readonly string[]> {
  const groups: unknown = Reflect.get(Object(entry), 'members');
  return new Map(
    Object.entries(Object(groups)).map(([member, words]) => [
      member,
      Array.isArray(words) ? words.map(String) : [],
    ]),
  );
}

describe('a compact tool’s search texts name only the members its variant offers', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  afterAll(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
    resetProcessLatchForTests();
  });

  for (const [kind, set] of Object.entries(SETS)) {
    it(`${kind} on cloud: no search word names a member the tool offers on premise only`, async () => {
      const tools = await listed(set, 'cloud');
      const naming: string[] = [];
      let checked = 0;
      for (const tool of tools) {
        const members = membersOf(tool.name);
        const search = searchOf(tool);
        if (members === undefined || search === undefined) continue;
        const gone = members.onprem.filter(
          (member) => !members.cloud.includes(member),
        );
        if (gone.length > 0) checked += 1;
        for (const member of gone) {
          for (const word of MEMBER_WORDS[member] ?? []) {
            if (search.keywords.some((keyword) => namesWord(keyword, word))) {
              naming.push(`${tool.name} keyword ${word} (${member})`);
            }
            if (namesWord(search.semantic, word)) {
              naming.push(`${tool.name} semantic ${word} (${member})`);
            }
          }
        }
      }
      expect(checked).toBeGreaterThanOrEqual(kind === 'compact' ? 8 : 1);
      expect(naming).toEqual([]);
    });

    it(`${kind} on onprem: every tool carries the table's own search texts`, async () => {
      const tools = await listed(set, 'onprem');
      const differing: string[] = [];
      for (const tool of tools) {
        const text = toolSearchText(tool.name);
        if (text === undefined) continue;
        const search = searchOf(tool);
        if (
          JSON.stringify(search) !==
          JSON.stringify({ keywords: text.keywords, semantic: text.semantic })
        ) {
          differing.push(tool.name);
        }
      }
      expect(differing).toEqual([]);
    });
  }

  it('groups a tool’s words only under its own members, each grouped keyword one of its keywords', () => {
    const table = searchTable();
    const misgrouped: string[] = [];
    let grouped = 0;
    for (const [name, entry] of Object.entries(table)) {
      const groups: unknown = Reflect.get(Object(entry), 'members');
      if (groups === undefined) continue;
      const members = membersOf(name);
      const own = new Set([
        ...(members?.onprem ?? []),
        ...(members?.cloud ?? []),
      ]);
      const keywords: unknown = Reflect.get(Object(entry), 'keywords');
      const listedKeywords = Array.isArray(keywords) ? keywords : [];
      for (const [member, words] of Object.entries(Object(groups))) {
        grouped += 1;
        if (!own.has(member)) misgrouped.push(`${name}: ${member}`);
        for (const word of Array.isArray(words) ? words : []) {
          if (!listedKeywords.includes(word)) {
            misgrouped.push(`${name}: ${member} ${String(word)}`);
          }
        }
      }
    }
    expect(grouped).toBeGreaterThan(0);
    expect(misgrouped).toEqual([]);
  });

  it('names in its keywords only the object kinds its members are', () => {
    const table = searchTable();
    const compact = new Set(
      Object.values(SETS).flatMap((set) =>
        registryOf(set, 'stdio', { dataTools: true })
          .getHandlerGroups()
          .flatMap((group) => group.getHandlers())
          .map((entry) => entry.toolDefinition.name),
      ),
    );
    // A kind word: one the table groups under a member, in any entry.
    const kinds = new Map<string, Set<string>>();
    for (const entry of Object.values(table)) {
      for (const [member, words] of groupsOf(entry)) {
        for (const word of words) {
          const named = kinds.get(word) ?? new Set<string>();
          named.add(member);
          kinds.set(word, named);
        }
      }
    }
    const foreign: string[] = [];
    let checked = 0;
    for (const [name, entry] of Object.entries(table)) {
      const members = membersOf(name);
      if (!compact.has(name) || members === undefined) continue;
      checked += 1;
      const own = new Set([...members.onprem, ...members.cloud]);
      const keywords: unknown = Reflect.get(Object(entry), 'keywords');
      for (const keyword of Array.isArray(keywords) ? keywords : []) {
        const named = kinds.get(String(keyword));
        if (named === undefined) continue;
        if (![...named].some((member) => own.has(member))) {
          foreign.push(`${name}: ${String(keyword)}`);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
    expect(foreign).toEqual([]);
  });
});
