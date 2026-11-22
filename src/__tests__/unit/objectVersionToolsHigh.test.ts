/**
 * Unit tests (#30): per-object HIGH-LEVEL version tools.
 *  - Get<Display>Versions dispatches to the right client accessor per type and
 *    forwards the natural name param as the resolver config;
 *  - Get<Display>VersionSource forwards content_uri to getVersionSource;
 *  - the factory registers all 28 expected tool names (9 versioned types ×
 *    {Versions, VersionSource, VersionDiff}, and the table type's Versions
 *    alone: SAP refuses its version source) with the per-type available_in
 *    copied from each high-level Get<X> (program is onprem);
 *  - non-versioned types (function_group, domain, data_element, package) get
 *    no version tools.
 * SAP-free via a mocked AdtClient.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { buildObjectVersionTools } from '../../handlers/common/high/objectVersionTools';
import * as clients from '../../lib/clients';
import { HighLevelHandlersGroup } from '../../lib/handlers/groups/HighLevelHandlersGroup';
import { okResponse } from '../helpers/fakeClient';
import { readsModuleIn } from '../helpers/functionModuleMetadata';

const mockClassGetVersions = mock.fn<(...args: any[]) => any>();
const mockTableGetVersions = mock.fn<(...args: any[]) => any>();
const mockTableGetVersionSource = mock.fn<(...args: any[]) => any>();
const mockFmGetVersions = mock.fn<(...args: any[]) => any>();
const mockGetClass = mock.fn<(...args: any[]) => any>();
const mockGetTable = mock.fn<(...args: any[]) => any>();
const mockGetFunctionModule = mock.fn<(...args: any[]) => any>();

mock.method(clients, 'createAdtClient', () => ({
  getClass: mockGetClass,
  getTable: mockGetTable,
  getFunctionModule: mockGetFunctionModule,
}));

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

function tool(name: string) {
  const entry = buildObjectVersionTools().find(
    (e) => e.toolDefinition.name === name,
  );
  if (!entry) throw new Error(`tool ${name} not found`);
  return entry;
}

beforeEach(() => {
  mockClassGetVersions.mock.resetCalls();
  mockClassGetVersions.mock.mockImplementation(() => undefined);
  mockTableGetVersions.mock.resetCalls();
  mockTableGetVersions.mock.mockImplementation(() => undefined);
  mockTableGetVersionSource.mock.resetCalls();
  mockTableGetVersionSource.mock.mockImplementation(() => undefined);
  mockFmGetVersions.mock.resetCalls();
  mockFmGetVersions.mock.mockImplementation(() => undefined);
  mockGetClass.mock.resetCalls();
  mockGetClass.mock.mockImplementation(() => undefined);
  mockGetTable.mock.resetCalls();
  mockGetTable.mock.mockImplementation(() => undefined);
  mockGetFunctionModule.mock.resetCalls();
  mockGetFunctionModule.mock.mockImplementation(() => undefined);
  mockGetClass.mock.mockImplementation(() => ({
    getVersions: mockClassGetVersions,
  }));
  mockGetTable.mock.mockImplementation(() => ({
    getVersions: mockTableGetVersions,
    getVersionSource: mockTableGetVersionSource,
  }));
  // A function module's metadata names the group the cases give (#2).
  mockGetFunctionModule.mock.mockImplementation(() => ({
    getVersions: mockFmGetVersions,
    readMetadata: readsModuleIn('Z_MY_GRP', 'Z_MY_FM'),
  }));
});

describe('per-object high-level version tools (#30)', () => {
  it('GetClassVersions dispatches to getClass().getVersions({ className })', async () => {
    const versions = [{ versionId: '00001', contentUri: '/x;version=00001' }];
    mockClassGetVersions.mock.mockImplementation(async () =>
      okResponse({ versions, document: '<feed/>' }),
    );

    const result = await tool('GetClassVersions').handler(ctx, {
      class_name: 'zcl_my_class',
    });

    assert.equal(result.isError, false);
    assert.ok(mockGetClass.mock.callCount() > 0);
    assert.ok(
      mockClassGetVersions.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], {
            className: 'ZCL_MY_CLASS',
          }) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    const data = payload(result);
    assert.equal(data.success, true);
    assert.equal(data.object_type, 'class');
    assert.equal(data.object_name, 'ZCL_MY_CLASS');
    assert.deepStrictEqual(data.versions, versions);
  });

  it('GetFunctionModuleVersions threads function_group_name through', async () => {
    mockFmGetVersions.mock.mockImplementation(async () =>
      okResponse({ versions: [], document: '<feed/>' }),
    );

    const result = await tool('GetFunctionModuleVersions').handler(ctx, {
      function_module_name: 'z_my_fm',
      function_group_name: 'z_my_grp',
    });

    assert.equal(result.isError, false);
    assert.ok(
      mockFmGetVersions.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], {
            functionGroupName: 'Z_MY_GRP',
            functionModuleName: 'Z_MY_FM',
          }) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
  });

  it('GetFunctionModuleVersions errors without function_group_name', async () => {
    const result = await tool('GetFunctionModuleVersions').handler(ctx, {
      function_module_name: 'z_my_fm',
    });
    assert.equal(result.isError, true);
    assert.equal(mockFmGetVersions.mock.callCount(), 0);
  });

  it('GetTableVersionSource forwards content_uri to getVersionSource', async () => {
    mockTableGetVersionSource.mock.mockImplementation(async () =>
      okResponse('DEFINE TABLE zmy_table.'),
    );

    const result = await tool('GetTableVersionSource').handler(ctx, {
      content_uri:
        '/sap/bc/adt/ddic/tables/zmy_table/source/main?version=00001',
    });

    assert.equal(result.isError, false);
    assert.ok(
      mockTableGetVersionSource.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(
            a[0],
            '/sap/bc/adt/ddic/tables/zmy_table/source/main?version=00001',
          ) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    const data = payload(result);
    assert.equal(data.success, true);
    assert.equal(data.source, 'DEFINE TABLE zmy_table.');
  });

  it('registers all 28 expected tool names', () => {
    const names = buildObjectVersionTools().map((e) => e.toolDefinition.name);
    const displays = [
      'Class',
      'Program',
      'Interface',
      'FunctionModule',
      'Table',
      'Structure',
      'Ddl',
      'BehaviorDefinition',
      'MetadataExtension',
    ];
    const expected = [
      ...displays.flatMap((d) => [
        `Get${d}Versions`,
        `Get${d}VersionSource`,
        `Get${d}VersionDiff`,
      ]),
      'GetTableTypeVersions',
    ];
    assert.deepStrictEqual(names.sort(), expected.sort());
    assert.equal(new Set(names).size, 28);
  });

  it('does not register version tools for non-versioned types', () => {
    const names = new Set(
      buildObjectVersionTools().map((e) => e.toolDefinition.name),
    );
    for (const d of ['FunctionGroup', 'Domain', 'DataElement', 'Package']) {
      assert.equal(names.has(`Get${d}Versions`), false);
      assert.equal(names.has(`Get${d}VersionSource`), false);
      assert.equal(names.has(`Get${d}VersionDiff`), false);
    }
  });

  it('the registered HighLevel group contains all 28 version tools (no dups)', () => {
    const group = new HighLevelHandlersGroup({
      connection: {},
      logger: undefined,
    } as any);
    const registered = group.getHandlers().map((e) => e.toolDefinition.name);
    const expected = buildObjectVersionTools().map(
      (e) => e.toolDefinition.name,
    );
    for (const name of expected) {
      assert.ok(registered.includes(name));
    }
    // no duplicate tool names in the whole HighLevel group
    assert.equal(new Set(registered).size, registered.length);
    // program version tools are on premise and cloud in the registered set
    const prog = group
      .getHandlers()
      .find((e) => e.toolDefinition.name === 'GetProgramVersions');
    assert.deepStrictEqual(prog?.toolDefinition.available_in, [
      'onprem',
      'cloud',
    ]);
  });

  it('program version tools are on premise and cloud (mirrors GetProgram)', () => {
    for (const name of ['GetProgramVersions', 'GetProgramVersionSource']) {
      assert.deepStrictEqual(tool(name).toolDefinition.available_in, [
        'onprem',
        'cloud',
      ]);
    }
    // class is both modern environments (mirrors GetClass)
    assert.deepStrictEqual(
      tool('GetClassVersions').toolDefinition.available_in,
      ['onprem', 'cloud'],
    );
    // table omits legacy (mirrors GetTable)
    assert.deepStrictEqual(
      tool('GetTableVersions').toolDefinition.available_in,
      ['onprem', 'cloud'],
    );
  });
});
