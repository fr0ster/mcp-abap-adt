/**
 * Unit tests (#30): version-diff tools.
 *  - generic GetObjectVersionDiff fetches BOTH content_uris via getVersionSource
 *    and returns a unified diff with changed lines + identical:false when the
 *    sources differ, identical:true when equal;
 *  - per-object GetClassVersionDiff is registered in the HighLevel group with the
 *    right available_in and forwards both content_uris;
 *  - an unknown object_type returns an error.
 * SAP-free via a mocked AdtClient.
 */

const mockClassGetVersionSource = jest.fn();
const mockGetClass = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getClass: mockGetClass,
  }),
}));

import { buildObjectVersionTools } from '../../handlers/common/high/objectVersionTools';
import { handleGetObjectVersionDiff } from '../../handlers/common/readonly/handleGetObjectVersionDiff';
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
  mockClassGetVersionSource.mockReset();
  mockGetClass.mockReset();
  mockGetClass.mockReturnValue({ getVersionSource: mockClassGetVersionSource });
});

describe('version diff tools (#30)', () => {
  it('generic GetObjectVersionDiff fetches both uris and reports differences', async () => {
    mockClassGetVersionSource
      .mockResolvedValueOnce('line one\nold middle\nline three\n')
      .mockResolvedValueOnce('line one\nnew middle\nline three\n');

    const result = await handleGetObjectVersionDiff(ctx, {
      object_type: 'class',
      content_uri_from:
        '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
      content_uri_to: '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00002',
    });

    expect(result.isError).toBe(false);
    expect(mockClassGetVersionSource).toHaveBeenCalledTimes(2);
    expect(mockClassGetVersionSource).toHaveBeenNthCalledWith(
      1,
      '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
    );
    expect(mockClassGetVersionSource).toHaveBeenNthCalledWith(
      2,
      '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00002',
    );

    const data = payload(result);
    expect(data.success).toBe(true);
    expect(data.object_type).toBe('class');
    expect(data.identical).toBe(false);
    expect(data.diff).toContain('-old middle');
    expect(data.diff).toContain('+new middle');
  });

  it('generic GetObjectVersionDiff reports identical:true for equal sources', async () => {
    mockClassGetVersionSource.mockResolvedValue('same\nsource\n');

    const result = await handleGetObjectVersionDiff(ctx, {
      object_type: 'class',
      content_uri_from: '/x?version=00001',
      content_uri_to: '/x?version=00002',
    });

    expect(result.isError).toBe(false);
    const data = payload(result);
    expect(data.identical).toBe(true);
  });

  it('returns an error for an unknown object_type', async () => {
    const result = await handleGetObjectVersionDiff(ctx, {
      object_type: 'nonsense',
      content_uri_from: '/x?version=00001',
      content_uri_to: '/x?version=00002',
    });
    expect(result.isError).toBe(true);
    expect(mockClassGetVersionSource).not.toHaveBeenCalled();
  });

  it('per-object GetClassVersionDiff forwards both content_uris', async () => {
    mockClassGetVersionSource
      .mockResolvedValueOnce('a\n')
      .mockResolvedValueOnce('b\n');

    const result = await tool('GetClassVersionDiff').handler(ctx, {
      content_uri_from: '/cls?version=00001',
      content_uri_to: '/cls?version=00002',
    });

    expect(result.isError).toBe(false);
    expect(mockClassGetVersionSource).toHaveBeenNthCalledWith(
      1,
      '/cls?version=00001',
    );
    expect(mockClassGetVersionSource).toHaveBeenNthCalledWith(
      2,
      '/cls?version=00002',
    );
    const data = payload(result);
    expect(data.identical).toBe(false);
    expect(data.object_type).toBe('class');
  });

  it('GetClassVersionDiff errors without both content_uris', async () => {
    const result = await tool('GetClassVersionDiff').handler(ctx, {
      content_uri_from: '/cls?version=00001',
    });
    expect(result.isError).toBe(true);
    expect(mockClassGetVersionSource).not.toHaveBeenCalled();
  });

  it('the factory builds 13 VersionDiff tools (39 total) and they register in High', () => {
    const names = buildObjectVersionTools().map((e) => e.toolDefinition.name);
    const diffNames = names.filter((n) => n.endsWith('VersionDiff'));
    expect(diffNames.length).toBe(13);
    expect(names.length).toBe(39);

    const group = new HighLevelHandlersGroup({
      connection: {},
      logger: undefined,
    } as any);
    const registered = group.getHandlers().map((e) => e.toolDefinition.name);
    for (const n of diffNames) {
      expect(registered).toContain(n);
    }
    // class diff mirrors GetClass available_in
    expect(tool('GetClassVersionDiff').toolDefinition.available_in).toEqual([
      'onprem',
      'cloud',
      'legacy',
    ]);
    // program diff is onprem/legacy-gated (mirrors GetProgram)
    expect(tool('GetProgramVersionDiff').toolDefinition.available_in).toEqual([
      'onprem',
      'legacy',
    ]);
  });
});
