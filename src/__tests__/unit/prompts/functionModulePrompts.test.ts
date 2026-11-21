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
import { compactToolSet } from '../../../../compact/src/launcher';
import type { JsonValue } from '../../../lib/json';
import type {
  AbapPrompt,
  PromptSource,
  PromptStep,
} from '../../../lib/prompts';
import { abapPrompts } from '../../../lib/prompts';
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
    assert.equal(unlock.tool, 'HandlerUnlock');
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
  for (const [label, source] of [
    ['compact', compactOnprem],
    ['core', coreOnprem],
  ] as const) {
    for (const name of [
      'create',
      'get',
      'update',
      'delete',
      'activate',
      'check',
      'unit_test',
      'where_used',
    ]) {
      it(`${label} ${name}`, () => {
        const schema = listed(source, name).argsSchema.function_group;
        assert.ok(schema, `${name} takes function_group`);
        assert.equal(schema.description, FUNCTION_GROUP_WORDS);
        assert.ok(schema.safeParse(undefined).success, 'optional');
      });
    }
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

  it('core unit_test: function_module_name and function_group_name', () => {
    const sent = userArguments(firstStep(coreOnprem, 'unit_test'));
    assert.equal(sent.function_module_name, 'ZFM');
    assert.equal(sent.function_group_name, 'ZFG');
  });

  it('compact unit_test: the FUNC target names the module alone; nothing to fill', () => {
    const step = firstStep(compactOnprem, 'unit_test');
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
