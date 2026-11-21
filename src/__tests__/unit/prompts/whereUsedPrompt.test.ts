/**
 * The where_used prompt (test 11): the where-used code of each type, one
 * step with background false exactly where the listed schema has it, the
 * container of text elements, and the deny list.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactReadOnlyToolSet } from '../../../../compact-ro/src/launcher';
import type { PromptSource } from '../../../lib/prompts/types';
import { whereUsedPrompt } from '../../../lib/prompts/whereUsedPrompt';
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
  options: { denied?: readonly string[]; backgroundRuns?: boolean } = {},
): PromptSource {
  return promptSourceFor(set, kind, {
    transport: 'stdio',
    backgroundRuns: options.backgroundRuns ?? true,
    denied: options.denied ?? [],
  });
}

const coreOnprem = sourceOf(fullToolSet, 'onprem');
const compactOnprem = sourceOf(compactToolSet, 'onprem');

const CODES: readonly (readonly [string, string])[] = [
  ['class', 'CLAS/OC'],
  ['interface', 'INTF/OI'],
  ['program', 'PROG/P'],
  ['include', 'PROG/I'],
  ['function_group', 'FUGR/F'],
  ['function_module', 'FUGR/FF'],
  ['package', 'DEVC/K'],
  ['ddl', 'DDLS/DF'],
  ['table', 'TABL/DT'],
  ['structure', 'TABL/DS'],
  ['table_type', 'TTYP/DA'],
  ['domain', 'DOMA/DD'],
  ['data_element', 'DTEL/DE'],
  ['behavior_definition', 'BDEF/BDO'],
  ['metadata_extension', 'DDLX/EX'],
  ['service_definition', 'SRVD/SRV'],
  ['service_binding', 'SRVB/SVB'],
  ['text_elements', 'PROG/PX'],
];

describe('the texts (spec §2.4)', () => {
  it('core-ro /where_used table', () => {
    assert.equal(
      textOf(
        promptOf(whereUsedPrompt, sourceOf(fullReadOnlyToolSet, 'onprem')),
        { object_type: 'table', name: 'SOME_TABLE' },
      ),
      [
        'List where the TABLE "SOME_TABLE" is used.',
        '1. Call GetWhereUsed with object_name: "SOME_TABLE", object_type: "TABL/DT", background: false.',
      ].join('\n'),
    );
  });

  it('compact /where_used class', () => {
    assert.equal(
      textOf(promptOf(whereUsedPrompt, compactOnprem), {
        object_type: 'class',
        name: 'SOME_CLASS',
      }),
      [
        'List where the CLASS "SOME_CLASS" is used.',
        '1. Call HandlerSystem with action: "where_used", object_name: "SOME_CLASS", object_type: "CLAS/OC", background: false.',
      ].join('\n'),
    );
  });

  it('core /where_used text_elements with container program', () => {
    assert.equal(
      textOf(promptOf(whereUsedPrompt, coreOnprem), {
        object_type: 'text_elements',
        name: 'SOME_PROGRAM',
        container: 'program',
      }),
      [
        'List where the TEXT_ELEMENTS "SOME_PROGRAM" is used.',
        '1. Call GetWhereUsed with object_name: "SOME_PROGRAM", object_type: "PROG/PX", container: "program", background: false.',
      ].join('\n'),
    );
  });

  for (const [family, source, words] of [
    [
      'core',
      coreOnprem,
      "object_name: Name of the ABAP object (with object_type; or give objects). For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).",
    ],
    [
      'compact',
      compactOnprem,
      "object_name: search_object: object name or mask (e.g. 'MARA*'). where_used: name of the object (with object_type), a function module as 'GROUP|FM_NAME'.",
    ],
  ] as const) {
    it(`${family} function_module quotes the listed object_name description`, () => {
      const { notes } = promptOf(whereUsedPrompt, source).instruction({
        object_type: 'function_module',
        name: 'SOME_GROUP|SOME_MODULE',
      });
      assert.deepEqual(notes, [words]);
    });
  }
});

describe('every type has its code, on every non-legacy binary and kind', () => {
  for (const [family, set] of [
    ['core', fullToolSet],
    ['core-ro', fullReadOnlyToolSet],
    ['compact', compactToolSet],
    ['compact-ro', compactReadOnlyToolSet],
  ] as const) {
    for (const kind of ['onprem', 'cloud'] as const) {
      it(`${family} ${kind}`, async () => {
        const prompt = promptOf(whereUsedPrompt, sourceOf(set, kind));
        assert.deepEqual(
          await completionOf(prompt, 'object_type'),
          CODES.map(([type]) => type),
        );
        for (const [type, code] of CODES) {
          const [step] = prompt.instruction({
            object_type: type,
            name: 'SOME_OBJECT',
            ...(type === 'text_elements' ? { container: 'program' } : {}),
          }).steps;
          assert.ok(step);
          assert.deepEqual(
            step.arguments.find(([name]) => name === 'object_type'),
            ['object_type', { from: 'user', value: code }],
            type,
          );
        }
      });
    }
  }
});

describe('container', () => {
  const prompt = promptOf(whereUsedPrompt, coreOnprem);

  it('function_group is passed through', () => {
    const [step] = prompt.instruction({
      object_type: 'text_elements',
      name: 'SOME_GROUP',
      container: 'function_group',
    }).steps;
    assert.ok(
      step?.arguments.some(
        ([name, value]) =>
          name === 'container' &&
          value.from === 'user' &&
          value.value === 'function_group',
      ),
    );
  });

  for (const blank of [undefined, '', '  ']) {
    it(`${JSON.stringify(blank)} with text_elements is refused`, () => {
      assertRefused(
        prompt,
        {
          object_type: 'text_elements',
          name: 'SOME_PROGRAM',
          container: blank,
        },
        'where_used: container is required.',
      );
    });
  }

  it('given with class is refused', () => {
    assertRefused(
      prompt,
      { object_type: 'class', name: 'SOME_CLASS', container: 'program' },
      'where_used: container is read with object_type text_elements only.',
    );
  });

  for (const given of ['PROGRAM', 'Function_Group']) {
    it(`${given} is accepted in any case and sent in lower case`, () => {
      const [step] = prompt.instruction({
        object_type: 'text_elements',
        name: 'SOME_PROGRAM',
        container: given,
      }).steps;
      assert.ok(
        step?.arguments.some(
          ([name, value]) =>
            name === 'container' &&
            value.from === 'user' &&
            value.value === given.toLowerCase(),
        ),
      );
    });
  }

  it('screen is refused naming the listed values', () => {
    assertRefused(
      prompt,
      {
        object_type: 'text_elements',
        name: 'SOME_PROGRAM',
        container: 'screen',
      },
      'where_used: container is one of program, function_group.',
    );
  });

  it('is completed only for text_elements, in any case, or before object_type is given', async () => {
    const both = ['program', 'function_group'];
    for (const objectType of [
      'text_elements',
      'TEXT_ELEMENTS',
      ' Text_Elements ',
    ]) {
      assert.deepEqual(
        await completionOf(prompt, 'container', '', {
          object_type: objectType,
        }),
        both,
        objectType,
      );
    }
    assert.deepEqual(
      await completionOf(prompt, 'container', '', { object_type: 'class' }),
      [],
    );
    assert.deepEqual(
      await completionOf(prompt, 'container', '', { object_type: '' }),
      both,
    );
    assert.deepEqual(await completionOf(prompt, 'container', 'PRO'), [
      'program',
    ]);
  });

  it('is completed from the listed enum', async () => {
    assert.deepEqual(await completionOf(prompt, 'container'), [
      'program',
      'function_group',
    ]);
  });
});

describe('background', () => {
  for (const [family, set] of [
    ['core', fullToolSet],
    ['compact', compactToolSet],
  ] as const) {
    it(`${family} with no background-run strategy passes no background and reads no run_handle`, () => {
      const { steps } = promptOf(
        whereUsedPrompt,
        sourceOf(set, 'onprem', { backgroundRuns: false }),
      ).instruction({ object_type: 'class', name: 'SOME_CLASS' });
      assert.equal(steps.length, 1);
      const [step] = steps;
      assert.ok(step);
      assert.ok(!step.arguments.some(([name]) => name === 'background'));
      assert.ok(
        !step.arguments.some(
          ([, value]) => value.from === 'step' && value.field === 'run_handle',
        ),
      );
    });
  }
});

describe('the deny list', () => {
  it('HandlerSystem.where_used removes the prompt from compact', () => {
    assert.equal(
      whereUsedPrompt(
        sourceOf(compactToolSet, 'onprem', {
          denied: ['HandlerSystem.where_used'],
        }),
      ),
      undefined,
    );
  });

  it('GetWhereUsed removes it from core', () => {
    assert.equal(
      whereUsedPrompt(
        sourceOf(fullToolSet, 'onprem', { denied: ['GetWhereUsed'] }),
      ),
      undefined,
    );
  });
});

describe('blank values (review focus 3)', () => {
  it('a blank name is absent', () => {
    assertRefused(
      promptOf(whereUsedPrompt, coreOnprem),
      { object_type: 'class', name: '  ' },
      'where_used: name is required.',
    );
  });
});
