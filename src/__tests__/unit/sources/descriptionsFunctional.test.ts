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
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * The tools that change a repository object (source, metadata, transports):
 * they create, update, delete, activate, lock or unlock, move, add, remove or
 * sort. They are named by that verb first, with no family prefix, or listed in
 * `CHANGING_BY_NAME`. Every other tool changes no repository object — the
 * meaning of the `-ro` binaries — and carries `[read-only]`: a read, a run of
 * code, a trace schedule, a debug session's step, a session's logoff, a
 * batch's start, send and answers. An ABAP Unit run (`STARTS_A_TEST_RUN`)
 * carries no marker: the tests it executes can change data in the system.
 */
const CHANGING_VERBS = [
  'Create',
  'Update',
  'Delete',
  'Activate',
  'Lock',
  'Unlock',
  'Move',
  'Add',
  'Remove',
  'Sort',
  'Write',
];

/** The compact tools that change a repository object, named by a prefix and a verb. */
const CHANGING_BY_NAME: ReadonlySet<string> = new Set([
  'HandlerCreate',
  'HandlerUpdate',
  'HandlerDelete',
  'HandlerActivate',
  'HandlerLock',
  'HandlerUnlock',
  'HandlerTransportCreate',
  'HandlerTransportSortAndCompress',
  'HandlerTransportMoveObjects',
]);

/**
 * The tools that start an ABAP Unit run: the tests they execute can change
 * data in the system, so they are not read-only. The tools that read a run's
 * status or result keep the marker.
 */
const STARTS_A_TEST_RUN: ReadonlySet<string> = new Set([
  'RunUnitTest',
  'RunCdsUnitTest',
  'RunProgramUnitTest',
  'RunFunctionGroupUnitTest',
  'RunFunctionModuleUnitTest',
  'RunAbapUnit',
  'HandlerUnitTestRun',
]);

/** Whether `name` begins with the word `word`: the next letter, if any, starts a new word. */
function startsWithWord(name: string, word: string): boolean {
  if (!name.startsWith(word)) return false;
  const next = name.charAt(word.length);
  return next === '' || next === next.toUpperCase();
}

/** Whether the tool named `name` changes a repository object. */
function changesRepositoryObject(name: string): boolean {
  return (
    CHANGING_BY_NAME.has(name) ||
    CHANGING_VERBS.some((verb) => startsWithWord(name, verb))
  );
}

/** Whether the tool named `name` must carry `[read-only]`. */
function readOnlyByName(name: string): boolean {
  return !changesRepositoryObject(name) && !STARTS_A_TEST_RUN.has(name);
}

/** Whether `tool` changes no repository object and starts no test run, and so must carry `[read-only]` (beside its `[runtime]`, `[debug]` or `[session]` marker). */
function mustBeMarkedReadOnly(tool: ServedTool): boolean {
  return readOnlyByName(tool.name);
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
    const marked = (name: string) => mustBeMarkedReadOnly(tool(name, 'x'));
    for (const name of [
      'GetClass',
      'GetBackgroundRun',
      'DebugGetStack',
      'MemorySnapshotList',
      'DebugWait',
      'DebugStep',
      'DebugSetBreakpoints',
      'DebugCreateWatchpoint',
      'DebugDeleteBreakpoint',
      'HandlerDebugStep',
      'RuntimeRunClass',
      'RuntimeCreateProfilerTraceParameters',
      'RunATC',
      'GetUnitTestStatus',
      'DiscardBackgroundRun',
      'LogoffLeftoverSession',
      'BatchBegin',
      'BatchAnswers',
      'HandlerBatch',
      'HandlerDumpList',
      'HandlerProfileSchedule',
      'Getaway',
    ]) {
      expect([name, marked(name)]).toEqual([name, true]);
    }
    for (const name of [
      'UpdateClass',
      'CreateClass',
      'DeleteClass',
      'ActivateClass',
      'MoveTransportObjects',
      'RemoveTransportObject',
      'HandlerUpdate',
      'HandlerLock',
      'HandlerTransportCreate',
      'RunUnitTest',
      'RunAbapUnit',
      'HandlerUnitTestRun',
    ]) {
      expect([name, marked(name)]).toEqual([name, false]);
    }
  });

  it.each(SETS.map(([kind]) => kind))(
    'every served tool of %s states only what it does, its parameters and its result',
    async (kind) => {
      const tools = await everyServed(kind);
      const names = new Set(tools.map((tool) => tool.name));
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
          mustBeMarkedReadOnly(tool) !==
          tool.description.startsWith('[read-only]')
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

/** The handler files that declare a tool, a set serving it or not (the low ones aside). */
function handlerFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    // The low handlers are internals of compact and high, listed by no set.
    if (entry.isDirectory()) {
      if (entry.name !== 'low') files.push(...handlerFiles(path));
    } else if (entry.name.startsWith('handle') && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('every declared tool carries [read-only] when it changes no repository object and starts no test run', () => {
  it('holds for each TOOL_DEFINITION under src/handlers, the unserved ones too', () => {
    const wrong: string[] = [];
    let seen = 0;
    for (const file of handlerFiles(join(__dirname, '../../../handlers'))) {
      const module = require(file) as {
        TOOL_DEFINITION?: { name?: unknown; description?: unknown };
      };
      const definition = module.TOOL_DEFINITION;
      if (
        typeof definition?.name !== 'string' ||
        typeof definition.description !== 'string'
      ) {
        continue;
      }
      seen += 1;
      const marked = readOnlyByName(definition.name);
      if (marked !== definition.description.startsWith('[read-only]')) {
        wrong.push(definition.name);
      }
    }
    expect(seen).toBeGreaterThan(100);
    expect(wrong).toEqual([]);
  });
});
