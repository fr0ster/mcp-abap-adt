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
import {
  functionGroupArgument,
  functionGroupTakers,
  nameArguments,
  type ObjectName,
  objectNameOf,
} from './functionModule.js';
import { jsonLiteral } from './instruction.js';
import {
  COMPACT_ROWS,
  type CompactRow,
  FULL_ROWS,
  type FullRow,
  lockTargetOf,
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

/** `type`'s full row, where its tool is listed. */
function fullRowOf(
  source: PromptSource,
  full: Partial<Record<PromptObjectType, FullRow>>,
  type: PromptObjectType,
): ServedRow | undefined {
  const row = full[type];
  const tool = row === undefined ? undefined : listed(source, row.tool);
  return row === undefined || tool === undefined
    ? undefined
    : { family: 'full', type, tool, name: row.name, content: row.content };
}

/** `member`'s compact row, where its tool offers it and `alsoNeeds` holds. */
function compactRowOf<M extends PromptObjectType>(
  source: PromptSource,
  compact: CompactRow<M>,
  member: M,
  alsoNeeds: (type: M) => boolean,
): ServedRow | undefined {
  const tool = listed(source, compact.tool);
  return offers(source, tool, member) && alsoNeeds(member)
    ? {
        family: 'compact',
        type: member,
        tool,
        name: compact.name[member],
        content: compact.content?.[member],
        token: compact.token(member),
      }
    : undefined;
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
  for (const member of compact.members) {
    const row =
      fullRowOf(source, full, member) ??
      compactRowOf(source, compact, member, alsoNeeds);
    if (row !== undefined) served.set(member, row);
  }
  for (const type of PROMPT_OBJECT_TYPES) {
    const row = served.has(type) ? undefined : fullRowOf(source, full, type);
    if (row !== undefined) served.set(type, row);
  }
  return [...served.values()];
}

/**
 * The rows of one family alone: every full row whose tool is listed, or
 * every compact row its tool offers — so a step of one family finds a row
 * of its own family where both are listed.
 */
export function familyRows<M extends PromptObjectType>(
  source: PromptSource,
  full: Partial<Record<PromptObjectType, FullRow>>,
  compact: CompactRow<M>,
  family: ServedRow['family'],
): readonly ServedRow[] {
  return family === 'full'
    ? PROMPT_OBJECT_TYPES.flatMap((type) => fullRowOf(source, full, type) ?? [])
    : compact.members.flatMap(
        (member) => compactRowOf(source, compact, member, () => true) ?? [],
      );
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
const NAME_WORDS = "The object's name.";
const FUNCTION_MODULE_NAME_WORDS =
  "The object's name; for a function module, its own name, with its function group in function_group.";

/** The prompt arguments every object prompt takes: `object_type`, completed from `served` (lowercase), and `name`. */
export function objectArguments(
  served: readonly string[],
  takers: readonly string[] = functionGroupTakers(served),
): PromptArgumentsSchema {
  return {
    object_type: completable(z.string().describe(OBJECT_TYPE_WORDS), (typed) =>
      completeFrom(served, typed),
    ),
    name: z
      .string()
      .describe(takers.length === 0 ? NAME_WORDS : FUNCTION_MODULE_NAME_WORDS),
    ...functionGroupArgument(takers),
  };
}

/** The served row and the name `args` give, or the refusal of either. */
export function objectOf(
  operation: ObjectOperation,
  rows: readonly ServedRow[],
  args: PromptArguments,
): { readonly row: ServedRow; readonly named: ObjectName } {
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
  const served = rows.map(({ type }) => type.toLowerCase());
  return {
    row,
    named: objectNameOf(
      operation,
      row.type,
      name,
      args,
      functionGroupTakers(served),
    ),
  };
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

/** `object_type` and the name, as a compact step opens; the name in the form the row's tool takes. */
export function compactNamed(
  row: ServedRow,
  named: ObjectName,
): (readonly [string, ArgumentValue])[] {
  const name = nameArguments(row.tool, row.type, row.name, named);
  return row.family === 'compact'
    ? [['object_type', userValue(row.type)], ...name]
    : [...name];
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

/**
 * The lock and unlock tools for a write of `type`, when listed and offering
 * its lock target: one tool, `HandlerLock`, whose `action` picks the unlock.
 */
export function lockToolsFor(
  source: PromptSource,
  type: PromptObjectType,
): LockTools | undefined {
  const target = lockTargetOf(type);
  const lock = listed(source, 'HandlerLock');
  return offers(source, lock, target)
    ? { target, lock, unlock: lock }
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
  named: ObjectName,
  write: (handle: StepArguments, state: StepArguments) => PromptStep,
  first: number,
): readonly PromptStep[] {
  const what = lockedWhat(type, locks.target);
  const handle: StepArguments = [
    ['lock_handle', stepValue(first, 'lock_handle')],
  ];
  // A service binding open in an editing session answers an empty
  // lock_handle alone (HandlerLock keeps no lock for it), so its
  // state_handle is carried when the lock answers one.
  const emptyHandle = locks.target === 'SERVICE_BINDING';
  const state: StepArguments = !source.stateHandle
    ? []
    : emptyHandle
      ? [
          [
            'state_handle',
            {
              from: 'model',
              writes: `the state_handle step ${first} answered, when it answered one`,
            },
          ],
        ]
      : [['state_handle', stepValue(first, 'state_handle')]];
  const lockNamed: StepArguments = [
    ['object_type', userValue(locks.target)],
    ...nameArguments(locks.lock, locks.target, 'object_name', named),
  ];
  const unlockNamed: StepArguments = [
    ['action', userValue('unlock')],
    ['object_type', userValue(locks.target)],
    ...nameArguments(locks.unlock, locks.target, 'object_name', named),
  ];
  return [
    toolStep(locks.lock, lockNamed, {
      lead: `Lock ${what}`,
      keeps:
        source.stateHandle && !emptyHandle
          ? ['lock_handle', 'state_handle']
          : ['lock_handle'],
      ...(emptyHandle && {
        note: 'A binding open in an editing session answers an empty lock_handle alone: the write and the unlock take that empty lock_handle.',
      }),
    }),
    write(handle, state),
    toolStep(locks.unlock, [...unlockNamed, ...handle, ...state], {
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
    named: ObjectName,
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
      const { row, named } = objectOf(operation, rows, args);
      return instruction(row, named, args);
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

/**
 * The package a create puts the object in: `package_name`, and for a
 * package, whose own name is its `package_name`, its parent `super_package`.
 */
function parentArgument(row: ServedRow, args: PromptArguments): StepArguments {
  const parent = requiredArgument(args, 'package_name');
  const key = row.type === 'PACKAGE' ? 'super_package' : 'package_name';
  return parent !== undefined && hasProperty(row.tool, key)
    ? [[key, userValue(parent)]]
    : [];
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
    (row, named, args) =>
      oneCall(
        headline('Create', row.type, named.name),
        row,
        toolStep(row.tool, [
          ...compactNamed(row, named),
          ...parentArgument(row, args),
          ...optionalArguments(row.tool, args, [
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
  named: ObjectName,
  words: { readonly lead?: string } = {},
): PromptStep {
  if (row.family === 'full') {
    return toolStep(row.tool, compactNamed(row, named), words);
  }
  const part = READ_PART(row.type);
  return longToolStep(
    row.tool,
    [
      ...compactNamed(row, named),
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
    (row, named) =>
      oneCall(headline('Get', row.type, named.name), row, readStep(row, named)),
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
    (row, named, args) => {
      const text = headline('Delete', row.type, named.name);
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
            named,
            (handle, state) =>
              toolStep(row.tool, [
                ...compactNamed(row, named),
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
        toolStep(row.tool, [...compactNamed(row, named), ...optional]),
      );
    },
    (row) =>
      row.family === 'compact' && deletedUnderLock(row.type)
        ? ['HandlerLock']
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
    (row, named) => ({
      headline: headline('Activate', row.type, named.name),
      steps: [toolStep(row.tool, compactNamed(row, named))],
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
    (row, named) =>
      oneCall(
        headline('Check', row.type, named.name),
        row,
        toolStep(row.tool, compactNamed(row, named)),
      ),
  );
}
