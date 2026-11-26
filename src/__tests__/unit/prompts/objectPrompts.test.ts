/**
 * The object prompts create, get, delete, activate and check: their texts
 * per family, the compact reads' part and background, the one-family types
 * left out, the served counts per binary and kind, and the refusals.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactReadOnlyToolSet } from '../../../../compact-ro/src/launcher';
import {
  activatePrompt,
  checkPrompt,
  createPrompt,
  deletePrompt,
  getPrompt,
} from '../../../lib/prompts/objectPrompts';
import { abapPrompts } from '../../../lib/prompts/prompts';
import { requiredArguments } from '../../../lib/prompts/source';
import type { AbapPrompt, PromptSource } from '../../../lib/prompts/types';
import { updatePrompt } from '../../../lib/prompts/updatePrompt';
import type { AbapSystemKind } from '../../../lib/systemKind';
import {
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '../../../lib/toolSet';
import {
  assertAsked,
  assertRefused,
  completionOf,
  promptOf,
  textOf,
} from '../../helpers/promptCalls';
import { promptSourceFor } from '../../helpers/promptSources';

function sourceOf(
  set: ToolSet,
  kind: AbapSystemKind | undefined,
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

describe('the worked examples', () => {
  it('core onprem /create class', () => {
    assert.equal(
      textOf(promptOf(createPrompt, coreOnprem), {
        object_type: 'class',
        name: 'SOME_CLASS',
        package_name: 'SOME_PACKAGE',
      }),
      [
        'Create the CLASS "SOME_CLASS".',
        '1. Call CreateClass with class_name: "SOME_CLASS", package_name: "SOME_PACKAGE".',
      ].join('\n'),
    );
  });

  it('core /get function_module without function_group lists function_group still to fill', () => {
    assert.equal(
      textOf(promptOf(getPrompt, coreOnprem), {
        object_type: 'function_module',
        name: 'SOME_MODULE',
      }),
      [
        'Get the FUNCTION_MODULE "SOME_MODULE".',
        '1. Call GetFunctionModule with function_module_name: "SOME_MODULE", function_group_name: the function group.',
        'Still to fill before the call: function_group (The function group the function module belongs to.).',
      ].join('\n'),
    );
  });

  it('core /get function_module with function_group sends both names', () => {
    assert.equal(
      textOf(promptOf(getPrompt, coreOnprem), {
        object_type: 'function_module',
        name: 'SOME_MODULE',
        function_group: 'SOME_GROUP',
      }),
      [
        'Get the FUNCTION_MODULE "SOME_MODULE".',
        '1. Call GetFunctionModule with function_module_name: "SOME_MODULE", function_group_name: "SOME_GROUP".',
      ].join('\n'),
    );
  });

  it('compact stdio /create class', () => {
    assert.equal(
      textOf(promptOf(createPrompt, compactOnprem), {
        object_type: 'class',
        name: 'SOME_CLASS',
        package_name: 'SOME_PACKAGE',
      }),
      [
        'Create the CLASS "SOME_CLASS".',
        '1. Call HandlerCreate with object_type: "CLASS", class_name: "SOME_CLASS", package_name: "SOME_PACKAGE".',
        'CLASS takes CLASS(class_name*, package_name*); * marks a required argument.',
      ].join('\n'),
    );
  });

  it('compact stdio /delete local_types: under the class lock', () => {
    assert.equal(
      textOf(promptOf(deletePrompt, compactOnprem), {
        object_type: 'local_types',
        name: 'SOME_CLASS',
      }),
      [
        'Delete the LOCAL_TYPES of "SOME_CLASS".',
        '1. Lock the class: call HandlerLock with object_type: "CLASS", object_name: "SOME_CLASS"; keep the lock_handle it answers.',
        '2. Call HandlerDelete with object_type: "LOCAL_TYPES", class_name: "SOME_CLASS", lock_handle: the lock_handle from step 1.',
        '3. Unlock the class: call HandlerLock with action: "unlock", object_type: "CLASS", object_name: "SOME_CLASS", lock_handle: the lock_handle from step 1 — after step 2, whatever it answered.',
        'LOCAL_TYPES takes LOCAL_TYPES(class_name*, lock_handle*, transport_request); * marks a required argument.',
      ].join('\n'),
    );
  });

  it('compact HTTP /delete local_types carries the lock state_handle', () => {
    const http = promptSourceFor(compactToolSet, 'onprem', {
      transport: 'http',
      backgroundRuns: true,
    });
    assert.equal(
      textOf(promptOf(deletePrompt, http), {
        object_type: 'local_types',
        name: 'SOME_CLASS',
      }),
      [
        'Delete the LOCAL_TYPES of "SOME_CLASS".',
        '1. Lock the class: call HandlerLock with object_type: "CLASS", object_name: "SOME_CLASS"; keep the lock_handle and the state_handle it answers.',
        '2. Call HandlerDelete with object_type: "LOCAL_TYPES", class_name: "SOME_CLASS", lock_handle: the lock_handle from step 1, state_handle: the state_handle from step 1.',
        '3. Unlock the class: call HandlerLock with action: "unlock", object_type: "CLASS", object_name: "SOME_CLASS", lock_handle: the lock_handle from step 1, state_handle: the state_handle from step 1 — after step 2, whatever it answered.',
        'LOCAL_TYPES takes LOCAL_TYPES(class_name*, lock_handle*, transport_request); * marks a required argument.',
      ].join('\n'),
    );
  });

  it('core-ro /get program', () => {
    assert.equal(
      textOf(promptOf(getPrompt, sourceOf(fullReadOnlyToolSet, 'onprem')), {
        object_type: 'program',
        name: 'SOME_PROGRAM',
      }),
      [
        'Get the PROGRAM "SOME_PROGRAM".',
        '1. Call GetProgram with program_name: "SOME_PROGRAM".',
      ].join('\n'),
    );
  });

  it('compact-ro /check class', () => {
    assert.equal(
      textOf(
        promptOf(checkPrompt, sourceOf(compactReadOnlyToolSet, 'onprem')),
        { object_type: 'class', name: 'SOME_CLASS' },
      ),
      [
        'Check the CLASS "SOME_CLASS".',
        '1. Call HandlerCheckRun with object_type: "CLASS", object_name: "SOME_CLASS".',
        'CLASS takes CLASS(object_name*); * marks a required argument.',
      ].join('\n'),
    );
  });

  it('compact /activate class names its arguments without echoing the type', () => {
    assert.equal(
      textOf(promptOf(activatePrompt, compactOnprem), {
        object_type: 'class',
        name: 'SOME_CLASS',
      }),
      [
        'Activate the CLASS "SOME_CLASS".',
        '1. Call HandlerActivate with object_type: "CLASS", object_name: "SOME_CLASS".',
        'CLASS takes object_type* and object_name*; * marks a required argument.',
      ].join('\n'),
    );
  });
});

describe('the compact read', () => {
  it('/get package passes part "metadata" and background false', () => {
    assert.equal(
      textOf(promptOf(getPrompt, compactOnprem), {
        object_type: 'package',
        name: 'SOME_PACKAGE',
      }),
      [
        'Get the PACKAGE "SOME_PACKAGE".',
        '1. Call HandlerGet with object_type: "PACKAGE", package_name: "SOME_PACKAGE", part: "metadata", background: false.',
        'PACKAGE takes PACKAGE(package_name*; part contents: package_name* or package_names*); * marks a required argument.',
      ].join('\n'),
    );
  });

  it('/get class passes no part', () => {
    const [step] = promptOf(getPrompt, compactOnprem).instruction({
      object_type: 'class',
      name: 'SOME_CLASS',
    }).steps;
    assert.ok(step);
    assert.deepEqual(
      step.arguments.map(([name]) => name),
      ['object_type', 'class_name', 'background'],
    );
  });

  it('a server with no background-run strategy passes no background', () => {
    const inCall = promptSourceFor(compactToolSet, 'onprem', {
      transport: 'stdio',
      backgroundRuns: false,
    });
    const [step] = promptOf(getPrompt, inCall).instruction({
      object_type: 'class',
      name: 'SOME_CLASS',
    }).steps;
    assert.ok(step);
    assert.deepEqual(
      step.arguments.map(([name]) => name),
      ['object_type', 'class_name'],
    );
  });
});

describe('the types one family serves stay out', () => {
  const ONE_FAMILY = [
    'table_settings',
    'program_text_elements',
    'function_group_text_elements',
    'class_text_elements',
  ];

  for (const [factory, type] of [
    [getPrompt, 'table_settings'],
    [getPrompt, 'class_text_elements'],
    [activatePrompt, 'program_text_elements'],
  ] as const) {
    it(`${type} is answered with the served types on compact onprem`, async () => {
      await assertAsked(
        promptOf(factory, compactOnprem),
        { object_type: type, name: 'SOME_OBJECT' },
        'object_type',
      );
    });
  }

  for (const factory of [getPrompt, activatePrompt]) {
    it(`${factory.name} completes none of the four`, async () => {
      const values = await completionOf(
        promptOf(factory, compactOnprem),
        'object_type',
      );
      assert.ok(values.length > 0);
      for (const type of ONE_FAMILY) assert.ok(!values.includes(type), type);
    });
  }
});

describe('served counts (spec §6)', () => {
  const FACTORIES = {
    create: createPrompt,
    get: getPrompt,
    delete: deletePrompt,
    activate: activatePrompt,
    check: checkPrompt,
  };
  type Counts = { readonly [K in keyof typeof FACTORIES]: number };
  const ROWS: readonly (readonly [string, ToolSet, AbapSystemKind, Counts])[] =
    [
      [
        'core',
        fullToolSet,
        'onprem',
        { create: 20, get: 22, delete: 24, activate: 16, check: 14 },
      ],
      [
        'core',
        fullToolSet,
        'cloud',
        { create: 18, get: 22, delete: 22, activate: 14, check: 14 },
      ],
      [
        'core-ro',
        fullReadOnlyToolSet,
        'onprem',
        { create: 0, get: 18, delete: 0, activate: 0, check: 0 },
      ],
      [
        'core-ro',
        fullReadOnlyToolSet,
        'cloud',
        { create: 0, get: 18, delete: 0, activate: 0, check: 0 },
      ],
      [
        'compact',
        compactToolSet,
        'onprem',
        { create: 18, get: 22, delete: 24, activate: 18, check: 14 },
      ],
      [
        'compact',
        compactToolSet,
        'cloud',
        { create: 16, get: 22, delete: 22, activate: 16, check: 14 },
      ],
      [
        'compact-ro',
        compactReadOnlyToolSet,
        'onprem',
        { create: 0, get: 22, delete: 0, activate: 0, check: 14 },
      ],
      [
        'compact-ro',
        compactReadOnlyToolSet,
        'cloud',
        { create: 0, get: 22, delete: 0, activate: 0, check: 14 },
      ],
    ];
  for (const [family, set, kind, counts] of ROWS) {
    it(`${family} ${kind}`, async () => {
      const source = sourceOf(set, kind);
      const served: Record<string, number> = {};
      for (const [operation, factory] of Object.entries(FACTORIES)) {
        const prompt = factory(source);
        served[operation] =
          prompt === undefined
            ? 0
            : (await completionOf(prompt, 'object_type')).length;
      }
      assert.deepEqual(served, counts);
    });
  }

  it('get serves no TRANSPORT, UNIT_TEST or CDS_UNIT_TEST', async () => {
    const values = await completionOf(
      promptOf(getPrompt, compactOnprem),
      'object_type',
    );
    for (const type of ['transport', 'unit_test', 'cds_unit_test']) {
      assert.ok(!values.includes(type), type);
    }
  });
});

describe('an object_type absent or not served asks the user (test 3)', () => {
  it('an unknown type', async () => {
    await assertAsked(
      promptOf(createPrompt, coreOnprem),
      { object_type: 'unknown_type', name: 'SOME_OBJECT' },
      'object_type',
    );
  });

  it('a program on cloud', async () => {
    await assertAsked(
      promptOf(createPrompt, sourceOf(fullToolSet, 'cloud')),
      { object_type: 'program', name: 'SOME_PROGRAM' },
      'object_type',
    );
  });

  it('a class with CreateClass denied', async () => {
    const prompt = promptOf(
      createPrompt,
      sourceOf(fullToolSet, 'onprem', ['CreateClass']),
    );
    assert.ok(!(await completionOf(prompt, 'object_type')).includes('class'));
    await assertAsked(
      prompt,
      { object_type: 'class', name: 'SOME_CLASS' },
      'object_type',
    );
  });

  it('the words list the served types in lowercase', () => {
    assert.ok(
      textOf(promptOf(createPrompt, compactOnprem), {
        object_type: 'unknown_type',
        name: 'SOME_OBJECT',
      }).startsWith(
        'The object_type "unknown_type" is not served by this server. The create prompt takes: package, domain, data_element, ',
      ),
    );
  });

  for (const [name, factory] of [
    ['create', createPrompt],
    ['get', getPrompt],
    ['update', updatePrompt],
    ['delete', deletePrompt],
    ['activate', activatePrompt],
    ['check', checkPrompt],
  ] as const) {
    for (const [family, source] of [
      ['core', coreOnprem],
      ['compact', compactOnprem],
    ] as const) {
      it(`${name} on ${family}: an absent object_type, a name given or not`, async () => {
        const prompt = promptOf(factory, source);
        await assertAsked(prompt, {}, 'object_type');
        await assertAsked(prompt, { name: 'SOME_OBJECT' }, 'object_type');
      });
    }
  }

  it('a missing name', () => {
    assertRefused(
      promptOf(createPrompt, coreOnprem),
      { object_type: 'class' },
      'create: name is required.',
    );
  });

  it('CLASS and class both answer, naming CLASS', () => {
    const prompt = promptOf(createPrompt, coreOnprem);
    for (const objectType of ['CLASS', 'class', 'Class']) {
      assert.ok(
        textOf(prompt, { object_type: objectType, name: 'SOME_CLASS' })
          .split('\n')
          .includes('Create the CLASS "SOME_CLASS".'),
      );
    }
  });
});

describe('get: prototype keys and blank values (review focus 1 and 3)', () => {
  const prompt = promptOf(getPrompt, coreOnprem);

  for (const key of [
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
  ]) {
    it(`object_type ${key} is answered as not served`, async () => {
      await assertAsked(
        prompt,
        { object_type: key, name: 'SOME_CLASS' },
        'object_type',
      );
    });
  }

  it('object_type " class " is read trimmed', () => {
    assert.ok(
      textOf(prompt, { object_type: ' class ', name: 'SOME_CLASS' }).startsWith(
        'Get the CLASS "SOME_CLASS".',
      ),
    );
  });

  for (const blank of ['', '   ']) {
    it(`name ${JSON.stringify(blank)} is absent`, () => {
      assertRefused(
        prompt,
        { object_type: 'class', name: blank },
        'get: name is required.',
      );
    });

    it(`object_type ${JSON.stringify(blank)} is absent`, async () => {
      await assertAsked(
        prompt,
        { object_type: blank, name: 'SOME_CLASS' },
        'object_type',
      );
    });
  }
});

describe('blank required arguments of the other object prompts (review focus 3)', () => {
  const PROMPTS: readonly (readonly [
    string,
    (source: PromptSource) => AbapPrompt | undefined,
  ])[] = [
    ['create', createPrompt],
    ['delete', deletePrompt],
    ['activate', activatePrompt],
    ['check', checkPrompt],
  ];
  for (const [name, factory] of PROMPTS) {
    it(`${name}: a blank name is absent`, () => {
      assertRefused(
        promptOf(factory, coreOnprem),
        { object_type: 'class', name: '  ' },
        `${name}: name is required.`,
      );
    });
  }
});

describe('completion', () => {
  it('create on compact onprem completes the 18 types in lowercase, in member order', async () => {
    assert.deepEqual(
      await completionOf(promptOf(createPrompt, compactOnprem), 'object_type'),
      [
        'package',
        'domain',
        'data_element',
        'table',
        'structure',
        'table_type',
        'ddl',
        'service_definition',
        'service_binding',
        'class',
        'program',
        'include',
        'interface',
        'function_group',
        'function_module',
        'behavior_definition',
        'behavior_implementation',
        'metadata_extension',
      ],
    );
  });

  it('filters by a prefix in any case', async () => {
    assert.deepEqual(
      await completionOf(
        promptOf(createPrompt, compactOnprem),
        'object_type',
        'DA',
      ),
      ['data_element'],
    );
  });
});

describe('the description states the function, the same on every binary', () => {
  it('create on compact and core', () => {
    for (const source of [compactOnprem, coreOnprem]) {
      assert.equal(
        promptOf(createPrompt, source).description,
        'Creates an ABAP object of object_type named name in package_name.',
      );
    }
  });

  it('delete on compact and core', () => {
    for (const source of [compactOnprem, coreOnprem]) {
      assert.equal(
        promptOf(deletePrompt, source).description,
        'Deletes an ABAP object of object_type named name.',
      );
    }
  });

  it('get on compact and core', () => {
    for (const source of [compactOnprem, coreOnprem]) {
      assert.equal(
        promptOf(getPrompt, source).description,
        'Reads an ABAP object of object_type named name.',
      );
    }
  });
});

describe('abapPrompts', () => {
  it('lists the prompts a binary serves, in the order of the operations', () => {
    assert.deepEqual(
      abapPrompts(coreOnprem).map(({ name }) => name),
      [
        'create',
        'get',
        'update',
        'delete',
        'activate',
        'check',
        'unit_test',
        'where_used',
        'transport',
      ],
    );
    assert.deepEqual(
      abapPrompts(sourceOf(compactReadOnlyToolSet, 'cloud')).map(
        ({ name }) => name,
      ),
      ['get', 'check', 'where_used', 'transport'],
    );
    assert.deepEqual(
      abapPrompts(sourceOf(fullReadOnlyToolSet, 'onprem')).map(
        ({ name }) => name,
      ),
      ['get', 'where_used', 'transport'],
    );
  });
});
