/**
 * Every served tool's description is purely functional (spec §3, "Wording"):
 * what the tool does, its parameters and its result — no negation, no
 * pointer to replaced or migrated work, no other tool of its set named, a
 * read tool marked `[read-only]`, a first sentence no other tool of its set
 * shares, and no vague subject ("an ABAP object", "an object", "a given …")
 * in it: it names the function on what the parameters name.
 *
 * The descriptions are taken as a client receives them: every set, every
 * transport, every system type, served by a `BaseMcpServer` with a batch
 * owner, so the sentence appended at registration is checked too.
 *
 * Words are split with plain code, no regular expression: letters and
 * apostrophes are word characters, anything else a separator.
 */
import { isBatchTool } from '../../../lib/batch/batchTools';
import type { ToolSetKind } from '../../../lib/config/binaries';
import {
  SETS,
  type ServedTool,
  SYSTEM_TYPES,
  servedCatalog,
  TRANSPORTS,
} from '../descriptions/catalog';

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

/** A listed word, or any contracted negation (a token ending in n't). */
function isNegation(word: string): boolean {
  return FORBIDDEN.has(word) || word.endsWith("n't");
}

/** The read-only set beside each set: its tools change nothing. */
const READ_ONLY_OF: Readonly<Record<ToolSetKind, ToolSetKind>> = {
  core: 'core-ro',
  'core-ro': 'core-ro',
  compact: 'compact-ro',
  'compact-ro': 'compact-ro',
};

/**
 * The tools a read-only set serves that change something: they run code,
 * schedule a trace or log a session off. (The batch tools are aside: they
 * record and send other calls.)
 */
const CHANGING_IN_READ_ONLY_SETS: ReadonlySet<string> = new Set([
  'RuntimeRunClass',
  'RuntimeRunProgram',
  'RuntimeCreateProfilerTraceParameters',
  'LogoffLeftoverSession',
  'HandlerLeftoverSessionLogoff',
]);

/**
 * The tools that change nothing whose name does not say so by a read verb:
 * the waits read the debug session's state and send nothing, the delta
 * compares two snapshots, the compact background-run reads read the kept
 * runs.
 */
const READ_BY_NAME: ReadonlySet<string> = new Set([
  'DebugWait',
  'AmdpDebugWait',
  'MemorySnapshotDelta',
  'HandlerBackgroundRunGet',
  'HandlerBackgroundRunList',
]);

/** The family prefixes a tool name may carry before its verb. */
const FAMILY_PREFIXES = ['Runtime', 'AmdpDebug', 'Debug', 'MemorySnapshot'];

/** The verbs a read tool's name (after its family prefix) begins with. */
const READ_VERBS = [
  'Get',
  'List',
  'Read',
  'Search',
  'Describe',
  'Check',
  'Validate',
  'Analyze',
];

/** Whether `name` begins with the word `word`: the next letter, if any, starts a new word. */
function startsWithWord(name: string, word: string): boolean {
  if (!name.startsWith(word)) return false;
  const next = name.charAt(word.length);
  return next === '' || next === next.toUpperCase();
}

/**
 * Whether `tool` changes nothing, and so must carry `[read-only]` (beside
 * its family's `[runtime]`, `[debug]` or `[session]`): served by the set's
 * read-only set and not one of the tools there that change something, or
 * named by a read verb after an optional family prefix, or one of the reads
 * `READ_BY_NAME` lists. A batch tool is aside.
 */
function mustBeMarkedReadOnly(
  tool: ServedTool,
  readOnly: ReadonlySet<string>,
): boolean {
  if (isBatchTool(tool.name)) return false;
  if (CHANGING_IN_READ_ONLY_SETS.has(tool.name)) return false;
  if (readOnly.has(tool.name) || READ_BY_NAME.has(tool.name)) return true;
  const prefix = FAMILY_PREFIXES.find((each) =>
    startsWithWord(tool.name, each),
  );
  const rest =
    prefix === undefined ? tool.name : tool.name.slice(prefix.length);
  return READ_VERBS.some((verb) => startsWithWord(rest, verb));
}

/** The identifiers of `text`: runs of letters, digits and underscores. */
function identifiersOf(text: string): string[] {
  const identifiers: string[] = [];
  let current = '';
  for (const character of text) {
    const word =
      character === '_' ||
      (character >= '0' && character <= '9') ||
      character.toLowerCase() !== character.toUpperCase();
    if (word) {
      current += character;
      continue;
    }
    if (current !== '') identifiers.push(current);
    current = '';
  }
  if (current !== '') identifiers.push(current);
  return identifiers;
}

/**
 * The first sentence of `text`: up to the first `.`, `!` or `?` followed by
 * white space or the end — "e.g." and "i.e." do not end it.
 */
function firstSentence(text: string): string {
  const characters = [...text];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] as string;
    if (character !== '.' && character !== '!' && character !== '?') continue;
    const next = characters[index + 1];
    if (next !== undefined && next !== ' ' && next !== '\n') continue;
    const sentence = characters.slice(0, index + 1).join('');
    if (sentence.endsWith('e.g.') || sentence.endsWith('i.e.')) continue;
    return sentence;
  }
  return text;
}

/** The vague subjects a first sentence must not be built around. */
const VAGUE_SUBJECTS = ['an abap object', 'an object', 'a given'];

/** Every tool `kind`'s set serves, on every transport and system type, each once. */
async function everyServed(kind: ToolSetKind): Promise<ServedTool[]> {
  const set = SETS.find(([each]) => each === kind)?.[1];
  if (set === undefined) throw new Error(`no set ${kind}`);
  const tools = new Map<string, ServedTool>();
  for (const transport of TRANSPORTS) {
    for (const systemType of SYSTEM_TYPES) {
      for (const tool of await servedCatalog(set, transport, systemType)) {
        const key = `${tool.name}\u0000${tool.description}`;
        if (!tools.has(key)) tools.set(key, tool);
      }
    }
  }
  return [...tools.values()];
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

  it('reads every contracted negation, straight or curly, in any case', () => {
    expect(
      wordsOf("wouldn’t SHOULDN'T Aren’t WASN'T hasn't Doesn’t").map(
        isNegation,
      ),
    ).toEqual([true, true, true, true, true, true]);
    expect(wordsOf("NOT Never NOTHING tool's runs").map(isNegation)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('reads identifiers, first sentences and read tools with plain code', () => {
    expect(identifiersOf('names GetClass_x, (BatchEnd)-done')).toEqual([
      'names',
      'GetClass_x',
      'BatchEnd',
      'done',
    ]);
    expect(firstSentence('Reads X (e.g. Y). Then Z.')).toBe(
      'Reads X (e.g. Y).',
    );
    expect(firstSentence('No end')).toBe('No end');
    const tool = (name: string, description: string): ServedTool => ({
      name,
      description,
      parameters: [],
      search: undefined,
    });
    const none = new Set<string>();
    expect(mustBeMarkedReadOnly(tool('GetClass', 'x'), none)).toBe(true);
    expect(mustBeMarkedReadOnly(tool('Getaway', 'x'), none)).toBe(false);
    expect(mustBeMarkedReadOnly(tool('UpdateClass', 'x'), none)).toBe(false);
    expect(
      mustBeMarkedReadOnly(tool('GetBackgroundRun', '[runtime] x'), none),
    ).toBe(true);
    expect(mustBeMarkedReadOnly(tool('DebugGetStack', 'x'), none)).toBe(true);
    expect(mustBeMarkedReadOnly(tool('MemorySnapshotList', 'x'), none)).toBe(
      true,
    );
    expect(mustBeMarkedReadOnly(tool('DebugWait', 'x'), none)).toBe(true);
    expect(mustBeMarkedReadOnly(tool('DebugSetBreakpoints', 'x'), none)).toBe(
      false,
    );
    expect(mustBeMarkedReadOnly(tool('DebugStep', 'x'), none)).toBe(false);
    expect(
      mustBeMarkedReadOnly(
        tool('RuntimeRunClass', 'x'),
        new Set(['RuntimeRunClass']),
      ),
    ).toBe(false);
    expect(
      mustBeMarkedReadOnly(
        tool('HandlerDumpList', 'x'),
        new Set(['HandlerDumpList']),
      ),
    ).toBe(true);
    expect(
      mustBeMarkedReadOnly(
        tool('BatchAnswers', 'x'),
        new Set(['BatchAnswers']),
      ),
    ).toBe(false);
  });

  it.each(SETS.map(([kind]) => kind))(
    'every served tool of %s states only what it does, its parameters and its result',
    async (kind) => {
      const tools = await everyServed(kind);
      const names = new Set(tools.map((tool) => tool.name));
      const readOnly = new Set(
        (await everyServed(READ_ONLY_OF[kind])).map((tool) => tool.name),
      );
      const negations: string[] = [];
      const otherTools: string[] = [];
      const unmarked: string[] = [];
      const vague: string[] = [];
      const firstSentences = new Map<string, string[]>();
      const add = (list: string[], finding: string) => {
        if (!list.includes(finding)) list.push(finding);
      };
      for (const tool of tools) {
        for (const word of new Set(wordsOf(tool.description))) {
          if (isNegation(word)) add(negations, `${tool.name}: "${word}"`);
        }
        for (const identifier of new Set(identifiersOf(tool.description))) {
          if (identifier !== tool.name && names.has(identifier)) {
            add(otherTools, `${tool.name}: ${identifier}`);
          }
        }
        if (
          mustBeMarkedReadOnly(tool, readOnly) &&
          !tool.description.startsWith('[read-only]')
        ) {
          add(unmarked, tool.name);
        }
        const first = firstSentence(tool.description);
        const lower = ` ${first.toLowerCase()}`;
        for (const subject of VAGUE_SUBJECTS) {
          if (
            lower.includes(` ${subject} `) ||
            lower.includes(` ${subject}:`)
          ) {
            add(vague, `${tool.name}: "${subject}"`);
          }
        }
        const sharing = firstSentences.get(first.toLowerCase()) ?? [];
        if (!sharing.includes(tool.name)) sharing.push(tool.name);
        firstSentences.set(first.toLowerCase(), sharing);
      }
      const shared = [...firstSentences.entries()]
        .filter(([, sharing]) => sharing.length > 1)
        .map(([sentence, sharing]) => `${sharing.join(', ')}: "${sentence}"`);
      expect(tools.length).toBeGreaterThan(10);
      expect({
        set: kind,
        negations,
        otherTools,
        unmarked,
        vague,
        shared,
      }).toEqual({
        set: kind,
        negations: [],
        otherTools: [],
        unmarked: [],
        vague: [],
        shared: [],
      });
    },
  );
});
