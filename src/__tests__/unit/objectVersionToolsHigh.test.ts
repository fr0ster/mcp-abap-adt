/**
 * Unit tests (#30): per-object HIGH-LEVEL version tools.
 *  - Get<Display>Versions dispatches to the right client accessor per type and
 *    forwards the natural name param as the resolver config;
 *  - Get<Display>VersionSource forwards content_uri to getVersionSource;
 *  - the factory registers all 26 expected tool names with the per-type
 *    available_in copied from each high-level Get<X> (program is onprem/legacy).
 * SAP-free via a mocked AdtClient.
 */

const mockClassGetVersions = jest.fn();
const mockTableGetVersions = jest.fn();
const mockTableGetVersionSource = jest.fn();
const mockFmGetVersions = jest.fn();
const mockGetClass = jest.fn();
const mockGetTable = jest.fn();
const mockGetFunctionModule = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getClass: mockGetClass,
    getTable: mockGetTable,
    getFunctionModule: mockGetFunctionModule,
  }),
}));

import { buildObjectVersionTools } from '../../handlers/common/high/objectVersionTools';
import { HighLevelHandlersGroup } from '../../lib/handlers/groups/HighLevelHandlersGroup';

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
  mockClassGetVersions.mockReset();
  mockTableGetVersions.mockReset();
  mockTableGetVersionSource.mockReset();
  mockFmGetVersions.mockReset();
  mockGetClass.mockReset();
  mockGetTable.mockReset();
  mockGetFunctionModule.mockReset();
  mockGetClass.mockReturnValue({ getVersions: mockClassGetVersions });
  mockGetTable.mockReturnValue({
    getVersions: mockTableGetVersions,
    getVersionSource: mockTableGetVersionSource,
  });
  mockGetFunctionModule.mockReturnValue({ getVersions: mockFmGetVersions });
});

describe('per-object high-level version tools (#30)', () => {
  it('GetClassVersions dispatches to getClass().getVersions({ className })', async () => {
    const versions = [{ versionId: '00001', contentUri: '/x;version=00001' }];
    mockClassGetVersions.mockResolvedValue(versions);

    const result = await tool('GetClassVersions').handler(ctx, {
      class_name: 'zcl_my_class',
    });

    expect(result.isError).toBe(false);
    expect(mockGetClass).toHaveBeenCalled();
    expect(mockClassGetVersions).toHaveBeenCalledWith({
      className: 'ZCL_MY_CLASS',
    });
    const data = payload(result);
    expect(data.success).toBe(true);
    expect(data.object_type).toBe('class');
    expect(data.object_name).toBe('ZCL_MY_CLASS');
    expect(data.versions).toEqual(versions);
  });

  it('GetFunctionModuleVersions threads function_group_name through', async () => {
    mockFmGetVersions.mockResolvedValue([]);

    const result = await tool('GetFunctionModuleVersions').handler(ctx, {
      function_module_name: 'z_my_fm',
      function_group_name: 'z_my_grp',
    });

    expect(result.isError).toBe(false);
    expect(mockFmGetVersions).toHaveBeenCalledWith({
      functionGroupName: 'Z_MY_GRP',
      functionModuleName: 'Z_MY_FM',
    });
  });

  it('GetFunctionModuleVersions errors without function_group_name', async () => {
    const result = await tool('GetFunctionModuleVersions').handler(ctx, {
      function_module_name: 'z_my_fm',
    });
    expect(result.isError).toBe(true);
    expect(mockFmGetVersions).not.toHaveBeenCalled();
  });

  it('GetTableVersionSource forwards content_uri to getVersionSource', async () => {
    mockTableGetVersionSource.mockResolvedValue('DEFINE TABLE zmy_table.');

    const result = await tool('GetTableVersionSource').handler(ctx, {
      content_uri:
        '/sap/bc/adt/ddic/tables/zmy_table/source/main?version=00001',
    });

    expect(result.isError).toBe(false);
    expect(mockTableGetVersionSource).toHaveBeenCalledWith(
      '/sap/bc/adt/ddic/tables/zmy_table/source/main?version=00001',
    );
    const data = payload(result);
    expect(data.success).toBe(true);
    expect(data.source).toBe('DEFINE TABLE zmy_table.');
  });

  it('registers all 39 expected tool names', () => {
    const names = buildObjectVersionTools().map((e) => e.toolDefinition.name);
    const displays = [
      'Class',
      'Program',
      'Interface',
      'FunctionGroup',
      'FunctionModule',
      'Table',
      'Structure',
      'Ddl',
      'Domain',
      'DataElement',
      'Package',
      'BehaviorDefinition',
      'MetadataExtension',
    ];
    const expected = displays.flatMap((d) => [
      `Get${d}Versions`,
      `Get${d}VersionSource`,
      `Get${d}VersionDiff`,
    ]);
    expect(names.sort()).toEqual(expected.sort());
    expect(new Set(names).size).toBe(39);
  });

  it('the registered HighLevel group contains all 39 version tools (no dups)', () => {
    const group = new HighLevelHandlersGroup({
      connection: {},
      logger: undefined,
    } as any);
    const registered = group.getHandlers().map((e) => e.toolDefinition.name);
    const expected = buildObjectVersionTools().map(
      (e) => e.toolDefinition.name,
    );
    for (const name of expected) {
      expect(registered).toContain(name);
    }
    // no duplicate tool names in the whole HighLevel group
    expect(new Set(registered).size).toBe(registered.length);
    // program version tools are onprem/legacy-gated in the registered set
    const prog = group
      .getHandlers()
      .find((e) => e.toolDefinition.name === 'GetProgramVersions');
    expect(prog?.toolDefinition.available_in).toEqual(['onprem', 'legacy']);
  });

  it('program version tools are onprem/legacy-gated (mirrors GetProgram)', () => {
    for (const name of ['GetProgramVersions', 'GetProgramVersionSource']) {
      expect(tool(name).toolDefinition.available_in).toEqual([
        'onprem',
        'legacy',
      ]);
    }
    // class is all three (mirrors GetClass)
    expect(tool('GetClassVersions').toolDefinition.available_in).toEqual([
      'onprem',
      'cloud',
      'legacy',
    ]);
    // table omits legacy (mirrors GetTable)
    expect(tool('GetTableVersions').toolDefinition.available_in).toEqual([
      'onprem',
      'cloud',
    ]);
  });
});
