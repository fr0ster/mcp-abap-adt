/**
 * A function module through the prompts: every prompt serving it takes
 * `function_group`, and each step names the module in the form its own tool
 * takes — `function_module_name` beside `function_group_name` where the tool
 * has both, `GROUP|MODULE` built from the two values where its name is
 * `object_name`. Without `function_group`, each step that needs it lists it
 * still to fill.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import type { JsonValue } from '../../../lib/json';
import { abapPrompts } from '../../../lib/prompts/prompts';
import { registerPrompts } from '../../../lib/prompts/register';
import type {
  AbapPrompt,
  PromptSource,
  PromptStep,
} from '../../../lib/prompts/types';
import { updatePrompt } from '../../../lib/prompts/updatePrompt';
import type { AbapSystemKind } from '../../../lib/systemKind';
import { fullToolSet, type ToolSet } from '../../../lib/toolSet';
import { promptOf } from '../../helpers/promptCalls';
import { promptSourceFor } from '../../helpers/promptSources';

const FUNCTION_GROUP_WORDS =
  'The function group the function module belongs to.';

function sourceOf(set: ToolSet, kind: AbapSystemKind): PromptSource {
  return promptSourceFor(set, kind, {
    transport: 'stdio',
    backgroundRuns: true,
  });
}

const compactOnprem = sourceOf(compactToolSet, 'onprem');
const coreOnprem = sourceOf(fullToolSet, 'onprem');

/** The user values a step sends, by argument. */
function userArguments(step: PromptStep): Record<string, JsonValue> {
  const values: Record<string, JsonValue> = {};
  for (const [name, value] of step.arguments) {
    if (value.from === 'user') values[name] = value.value;
  }
  return values;
}

/** The prompt `name` of `source`, which must be listed. */
function listed(source: PromptSource, name: string): AbapPrompt {
  const prompt = abapPrompts(source).find((each) => each.name === name);
  assert.ok(prompt, `${name} is listed`);
  return prompt;
}

const MODULE = { object_type: 'function_module', name: 'ZFM' };
const GROUPED = { ...MODULE, function_group: 'ZFG' };

describe('compact /update function_module: each tool its own form', () => {
  const steps = promptOf(updatePrompt, compactOnprem).instruction(
    GROUPED,
  ).steps;

  it('reads with HandlerGet by function_module_name and function_group_name', () => {
    const [read] = steps;
    assert.ok(read);
    assert.equal(read.tool, 'HandlerGet');
    const sent = userArguments(read);
    assert.equal(sent.function_module_name, 'ZFM');
    assert.equal(sent.function_group_name, 'ZFG');
    assert.deepEqual(read.stillToFill, []);
  });

  it('locks and unlocks with HandlerLock / HandlerUnlock by object_name GROUP|MODULE', () => {
    const lock = steps[1];
    const unlock = steps[3];
    assert.ok(lock && unlock);
    assert.equal(lock.tool, 'HandlerLock');
    assert.equal(unlock.tool, 'HandlerLock');
    for (const step of [lock, unlock]) {
      const sent = userArguments(step);
      assert.equal(sent.object_name, 'ZFG|ZFM');
      assert.equal(sent.function_group_name, undefined);
    }
  });

  it('writes with HandlerUpdate by function_module_name and function_group_name', () => {
    const write = steps[2];
    assert.ok(write);
    assert.equal(write.tool, 'HandlerUpdate');
    const sent = userArguments(write);
    assert.equal(sent.function_module_name, 'ZFM');
    assert.equal(sent.function_group_name, 'ZFG');
  });
});

describe('without function_group, each step needing it lists it still to fill', () => {
  it('compact /update function_module', () => {
    const steps = promptOf(updatePrompt, compactOnprem).instruction(
      MODULE,
    ).steps;
    assert.equal(steps.length, 4);
    for (const step of steps) {
      assert.deepEqual(
        step.stillToFill.filter(({ name }) => name === 'function_group'),
        [{ name: 'function_group', description: FUNCTION_GROUP_WORDS }],
        step.tool,
      );
      assert.equal(
        userArguments(step).function_group_name,
        undefined,
        step.tool,
      );
    }
  });

  it('core /get function_module lists function_group, not function_group_name', () => {
    const [step] = listed(coreOnprem, 'get').instruction(MODULE).steps;
    assert.ok(step);
    assert.deepEqual(
      step.stillToFill.map(({ name }) => name),
      ['function_group'],
    );
  });
});

describe('every prompt serving function_module takes function_group', () => {
  for (const [label, source, names] of [
    [
      'compact',
      compactOnprem,
      ['create', 'get', 'update', 'delete', 'activate', 'check', 'where_used'],
    ],
    [
      'core',
      coreOnprem,
      ['create', 'get', 'update', 'delete', 'activate', 'check', 'where_used'],
    ],
  ] as const) {
    for (const name of names) {
      it(`${label} ${name}`, () => {
        const schema = listed(source, name).argsSchema.function_group;
        assert.ok(schema, `${name} takes function_group`);
        assert.equal(schema.description, FUNCTION_GROUP_WORDS);
        assert.ok(schema.safeParse(undefined).success, 'optional');
      });
    }
  }

  for (const [label, source] of [
    ['core', coreOnprem],
    ['compact', compactOnprem],
  ] as const) {
    it(`${label} unit_test takes none: a run names the module alone`, () => {
      const prompt = listed(source, 'unit_test');
      assert.equal(prompt.argsSchema.function_group, undefined);
      assert.equal(prompt.argsSchema.name?.description, "The object's name.");
    });
  }

  it('a prompt serving no function module takes none (core transport)', () => {
    assert.equal(
      listed(coreOnprem, 'transport').argsSchema.function_group,
      undefined,
    );
  });
});

describe('the form per tool', () => {
  const firstStep = (
    source: PromptSource,
    prompt: string,
    extra: Record<string, string> = {},
  ): PromptStep => {
    const [step] = listed(source, prompt).instruction({
      ...GROUPED,
      ...extra,
    }).steps;
    assert.ok(step);
    return step;
  };

  for (const prompt of ['create', 'get', 'delete', 'activate', 'check']) {
    it(`core ${prompt}: function_module_name and function_group_name`, () => {
      const sent = userArguments(firstStep(coreOnprem, prompt));
      assert.equal(sent.function_module_name, 'ZFM');
      assert.equal(sent.function_group_name, 'ZFG');
    });
  }

  for (const prompt of ['create', 'get', 'delete']) {
    it(`compact ${prompt}: function_module_name and function_group_name`, () => {
      const sent = userArguments(firstStep(compactOnprem, prompt));
      assert.equal(sent.function_module_name, 'ZFM');
      assert.equal(sent.function_group_name, 'ZFG');
    });
  }

  for (const prompt of ['activate', 'check', 'where_used']) {
    it(`compact ${prompt}: object_name GROUP|MODULE`, () => {
      const sent = userArguments(firstStep(compactOnprem, prompt));
      assert.equal(sent.object_name, 'ZFG|ZFM');
      assert.equal(sent.function_group_name, undefined);
    });
  }

  it('core where_used: object_name GROUP|MODULE', () => {
    assert.equal(
      userArguments(firstStep(coreOnprem, 'where_used')).object_name,
      'ZFG|ZFM',
    );
  });

  it('core unit_test: function_module_name alone; nothing to fill', () => {
    const [step] = listed(coreOnprem, 'unit_test').instruction(MODULE).steps;
    assert.ok(step);
    assert.equal(step.tool, 'RunFunctionModuleUnitTest');
    assert.deepEqual(userArguments(step), { function_module_name: 'ZFM' });
    assert.deepEqual(step.stillToFill, []);
  });

  it('compact unit_test: the FUNC target names the module alone; nothing to fill', () => {
    const [step] = listed(compactOnprem, 'unit_test').instruction(MODULE).steps;
    assert.ok(step);
    assert.deepEqual(userArguments(step).target, {
      kind: 'object',
      name: 'ZFM',
      type: 'FUNC',
    });
    const [bare] = listed(compactOnprem, 'unit_test').instruction(MODULE).steps;
    assert.ok(bare);
    assert.deepEqual(
      bare.stillToFill.filter(({ name }) => name === 'function_group'),
      [],
    );
  });
});

/** A client of a server registering `source`'s prompts. */
async function clientOf(source: PromptSource): Promise<Client> {
  const server = new McpServer({ name: 'function-group', version: '1' });
  registerPrompts(server, abapPrompts(source));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'function-group', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

/** `prompts/get` refuses `args` as InvalidParams, its message ending with `words`. */
async function assertGetRefused(
  client: Client,
  prompt: string,
  args: Record<string, string>,
  words: string,
): Promise<void> {
  await assert.rejects(
    client.getPrompt({ name: prompt, arguments: args }),
    (error: Error) => {
      assert.ok(error instanceof McpError);
      assert.equal(error.code, ErrorCode.InvalidParams);
      // The SDK prefixes the code on the server's error and again on the
      // client's, so the words end the message.
      assert.ok(error.message.endsWith(`: ${words}`), error.message);
      return true;
    },
  );
}

describe('function_group given for a type that reads none is refused (M4)', () => {
  for (const [label, source, prompts] of [
    [
      'core',
      coreOnprem,
      ['create', 'get', 'update', 'delete', 'activate', 'check', 'where_used'],
    ],
    [
      'compact',
      compactOnprem,
      ['create', 'get', 'update', 'delete', 'activate', 'check', 'where_used'],
    ],
  ] as const) {
    for (const prompt of prompts) {
      it(`${label} ${prompt} class with function_group, through prompts/get`, async () => {
        const client = await clientOf(source);
        try {
          await assertGetRefused(
            client,
            prompt,
            {
              object_type: 'class',
              name: 'ZCL_SOME',
              function_group: 'ZFG',
              ...(prompt === 'update' ? { change: 'some words' } : {}),
            },
            `${prompt}: function_group is read with object_type function_module only.`,
          );
        } finally {
          await client.close();
        }
      });
    }
  }

  for (const [label, source, call] of [
    [
      'core',
      coreOnprem,
      'RunFunctionModuleUnitTest with function_module_name: "ZFM"',
    ],
    [
      'compact',
      compactOnprem,
      'HandlerUnitTestRun with target: {"kind":"object","name":"ZFM","type":"FUNC"}',
    ],
  ] as const) {
    it(`${label} unit_test function_module: the module's name alone, its group's tests, through prompts/get`, async () => {
      const client = await clientOf(source);
      try {
        const { prompts } = await client.listPrompts();
        const unitTest = prompts.find(({ name }) => name === 'unit_test');
        assert.ok(unitTest);
        assert.ok(
          !unitTest.arguments?.some(({ name }) => name === 'function_group'),
        );
        const { messages } = await client.getPrompt({
          name: 'unit_test',
          arguments: MODULE,
        });
        const [first] = messages;
        assert.ok(first?.content.type === 'text');
        const text = first.content.text;
        assert.ok(text.includes(call), text);
        assert.ok(!text.includes('function_group'), text);
        assert.ok(
          text.startsWith(
            'Run the ABAP Unit tests of the whole function group of the FUNCTION_MODULE "ZFM".\n',
          ),
          text,
        );
        assert.ok(
          text.includes(
            "A run of a function module runs the ABAP Unit tests of the module's whole function group.",
          ),
          text,
        );
      } finally {
        await client.close();
      }
    });
  }

  it('a blank function_group is not given, so it is not refused', async () => {
    const client = await clientOf(coreOnprem);
    try {
      const { messages } = await client.getPrompt({
        name: 'get',
        arguments: {
          object_type: 'class',
          name: 'ZCL_SOME',
          function_group: ' ',
        },
      });
      assert.equal(messages.length, 1);
    } finally {
      await client.close();
    }
  });

  it('with function_module it is read, through prompts/get', async () => {
    const client = await clientOf(coreOnprem);
    try {
      const { messages } = await client.getPrompt({
        name: 'get',
        arguments: GROUPED,
      });
      const [first] = messages;
      assert.ok(first?.content.type === 'text');
      assert.ok(first.content.text.includes('function_group_name: "ZFG"'));
    } finally {
      await client.close();
    }
  });
});
