/**
 * The transport prompt: one prompt with an action — create a request or a
 * task, list, read, add, remove, move and sort entries — each served by the
 * rows its binary lists. The entries a read answers are sent on through
 * `ENTRY_ARGUMENT`, their `pgmid` carried.
 */
import * as z from 'zod';
import { closedArgument, closedOptionalArgument } from './completion.js';
import { jsonLiteral } from './instruction.js';
import {
  offers,
  type StepArguments,
  stepValue,
  userValue,
} from './objectPrompts.js';
import {
  notServedWords,
  promptRefusal,
  requiredWords,
  transportTakesWords,
} from './refusals.js';
import { lowercaseKeyed, matchServed, requiredArgument } from './served.js';
import { longToolStep, toolStep } from './source.js';
import {
  ENTRY_ARGUMENT,
  OBJECT_DIRECTORY_TYPE,
  SENT_ENTRY,
  TRANSPORT_OBJECT_TYPES,
  type TransportObjectType,
} from './transportEntry.js';
import type {
  AbapPrompt,
  PromptInstruction,
  PromptSource,
  PromptStep,
} from './types.js';

/** The arguments an action may read besides `action`. */
type TransportArgument =
  | 'number'
  | 'description'
  | 'user'
  | 'object_type'
  | 'name'
  | 'target_number';

/** The arguments as given, read and checked. */
interface Given {
  readonly number: string;
  readonly description: string;
  readonly user: string | undefined;
  readonly object: TransportObjectType | undefined;
  readonly name: string;
  readonly target: string;
}

/** An action as one row serves it: its instruction. */
interface ServedAction {
  readonly instruction: (given: Given) => PromptInstruction;
}

/** A row of an action: what it serves on `source`, when its tools are listed. */
type ActionRow = (source: PromptSource) => ServedAction | undefined;

/**
 * An action: the arguments it requires, those it reads besides, its rows in
 * preference order, and what its `number` and `user` name in the words of
 * those arguments.
 */
interface TransportAction {
  readonly takes: readonly TransportArgument[];
  readonly alsoReads: readonly TransportArgument[];
  readonly rows: readonly ActionRow[];
  /** Its `number` names a task. */
  readonly numberIsTask?: true;
  /** Whose user id its `user` is. */
  readonly userIs?: string;
}

/** One call of a tool, when it is listed. */
function oneCall(
  name: string,
  headline: (given: Given) => string,
  args: (given: Given) => StepArguments,
  long = false,
): ActionRow {
  return (source) => {
    const tool = source.tools.get(name);
    if (tool === undefined) return undefined;
    return {
      instruction: (given) => ({
        headline: headline(given),
        steps: [
          long ? longToolStep(tool, args(given)) : toolStep(tool, args(given)),
        ],
        notes: [],
      }),
    };
  };
}

/** A compact tool's call with its member, when its members offer it. */
function memberCall(
  name: string,
  member: string,
  opening: StepArguments,
  headline: (given: Given) => string,
  args: (given: Given) => StepArguments,
  long: boolean,
): ActionRow {
  return (source) => {
    const tool = source.tools.get(name);
    if (!offers(source, tool, member)) return undefined;
    return {
      instruction: (given) => ({
        headline: headline(given),
        steps: [
          long
            ? longToolStep(tool, [...opening, ...args(given)])
            : toolStep(tool, [...opening, ...args(given)]),
        ],
        notes: [],
      }),
    };
  };
}

/** How the read of a task's entries is made on a binary. */
interface EntryRead {
  readonly step: (number: string, note: string | undefined) => PromptStep;
}

/** `ReadTransportObjects`, when it is listed. */
function fullEntryRead(source: PromptSource): EntryRead | undefined {
  const tool = source.tools.get('ReadTransportObjects');
  if (tool === undefined) return undefined;
  return {
    step: (number, note) =>
      toolStep(tool, [['transport_number', userValue(number)]], {
        lead: "Read the task's entries",
        ...(note === undefined ? {} : { note }),
      }),
  };
}

/** `HandlerGet` with `TRANSPORT`, when its members offer it. */
function compactEntryRead(source: PromptSource): EntryRead | undefined {
  const tool = source.tools.get('HandlerGet');
  if (!offers(source, tool, 'TRANSPORT')) return undefined;
  return {
    step: (number, note) =>
      longToolStep(
        tool,
        [
          ['object_type', userValue('TRANSPORT')],
          ['transport_number', userValue(number)],
        ],
        {
          lead: "Read the task's entries",
          ...(note === undefined ? {} : { note }),
        },
      ),
  };
}

const NULL_POSITION =
  'An entry the read answers without a position is named to the user and left out of the call.';

/** The words that pick the entry of `object` named `name` from the read. */
function pickWords(object: TransportObjectType, name: string): string {
  return `Take the entry whose name is ${jsonLiteral(name)}, type ${jsonLiteral(OBJECT_DIRECTORY_TYPE[object])} and pgmid "R3TR".`;
}

/** `the CLASS "<name>"` */
function objectWords(given: Given): string {
  return given.object === undefined
    ? jsonLiteral(given.name)
    : `the ${given.object} ${jsonLiteral(given.name)}`;
}

/** The entries read, then one sent with its four fields from the read. */
function removeRow(source: PromptSource): ServedAction | undefined {
  const read = fullEntryRead(source);
  const remove = source.tools.get('RemoveTransportObject');
  if (read === undefined || remove === undefined) return undefined;
  return {
    instruction: (given) => ({
      headline: `Remove ${objectWords(given)} from the task ${jsonLiteral(given.number)}.`,
      steps: [
        read.step(
          given.number,
          given.object === undefined
            ? undefined
            : pickWords(given.object, given.name),
        ),
        toolStep(
          remove,
          [
            ['transport_number', userValue(given.number)],
            ...SENT_ENTRY.map(
              ([sent, field]) => [sent, stepValue(1, field)] as const,
            ),
          ],
          { note: NULL_POSITION },
        ),
      ],
      notes: [],
    }),
  };
}

/** The entries read, then those chosen moved, each sent with its four fields. */
function moveRow(
  readOf: (source: PromptSource) => EntryRead | undefined,
  moveName: string,
): ActionRow {
  return (source) => {
    const read = readOf(source);
    const move = source.tools.get(moveName);
    if (read === undefined || move === undefined) return undefined;
    return {
      instruction: (given) => {
        const picked = given.object !== undefined;
        return {
          headline: picked
            ? `Move ${objectWords(given)} from the task ${jsonLiteral(given.number)} to the task ${jsonLiteral(given.target)}.`
            : `Move entries of the task ${jsonLiteral(given.number)} to the task ${jsonLiteral(given.target)}.`,
          steps: [
            read.step(
              given.number,
              given.object === undefined
                ? undefined
                : pickWords(given.object, given.name),
            ),
            toolStep(
              move,
              [
                ['transport_number', userValue(given.number)],
                ['target_number', userValue(given.target)],
                [
                  'objects',
                  {
                    from: 'entries',
                    step: 1,
                    writes: 'the entries to move',
                    fields: SENT_ENTRY,
                  },
                ],
              ],
              {
                note: picked
                  ? NULL_POSITION
                  : `The entries to move are chosen with the user. ${NULL_POSITION}`,
              },
            ),
          ],
          notes: [],
        };
      },
    };
  };
}

const numberArgument = (given: Given): StepArguments => [
  ['transport_number', userValue(given.number)],
];
const descriptionArgument = (given: Given): StepArguments => [
  ['description', userValue(given.description)],
];
const userArgument = (given: Given): StepArguments =>
  given.user === undefined ? [] : [['user', userValue(given.user)]];

/** The actions, in the order they are offered (spec §2.5). */
export const TRANSPORT_ACTIONS = {
  create: {
    takes: ['description'],
    alsoReads: [],
    rows: [
      oneCall(
        'CreateTransport',
        () => 'Create a transport request.',
        descriptionArgument,
      ),
      oneCall(
        'HandlerTransportCreate',
        () => 'Create a transport request.',
        descriptionArgument,
      ),
      memberCall(
        'HandlerCreate',
        'TRANSPORT',
        [['object_type', userValue('TRANSPORT')]],
        () => 'Create a transport request.',
        descriptionArgument,
        false,
      ),
    ],
  },
  create_task: {
    takes: ['number', 'user'],
    alsoReads: [],
    userIs: "the task's owner",
    rows: [
      oneCall(
        'CreateTransportTask',
        (given) => `Create a task in the request ${jsonLiteral(given.number)}.`,
        (given) => [
          ['transport_number', userValue(given.number)],
          ['target_user', userValue(given.user ?? '')],
        ],
      ),
    ],
  },
  list: {
    takes: [],
    alsoReads: ['user'],
    userIs: 'whose requests are listed',
    rows: [
      oneCall(
        'ListTransports',
        () => 'List transport requests.',
        userArgument,
        true,
      ),
      memberCall(
        'HandlerSystem',
        'transports',
        [['action', userValue('transports')]],
        () => 'List transport requests.',
        userArgument,
        true,
      ),
    ],
  },
  get: {
    takes: ['number'],
    alsoReads: [],
    rows: [
      oneCall(
        'GetTransport',
        (given) =>
          `Get the transport request or task ${jsonLiteral(given.number)}.`,
        numberArgument,
      ),
      memberCall(
        'HandlerGet',
        'TRANSPORT',
        [
          ['object_type', userValue('TRANSPORT')],
          ['part', userValue('metadata')],
        ],
        (given) =>
          `Get the transport request or task ${jsonLiteral(given.number)}.`,
        numberArgument,
        true,
      ),
    ],
  },
  objects: {
    takes: ['number'],
    alsoReads: [],
    rows: [
      oneCall(
        'ReadTransportObjects',
        (given) =>
          `List the entries of the request or task ${jsonLiteral(given.number)}.`,
        numberArgument,
      ),
      memberCall(
        'HandlerGet',
        'TRANSPORT',
        [['object_type', userValue('TRANSPORT')]],
        (given) =>
          `List the entries of the request or task ${jsonLiteral(given.number)}.`,
        numberArgument,
        true,
      ),
    ],
  },
  log: {
    takes: ['number'],
    alsoReads: [],
    rows: [
      oneCall(
        'ReadTransportActionLog',
        (given) =>
          `Read the action log of the request or task ${jsonLiteral(given.number)}.`,
        numberArgument,
      ),
    ],
  },
  add_object: {
    numberIsTask: true,
    takes: ['number', 'object_type', 'name'],
    alsoReads: [],
    rows: [
      oneCall(
        'AddTransportObject',
        (given) =>
          `Add ${objectWords(given)} to the task ${jsonLiteral(given.number)}.`,
        (given) => [
          ['transport_number', userValue(given.number)],
          [ENTRY_ARGUMENT.name, userValue(given.name)],
          ...(given.object === undefined
            ? []
            : [
                [
                  ENTRY_ARGUMENT.type,
                  userValue(OBJECT_DIRECTORY_TYPE[given.object]),
                ] as const,
              ]),
        ],
      ),
    ],
  },
  remove_object: {
    numberIsTask: true,
    takes: ['number', 'object_type', 'name'],
    alsoReads: [],
    rows: [removeRow],
  },
  move_objects: {
    numberIsTask: true,
    takes: ['number', 'target_number'],
    alsoReads: ['object_type', 'name'],
    rows: [
      moveRow(fullEntryRead, 'MoveTransportObjects'),
      moveRow(compactEntryRead, 'HandlerTransportMoveObjects'),
    ],
  },
  sort_compress: {
    numberIsTask: true,
    takes: ['number'],
    alsoReads: [],
    rows: [
      oneCall(
        'SortAndCompressTransportTask',
        (given) => `Sort and compress the task ${jsonLiteral(given.number)}.`,
        numberArgument,
      ),
      oneCall(
        'HandlerTransportSortAndCompress',
        (given) => `Sort and compress the task ${jsonLiteral(given.number)}.`,
        numberArgument,
      ),
    ],
  },
} as const satisfies Readonly<Record<string, TransportAction>>;

/** An action's name. */
type ActionName = keyof typeof TRANSPORT_ACTIONS;

/** The actions in the order they are offered. */
const ACTION_NAMES: readonly ActionName[] = [
  'create',
  'create_task',
  'list',
  'get',
  'objects',
  'log',
  'add_object',
  'remove_object',
  'move_objects',
  'sort_compress',
];

/** Every argument an action may read, in the order the words name them. */
const ARGUMENTS: readonly TransportArgument[] = [
  'number',
  'description',
  'user',
  'object_type',
  'name',
  'target_number',
];

/** The words of the arguments whose words name no action; `action`'s before its values. */
const WORDS: {
  readonly [A in
    | Exclude<TransportArgument, 'number' | 'user' | 'object_type'>
    | 'action']: string;
} = {
  action: 'What to do with transport requests',
  description: "The new request's description.",
  name: "The object's name.",
  target_number: 'The task the entries move to.',
};

/** `argument`'s words, naming only the served `actions`; `object_type`'s before its values. */
function wordsOf(
  argument: TransportArgument,
  actions: readonly ActionName[],
): string {
  const of = (action: ActionName): TransportAction => TRANSPORT_ACTIONS[action];
  switch (argument) {
    case 'number': {
      const tasks = actions.filter((action) => of(action).numberIsTask);
      const head = 'The number of the request or task the action works on';
      return tasks.length === 0
        ? `${head}.`
        : `${head} (a task for ${tasks.join(', ')}).`;
    }
    case 'user':
      return `An SAP user id: ${actions
        .flatMap((action) => {
          const whose = of(action).userIs;
          return whose === undefined ? [] : [`${whose} (${action})`];
        })
        .join(', or ')}.`;
    case 'object_type':
      return `The object's type (read by ${actions
        .filter((action) => readsOf(action).includes('object_type'))
        .join(', ')})`;
    default:
      return WORDS[argument];
  }
}

/** The served actions of `source`, each with the first row that serves it. */
function servedActions(
  source: PromptSource,
): ReadonlyMap<ActionName, ServedAction> {
  const served = new Map<ActionName, ServedAction>();
  for (const action of ACTION_NAMES) {
    const rows: readonly ActionRow[] = TRANSPORT_ACTIONS[action].rows;
    for (const row of rows) {
      const answer = row(source);
      if (answer !== undefined) {
        served.set(action, answer);
        break;
      }
    }
  }
  return served;
}

/** The arguments `action` reads, required first. */
function readsOf(action: ActionName): readonly TransportArgument[] {
  const { takes, alsoReads } = TRANSPORT_ACTIONS[action];
  return [...takes, ...alsoReads];
}

/**
 * The arguments `action` reads, as given and checked against what it takes;
 * an argument it reads none of is left out.
 */
function givenFor(
  action: ActionName,
  given: Readonly<Record<string, string | undefined>>,
  objectTypes: ReadonlyMap<string, TransportObjectType>,
): Given {
  const reads: readonly TransportArgument[] = readsOf(action);
  const args = Object.fromEntries(
    reads.map((argument) => [argument, given[argument]]),
  );
  const { takes } = TRANSPORT_ACTIONS[action];
  const takenList: readonly TransportArgument[] = takes;
  const objectAndName: readonly TransportArgument[] = ['object_type', 'name'];
  const missing = takenList.some(
    (argument) => requiredArgument(args, argument) === undefined,
  );
  const half =
    action === 'move_objects' &&
    (requiredArgument(args, 'object_type') === undefined) !==
      (requiredArgument(args, 'name') === undefined);
  if (missing) throw promptRefusal(transportTakesWords(action, takenList));
  if (half) throw promptRefusal(transportTakesWords(action, objectAndName));
  const objectType = requiredArgument(args, 'object_type');
  const object =
    objectType === undefined ? undefined : matchServed(objectType, objectTypes);
  if (objectType !== undefined && object === undefined) {
    throw promptRefusal(
      notServedWords('transport', objectType, [...objectTypes.keys()]),
    );
  }
  return {
    number: requiredArgument(args, 'number') ?? '',
    description: requiredArgument(args, 'description') ?? '',
    user: requiredArgument(args, 'user'),
    object,
    name: requiredArgument(args, 'name') ?? '',
    target: requiredArgument(args, 'target_number') ?? '',
  };
}

/** `transport`: work with transport requests by action. */
export function transportPrompt(source: PromptSource): AbapPrompt | undefined {
  const served = servedActions(source);
  if (served.size === 0) return undefined;
  const actions = ACTION_NAMES.filter((action) => served.has(action));
  const actionByName = lowercaseKeyed(actions);
  const objectTypes = new Map(
    TRANSPORT_OBJECT_TYPES.map((type) => [type.toLowerCase(), type]),
  );
  const objectTypeValues = [...objectTypes.keys()];
  const declared = ARGUMENTS.filter((argument) =>
    actions.some((action) => readsOf(action).includes(argument)),
  );
  const readsObjectType = (action: string | undefined): boolean => {
    const named =
      action === undefined
        ? undefined
        : matchServed(action.trim(), actionByName);
    return action === undefined || action.trim() === ''
      ? true
      : named !== undefined && readsOf(named).includes('object_type');
  };
  const schemaOf = (argument: TransportArgument) =>
    argument === 'object_type'
      ? closedOptionalArgument(
          wordsOf('object_type', actions),
          objectTypeValues,
          (given) => readsObjectType(given.action),
        )
      : z.string().optional().describe(wordsOf(argument, actions));
  return {
    name: 'transport',
    description:
      'Works with transport requests and their entries, by the action given.',
    argsSchema: {
      action: closedArgument(WORDS.action, actions),
      ...Object.fromEntries(
        declared.map((argument) => [argument, schemaOf(argument)]),
      ),
    },
    instruction: (args): PromptInstruction => {
      const given = requiredArgument(args, 'action');
      if (given === undefined) {
        throw promptRefusal(requiredWords('transport', 'action'));
      }
      const action = matchServed(given, actionByName);
      const row = action === undefined ? undefined : served.get(action);
      if (action === undefined || row === undefined) {
        throw promptRefusal(
          `transport: action ${jsonLiteral(given)} is not served by this server; it serves ${actions.join(', ')}.`,
        );
      }
      return row.instruction(givenFor(action, args, objectTypes));
    },
  };
}
