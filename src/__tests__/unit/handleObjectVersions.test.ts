/**
 * Unit tests (#30): GetObjectVersions + GetObjectVersionSource.
 *  - GetObjectVersions dispatches to the right client accessor per object_type
 *    and returns the version list;
 *  - GetObjectVersionSource forwards content_uri to getVersionSource;
 *  - an unknown object_type returns an error.
 * SAP-free via a mocked AdtClient.
 */

const mockClassGetVersions = jest.fn();
const mockClassGetVersionSource = jest.fn();
const mockTableGetVersions = jest.fn();
const mockGetClass = jest.fn();
const mockGetTable = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getClass: mockGetClass,
    getTable: mockGetTable,
  }),
}));

import { handleGetObjectVersionSource } from '../../handlers/common/readonly/handleGetObjectVersionSource';
import { handleGetObjectVersions } from '../../handlers/common/readonly/handleGetObjectVersions';

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

describe('GetObjectVersions / GetObjectVersionSource (#30)', () => {
  beforeEach(() => {
    mockClassGetVersions.mockReset();
    mockClassGetVersionSource.mockReset();
    mockTableGetVersions.mockReset();
    mockGetClass.mockReset();
    mockGetTable.mockReset();
    mockGetClass.mockReturnValue({
      getVersions: mockClassGetVersions,
      getVersionSource: mockClassGetVersionSource,
    });
    mockGetTable.mockReturnValue({
      getVersions: mockTableGetVersions,
      getVersionSource: jest.fn(),
    });
  });

  it('dispatches a class to getClass().getVersions with className', async () => {
    const versions = [
      {
        versionId: '00001',
        author: 'DEV',
        updatedAt: '2026-01-01T00:00:00Z',
        title: 'Version List',
        contentUri: '/sap/bc/adt/...;version=00001',
      },
    ];
    mockClassGetVersions.mockResolvedValue(versions);

    const result = await handleGetObjectVersions(ctx, {
      object_type: 'class',
      object_name: 'zcl_my_class',
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

  it('passes through transportRequest/transportDescription per version (adt-clients 7.2.0)', async () => {
    const versions = [
      {
        versionId: '00002',
        author: 'DEV',
        updatedAt: '2026-06-30T00:00:00Z',
        title: 'Version List',
        transportRequest: 'DS4K901917',
        transportDescription: 'My change',
        contentUri: '/sap/bc/adt/...;version=00002',
      },
    ];
    mockClassGetVersions.mockResolvedValue(versions);

    const result = await handleGetObjectVersions(ctx, {
      object_type: 'class',
      object_name: 'zcl_my_class',
    });

    expect(result.isError).toBe(false);
    const v = payload(result).versions[0];
    expect(v.transportRequest).toBe('DS4K901917');
    expect(v.transportDescription).toBe('My change');
  });

  it('dispatches a table to getTable().getVersions with tableName', async () => {
    mockTableGetVersions.mockResolvedValue([]);

    const result = await handleGetObjectVersions(ctx, {
      object_type: 'table',
      object_name: 'zmy_table',
    });

    expect(result.isError).toBe(false);
    expect(mockGetTable).toHaveBeenCalled();
    expect(mockTableGetVersions).toHaveBeenCalledWith({
      tableName: 'ZMY_TABLE',
    });
    expect(payload(result).versions).toEqual([]);
  });

  it('forwards content_uri to getVersionSource', async () => {
    mockClassGetVersionSource.mockResolvedValue('CLASS zcl_x DEFINITION.');

    const result = await handleGetObjectVersionSource(ctx, {
      object_type: 'class',
      content_uri: '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
    });

    expect(result.isError).toBe(false);
    expect(mockClassGetVersionSource).toHaveBeenCalledWith(
      '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
    );
    const data = payload(result);
    expect(data.success).toBe(true);
    expect(data.source).toBe('CLASS zcl_x DEFINITION.');
  });

  it('returns an error for an unknown object_type', async () => {
    const result = await handleGetObjectVersions(ctx, {
      object_type: 'nonsense',
      object_name: 'X',
    });

    expect(result.isError).toBe(true);
    expect(mockClassGetVersions).not.toHaveBeenCalled();
  });
});
