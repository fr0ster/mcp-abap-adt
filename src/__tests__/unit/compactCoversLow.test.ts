/**
 * What compact gained when the low set left the full binaries, beyond
 * the request parity of `lowToCompact.test.ts`: the refusals that keep the new
 * arguments honest, and the function-group read-back.
 */

import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { silentLogger } from '../helpers/lowToCompact';
import { recordingConnection } from '../helpers/recordingConnection';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

function tools(connection: unknown): Map<string, HandlerEntry> {
  const context = { connection, logger: silentLogger } as HandlerContext;
  return new Map(
    [
      ...compactModifyEntries(() => context),
      ...compactReadOnlyEntries(() => context),
    ].map((e) => [e.toolDefinition.name, e]),
  );
}

async function call(
  tool: string,
  args: Record<string, unknown>,
  connection = recordingConnection(),
): Promise<{ isError?: boolean; text: string; sent: number }> {
  const entry = tools(connection).get(tool);
  if (!entry) throw new Error(tool);
  const answered = (await (
    entry.handler as unknown as (a: unknown) => Promise<unknown>
  )(args)) as {
    isError?: boolean;
    content?: Array<{ text?: string }>;
  };
  return {
    isError: answered?.isError,
    text: answered?.content?.[0]?.text ?? '',
    sent: connection.requests.length,
  };
}

describe('compact covers what the low set did', () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  it('an update without lock_handle is refused before any request', async () => {
    const answered = await call('HandlerUpdate', {
      object_type: 'CLASS',
      class_name: 'CLAS_A',
      source_code: 'source text',
    });
    expect(answered.isError).toBe(true);
    expect(answered.text).toContain('lock_handle is required');
    expect(answered.sent).toBe(0);
  });

  it('an update under lock_handle is the one write: no lock, no unlock', async () => {
    const connection = recordingConnection();
    await call(
      'HandlerUpdate',
      {
        object_type: 'CLASS',
        class_name: 'CLAS_A',
        source_code: 'source text',
        lock_handle: 'LOCK_HANDLE_PLACEHOLDER',
      },
      connection,
    );
    expect(connection.requests.map((r) => r.method)).toEqual(['PUT']);
  });

  it('source_code is checked only for CLASS, STRUCTURE and DDL', async () => {
    const answered = await call('HandlerCheckRun', {
      object_type: 'PROGRAM',
      object_name: 'PROG_A',
      source_code: 'source text',
    });
    expect(answered.isError).toBe(true);
    expect(answered.text).toContain('source_code is checked only for');
    expect(answered.sent).toBe(0);
  });

  it.each(['object_structure', 'node_structure'])(
    'HandlerGet part=%s needs object_adt_type and object_name',
    async (part) => {
      const answered = await call('HandlerGet', {
        part,
        object_name: 'CLAS_A',
      });
      expect(answered.isError).toBe(true);
      expect(answered.text).toContain(
        'requires object_adt_type and object_name',
      );
      expect(answered.sent).toBe(0);
    },
  );

  it.each(['source', 'metadata', 'urls', 'contents'])(
    'HandlerGet part=%s without object_type is refused: object_type is required',
    async (part) => {
      const answered = await call('HandlerGet', { part });
      expect(answered.isError).toBe(true);
      expect(answered.text).toContain('object_type is required');
      expect(answered.text).not.toContain('undefined');
      expect(answered.sent).toBe(0);
    },
  );

  it('a function module is named GROUP|MODULE for validate and check', async () => {
    for (const tool of ['HandlerValidate', 'HandlerCheckRun']) {
      const answered = await call(tool, {
        object_type: 'FUNCTION_MODULE',
        object_name: 'FM_A',
      });
      expect(answered.isError).toBe(true);
      expect(answered.text).toContain('GROUP|FM_NAME');
      expect(answered.sent).toBe(0);
    }
  });

  it('HandlerCreate FUNCTION_GROUP sends no read-back after the interface 400 — the 400 is the answer', async () => {
    const refusal =
      '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
      '<namespace id="com.sap.adt"/><type id="ExceptionResourceCreationFailure"/>' +
      '<message lang="EN">Interface SAPLFUGR_A has not been created</message></exc:exception>';
    const connection = recordingConnection([
      { status: 400, statusText: 'Bad Request', data: refusal },
    ]);
    const answered = await call(
      'HandlerCreate',
      {
        object_type: 'FUNCTION_GROUP',
        function_group_name: 'FUGR_A',
        package_name: 'PKG_TARGET',
        transport_request: 'XXXK900001',
        description: 'Text',
      },
      connection,
    );
    // One request per compact call: whether the group landed is the
    // caller's next call (HandlerGet part metadata), not a read of ours.
    expect(connection.requests.map((r) => r.method)).toEqual(['POST']);
    expect(answered.isError).toBe(true);
    expect(answered.text).toContain('has not been created');
  });

  it('another refusal of a function group create is answered as it came, with no read', async () => {
    const connection = recordingConnection([
      { status: 400, statusText: 'Bad Request', data: '' },
    ]);
    const answered = await call(
      'HandlerCreate',
      {
        object_type: 'FUNCTION_GROUP',
        function_group_name: 'FUGR_A',
        package_name: 'PKG_TARGET',
        transport_request: 'XXXK900001',
        description: 'Text',
      },
      connection,
    );
    expect(connection.requests.map((r) => r.method)).toEqual(['POST']);
    expect(answered.isError).toBe(true);
  });

  it('HandlerActivate no longer names a low tool', async () => {
    const answered = await call('HandlerActivate', {
      object_type: 'FUNCTION_MODULE',
      object_name: 'FM_A',
    }).catch((error: Error) => ({ text: error.message }));
    expect(answered.text).toContain('parentName');
    expect(answered.text).not.toMatch(/\w+Low\b/);
  });
});
