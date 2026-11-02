/**
 * A compact tool whose `object_type` (or `target_type`) picks the member
 * offers, on each declared variant, exactly the properties some member it
 * offers there takes: read from the server as a client reads it
 * (`tools/list`, stdio over an in-memory transport), each property is taken
 * by an offered member or by every call, and every property an offered
 * member takes is listed. What each member takes is the tool's takes
 * (`compactSchemas.ts`); the arguments a description names for a member
 * (`TYPE(arg*, …)`) are held to the same takes.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import {
  COMPACT_ACTIVATE,
  COMPACT_CHECK,
  COMPACT_CREATE,
  COMPACT_DELETE,
  COMPACT_DELETION_CHECK,
  COMPACT_LOCK,
  COMPACT_PROFILE,
  COMPACT_READ,
  COMPACT_UNLOCK,
  COMPACT_UPDATE,
  COMPACT_VALIDATE,
  COMPACT_WHERE_USED,
  type VariantValues,
} from '../../../lib/adtProjections';
import type { ServerVariant } from '../../../lib/clients';
import {
  COMPACT_ACTIVATE_TAKES,
  COMPACT_CHECK_TAKES,
  COMPACT_CREATE_TAKES,
  COMPACT_DELETE_TAKES,
  COMPACT_DELETION_CHECK_TAKES,
  COMPACT_LOCK_TAKES,
  COMPACT_PROFILE_TAKES,
  COMPACT_READ_TAKES,
  COMPACT_UNLOCK_TAKES,
  COMPACT_UPDATE_TAKES,
  COMPACT_VALIDATE_TAKES,
  COMPACT_WHERE_USED_TAKES,
} from '../../../lib/compact/compactSchemas';
import { registryOf, type ToolSet } from '../../../lib/toolSet';

jest.setTimeout(120_000);

/** One tool's takes, read as plain lists. */
interface Takes {
  readonly every: readonly string[];
  readonly members: {
    readonly [member: string]: readonly string[] | undefined;
  };
}

/** The tools whose members pick what they take: their takes and members. */
const TOOLS: Readonly<
  Record<string, { readonly takes: Takes; readonly members: VariantValues }>
> = {
  HandlerCreate: { takes: COMPACT_CREATE_TAKES, members: COMPACT_CREATE },
  HandlerGet: { takes: COMPACT_READ_TAKES, members: COMPACT_READ },
  HandlerUpdate: { takes: COMPACT_UPDATE_TAKES, members: COMPACT_UPDATE },
  HandlerDelete: { takes: COMPACT_DELETE_TAKES, members: COMPACT_DELETE },
  HandlerLock: { takes: COMPACT_LOCK_TAKES, members: COMPACT_LOCK },
  HandlerUnlock: { takes: COMPACT_UNLOCK_TAKES, members: COMPACT_UNLOCK },
  HandlerValidate: { takes: COMPACT_VALIDATE_TAKES, members: COMPACT_VALIDATE },
  HandlerCheckRun: { takes: COMPACT_CHECK_TAKES, members: COMPACT_CHECK },
  HandlerDeletionCheck: {
    takes: COMPACT_DELETION_CHECK_TAKES,
    members: COMPACT_DELETION_CHECK,
  },
  HandlerActivate: { takes: COMPACT_ACTIVATE_TAKES, members: COMPACT_ACTIVATE },
  HandlerWhereUsed: {
    takes: COMPACT_WHERE_USED_TAKES,
    members: COMPACT_WHERE_USED,
  },
  HandlerProfileRun: { takes: COMPACT_PROFILE_TAKES, members: COMPACT_PROFILE },
};

const SETS: Readonly<Record<string, ToolSet>> = {
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
  const client = new Client({ name: 'variant-properties', version: '1' });
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
  }
}

/** The properties `takes` names for a call on one of `members`. */
function takenOn(takes: Takes, members: readonly string[]): Set<string> {
  return new Set([
    ...takes.every,
    ...members.flatMap((member) => takes.members[member] ?? []),
  ]);
}

const isMemberChar = (char: string): boolean =>
  char === '_' || (char >= 'A' && char <= 'Z');
const isNameChar = (char: string): boolean =>
  char === '_' || char === '*' || (char >= 'a' && char <= 'z');

/** `[MEMBER, inner]` for each `MEMBER(inner)` in the text, left to right. */
function memberCalls(text: string): Array<[string, string]> {
  const calls: Array<[string, string]> = [];
  let from = 0;
  for (;;) {
    const open = text.indexOf('(', from);
    if (open === -1) return calls;
    let start = open;
    while (start > from && isMemberChar(text.charAt(start - 1))) start -= 1;
    if (start === open) {
      from = open + 1;
      continue;
    }
    const close = text.indexOf(')', open + 1);
    if (close === -1) return calls;
    calls.push([text.slice(start, open), text.slice(open + 1, close)]);
    from = close + 1;
  }
}

/** The runs of lower-case letters, underscores and `*` in the text. */
function nameWords(text: string): string[] {
  const words: string[] = [];
  let word = '';
  for (const char of text) {
    if (isNameChar(char)) word += char;
    else if (word !== '') {
      words.push(word);
      word = '';
    }
  }
  if (word !== '') words.push(word);
  return words;
}

/**
 * `[member, argument]` for each argument a description names as
 * `MEMBER(argument …)`: a word the tool takes, a word with an underscore, or
 * a word marked required (`*`); `a*=b*` names `a`.
 */
function namedArguments(
  description: string,
  members: readonly string[],
  properties: ReadonlySet<string>,
): Array<[string, string]> {
  const named: Array<[string, string]> = [];
  for (const [member, inner] of memberCalls(description)) {
    if (!members.includes(member)) continue;
    for (const part of inner.split(',')) {
      const [named0 = ''] = part.split('=');
      for (const word of nameWords(named0)) {
        const bare = word.endsWith('*') ? word.slice(0, -1) : word;
        if (bare === '') continue;
        if (properties.has(bare) || bare.includes('_') || word.endsWith('*')) {
          named.push([member, bare]);
        }
      }
    }
  }
  return named;
}

describe('a compact tool offers on each variant the properties its offered members take', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  afterAll(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
    resetProcessLatchForTests();
  });

  for (const [kind, set] of Object.entries(SETS)) {
    for (const variant of VARIANTS) {
      it(`${kind} on ${variant}: every property is taken by an offered member, and every property an offered member takes is listed`, async () => {
        const tools = await listed(set, variant);
        const untaken: Record<string, string[]> = {};
        const missing: Record<string, string[]> = {};
        let checked = 0;
        for (const tool of tools) {
          const declared = TOOLS[tool.name];
          if (declared === undefined) continue;
          checked += 1;
          const taken = takenOn(declared.takes, declared.members[variant]);
          const properties = Object.keys(tool.inputSchema.properties ?? {});
          const extra = properties.filter((property) => !taken.has(property));
          if (extra.length > 0) untaken[tool.name] = extra;
          const absent = [...taken].filter(
            (property) => !properties.includes(property),
          );
          if (absent.length > 0) missing[tool.name] = absent;
        }
        expect(checked).toBeGreaterThanOrEqual(kind === 'compact' ? 12 : 5);
        expect({ untaken, missing }).toEqual({ untaken: {}, missing: {} });
      });

      it(`${kind} on ${variant}: every argument a description names for a member is one that member takes`, async () => {
        const tools = await listed(set, variant);
        let named = 0;
        for (const tool of tools) {
          const declared = TOOLS[tool.name];
          if (declared === undefined) continue;
          const offered = declared.members[variant];
          // Every property the tool takes on any variant, so a description
          // naming one its variant does not offer is caught too.
          const properties = takenOn(declared.takes, declared.members.onprem);
          for (const [member, argument] of namedArguments(
            tool.description ?? '',
            offered,
            properties,
          )) {
            named += 1;
            expect({
              tool: tool.name,
              member,
              argument,
              taken: takenOn(declared.takes, [member]).has(argument),
            }).toEqual({ tool: tool.name, member, argument, taken: true });
          }
        }
        expect(named).toBeGreaterThan(20);
      });
    }
  }
});
