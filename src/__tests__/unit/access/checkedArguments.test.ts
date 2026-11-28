/**
 * Which tools the call-time checks read, and what they read (spec §3.3,
 * Appendix B): over the full and compact sets as registered (data tools
 * served), the tools with a package or request argument that the `-ro` twins
 * do not serve; the tables of the two table reads; what a call's arguments
 * make of them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { readOnlyToolSet as coreRoSet } from '../../../../core-ro/src/launcher';
import {
  accessCallOf,
  type CheckedArguments,
  checkedArgumentsOf,
  isPackageCreate,
} from '../../../lib/access/checkedArguments';
import { COMPACT_READ_ONLY_TOOL_NAMES } from '../../../lib/access/compactReadOnlyTools';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  fullToolSet,
  readOnlyToolNames,
  type ServedTransport,
  type ToolSet,
} from '../../../lib/toolSet';

const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];

/** Every entry `set` serves on any transport, the data tools included, by name. */
function entriesOf(set: ToolSet): ReadonlyMap<string, HandlerEntry> {
  const out = new Map<string, HandlerEntry>();
  for (const transport of TRANSPORTS) {
    for (const group of set.groups(noConnectionContext(), transport, {
      dataTools: true,
    })) {
      for (const entry of group.getHandlers()) {
        out.set(entry.toolDefinition.name, entry);
      }
    }
  }
  return out;
}

const READ_ONLY: ReadonlySet<string> = new Set([
  ...entriesOf(coreRoSet).keys(),
  ...entriesOf(compactRoSet).keys(),
]);

/** Tool → the package and request arguments checked on it. */
function checkedOf(set: ToolSet): Map<string, CheckedArguments> {
  const out = new Map<string, CheckedArguments>();
  for (const [name, entry] of entriesOf(set)) {
    const checked = checkedArgumentsOf(entry.toolDefinition, READ_ONLY);
    if (checked !== undefined && argumentsOf(checked).length > 0) {
      out.set(name, checked);
    }
  }
  return out;
}

/** Appendix B, by the arguments each tool declares. */
const FULL: ReadonlyArray<readonly [readonly string[], readonly string[]]> = [
  [
    [
      'UpdateTableType',
      'UpdateTableSettings',
      'UpdateTextElements',
      'DeleteDomain',
      'DeleteTableType',
      'UpdateMessageClass',
      'DeleteMessageClass',
      'CreateMessageClassMessage',
      'UpdateMessageClassMessage',
      'DeleteMessageClassMessage',
      'DeleteDataElement',
      'UpdateTable',
      'DeleteTable',
      'UpdateStructure',
      'DeleteStructure',
      'UpdateDdl',
      'DeleteDdl',
      'UpdateServiceDefinition',
      'DeleteServiceDefinition',
      'DeleteServiceBinding',
      'UpdateClass',
      'DeleteClass',
      'CreateUnitTest',
      'UpdateUnitTest',
      'DeleteUnitTest',
      'UpdateCdsUnitTest',
      'DeleteCdsUnitTest',
      'CreateProgramUnitTest',
      'UpdateProgramUnitTest',
      'CreateFunctionGroupUnitTest',
      'UpdateFunctionGroupUnitTest',
      'UpdateLocalTestClass',
      'DeleteLocalTestClass',
      'UpdateLocalTypes',
      'DeleteLocalTypes',
      'UpdateLocalDefinitions',
      'DeleteLocalDefinitions',
      'UpdateLocalMacros',
      'DeleteLocalMacros',
      'UpdateInclude',
      'UpdateIncludeMetadata',
      'DeleteInclude',
      'UpdateProgram',
      'DeleteProgram',
      'UpdateInterface',
      'DeleteInterface',
      'UpdateFunctionGroup',
      'DeleteFunctionGroup',
      'CreateFunctionModule',
      'UpdateFunctionModule',
      'DeleteFunctionModule',
      'CreateFunctionInclude',
      'UpdateFunctionInclude',
      'DeleteFunctionInclude',
      'UpdateBehaviorDefinition',
      'DeleteBehaviorDefinition',
      'UpdateBehaviorImplementation',
      'DeleteBehaviorImplementation',
      'UpdateMetadataExtension',
      'DeleteMetadataExtension',
    ],
    ['transport_request'],
  ],
  [
    [
      'UpdatePackage',
      'DeletePackage',
      'CreateDomain',
      'CreateTableType',
      'UpdateDomain',
      'CreateMessageClass',
      'CreateDataElement',
      'UpdateDataElement',
      'CreateTable',
      'CreateStructure',
      'CreateDdl',
      'CreateServiceDefinition',
      'CreateServiceBinding',
      'CreateClass',
      'CreateCdsUnitTest',
      'CreateInclude',
      'CreateProgram',
      'CreateInterface',
      'CreateFunctionGroup',
      'CreateBehaviorDefinition',
      'CreateBehaviorImplementation',
      'CreateMetadataExtension',
    ],
    ['package_name', 'transport_request'],
  ],
  [['CreatePackage'], ['package_name', 'super_package', 'transport_request']],
  [
    ['CreateTransportTask', 'SortAndCompressTransportTask'],
    ['transport_number'],
  ],
  [
    ['AddTransportObject', 'RemoveTransportObject'],
    ['object_name', 'transport_number'],
  ],
  [
    ['MoveTransportObjects'],
    ['objects[].object_name', 'transport_number', 'target_number'],
  ],
  [['RunAbapUnit'], ['target.name']],
  [['ActivateObjects'], ['objects[].name']],
];

const COMPACT: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['HandlerCreate', ['package_name', 'super_package', 'transport_request']],
  ['HandlerUpdate', ['package_name', 'transport_request']],
  ['HandlerDelete', ['package_name', 'transport_request']],
  ['HandlerLock', ['object_name']],
  [
    'HandlerTransportMoveObjects',
    ['objects[].object_name', 'transport_number', 'target_number'],
  ],
  ['HandlerTransportSortAndCompress', ['transport_number']],
  ['HandlerUnitTestRun', ['target.name']],
  ['HandlerActivate', ['object_name', 'objects[].name']],
];

const argumentsOf = (checked: CheckedArguments): string[] =>
  [
    ...checked.packages,
    ...(checked.packageTarget === undefined
      ? []
      : [`${checked.packageTarget}.name`]),
    ...checked.requests,
    ...(checked.packageObject === undefined ? [] : [checked.packageObject]),
    ...(checked.activation === undefined ? [] : ['objects[].name']),
    ...(checked.activation?.single === true ? ['object_name'] : []),
    ...(checked.transportEntries === 'list' ? ['objects[].object_name'] : []),
    ...(checked.transportEntries === 'object' ? ['object_name'] : []),
  ].sort();

describe('the checked package and request arguments', () => {
  it('the full set checks exactly the tools of Appendix B', () => {
    const expected = new Map<string, string[]>();
    for (const [tools, args] of FULL) {
      for (const tool of tools) expected.set(tool, [...args].sort());
    }
    const actual = checkedOf(fullToolSet);
    assert.deepEqual(
      Object.fromEntries(
        [...actual]
          .map(([tool, checked]) => [tool, argumentsOf(checked)] as const)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      Object.fromEntries([...expected].sort(([a], [b]) => a.localeCompare(b))),
    );
  });

  it('the compact set checks exactly the tools of Appendix B', () => {
    const actual = checkedOf(compactToolSet);
    assert.deepEqual(
      Object.fromEntries(
        [...actual]
          .map(([tool, checked]) => [tool, argumentsOf(checked)] as const)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      Object.fromEntries(
        COMPACT.map(([tool, args]) => [tool, [...args].sort()] as const).sort(
          ([a], [b]) => a.localeCompare(b),
        ),
      ),
    );
  });

  it('checks no read the -ro twins serve', () => {
    const full = checkedOf(fullToolSet);
    const compact = checkedOf(compactToolSet);
    for (const tool of [
      'GetPackage',
      'GetTransport',
      'HandlerGet',
      'HandlerValidate',
    ]) {
      assert.equal(full.has(tool) || compact.has(tool), false, tool);
    }
  });

  it('never checks an argument that names no package or request', () => {
    const never = [
      'package_type',
      'transport_layer',
      'transport_type',
      'task_type',
      'include_subpackages',
      'include_tasks',
      'packages',
      'package_names',
    ];
    for (const set of [fullToolSet, compactToolSet]) {
      for (const [tool, checked] of checkedOf(set)) {
        for (const argument of argumentsOf(checked)) {
          assert.equal(never.includes(argument), false, `${tool}.${argument}`);
        }
      }
    }
  });
});

describe('the checked tables', () => {
  it('GetTableContents by table_name, HandlerGetData by object_name, and no other tool', () => {
    const tables = new Map<string, string>();
    for (const set of [fullToolSet, compactToolSet]) {
      for (const [name, entry] of entriesOf(set)) {
        const table = checkedArgumentsOf(
          entry.toolDefinition,
          READ_ONLY,
        )?.table;
        if (table !== undefined) tables.set(name, table);
      }
    }
    assert.deepEqual(Object.fromEntries(tables), {
      GetTableContents: 'table_name',
      HandlerGetData: 'object_name',
    });
  });
});

describe('isPackageCreate', () => {
  it('is true for exactly CreatePackage and HandlerCreate with PACKAGE', () => {
    assert.equal(isPackageCreate('CreatePackage', {}), true);
    assert.equal(
      isPackageCreate('HandlerCreate', { object_type: 'PACKAGE' }),
      true,
    );
    assert.equal(
      isPackageCreate('HandlerCreate', { object_type: 'package' }),
      true,
    );
    assert.equal(isPackageCreate('CheckPackage', {}), false);
    assert.equal(
      isPackageCreate('HandlerValidate', { object_type: 'PACKAGE' }),
      false,
    );
    assert.equal(
      isPackageCreate('HandlerCreate', { object_type: 'CLASS' }),
      false,
    );
  });
});

describe('accessCallOf', () => {
  const checked: CheckedArguments = {
    packages: ['package_name', 'super_package'],
    packageTarget: undefined,
    requests: ['transport_request'],
    table: undefined,
    dispatch: 'object_type',
    packageObject: undefined,
    activation: undefined,
    transportEntries: undefined,
  };
  const lock: CheckedArguments = {
    packages: ['super_package'],
    packageTarget: undefined,
    requests: [],
    table: undefined,
    dispatch: 'object_type',
    packageObject: 'object_name',
    activation: undefined,
    transportEntries: undefined,
  };

  it('names a package lock by its object_name, and its super_package nowhere', () => {
    for (const args of [
      { object_type: 'PACKAGE', object_name: 'zfoo' },
      { object_type: 'package', object_name: 'zfoo', super_package: 'ZROOT' },
    ]) {
      assert.deepEqual(accessCallOf('HandlerLock', lock, args)?.packages, [
        { argument: 'object_name', value: 'ZFOO' },
      ]);
    }
  });

  it('names nothing for a lock of an object that is not a package', () => {
    assert.equal(
      accessCallOf('HandlerLock', lock, {
        object_type: 'CLASS',
        object_name: 'ZCL_FOO',
      }),
      undefined,
    );
  });

  it('names a super_package only on a package create', () => {
    assert.deepEqual(
      accessCallOf('CheckPackage', checked, {
        package_name: 'zfoo',
        super_package: 'YROOT',
      })?.packages,
      [{ argument: 'package_name', value: 'ZFOO' }],
    );
  });

  it('names the string values, trimmed and upper-cased', () => {
    assert.deepEqual(
      accessCallOf('HandlerCreate', checked, {
        object_type: 'PACKAGE',
        package_name: ' zfoo ',
        super_package: 'ZROOT',
        transport_request: 'a4hk900123',
      }),
      {
        tool: 'HandlerCreate',
        dispatch: 'PACKAGE',
        packages: [
          { argument: 'package_name', value: 'ZFOO' },
          { argument: 'super_package', value: 'ZROOT' },
        ],
        requests: [{ argument: 'transport_request', value: 'A4HK900123' }],
        tables: [],
        packageCreate: true,
      },
    );
  });

  it('names nothing for a number or a blank string (Review Focus 3)', () => {
    assert.equal(
      accessCallOf('CreateClass', checked, { package_name: 42 }),
      undefined,
    );
    assert.equal(
      accessCallOf('CreateClass', checked, { package_name: '  ' }),
      undefined,
    );
  });
});

describe('accessCallOf on a run target', () => {
  const checked: CheckedArguments = {
    packages: [],
    packageTarget: 'target',
    requests: [],
    table: undefined,
    dispatch: undefined,
    packageObject: undefined,
    activation: undefined,
    transportEntries: undefined,
  };

  it('names a package target as target.name, trimmed and upper-cased', () => {
    assert.deepEqual(
      accessCallOf('RunAbapUnit', checked, {
        target: { kind: 'package', name: ' zfoo ', include_subpackages: true },
      })?.packages,
      [{ argument: 'target.name', value: 'ZFOO' }],
    );
  });

  it('names nothing for an object target', () => {
    assert.equal(
      accessCallOf('RunAbapUnit', checked, {
        target: { kind: 'object', name: 'YCL_X', type: 'CLAS/OC' },
      }),
      undefined,
    );
  });
});

describe('readOnlyToolNames', () => {
  it('lists the compact read-only half and the data tool as their builders do', () => {
    assert.deepEqual(
      [...COMPACT_READ_ONLY_TOOL_NAMES].sort(),
      [...compactReadOnlyEntries(), ...compactDataEntries()]
        .map((entry) => entry.toolDefinition.name)
        .sort(),
    );
  });

  it('is exactly the tools the core-ro and compact-ro sets serve', () => {
    assert.deepEqual([...readOnlyToolNames()].sort(), [...READ_ONLY].sort());
  });
});
