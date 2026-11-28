/**
 * Test 14: every call a prompt generates parses against its tool's listed
 * schema. For each binary's set, on `onprem`, `cloud` and no kind, with and
 * without a background-run strategy, and with `state_handle` on Streamable
 * HTTP, each prompt is asked for every value it serves; each step of its
 * instruction gets its arguments from the step data — a transport entry read
 * answers the fixture `ENTRY_FIXTURE` — and what is still to fill from the
 * listed schema (`placeholderFor`). The call then parses with the listed
 * schema, rules included.
 *
 * Beside the parse: a long tool's step passes `background: false` exactly when
 * its listed schema has `background`; a step sending transport entries carries
 * the fixture's fields under their sent names; and each binary serves the
 * counts of spec §6 per prompt and kind (no kind: the `onprem` counts).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import * as z from 'zod';
import { InMemoryBackgroundRuns } from '../../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ReadTransportEntry } from '../../../handlers/transport/readonly/handleReadTransportObjects';
import type {
  IHandlersRegistry,
  SapEnvironment,
} from '../../../lib/handlers/interfaces';
import type { JsonValue } from '../../../lib/json';
import { LONG_TOOLS } from '../../../lib/longTools';
import type {
  AbapPrompt,
  PromptName,
  PromptSource,
  PromptStep,
} from '../../../lib/prompts/types';
import type { AbapSystemKind } from '../../../lib/systemKind';
import { registryOf, type ToolSetKind } from '../../../lib/toolSet';
import {
  closedArgumentOf,
  promptArguments,
} from '../../helpers/promptArguments';
import { completionOf } from '../../helpers/promptCalls';
import { KINDS, TRANSPORTS, toolSets } from '../../helpers/servedTools';

type JsonSchema = z.core.JSONSchema.JSONSchema;
type JsonSchemaOrBoolean = z.core.JSONSchema._JSONSchema;

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** The one transport entry every entry read answers. */
const ENTRY = {
  pgmid: 'LIMU',
  type: 'METH',
  name: 'ZCL_X=>M',
  position: '000001',
} satisfies ReadTransportEntry;

/** The answer of an entry read: `ReadTransportObjects`' terse answer. */
const ENTRY_FIXTURE = { objects: [ENTRY] };

/** The fixture entry's fields, read by a step value's field name. */
const ENTRY_BY_FIELD: ReadonlyMap<string, string> = new Map(
  Object.entries(ENTRY),
);

/** What a step sending a transport entry sends, each field under its sent name. */
const SENT_FIXTURE: Readonly<Record<string, string>> = {
  object_name: 'ZCL_X=>M',
  object_type: 'METH',
  position: '000001',
  pgmid: 'LIMU',
};

/** A value with no earlier-step source in the fixture. */
const STAND_IN = 'X1';

/** Spec §6, re-measured 2026-11-20: the served values per prompt, per family and kind. */
const SERVED_COUNTS: Readonly<
  Record<
    ToolSetKind,
    Readonly<Record<AbapSystemKind, Partial<Record<PromptName, number>>>>
  >
> = {
  core: {
    onprem: {
      create: 20,
      get: 22,
      update: 24,
      delete: 24,
      activate: 16,
      check: 14,
      unit_test: 6,
      where_used: 18,
      transport: 10,
    },
    cloud: {
      create: 18,
      get: 22,
      update: 22,
      delete: 22,
      activate: 14,
      check: 14,
      unit_test: 6,
      where_used: 18,
      transport: 10,
    },
  },
  'core-ro': {
    onprem: { get: 22, check: 14, where_used: 18, transport: 4 },
    cloud: { get: 22, check: 14, where_used: 18, transport: 4 },
  },
  compact: {
    onprem: {
      create: 18,
      get: 22,
      update: 24,
      delete: 24,
      activate: 18,
      check: 14,
      unit_test: 6,
      where_used: 18,
      transport: 6,
    },
    cloud: {
      create: 16,
      get: 22,
      update: 22,
      delete: 22,
      activate: 16,
      check: 14,
      unit_test: 6,
      where_used: 18,
      transport: 6,
    },
  },
  'compact-ro': {
    onprem: { get: 22, check: 14, where_used: 18, transport: 3 },
    cloud: { get: 22, check: 14, where_used: 18, transport: 3 },
  },
};

/** How a test server is built. */
interface ServerOptions {
  readonly systemType: SapEnvironment | undefined;
  readonly backgroundRuns: boolean;
  readonly stateHandleArgument: boolean;
}

/** A server registering `registry` as every binary does, reading back its prompts. */
class PromptServer extends BaseMcpServer {
  constructor(registry: IHandlersRegistry, options: ServerOptions) {
    super({
      name: 'prompt-calls-parse',
      logger: silent,
      systemType: options.systemType,
      systemTypeFromEnvironment: false,
      stateHandleArgument: options.stateHandleArgument,
      ...(options.backgroundRuns && {
        backgroundRuns: new InMemoryBackgroundRuns(),
      }),
    });
    this.registerHandlers(registry);
  }

  get source(): PromptSource | undefined {
    return this.promptSource;
  }

  get prompts(): readonly AbapPrompt[] {
    return this.listedPrompts;
  }
}

/** The input JSON schema of a listed schema, as a caller reads it. */
const inputJson = (schema: z.ZodObject): JsonSchema =>
  z.toJSONSchema(schema, { io: 'input' });

/**
 * A value `property` accepts, read from its JSON schema; throws, naming
 * `where`, for a property it cannot fill.
 */
function placeholderFor(
  property: JsonSchemaOrBoolean | undefined,
  where: string,
): JsonValue {
  if (property === undefined || typeof property === 'boolean') {
    throw new Error(`${where}: no schema to fill it from`);
  }
  const [first] = property.enum ?? [];
  if (first !== undefined) return first;
  if (property.const !== undefined) return property.const;
  const [branch] = property.anyOf ?? property.oneOf ?? [];
  if (branch !== undefined) return placeholderFor(branch, where);
  switch (property.type) {
    case 'string':
      return STAND_IN.padEnd(property.minLength ?? 0, 'X');
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return property.minimum ?? 1;
    case 'array': {
      const items = property.items;
      if (Array.isArray(items)) {
        throw new Error(`${where}: a tuple of items is not filled`);
      }
      const one = placeholderFor(items, `${where}[]`);
      return Array.from({ length: Math.max(1, property.minItems ?? 1) }, () =>
        structuredClone(one),
      );
    }
    case 'object': {
      const filled: Record<string, JsonValue> = {};
      for (const name of property.required ?? []) {
        filled[name] = placeholderFor(
          property.properties?.[name],
          `${where}.${name}`,
        );
      }
      return filled;
    }
    default:
      throw new Error(`${where}: no rule fills this schema`);
  }
}

/** Whether `step` reads transport entries, so it answers `ENTRY_FIXTURE`. */
function readsEntries(step: PromptStep): boolean {
  if (step.tool === 'ReadTransportObjects') return true;
  return (
    step.tool === 'HandlerGet' &&
    step.arguments.some(
      ([name, value]) =>
        name === 'object_type' &&
        value.from === 'user' &&
        value.value === 'TRANSPORT',
    )
  );
}

/** The arguments of `prompt` for `value` of its closed argument. */
/** The object prompts, asked a second time with every optional argument given. */
const OBJECT_PROMPTS: ReadonlySet<string> = new Set([
  'create',
  'get',
  'update',
  'delete',
  'activate',
  'check',
]);

/**
 * The arguments of `prompt` for `value` with every optional argument it
 * declares given too (an object prompt; `function_group` only for a function
 * module, the type it names), so an optional value the steps send is parsed
 * as well.
 */
async function everyArgumentFor(
  prompt: AbapPrompt,
  value: string,
): Promise<Record<string, string>> {
  const args = await argumentsFor(prompt, value);
  for (const name of Object.keys(prompt.argsSchema)) {
    if (name === 'function_group' || Object.hasOwn(args, name)) continue;
    args[name] = `SOME_${name.toUpperCase()}`;
  }
  return args;
}

async function argumentsFor(
  prompt: AbapPrompt,
  value: string,
): Promise<Record<string, string>> {
  const required = Object.entries(prompt.argsSchema)
    .filter(([, schema]) => !schema.safeParse(undefined).success)
    .map(([name]) => name);
  const args = promptArguments(prompt.name, value, required);
  if (prompt.name === 'where_used' && value === 'text_elements') {
    const [container] = await completionOf(prompt, 'container');
    assert.ok(container, 'where_used completes container');
    args.container = container;
  }
  if (value === 'function_module' && prompt.name !== 'unit_test') {
    // A function module is named by its bare name and its function group;
    // each step builds the form its tool takes. A unit run names the module
    // alone and declares no function group.
    assert.ok(
      prompt.argsSchema.function_group,
      `${prompt.name} takes function_group`,
    );
    args.function_group = 'SOME_GROUP';
  }
  if (prompt.name === 'unit_test' && value === 'package') {
    // Ruling C8: a package's run without the flag lists it still to fill,
    // inside `target`; the flag given, the call is complete.
    args.include_subpackages = 'false';
  }
  return args;
}

/** What one instruction's calls got wrong, one line each. */
function problemsOf(
  source: PromptSource,
  key: string,
  steps: readonly PromptStep[],
): string[] {
  const problems: string[] = [];
  const answers = new Map<number, typeof ENTRY_FIXTURE>();
  steps.forEach((step, index) => {
    const n = index + 1;
    const where = `${key} step ${n} (${step.tool})`;
    const tool = source.tools.get(step.tool);
    if (tool === undefined) {
      problems.push(`${where}: the tool is not listed`);
      return;
    }
    // The argument list as the text renders it: `args` below keeps the last
    // of two values under one key, so a duplicate is read here.
    const names = step.arguments.map(([name]) => name);
    const repeated = names.filter((name, at) => names.indexOf(name) !== at);
    if (repeated.length > 0) {
      problems.push(`${where}: ${repeated.join(', ')} is given twice`);
    }
    const args: Record<string, JsonValue> = {};
    let sendsEntry = false;
    const sent: Record<string, JsonValue>[] = [];
    for (const [name, value] of step.arguments) {
      switch (value.from) {
        case 'user':
          args[name] = value.value;
          break;
        case 'model':
          args[name] = STAND_IN;
          break;
        case 'step': {
          if (value.step >= n) {
            problems.push(
              `${where}: ${name} reads the later step ${value.step}`,
            );
          }
          if (answers.has(value.step)) {
            const field = ENTRY_BY_FIELD.get(value.field);
            if (field === undefined) {
              problems.push(
                `${where}: ${name} reads no entry field (${value.field})`,
              );
              break;
            }
            args[name] = field;
            sendsEntry = true;
          } else {
            args[name] = STAND_IN;
          }
          break;
        }
        case 'entries': {
          if (!answers.has(value.step)) {
            problems.push(
              `${where}: ${name} reads step ${value.step}, which reads no entries`,
            );
            break;
          }
          const entries = [ENTRY].map((entry) => {
            const one: Record<string, JsonValue> = {};
            for (const [sentName, read] of value.fields) {
              one[sentName] = entry[read];
            }
            return one;
          });
          sent.push(...entries);
          args[name] = entries;
          break;
        }
      }
    }
    if (sendsEntry) sent.push({ ...args });
    for (const entry of sent) {
      const carried = Object.fromEntries(
        Object.keys(SENT_FIXTURE).map((name) => [name, entry[name]]),
      );
      if (!isDeepStrictEqual(carried, SENT_FIXTURE)) {
        problems.push(
          `${where}: the sent entry carries ${JSON.stringify(carried)}, not ${JSON.stringify(SENT_FIXTURE)}`,
        );
      }
    }
    if (readsEntries(step)) answers.set(n, ENTRY_FIXTURE);

    const json = inputJson(tool.inputSchema);
    for (const { name } of step.stillToFill) {
      try {
        args[name] = placeholderFor(
          json.properties?.[name],
          `${step.tool} ${name}`,
        );
      } catch (error) {
        problems.push(
          `${where}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const name of json.required ?? []) {
      if (!Object.hasOwn(args, name)) {
        problems.push(
          `${where}: the required ${name} is absent after the fill`,
        );
      }
    }
    if (LONG_TOOLS.includes(step.tool)) {
      const listedBackground = Object.hasOwn(
        tool.inputSchema.shape,
        'background',
      );
      const passed = args.background === false;
      if (listedBackground !== passed) {
        problems.push(
          `${where}: background: false ${passed ? 'passed' : 'missing'}, the listed schema ${listedBackground ? 'has' : 'has no'} background`,
        );
      }
    }
    // A plain `z.object` strips a key it does not declare, so the parse
    // alone passes an argument the tool does not take.
    const unlisted = Object.keys(args).filter(
      (name) => !Object.hasOwn(tool.inputSchema.shape, name),
    );
    if (unlisted.length > 0) {
      problems.push(
        `${where}: ${unlisted.join(', ')} is no property of the listed schema`,
      );
    }
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      problems.push(
        `${where}: ${JSON.stringify(args)} does not parse: ${JSON.stringify(parsed.error.issues)}`,
      );
    }
  });
  return problems;
}

const SYSTEM_TYPES: readonly (AbapSystemKind | undefined)[] = [
  'onprem',
  'cloud',
  undefined,
];

describe('every generated call parses against its tool’s listed schema (test 14)', () => {
  for (const transport of TRANSPORTS) {
    for (const kind of KINDS) {
      for (const systemType of SYSTEM_TYPES) {
        for (const backgroundRuns of [true, false]) {
          const label = `${transport} ${kind} on ${systemType ?? 'no kind'}, background runs ${backgroundRuns ? 'on' : 'off'}`;
          it(label, async () => {
            const server = new PromptServer(
              registryOf(toolSets[transport][kind], transport, {
                dataTools: false,
              }),
              {
                systemType,
                backgroundRuns,
                stateHandleArgument: transport === 'http',
              },
            );
            const source = server.source;
            assert.ok(source, 'the server lists prompts');
            const counts: Partial<Record<PromptName, number>> = {};
            const problems: string[] = [];
            let calls = 0;
            for (const prompt of server.prompts) {
              const values = await completionOf(
                prompt,
                closedArgumentOf(prompt.name),
              );
              counts[prompt.name] = values.length;
              for (const value of values) {
                const key = `${prompt.name} ${value}`;
                const instruction = prompt.instruction(
                  await argumentsFor(prompt, value),
                );
                calls += instruction.steps.length;
                problems.push(...problemsOf(source, key, instruction.steps));
                if (OBJECT_PROMPTS.has(prompt.name)) {
                  const given = prompt.instruction(
                    await everyArgumentFor(prompt, value),
                  );
                  problems.push(
                    ...problemsOf(
                      source,
                      `${key} (every argument)`,
                      given.steps,
                    ),
                  );
                }
              }
            }
            assert.deepEqual(problems, []);
            assert.deepEqual(
              counts,
              SERVED_COUNTS[kind][systemType ?? 'onprem'],
              'the served counts of spec §6',
            );
            assert.ok(calls > 0);
          });
        }
      }
    }
  }
});
