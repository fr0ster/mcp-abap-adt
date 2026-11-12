/**
 * Which tools the call-time checks read, and what they read (spec §3.3,
 * Appendix B): over the full and compact sets as registered (data tools
 * served), the tools with a package or request argument that the `-ro` twins
 * do not serve; the tables of the two table reads; what a call's arguments
 * make of them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { readOnlyToolSet as coreRoSet } from '../../../../core-ro/src/launcher';
import {
  accessCallOf,
  type CheckedArguments,
  checkedArgumentsOf,
  isPackageCreate,
} from '../../../lib/access/checkedArguments';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  fullToolSet,
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
    if (
      checked !== undefined &&
      (checked.packages.length > 0 || checked.requests.length > 0)
    ) {
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
  [['CheckPackage'], ['package_name', 'super_package']],
  [['ValidateServiceBinding'], ['package_name']],
  [
    [
      'CreateTransportTask',
      'AddTransportObject',
      'RemoveTransportObject',
      'SortAndCompressTransportTask',
    ],
    ['transport_number'],
  ],
  [['MoveTransportObjects'], ['transport_number', 'target_number']],
];

const COMPACT: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['HandlerCreate', ['package_name', 'super_package', 'transport_request']],
  ['HandlerUpdate', ['package_name', 'transport_request']],
  ['HandlerDelete', ['package_name', 'transport_request']],
  ['HandlerLock', ['super_package']],
  ['HandlerTransportMoveObjects', ['transport_number', 'target_number']],
  ['HandlerTransportSortAndCompress', ['transport_number']],
];

const argumentsOf = (checked: CheckedArguments): string[] =>
  [...checked.packages, ...checked.requests].sort();

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
    requests: ['transport_request'],
    table: undefined,
    dispatch: 'object_type',
  };

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
