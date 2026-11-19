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

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { AdtObjectErrorCodes } from '@mcp-abap-adt/interfaces-adt';
import { buildObjectVersionTools } from '../../handlers/common/high/objectVersionTools';
import {
  TOOL_DEFINITION as GET_OBJECT_VERSION_DIFF,
  handleGetObjectVersionDiff,
} from '../../handlers/common/readonly/handleGetObjectVersionDiff';
import * as clients from '../../lib/clients';
import { HighLevelHandlersGroup } from '../../lib/handlers/groups/HighLevelHandlersGroup';
import { defineTool } from '../../lib/handlers/interfaces';
import { assertRejects } from '../helpers/assertions';
import { okResponse, refusedResponse } from '../helpers/fakeClient';
import { stateSystemKind } from '../helpers/systemKind';

// Made afresh before each case (Jest's mockReset): no one-off answer a case
// left unconsumed reaches the next one.
let mockClassGetVersionSource = mock.fn<(...args: any[]) => any>();
let mockGetClass = mock.fn<(...args: any[]) => any>();

// The declared variant the boundary checks a type argument against.
// The declared variant: the kind stated, read by the real variantOf.
stateSystemKind('onprem');
mock.method(clients, 'createAdtClient', () => ({
  // This case's mock, read when the client is asked.
  getClass: (...args: any[]) => mockGetClass(...args),
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
  mockClassGetVersionSource = mock.fn<(...args: any[]) => any>();
  mockGetClass = mock.fn<(...args: any[]) => any>(() => ({
    getVersionSource: mockClassGetVersionSource,
  }));
});

describe('version diff tools (#30)', () => {
  it('generic GetObjectVersionDiff fetches both uris and reports differences', async () => {
    // Two calls, each answered once, by the call index they are for.
    const first = mockClassGetVersionSource.mock.callCount();
    mockClassGetVersionSource.mock.mockImplementationOnce(
      async () => okResponse('line one\nold middle\nline three\n'),
      first,
    );
    mockClassGetVersionSource.mock.mockImplementationOnce(
      async () => okResponse('line one\nnew middle\nline three\n'),
      first + 1,
    );

    const result = await handleGetObjectVersionDiff(ctx, {
      object_type: 'class',
      content_uri_from:
        '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
      content_uri_to: '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00002',
    });

    assert.equal(result.isError, false);
    assert.equal(mockClassGetVersionSource.mock.callCount(), 2);
    {
      const called: any[] =
        mockClassGetVersionSource.mock.calls[0]?.arguments ?? [];
      assert.equal(called.length, 2);
      assert.deepStrictEqual(
        called[0],
        '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
      );
      assert.ok(typeof called[1]?.analyse === 'function');
    }
    {
      const called: any[] =
        mockClassGetVersionSource.mock.calls[1]?.arguments ?? [];
      assert.equal(called.length, 2);
      assert.deepStrictEqual(
        called[0],
        '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00002',
      );
      assert.ok(typeof called[1]?.analyse === 'function');
    }

    const data = payload(result);
    assert.equal(data.success, true);
    assert.equal(data.object_type, 'class');
    assert.equal(data.identical, false);
    assert.ok(data.diff.includes('-old middle'));
    assert.ok(data.diff.includes('+new middle'));
  });

  it('generic GetObjectVersionDiff reports identical:true for equal sources', async () => {
    mockClassGetVersionSource.mock.mockImplementation(async () =>
      okResponse('same\nsource\n'),
    );

    const result = await handleGetObjectVersionDiff(ctx, {
      object_type: 'class',
      content_uri_from: '/x?version=00001',
      content_uri_to: '/x?version=00002',
    });

    assert.equal(result.isError, false);
    const data = payload(result);
    assert.equal(data.identical, true);
  });

  it('refuses an unknown object_type at the schema', async () => {
    const refused = assertRejects(
      defineTool(GET_OBJECT_VERSION_DIFF, handleGetObjectVersionDiff).call(
        ctx,
        {
          object_type: 'nonsense',
          content_uri_from: '/x?version=00001',
          content_uri_to: '/x?version=00002',
        },
      ),
      'Invalid arguments for tool GetObjectVersionDiff: ',
    );
    await refused;
    assert.equal(mockClassGetVersionSource.mock.callCount(), 0);
  });

  it('per-object GetClassVersionDiff forwards both content_uris', async () => {
    // Two calls, each answered once, by the call index they are for.
    const first = mockClassGetVersionSource.mock.callCount();
    mockClassGetVersionSource.mock.mockImplementationOnce(
      async () => okResponse('a\n'),
      first,
    );
    mockClassGetVersionSource.mock.mockImplementationOnce(
      async () => okResponse('b\n'),
      first + 1,
    );

    const result = await tool('GetClassVersionDiff').handler(ctx, {
      content_uri_from: '/cls?version=00001',
      content_uri_to: '/cls?version=00002',
    });

    assert.equal(result.isError, false);
    {
      const called: any[] =
        mockClassGetVersionSource.mock.calls[0]?.arguments ?? [];
      assert.equal(called.length, 2);
      assert.deepStrictEqual(called[0], '/cls?version=00001');
      assert.ok(typeof called[1]?.analyse === 'function');
    }
    {
      const called: any[] =
        mockClassGetVersionSource.mock.calls[1]?.arguments ?? [];
      assert.equal(called.length, 2);
      assert.deepStrictEqual(called[0], '/cls?version=00002');
      assert.ok(typeof called[1]?.analyse === 'function');
    }
    const data = payload(result);
    assert.equal(data.identical, false);
    assert.equal(data.object_type, 'class');
  });

  it('GetClassVersionDiff errors without both content_uris', async () => {
    const result = await tool('GetClassVersionDiff').handler(ctx, {
      content_uri_from: '/cls?version=00001',
    });
    assert.equal(result.isError, true);
    assert.equal(mockClassGetVersionSource.mock.callCount(), 0);
  });

  // adt-clients 19: "no version resource for this type" is a failure IN THE
  // ANSWER (`ok: false`, `code: AdtObjectErrorCodes.UNSUPPORTED_OPERATION`),
  // not a throw — see `IAdtVersionable.getVersionSource`'s own doc. The
  // generic handler reads both `getVersionSource` answers directly (via
  // `pair()`), so a refusal reaches `answer()` as the real `IAdtResponse` it
  // already is, and `failurePayload` carries the code alongside the message
  // — richer than the hand-written "not supported" sentence this handler
  // used to build, and richer than the `client_threw` shape a throw would
  // produce (see `handleGetObjectVersionDiff.ts`'s own comment on why
  // `unwrapVersionSource`/`buildVersionDiff` are no longer used here).
  it('generic GetObjectVersionDiff surfaces UNSUPPORTED_OPERATION as a refusal, code included', async () => {
    mockClassGetVersionSource.mock.mockImplementation(async () =>
      refusedResponse('version diff not available', {
        code: AdtObjectErrorCodes.UNSUPPORTED_OPERATION,
      }),
    );

    const result = await handleGetObjectVersionDiff(ctx, {
      object_type: 'class',
      content_uri_from:
        '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00001',
      content_uri_to: '/sap/bc/adt/oo/classes/zcl_x/source/main?version=00002',
    });

    assert.equal(result.isError, true);
    const errText =
      (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
    assert.ok(!errText.includes('stack'));
    const payload = JSON.parse(errText);
    assert.equal(payload.message, 'version diff not available');
    assert.equal(payload.code, AdtObjectErrorCodes.UNSUPPORTED_OPERATION);
    assert.equal(payload.origin, 'refusal');
  });

  it('per-object GetClassVersionDiff answers the error of the read as it is, with its step', async () => {
    // `objectVersionTools.ts` (untouched by this task) still catches
    // `buildVersionDiff`'s throw and reads `.code` off it directly — a plain
    // reject here exercises exactly that path, same as before this migration.
    mockClassGetVersionSource.mock.mockImplementation(async () =>
      refusedResponse('version diff not available', {
        code: AdtObjectErrorCodes.UNSUPPORTED_OPERATION,
      }),
    );

    const result = await tool('GetClassVersionDiff').handler(ctx, {
      content_uri_from: '/cls?version=00001',
      content_uri_to: '/cls?version=00002',
    });

    assert.equal(result.isError, true);
    const errText =
      (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
    assert.ok(!errText.includes('stack'));
    const payload = JSON.parse(errText);
    assert.equal(payload.message, 'version diff not available');
    assert.equal(payload.code, AdtObjectErrorCodes.UNSUPPORTED_OPERATION);
    assert.equal(payload.origin, 'refusal');
    assert.equal(payload.step, 'read version source (from)');
  });

  it('the factory builds 9 VersionDiff tools (28 total) and they register in High', () => {
    const names = buildObjectVersionTools().map((e) => e.toolDefinition.name);
    const diffNames = names.filter((n) => n.endsWith('VersionDiff'));
    assert.equal(diffNames.length, 9);
    assert.equal(names.length, 28);

    const group = new HighLevelHandlersGroup({
      connection: {},
      logger: undefined,
    } as any);
    const registered = group.getHandlers().map((e) => e.toolDefinition.name);
    for (const n of diffNames) {
      assert.ok(registered.includes(n));
    }
    // class diff mirrors GetClass available_in
    assert.deepStrictEqual(
      tool('GetClassVersionDiff').toolDefinition.available_in,
      ['onprem', 'cloud'],
    );
    // program diff mirrors GetProgram: on premise and cloud
    assert.deepStrictEqual(
      tool('GetProgramVersionDiff').toolDefinition.available_in,
      ['onprem', 'cloud'],
    );
  });
});
