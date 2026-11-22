/**
 * Unit tests (#30): GetObjectVersions + GetObjectVersionSource.
 *  - GetObjectVersions dispatches to the right client accessor per object_type
 *    and returns the version list;
 *  - GetObjectVersionSource forwards content_uri to getVersionSource;
 *  - an unknown object_type returns an error.
 * SAP-free via a mocked AdtClient.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { handleGetObjectVersionSource } from '../../handlers/common/readonly/handleGetObjectVersionSource';
import {
  TOOL_DEFINITION as GET_OBJECT_VERSIONS,
  handleGetObjectVersions,
} from '../../handlers/common/readonly/handleGetObjectVersions';
import * as clients from '../../lib/clients';
import { defineTool } from '../../lib/handlers/interfaces';
import { assertRejects } from '../helpers/assertions';
import { okResponse } from '../helpers/fakeClient';
import { stateSystemKind } from '../helpers/systemKind';

const mockClassGetVersions = mock.fn<(...args: any[]) => any>();
const mockClassGetVersionSource = mock.fn<(...args: any[]) => any>();
const mockTableGetVersions = mock.fn<(...args: any[]) => any>();
const mockGetClass = mock.fn<(...args: any[]) => any>();
const mockGetTable = mock.fn<(...args: any[]) => any>();

// The declared variant the boundary checks a type argument against.
// The declared variant: the kind stated, read by the real variantOf.
stateSystemKind('onprem');
mock.method(clients, 'createAdtClient', () => ({
  getClass: mockGetClass,
  getTable: mockGetTable,
}));

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

describe('GetObjectVersions / GetObjectVersionSource (#30)', () => {
  beforeEach(() => {
    mockClassGetVersions.mock.resetCalls();
    mockClassGetVersions.mock.mockImplementation(() => undefined);
    mockClassGetVersionSource.mock.resetCalls();
    mockClassGetVersionSource.mock.mockImplementation(() => undefined);
    mockTableGetVersions.mock.resetCalls();
    mockTableGetVersions.mock.mockImplementation(() => undefined);
    mockGetClass.mock.resetCalls();
    mockGetClass.mock.mockImplementation(() => undefined);
    mockGetTable.mock.resetCalls();
    mockGetTable.mock.mockImplementation(() => undefined);
    mockGetClass.mock.mockImplementation(() => ({
      getVersions: mockClassGetVersions,
      getVersionSource: mockClassGetVersionSource,
    }));
    mockGetTable.mock.mockImplementation(() => ({
      getVersions: mockTableGetVersions,
      getVersionSource: mock.fn<(...args: any[]) => any>(),
    }));
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
    mockClassGetVersions.mock.mockImplementation(async () =>
      okResponse({ versions, document: '<feed/>' }),
    );

    const result = await handleGetObjectVersions(ctx, {
      object_type: 'class',
      object_name: 'zcl_my_class',
      detail: 'full',
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
    mockClassGetVersions.mock.mockImplementation(async () =>
      okResponse({ versions, document: '<feed/>' }),
    );

    const result = await handleGetObjectVersions(ctx, {
      object_type: 'class',
      object_name: 'zcl_my_class',
      detail: 'full',
    });

    assert.equal(result.isError, false);
    const v = payload(result).versions[0];
    assert.equal(v.transportRequest, 'DS4K901917');
    assert.equal(v.transportDescription, 'My change');
  });

  it('raw answers the version feed as ADT sent it', async () => {
    mockClassGetVersions.mock.mockImplementation(async () =>
      okResponse({ versions: [], document: '<atom:feed>RAW</atom:feed>' }),
    );
    const result = await handleGetObjectVersions(ctx, {
      object_type: 'class',
      object_name: 'ZCL_X',
      detail: 'raw',
    });
    assert.equal(result.content[0]?.text, '<atom:feed>RAW</atom:feed>');
  });

  it('terse, by default: a TSV row per version, its content_uri the next read', async () => {
    mockClassGetVersions.mock.mockImplementation(async () =>
      okResponse({
        document: '<feed/>',
        versions: [
          {
            versionId: '00002',
            author: 'DEV',
            updatedAt: '2026-06-30T00:00:00Z',
            title: 'Version List',
            transportRequest: 'DS4K901917',
            contentUri: '/sap/bc/adt/x;version=00002',
          },
        ],
      }),
    );
    const result = await handleGetObjectVersions(ctx, {
      object_type: 'class',
      object_name: 'zcl_my_class',
    });
    assert.equal(
      (result.content[0] as { text: string }).text,
      [
        '# object class ZCL_MY_CLASS',
        'versionId\tauthor\tupdatedAt\ttransport\tcontent_uri',
        '00002\tDEV\t2026-06-30T00:00:00Z\tDS4K901917\t/sap/bc/adt/x;version=00002',
      ].join('\n'),
    );
  });

  it('dispatches a table to getTable().getVersions with tableName', async () => {
    mockTableGetVersions.mock.mockImplementation(async () =>
      okResponse({ versions: [], document: '<feed/>' }),
    );

    const result = await handleGetObjectVersions(ctx, {
      object_type: 'table',
      object_name: 'zmy_table',
      detail: 'full',
    });

    assert.equal(result.isError, false);
    assert.ok(mockGetTable.mock.callCount() > 0);
    assert.ok(
      mockTableGetVersions.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], {
            tableName: 'ZMY_TABLE',
          }) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    assert.deepStrictEqual(payload(result).versions, []);
  });

  it('forwards content_uri to getVersionSource', async () => {
    mockClassGetVersionSource.mock.mockImplementation(async () =>
      okResponse('CLASS zcl_x DEFINITION.'),
    );

    const result = await handleGetObjectVersionSource(ctx, {
      object_type: 'class',
      content_uri: '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
    });

    assert.equal(result.isError, false);
    assert.ok(
      mockClassGetVersionSource.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(
            a[0],
            '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
          ) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    const data = payload(result);
    assert.equal(data.success, true);
    assert.equal(data.source, 'CLASS zcl_x DEFINITION.');
  });

  it('refuses an unknown object_type at the schema', async () => {
    const refused = assertRejects(
      defineTool(GET_OBJECT_VERSIONS, handleGetObjectVersions).call(ctx, {
        object_type: 'nonsense',
        object_name: 'X',
      }),
      'Invalid arguments for tool GetObjectVersions: ',
    );
    await refused;
    assert.equal(mockClassGetVersions.mock.callCount(), 0);
  });
});
