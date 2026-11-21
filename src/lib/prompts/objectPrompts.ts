/**
 * The object prompts `create`, `get`, `delete`, `activate` and `check`: each
 * serves the types its rows' tools are listed for, on the server's kind and
 * after its deny list, and answers the calls of the row it serves the type by.
 */
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import * as z from 'zod';
import { EMPTIED_INCLUDE_TYPES } from '../compact/compactSchemas.js';
import type { JsonValue } from '../json.js';
import { completeFrom } from './completion.js';
import { jsonLiteral } from './instruction.js';
import {
  COMPACT_ROWS,
  type CompactRow,
  FULL_ROWS,
  type FullRow,
  LOCKED_AS,
  PROMPT_OBJECT_TYPES,
  type PromptObjectType,
  READ_PART,
} from './objectRows.js';
import { notServedWords, promptRefusal, requiredWords } from './refusals.js';
import { matchServed, requiredArgument } from './served.js';
import { hasProperty, longToolStep, membersOn, toolStep } from './source.js';
import type {
  AbapPrompt,
  ArgumentValue,
  ListedPromptTool,
  ObjectOperation,
  PromptArgumentsSchema,
  PromptInstruction,
  PromptSource,
  PromptStep,
} from './types.js';

/** A type served by one row: the tool called and the argument the name fills. */
export type ServedRow =
  | {
      readonly family: 'full';
      readonly type: PromptObjectType;
      readonly tool: ListedPromptTool;
      readonly name: string;
      readonly content: string | undefined;
    }
  | {
      readonly family: 'compact';
      readonly type: PromptObjectType;
      readonly tool: ListedPromptTool;
      readonly name: string;
      readonly content: string | undefined;
      readonly token: string;
    };

/** The arguments a prompt answers for. */
export type PromptArguments = Readonly<Record<string, string | undefined>>;

/** A user value as a step writes it. */
export function userValue(value: JsonValue): ArgumentValue {
  return { from: 'user', value };
}

/** A value an earlier step answers. */
export function stepValue(step: number, field: string): ArgumentValue {
  return { from: 'step', step, field };
}

/** The listed tool named `name`, when it is listed. */
function listed(
  source: PromptSource,
  name: string,
): ListedPromptTool | undefined {
  return source.tools.get(name);
}

/** Whether `tool` is listed and offers `member` on the source's kind. */
export function offers(
  source: PromptSource,
  tool: ListedPromptTool | undefined,
  member: string,
): tool is ListedPromptTool {
  return (
    tool !== undefined &&
    (membersOn(tool, source.kind) ?? []).some((offered) => offered === member)
  );
}

/**
 * The types an operation serves, each with its row: the full row where its
 * tool is listed, else the compact row where its tool offers the type and
 * `alsoNeeds` holds. Ordered by the compact tool's members, then the full
 * set's other types in vocabulary order.
 */
export function servedRows<M extends PromptObjectType>(
  source: PromptSource,
  full: Partial<Record<PromptObjectType, FullRow>>,
  compact: CompactRow<M>,
  alsoNeeds: (type: M) => boolean = () => true,
): readonly ServedRow[] {
  const served = new Map<PromptObjectType, ServedRow>();
  const viaFull = (type: PromptObjectType): ServedRow | undefined => {
    const row = full[type];
    const tool = row === undefined ? undefined : listed(source, row.tool);
    return row === undefined || tool === undefined
      ? undefined
      : { family: 'full', type, tool, name: row.name, content: row.content };
  };
  const compactTool = listed(source, compact.tool);
  for (const member of compact.members) {
    const fullRow = viaFull(member);
    if (fullRow !== undefined) {
      served.set(member, fullRow);
    } else if (offers(source, compactTool, member) && alsoNeeds(member)) {
      served.set(member, {
        family: 'compact',
        type: member,
        tool: compactTool,
        name: compact.name[member],
        content: compact.content?.[member],
        token: compact.token(member),
      });
    }
  }
  for (const type of PROMPT_OBJECT_TYPES) {
    const fullRow = served.has(type) ? undefined : viaFull(type);
    if (fullRow !== undefined) served.set(type, fullRow);
  }
  return [...served.values()];
}

/** The tools of `rows`, with those `alsoCalls` names per row, each once, in row order. */
export function toolsOf(
  rows: readonly ServedRow[],
  alsoCalls: (row: ServedRow) => readonly string[] = () => [],
): string {
  return [
    ...new Set(
      rows.flatMap((row) => [row.tool.definition.name, ...alsoCalls(row)]),
    ),
  ].join(', ');
}

/** The served types by their name in lowercase. */
function byLowercase(
  rows: readonly ServedRow[],
): ReadonlyMap<string, PromptObjectType> {
  return new Map(rows.map(({ type }) => [type.toLowerCase(), type]));
}

const OBJECT_TYPE_WORDS =
  "The object's type; the values are the types this server serves for the operation.";
const NAME_WORDS =
  "The object's name (for a function module, as the type's arguments state).";

/** The prompt arguments every object prompt takes: `object_type`, completed from `served` (lowercase), and `name`. */
export function objectArguments(
  served: readonly string[],
): PromptArgumentsSchema {
  return {
    object_type: completable(z.string().describe(OBJECT_TYPE_WORDS), (typed) =>
      completeFrom(served, typed),
    ),
    name: z.string().describe(NAME_WORDS),
  };
}

/** The served row and the name `args` give, or the refusal of either. */
export function objectOf(
  operation: ObjectOperation,
  rows: readonly ServedRow[],
  args: PromptArguments,
): { readonly row: ServedRow; readonly name: string } {
  const objectType = requiredArgument(args, 'object_type');
  if (objectType === undefined) {
    throw promptRefusal(requiredWords(operation, 'object_type'));
  }
  const type = matchServed(objectType, byLowercase(rows));
  const row = rows.find((served) => served.type === type);
  if (row === undefined) {
    throw promptRefusal(
      notServedWords(
        operation,
        objectType,
        rows.map(({ type }) => type.toLowerCase()),
      ),
    );
  }
  const name = requiredArgument(args, 'name');
  if (name === undefined) throw promptRefusal(requiredWords(operation, 'name'));
  return { row, name };
}

/** The types whose name is their class's: the class includes and the unit tests. */
const CLASS_PARTS: ReadonlySet<PromptObjectType> = new Set([
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'UNIT_TEST',
  'CDS_UNIT_TEST',
]);

/** `<Verb> the <TYPE> "<name>".`, or `… the <TYPE> of "<class>".` for a class part. */
export function headline(
  verb: string,
  type: PromptObjectType,
  name: string,
): string {
  return CLASS_PARTS.has(type)
    ? `${verb} the ${type} of ${jsonLiteral(name)}.`
    : `${verb} the ${type} ${jsonLiteral(name)}.`;
}

/** The compact trailing line: the type and the arguments its member takes. */
export function takesLine(type: PromptObjectType, token: string): string {
  return `${type} takes ${token}; * marks a required argument.`;
}

/** `object_type` and the name, as a compact step opens. */
export function compactNamed(
  row: ServedRow,
  name: string,
): (readonly [string, ArgumentValue])[] {
  return row.family === 'compact'
    ? [
        ['object_type', userValue(row.type)],
        [row.name, userValue(name)],
      ]
    : [[row.name, userValue(name)]];
}

/** The optional arguments `keys` that `args` give and the listed schema of `tool` has. */
export function optionalArguments(
  tool: ListedPromptTool,
  args: PromptArguments,
  keys: readonly string[],
): (readonly [string, ArgumentValue])[] {
  return keys.flatMap((key) => {
    const value = requiredArgument(args, key);
    return value !== undefined && hasProperty(tool, key)
      ? [[key, userValue(value)] as const]
      : [];
  });
}

/** A lock target's listed lock and unlock tools, when both offer it. */
export interface LockTools {
  readonly target: string;
  readonly lock: ListedPromptTool;
  readonly unlock: ListedPromptTool;
}

/** The object a compact write of `type` locks: `LOCKED_AS`'s, else the type itself. */
export const LOCK_TARGETS: ReadonlyMap<string, string> = new Map(
  Object.entries(LOCKED_AS),
);

/** The lock and unlock tools for a write of `type`, when both are listed and offer its lock target. */
export function lockToolsFor(
  source: PromptSource,
  type: PromptObjectType,
): LockTools | undefined {
  const target = LOCK_TARGETS.get(type) ?? type;
  const lock = listed(source, 'HandlerLock');
  const unlock = listed(source, 'HandlerUnlock');
  return offers(source, lock, target) && offers(source, unlock, target)
    ? { target, lock, unlock }
    : undefined;
}

/** The words of a lock step: the object itself, or the one it is written under. */
function lockedWhat(type: PromptObjectType, target: string): string {
  return target === type ? 'it' : `the ${target.toLowerCase()}`;
}

/** Arguments as a step writes them, in order. */
export type StepArguments = readonly (readonly [string, ArgumentValue])[];

/**
 * A write of `type` named `name` under its lock, its steps numbered from
 * `first`: lock, the write `write` builds from the lock handle and the
 * state handle arguments, then unlock after the write whatever it answered.
 * The lock's `state_handle` is kept and passed where every tool declares it.
 */
export function underLock(
  source: PromptSource,
  locks: LockTools,
  type: PromptObjectType,
  name: string,
  write: (handle: StepArguments, state: StepArguments) => PromptStep,
  first: number,
): readonly PromptStep[] {
  const what = lockedWhat(type, locks.target);
  const handle: StepArguments = [
    ['lock_handle', stepValue(first, 'lock_handle')],
  ];
  const state: StepArguments = source.stateHandle
    ? [['state_handle', stepValue(first, 'state_handle')]]
    : [];
  const named: StepArguments = [
    ['object_type', userValue(locks.target)],
    ['object_name', userValue(name)],
  ];
  return [
    toolStep(locks.lock, named, {
      lead: `Lock ${what}`,
      keeps: source.stateHandle
        ? ['lock_handle', 'state_handle']
        : ['lock_handle'],
    }),
    write(handle, state),
    toolStep(locks.unlock, [...named, ...handle, ...state], {
      lead: `Unlock ${what}`,
      finally: first + 1,
    }),
  ];
}

/** The description of an object prompt: its sentence and the tools it asks for. */
function described(
  sentence: string,
  rows: readonly ServedRow[],
  alsoCalls?: (row: ServedRow) => readonly string[],
): string {
  return `${sentence} ${toolsOf(rows, alsoCalls)}.`;
}

/** One object prompt: its served rows, its arguments and its instruction per row. */
export function objectPrompt(
  operation: ObjectOperation,
  sentence: string,
  rows: readonly ServedRow[],
  extra: PromptArgumentsSchema,
  instruction: (
    row: ServedRow,
    name: string,
    args: PromptArguments,
  ) => PromptInstruction,
  alsoCalls?: (row: ServedRow) => readonly string[],
): AbapPrompt | undefined {
  if (rows.length === 0) return undefined;
  return {
    name: operation,
    description: described(sentence, rows, alsoCalls),
    argsSchema: {
      ...objectArguments(rows.map(({ type }) => type.toLowerCase())),
      ...extra,
    },
    instruction: (args) => {
      const { row, name } = objectOf(operation, rows, args);
      return instruction(row, name, args);
    },
  };
}

const PACKAGE_WORDS = 'The package the object is created in.';
const DESCRIPTION_WORDS = "The object's short description.";
export const TRANSPORT_REQUEST_WORDS =
  'The transport request number the change is recorded on.';

/** A one-step instruction: its headline, the call, and the compact row's trailing line. */
function oneCall(
  headlineText: string,
  row: ServedRow,
  step: PromptStep,
): PromptInstruction {
  return {
    headline: headlineText,
    steps: [step],
    notes: row.family === 'compact' ? [takesLine(row.type, row.token)] : [],
  };
}

/** `create`: the type's create call. */
export function createPrompt(source: PromptSource): AbapPrompt | undefined {
  const rows = servedRows(source, FULL_ROWS.create, COMPACT_ROWS.create);
  return objectPrompt(
    'create',
    'Creates an ABAP object of object_type named name in package_name: asks the model to call',
    rows,
    {
      package_name: z.string().optional().describe(PACKAGE_WORDS),
      description: z.string().optional().describe(DESCRIPTION_WORDS),
      transport_request: z
        .string()
        .optional()
        .describe(TRANSPORT_REQUEST_WORDS),
    },
    (row, name, args) =>
      oneCall(
        headline('Create', row.type, name),
        row,
        toolStep(row.tool, [
          ...compactNamed(row, name),
          ...optionalArguments(row.tool, args, [
            'package_name',
            'description',
            'transport_request',
          ]),
        ]),
      ),
  );
}

/** The step reading `type` named `name` with `row`'s tool: the compact read passes its part. */
export function readStep(
  row: ServedRow,
  name: string,
  words: { readonly lead?: string } = {},
): PromptStep {
  if (row.family === 'full') {
    return toolStep(row.tool, compactNamed(row, name), words);
  }
  const part = READ_PART(row.type);
  return longToolStep(
    row.tool,
    [
      ...compactNamed(row, name),
      ...(part === undefined ? [] : [['part', userValue(part)] as const]),
    ],
    words,
  );
}

/** `get`: the type's read. */
export function getPrompt(source: PromptSource): AbapPrompt | undefined {
  const rows = servedRows(source, FULL_ROWS.get, COMPACT_ROWS.get);
  return objectPrompt(
    'get',
    'Reads an ABAP object of object_type named name: asks the model to call',
    rows,
    {},
    (row, name) =>
      oneCall(headline('Get', row.type, name), row, readStep(row, name)),
  );
}

/** The types a compact delete writes empty under their class's lock. */
const EMPTIED: ReadonlySet<string> = new Set(EMPTIED_INCLUDE_TYPES);

/** Whether a compact delete of `type` writes an include empty under its class's lock. */
function deletedUnderLock(type: PromptObjectType): boolean {
  return EMPTIED.has(type);
}

/** `delete`: the type's deletion; a class include's under the class's lock. */
export function deletePrompt(source: PromptSource): AbapPrompt | undefined {
  const rows = servedRows(
    source,
    FULL_ROWS.delete,
    COMPACT_ROWS.delete,
    (member) =>
      !deletedUnderLock(member) || lockToolsFor(source, member) !== undefined,
  );
  return objectPrompt(
    'delete',
    'Deletes an ABAP object of object_type named name: asks the model to call',
    rows,
    {
      transport_request: z
        .string()
        .optional()
        .describe(TRANSPORT_REQUEST_WORDS),
    },
    (row, name, args) => {
      const text = headline('Delete', row.type, name);
      const optional = optionalArguments(row.tool, args, ['transport_request']);
      const locks =
        row.family === 'compact' && deletedUnderLock(row.type)
          ? lockToolsFor(source, row.type)
          : undefined;
      if (row.family === 'compact' && locks !== undefined) {
        return {
          headline: text,
          steps: underLock(
            source,
            locks,
            row.type,
            name,
            (handle, state) =>
              toolStep(row.tool, [
                ...compactNamed(row, name),
                ...handle,
                ...optional,
                ...state,
              ]),
            1,
          ),
          notes: [takesLine(row.type, row.token)],
        };
      }
      return oneCall(
        text,
        row,
        toolStep(row.tool, [...compactNamed(row, name), ...optional]),
      );
    },
    (row) =>
      row.family === 'compact' && deletedUnderLock(row.type)
        ? ['HandlerLock', 'HandlerUnlock']
        : [],
  );
}

/**
 * The compact activation's trailing line: a member the type alone names
 * takes the single form's arguments; a function module its own token.
 */
function activationLine(type: PromptObjectType, token: string): string {
  return token === type
    ? `${type} takes object_type* and object_name*; * marks a required argument.`
    : takesLine(type, token);
}

/** `activate`: the type's activation. */
export function activatePrompt(source: PromptSource): AbapPrompt | undefined {
  const rows = servedRows(source, FULL_ROWS.activate, COMPACT_ROWS.activate);
  return objectPrompt(
    'activate',
    'Activates an ABAP object of object_type named name: asks the model to call',
    rows,
    {},
    (row, name) => ({
      headline: headline('Activate', row.type, name),
      steps: [toolStep(row.tool, compactNamed(row, name))],
      notes:
        row.family === 'compact' ? [activationLine(row.type, row.token)] : [],
    }),
  );
}

/** `check`: the type's syntax check. */
export function checkPrompt(source: PromptSource): AbapPrompt | undefined {
  const rows = servedRows(source, FULL_ROWS.check, COMPACT_ROWS.check);
  return objectPrompt(
    'check',
    'Runs a syntax check of an ABAP object of object_type named name: asks the model to call',
    rows,
    {},
    (row, name) =>
      oneCall(
        headline('Check', row.type, name),
        row,
        toolStep(row.tool, compactNamed(row, name)),
      ),
  );
}
