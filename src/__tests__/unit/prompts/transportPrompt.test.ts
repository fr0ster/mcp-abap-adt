/**
 * The transport prompt (test 12): one prompt with an action — the texts,
 * the actions per binary, each action's arguments, the deny list, the
 * object-directory types, and the entry fields sent through ENTRY_ARGUMENT
 * alone.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactReadOnlyToolSet } from '../../../../compact-ro/src/launcher';
import {
  ENTRY_ARGUMENT,
  OBJECT_DIRECTORY_TYPE,
} from '../../../lib/prompts/transportEntry';
import { transportPrompt } from '../../../lib/prompts/transportPrompt';
import type { PromptSource, ReadEntryField } from '../../../lib/prompts/types';
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
import { repositoryRoot } from '../../helpers/repoRoot';

function sourceOf(
  set: ToolSet,
  kind: AbapSystemKind = 'onprem',
  denied: readonly string[] = [],
): PromptSource {
  return promptSourceFor(set, kind, {
    transport: 'stdio',
    backgroundRuns: true,
    denied,
  });
}

const core = sourceOf(fullToolSet);
const compact = sourceOf(compactToolSet);

describe('the texts (spec §2.5)', () => {
  it('core create', () => {
    assert.equal(
      textOf(promptOf(transportPrompt, core), {
        action: 'create',
        description: 'some words',
      }),
      [
        'Create a transport request.',
        '1. Call CreateTransport with description: "some words".',
      ].join('\n'),
    );
  });

  it('core remove_object', () => {
    assert.equal(
      textOf(promptOf(transportPrompt, core), {
        action: 'remove_object',
        number: 'SOME_TASK',
        object_type: 'class',
        name: 'SOME_CLASS',
      }),
      [
        'Remove the CLASS "SOME_CLASS" from the task "SOME_TASK".',
        '1. Read the task\'s entries: call ReadTransportObjects with transport_number: "SOME_TASK". Take the entry whose name is "SOME_CLASS", type "CLAS" and pgmid "R3TR".',
        '2. Call RemoveTransportObject with transport_number: "SOME_TASK", object_name: the name from step 1, object_type: the type from step 1, position: the position from step 1, pgmid: the pgmid from step 1. An entry the read answers without a position is named to the user and left out of the call.',
      ].join('\n'),
    );
  });

  it('compact move_objects', () => {
    assert.equal(
      textOf(promptOf(transportPrompt, compact), {
        action: 'move_objects',
        number: 'SOME_TASK',
        target_number: 'OTHER_TASK',
      }),
      [
        'Move entries of the task "SOME_TASK" to the task "OTHER_TASK".',
        '1. Read the task\'s entries: call HandlerGet with object_type: "TRANSPORT", transport_number: "SOME_TASK", background: false.',
        '2. Call HandlerTransportMoveObjects with transport_number: "SOME_TASK", target_number: "OTHER_TASK", objects: the entries to move from step 1, each as { object_name: the entry\'s name, object_type: the entry\'s type, position: the entry\'s position, pgmid: the entry\'s pgmid }. The entries to move are chosen with the user. An entry the read answers without a position is named to the user and left out of the call.',
      ].join('\n'),
    );
  });

  it('compact-ro list', () => {
    assert.equal(
      textOf(promptOf(transportPrompt, sourceOf(compactReadOnlyToolSet)), {
        action: 'list',
      }),
      [
        'List transport requests.',
        '1. Call HandlerSystem with action: "transports", background: false.',
      ].join('\n'),
    );
  });
});

describe('action is accepted in any case (M9)', () => {
  const prompt = promptOf(transportPrompt, core);

  for (const given of ['CREATE', 'Create', ' create ']) {
    it(`${JSON.stringify(given)} reads as create`, () => {
      assert.equal(
        textOf(prompt, { action: given, description: 'some words' }),
        textOf(prompt, { action: 'create', description: 'some words' }),
      );
    });
  }

  it('an unknown action is refused naming the served ones in lower case', () => {
    assertRefused(
      prompt,
      { action: 'RELEASE' },
      'transport: action "RELEASE" is not served by this server; it serves create, create_task, list, get, objects, log, add_object, remove_object, move_objects, sort_compress.',
    );
  });

  it('object_type is completed for an action given in upper case', async () => {
    assert.equal(
      (await completionOf(prompt, 'object_type', '', { action: 'ADD_OBJECT' }))
        .length,
      16,
    );
    assert.deepEqual(
      await completionOf(prompt, 'object_type', '', { action: 'LIST' }),
      [],
    );
  });

  it('action completes in lower case', async () => {
    assert.deepEqual(await completionOf(prompt, 'action', 'CREATE'), [
      'create',
      'create_task',
    ]);
  });
});

describe('the actions per binary', () => {
  for (const [family, set, actions] of [
    [
      'core',
      fullToolSet,
      [
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
      ],
    ],
    ['core-ro', fullReadOnlyToolSet, ['list', 'get', 'objects', 'log']],
    [
      'compact',
      compactToolSet,
      ['create', 'list', 'get', 'objects', 'move_objects', 'sort_compress'],
    ],
    ['compact-ro', compactReadOnlyToolSet, ['list', 'get', 'objects']],
  ] as const) {
    for (const kind of ['onprem', 'cloud'] as const) {
      it(`${family} ${kind}: ${actions.length}`, async () => {
        assert.deepEqual(
          await completionOf(
            promptOf(transportPrompt, sourceOf(set, kind)),
            'action',
          ),
          actions,
        );
      });
    }
  }
});

describe('each action refuses its missing argument', () => {
  const CASES: readonly (readonly [string, Record<string, string>, string])[] =
    [
      ['create', {}, 'description'],
      ['create_task', { number: 'SOME_REQUEST' }, 'number, user'],
      ['list', {}, ''],
      ['get', {}, 'number'],
      ['objects', {}, 'number'],
      ['log', {}, 'number'],
      [
        'add_object',
        { number: 'SOME_TASK', object_type: 'class' },
        'number, object_type, name',
      ],
      [
        'remove_object',
        { number: 'SOME_TASK', name: 'SOME_CLASS' },
        'number, object_type, name',
      ],
      ['move_objects', { number: 'SOME_TASK' }, 'number, target_number'],
      ['sort_compress', {}, 'number'],
    ];
  const prompt = promptOf(transportPrompt, core);
  for (const [action, partial, takes] of CASES) {
    if (takes !== '') {
      it(`${action}: a missing argument`, () => {
        assertRefused(
          prompt,
          { action, ...partial },
          `transport: action "${action}" takes ${takes}.`,
        );
      });
    }
  }

  it('an action the binary serves none of is refused', () => {
    assertRefused(
      promptOf(transportPrompt, sourceOf(fullReadOnlyToolSet)),
      { action: 'create', description: 'some words' },
      'transport: action "create" is not served by this server; it serves list, get, objects, log.',
    );
  });

  it('number blank is absent (review focus 3)', () => {
    for (const blank of ['', '   ']) {
      assertRefused(
        prompt,
        { action: 'get', number: blank },
        'transport: action "get" takes number.',
      );
    }
  });
});

describe('the deny list', () => {
  async function actionsOf(
    set: ToolSet,
    denied: readonly string[],
  ): Promise<readonly string[]> {
    const prompt = transportPrompt(sourceOf(set, 'onprem', denied));
    return prompt === undefined ? [] : completionOf(prompt, 'action');
  }

  it('HandlerSystem.transports removes list', async () => {
    assert.ok(
      !(await actionsOf(compactToolSet, ['HandlerSystem.transports'])).includes(
        'list',
      ),
    );
  });

  it('HandlerGet.TRANSPORT removes objects and move_objects', async () => {
    const actions = await actionsOf(compactToolSet, ['HandlerGet.TRANSPORT']);
    assert.ok(!actions.includes('objects'));
    assert.ok(!actions.includes('move_objects'));
    assert.ok(actions.includes('list'));
  });

  it('HandlerTransportCreate routes create through HandlerCreate', () => {
    assert.equal(
      textOf(
        promptOf(
          transportPrompt,
          sourceOf(compactToolSet, 'onprem', ['HandlerTransportCreate']),
        ),
        { action: 'create', description: 'some words' },
      ),
      [
        'Create a transport request.',
        '1. Call HandlerCreate with object_type: "TRANSPORT", description: "some words".',
      ].join('\n'),
    );
  });

  it('denying both leaves no create', async () => {
    assert.ok(
      !(
        await actionsOf(compactToolSet, [
          'HandlerTransportCreate',
          'HandlerCreate.TRANSPORT',
        ])
      ).includes('create'),
    );
  });
});

describe('object_type', () => {
  it('maps each of the 16 types to its object-directory type', () => {
    assert.deepEqual(OBJECT_DIRECTORY_TYPE, {
      CLASS: 'CLAS',
      INTERFACE: 'INTF',
      PROGRAM: 'PROG',
      INCLUDE: 'PROG',
      FUNCTION_GROUP: 'FUGR',
      PACKAGE: 'DEVC',
      DDL: 'DDLS',
      TABLE: 'TABL',
      STRUCTURE: 'TABL',
      TABLE_TYPE: 'TTYP',
      DOMAIN: 'DOMA',
      DATA_ELEMENT: 'DTEL',
      BEHAVIOR_DEFINITION: 'BDEF',
      METADATA_EXTENSION: 'DDLX',
      SERVICE_DEFINITION: 'SRVD',
      SERVICE_BINDING: 'SRVB',
    });
  });

  it('add_object sends the object-directory type of each', () => {
    const prompt = promptOf(transportPrompt, core);
    for (const [type, directoryType] of Object.entries(OBJECT_DIRECTORY_TYPE)) {
      const [step] = prompt.instruction({
        action: 'add_object',
        number: 'SOME_TASK',
        object_type: type.toLowerCase(),
        name: 'SOME_OBJECT',
      }).steps;
      assert.deepEqual(
        step?.arguments.find(([name]) => name === ENTRY_ARGUMENT.type),
        [ENTRY_ARGUMENT.type, { from: 'user', value: directoryType }],
      );
    }
  });

  it('function_module is not a transport type', () => {
    assertRefused(
      promptOf(transportPrompt, core),
      {
        action: 'add_object',
        number: 'SOME_TASK',
        object_type: 'function_module',
        name: 'SOME_MODULE',
      },
      'transport: object_type "function_module" is not served by this server; it serves ',
      true,
    );
  });

  it('is completed for an action that reads it, or before an action is given', async () => {
    const prompt = promptOf(transportPrompt, core);
    assert.equal((await completionOf(prompt, 'object_type')).length, 16);
    assert.equal(
      (await completionOf(prompt, 'object_type', '', { action: 'add_object' }))
        .length,
      16,
    );
    assert.deepEqual(
      await completionOf(prompt, 'object_type', '', { action: 'list' }),
      [],
    );
  });
});

describe('the sent entry fields come from ENTRY_ARGUMENT alone', () => {
  const FIELDS: readonly ReadEntryField[] = [
    'name',
    'type',
    'position',
    'pgmid',
  ];
  const PAIRS = FIELDS.map((field) => [ENTRY_ARGUMENT[field], field]);
  const sorted = (pairs: readonly (readonly string[])[]) =>
    pairs.map((pair) => pair.join('=')).sort();

  it('core remove_object sends the four read fields', () => {
    const { steps } = promptOf(transportPrompt, core).instruction({
      action: 'remove_object',
      number: 'SOME_TASK',
      object_type: 'class',
      name: 'SOME_CLASS',
    });
    const send = steps[1];
    assert.ok(send);
    const fromRead = send.arguments.flatMap(([name, value]) =>
      value.from === 'step' && value.step === 1 ? [[name, value.field]] : [],
    );
    assert.deepEqual(sorted(fromRead), sorted(PAIRS));
  });

  it('core remove_object names the read field each sent argument takes', () => {
    const text = textOf(promptOf(transportPrompt, core), {
      action: 'remove_object',
      number: 'SOME_TASK',
      object_type: 'class',
      name: 'SOME_CLASS',
    });
    for (const [sent, field] of PAIRS) {
      assert.ok(text.includes(`${sent}: the ${field} from step 1`), sent);
    }
  });

  for (const [family, source] of [
    ['core', core],
    ['compact', compact],
  ] as const) {
    it(`${family} move_objects sends each entry with the four read fields`, () => {
      const { steps } = promptOf(transportPrompt, source).instruction({
        action: 'move_objects',
        number: 'SOME_TASK',
        target_number: 'OTHER_TASK',
        object_type: 'class',
        name: 'SOME_CLASS',
      });
      const objects = steps[1]?.arguments.find(
        ([name]) => name === 'objects',
      )?.[1];
      assert.ok(objects?.from === 'entries');
      assert.equal(objects.step, 1);
      assert.deepEqual(sorted(objects.fields), sorted(PAIRS));
    });
  }

  it('core add_object sends the name and the type, no position or pgmid', () => {
    const [step] = promptOf(transportPrompt, core).instruction({
      action: 'add_object',
      number: 'SOME_TASK',
      object_type: 'class',
      name: 'SOME_CLASS',
    }).steps;
    assert.ok(step);
    assert.deepEqual(
      step.arguments.find(([name]) => name === ENTRY_ARGUMENT.name),
      [ENTRY_ARGUMENT.name, { from: 'user', value: 'SOME_CLASS' }],
    );
    assert.deepEqual(
      step.arguments.find(([name]) => name === ENTRY_ARGUMENT.type),
      [ENTRY_ARGUMENT.type, { from: 'user', value: 'CLAS' }],
    );
    for (const field of ['position', 'pgmid'] as const) {
      assert.ok(
        !step.arguments.some(([name]) => name === ENTRY_ARGUMENT[field]),
        field,
      );
    }
  });

  it('the generator names no sent entry field itself', () => {
    const text = readFileSync(
      join(repositoryRoot(__dirname), 'src/lib/prompts/transportPrompt.ts'),
      'utf8',
    );
    for (const literal of ["'object_name'", "'position'", "'pgmid'"]) {
      assert.ok(!text.includes(literal), literal);
    }
  });
});

describe('the arguments declared are those a served action reads', () => {
  const coreRo = sourceOf(fullReadOnlyToolSet);
  const compactRo = sourceOf(compactReadOnlyToolSet);
  const declared = (source: PromptSource) =>
    Object.keys(promptOf(transportPrompt, source).argsSchema);
  const describedAs = (source: PromptSource, argument: string) =>
    promptOf(transportPrompt, source).argsSchema[argument]?.description;

  it('core declares every argument', () => {
    assert.deepEqual(declared(core), [
      'action',
      'number',
      'description',
      'user',
      'object_type',
      'name',
      'target_number',
    ]);
  });

  it('core-ro declares the number and the user (list, get, objects, log)', () => {
    assert.deepEqual(declared(coreRo), ['action', 'number', 'user']);
  });

  it('compact-ro declares the number and the user (list, objects)', () => {
    assert.deepEqual(declared(compactRo), ['action', 'number', 'user']);
  });

  it('core-ro and compact-ro complete no object_type', async () => {
    for (const source of [coreRo, compactRo]) {
      const prompt = promptOf(transportPrompt, source);
      assert.equal(prompt.argsSchema.object_type, undefined);
      assert.deepEqual(await completionOf(prompt, 'action', ''), [
        ...(source === coreRo
          ? ['list', 'get', 'objects', 'log']
          : ['list', 'get', 'objects']),
      ]);
    }
  });

  it('the number and user words name only the served actions', () => {
    assert.equal(
      describedAs(core, 'number'),
      'The number of the request or task the action works on (a task for add_object, remove_object, move_objects, sort_compress).',
    );
    assert.equal(
      describedAs(core, 'user'),
      "An SAP user id: the task's owner (create_task), or whose requests are listed (list).",
    );
    for (const source of [coreRo, compactRo]) {
      assert.equal(
        describedAs(source, 'number'),
        'The number of the request or task the action works on.',
      );
      assert.equal(
        describedAs(source, 'user'),
        'An SAP user id: whose requests are listed (list).',
      );
    }
    assert.equal(
      describedAs(compact, 'number'),
      'The number of the request or task the action works on (a task for move_objects, sort_compress).',
    );
    assert.equal(
      describedAs(compact, 'user'),
      'An SAP user id: whose requests are listed (list).',
    );
  });
});
