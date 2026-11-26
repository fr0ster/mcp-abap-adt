/**
 * The unit_test prompt (test 10): one call on core, run, status and result
 * on compact; the run target of each type; the served counts; the deny
 * list per tool; include_subpackages read for a package alone.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactReadOnlyToolSet } from '../../../../compact-ro/src/launcher';
import type { PromptSource } from '../../../lib/prompts/types';
import { unitTestPrompt } from '../../../lib/prompts/unitTestPrompt';
import type { AbapSystemKind } from '../../../lib/systemKind';
import {
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '../../../lib/toolSet';
import {
  assertRefused,
  completionOf,
  promptOf,
  textOf,
} from '../../helpers/promptCalls';
import { promptSourceFor } from '../../helpers/promptSources';

function sourceOf(
  set: ToolSet,
  kind: AbapSystemKind,
  denied: readonly string[] = [],
): PromptSource {
  return promptSourceFor(set, kind, {
    transport: 'stdio',
    backgroundRuns: true,
    denied,
  });
}

const coreOnprem = sourceOf(fullToolSet, 'onprem');
const compactOnprem = sourceOf(compactToolSet, 'onprem');

describe('the texts (spec §2.3)', () => {
  it('core /unit_test class', () => {
    assert.equal(
      textOf(promptOf(unitTestPrompt, coreOnprem), {
        object_type: 'class',
        name: 'SOME_CLASS',
      }),
      [
        'Run the unit tests of the CLASS "SOME_CLASS".',
        '1. Call RunUnitTest with class_name: "SOME_CLASS".',
        '2. When it answers a run_id without a run_result: call GetUnitTestResult with run_id: the run_id from step 1.',
      ].join('\n'),
    );
  });

  it('compact /unit_test package include_subpackages=true', () => {
    assert.equal(
      textOf(promptOf(unitTestPrompt, compactOnprem), {
        object_type: 'package',
        name: 'SOME_PACKAGE',
        include_subpackages: 'true',
      }),
      [
        'Run the unit tests of the PACKAGE "SOME_PACKAGE".',
        '1. Call HandlerUnitTestRun with target: {"kind":"package","name":"SOME_PACKAGE","include_subpackages":true}; keep the run_id it answers.',
        '2. Call HandlerUnitTestStatus with run_id: the run_id from step 1, with_long_polling: true; keep the status it answers.',
        '3. When the status is FINISHED: call HandlerUnitTestResult with run_id: the run_id from step 1. For any other status, answer the user with the run_id and the status SAP named, so the user can ask again.',
      ].join('\n'),
    );
  });

  it('a package without include_subpackages lists it still to fill', () => {
    const text = textOf(promptOf(unitTestPrompt, coreOnprem), {
      object_type: 'package',
      name: 'SOME_PACKAGE',
    });
    assert.ok(
      text
        .split('\n')
        .includes(
          'Still to fill before step 1: include_subpackages (For a package, whether the tests of its subpackages run too: true, false.).',
        ),
      text,
    );
  });

  it('core /unit_test ddl runs the foreign tests of the object target', () => {
    const [step] = promptOf(unitTestPrompt, coreOnprem).instruction({
      object_type: 'ddl',
      name: 'SOME_VIEW',
    }).steps;
    assert.ok(step);
    assert.equal(step.tool, 'RunAbapUnit');
    assert.deepEqual(step.arguments, [
      [
        'target',
        {
          from: 'user',
          value: { kind: 'object', name: 'SOME_VIEW', type: 'DDLS/DF' },
        },
      ],
      ['scope', { from: 'user', value: { foreign_tests: true } }],
    ]);
  });
});

describe('the run target of each type on compact', () => {
  for (const [type, code] of [
    ['class', 'CLAS/OC'],
    ['program', 'PROG/P'],
    ['function_group', 'FUGR/F'],
    ['function_module', 'FUNC'],
    ['ddl', 'DDLS/DF'],
  ] as const) {
    it(`${type} sends target.type ${code}`, () => {
      const [step] = promptOf(unitTestPrompt, compactOnprem).instruction({
        object_type: type,
        name: 'SOME_OBJECT',
      }).steps;
      assert.ok(step);
      assert.deepEqual(step.arguments[0], [
        'target',
        {
          from: 'user',
          value: { kind: 'object', name: 'SOME_OBJECT', type: code },
        },
      ]);
    });
  }
});

describe('served counts', () => {
  for (const [family, set, kind, count] of [
    ['core', fullToolSet, 'onprem', 6],
    ['core', fullToolSet, 'cloud', 6],
    ['compact', compactToolSet, 'onprem', 6],
    ['compact', compactToolSet, 'cloud', 6],
  ] as const) {
    it(`${family} ${kind}: ${count}`, async () => {
      assert.deepEqual(
        await completionOf(
          promptOf(unitTestPrompt, sourceOf(set, kind)),
          'object_type',
        ),
        [
          'class',
          'program',
          'function_group',
          'function_module',
          'ddl',
          'package',
        ].slice(0, count),
      );
    });
  }

  for (const [family, set] of [
    ['core-ro', fullReadOnlyToolSet],
    ['compact-ro', compactReadOnlyToolSet],
  ] as const) {
    it(`${family} lists none`, () => {
      assert.equal(unitTestPrompt(sourceOf(set, 'onprem')), undefined);
    });
  }
});

describe('the deny list', () => {
  it('denying HandlerUnitTestStatus removes the compact prompt', () => {
    assert.equal(
      unitTestPrompt(
        sourceOf(compactToolSet, 'onprem', ['HandlerUnitTestStatus']),
      ),
      undefined,
    );
  });

  it('denying RunUnitTest removes class from core', async () => {
    const values = await completionOf(
      promptOf(
        unitTestPrompt,
        sourceOf(fullToolSet, 'onprem', ['RunUnitTest']),
      ),
      'object_type',
    );
    assert.ok(!values.includes('class'));
    assert.ok(values.includes('program'));
  });
});

describe('include_subpackages', () => {
  it('is completed true and false', async () => {
    assert.deepEqual(
      await completionOf(
        promptOf(unitTestPrompt, coreOnprem),
        'include_subpackages',
      ),
      ['true', 'false'],
    );
  });

  it('refuses another value', () => {
    assertRefused(
      promptOf(unitTestPrompt, coreOnprem),
      {
        object_type: 'package',
        name: 'SOME_PACKAGE',
        include_subpackages: 'yes',
      },
      'unit_test: include_subpackages is true or false.',
    );
  });

  it('is refused with another type', () => {
    assertRefused(
      promptOf(unitTestPrompt, coreOnprem),
      {
        object_type: 'class',
        name: 'SOME_CLASS',
        include_subpackages: 'false',
      },
      'unit_test: include_subpackages is read for package',
    );
  });

  it('a blank value is absent', () => {
    assert.doesNotThrow(() =>
      promptOf(unitTestPrompt, coreOnprem).instruction({
        object_type: 'class',
        name: 'SOME_CLASS',
        include_subpackages: ' ',
      }),
    );
  });
});

describe('blank values (review focus 3)', () => {
  it('a blank name is absent', () => {
    assertRefused(
      promptOf(unitTestPrompt, coreOnprem),
      { object_type: 'class', name: '' },
      'unit_test: name is required.',
    );
  });
});

describe('the compact run is read once (no polling)', () => {
  for (const type of ['class', 'program', 'package'] as const) {
    it(`${type}: one status call, the result read on FINISHED`, () => {
      const { steps } = promptOf(unitTestPrompt, compactOnprem).instruction({
        object_type: type,
        name: 'SOME_NAME',
        ...(type === 'package' && { include_subpackages: 'false' }),
      });
      const status = steps.filter(
        ({ tool }) => tool === 'HandlerUnitTestStatus',
      );
      assert.equal(status.length, 1);
      for (const step of steps) assert.equal(step.repeat, undefined);
      const result = steps.find(({ tool }) => tool === 'HandlerUnitTestResult');
      assert.equal(result?.condition, 'When the status is FINISHED');
      const text = textOf(promptOf(unitTestPrompt, compactOnprem), {
        object_type: type,
        name: 'SOME_NAME',
        ...(type === 'package' && { include_subpackages: 'false' }),
      });
      assert.ok(!text.includes('until'), text);
    });
  }
});
