/**
 * GetWhereUsed and the text elements: `PROG/PX` names whose text elements
 * it is by `container` — `program` or `function_group` — and no other type
 * takes one. Where-used of a program's and of a function group's text
 * elements answered `globalType="PROG/PX"` on premise and on the cloud
 * (measured, `texts-translation.md` §11, §12.6, §13.6).
 *
 * Replayed over a connection answering by request: real adt-clients code,
 * no SAP.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import {
  handleGetWhereUsed,
  TOOL_DEFINITION,
} from '../../../handlers/system/readonly/handleGetWhereUsed';
import { declareSystemKind } from '../../../lib/systemKind';

const NO_REFERENCES =
  '<?xml version="1.0" encoding="utf-8"?><usagereferences:usageReferenceResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences" numberOfResults="0"><usagereferences:referencedObjects/></usagereferences:usageReferenceResult>';

/** A connection answering every request with an empty where-used list. */
function system(variant: 'onprem' | 'cloud') {
  const requests: IAbapRequestOptions[] = [];
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      requests.push(options);
      // A recorded body is text; `T` is the caller's view of it.
      return {
        data: NO_REFERENCES as T,
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    },
  };
  declareSystemKind(connection, variant);
  return { context: { connection, logger: undefined }, requests };
}

/** The object address each where-used request named. */
function addresses(requests: readonly IAbapRequestOptions[]): string[] {
  return requests.map((r) => {
    const query = r.url.split('?')[1] ?? '';
    return new URLSearchParams(query).get('uri') ?? '';
  });
}

const schema = TOOL_DEFINITION.variants.cloud.inputSchema;

describe('GetWhereUsed: the container of PROG/PX', () => {
  it('refuses PROG/PX without container at the schema', () => {
    const parsed = schema.safeParse({
      object_name: 'ZPROG_X',
      object_type: 'PROG/PX',
    });
    assert.equal(parsed.success, false);
    assert.match(String(parsed.error?.message), /container/);
  });

  it('refuses PROG/PX without container in an objects entry at the schema', () => {
    const parsed = schema.safeParse({
      objects: [{ object_name: 'ZPROG_X', object_type: 'PROG/PX' }],
    });
    assert.equal(parsed.success, false);
    assert.match(String(parsed.error?.message), /container/);
  });

  it('refuses container beside another type at the schema', () => {
    const parsed = schema.safeParse({
      object_name: 'ZPROG_X',
      object_type: 'PROG/P',
      container: 'program',
    });
    assert.equal(parsed.success, false);
    assert.match(String(parsed.error?.message), /container/);
  });

  it('sends nothing for PROG/PX without container', async () => {
    const { context, requests } = system('onprem');
    const result = await handleGetWhereUsed(context, {
      object_name: 'ZPROG_X',
      object_type: 'PROG/PX',
    });
    assert.equal(result.isError, true);
    assert.deepEqual(requests, []);
  });

  for (const variant of ['onprem', 'cloud'] as const) {
    it(`asks where-used of a function group's text elements at their address (${variant})`, async () => {
      const { context, requests } = system(variant);
      const result = await handleGetWhereUsed(context, {
        object_name: 'ZFG_X',
        object_type: 'PROG/PX',
        container: 'function_group',
      });
      assert.notEqual(result.isError, true);
      assert.deepEqual(addresses(requests), [
        '/sap/bc/adt/textelements/functiongroups/zfg_x',
      ]);
    });
  }

  it("asks where-used of a program's text elements at their address", async () => {
    const { context, requests } = system('onprem');
    await handleGetWhereUsed(context, {
      object_name: 'ZPROG_X',
      object_type: 'PROG/PX',
      container: 'program',
    });
    assert.deepEqual(addresses(requests), [
      '/sap/bc/adt/textelements/programs/zprog_x',
    ]);
  });
});
