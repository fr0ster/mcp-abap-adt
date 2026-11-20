/**
 * What compact gained when the low set left the full binaries, beyond
 * the request parity of `lowToCompact.test.ts`: the refusals that keep the new
 * arguments honest, and the function-group read-back.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../lib/handlers/interfaces';
import { resetSystemContextCache } from '../../lib/systemContext';
import { holdingLockOf } from '../helpers/heldLocks';
import { silentLogger } from '../helpers/lowToCompact';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';
import { toolAnswer } from '../helpers/toolAnswer';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

function tools(): Map<string, HandlerEntry> {
  return new Map(
    [...compactModifyEntries(), ...compactReadOnlyEntries()].map((e) => [
      e.toolDefinition.name,
      e,
    ]),
  );
}

async function call(
  tool: string,
  args: Record<string, unknown>,
  connection = recordingConnection(),
): Promise<{ isError?: boolean | undefined; text: string; sent: number }> {
  const entry = tools().get(tool);
  if (!entry) throw new Error(tool);
  const context = { connection, logger: silentLogger } as HandlerContext;
  // Arguments the tool's schema refuses never reach its handler: the
  // refusal is the call's answer.
  const answered = await entry
    .call({ ...context, heldLocks: holdingLockOf(args) }, args)
    .then(toolAnswer, (error) => ({
      isError: true,
      content: [{ text: String(error) }],
    }));
  return {
    isError: answered.isError,
    text: answered.content[0]?.text ?? '',
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
    assert.equal(answered.isError, true);
    assert.ok(
      answered.text.includes(
        'Invalid arguments for tool HandlerUpdate: Invalid input: expected string, received undefined at lock_handle',
      ),
    );
    assert.equal(answered.sent, 0);
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
    assert.deepStrictEqual(
      connection.requests.map((r) => r.method),
      ['PUT'],
    );
  });

  it('source_code is checked only for CLASS, STRUCTURE and DDL', async () => {
    const answered = await call('HandlerCheckRun', {
      object_type: 'PROGRAM',
      object_name: 'PROG_A',
      source_code: 'source text',
    });
    assert.equal(answered.isError, true);
    assert.ok(answered.text.includes('source_code is checked only for'));
    assert.equal(answered.sent, 0);
  });

  for (const part of ['object_structure', 'node_structure']) {
    it(
      format('HandlerGet part=%s needs object_adt_type and object_name', part),
      async () => {
        const answered = await call('HandlerGet', {
          part,
          object_name: 'CLAS_A',
        });
        assert.equal(answered.isError, true);
        assert.ok(
          answered.text.includes('requires object_adt_type and object_name'),
        );
        assert.equal(answered.sent, 0);
      },
    );
  }

  for (const part of ['source', 'metadata', 'urls', 'contents']) {
    it(
      format(
        'HandlerGet part=%s without object_type is refused: object_type is required',
        part,
      ),
      async () => {
        const answered = await call('HandlerGet', { part });
        assert.equal(answered.isError, true);
        assert.ok(answered.text.includes('object_type is required'));
        assert.ok(!answered.text.includes('undefined'));
        assert.equal(answered.sent, 0);
      },
    );
  }

  it('a function module is named GROUP|MODULE for validate and check', async () => {
    for (const tool of ['HandlerValidate', 'HandlerCheckRun']) {
      const answered = await call(tool, {
        object_type: 'FUNCTION_MODULE',
        object_name: 'FM_A',
        // A validation states a description (SAP answers 400 without one):
        // given, so the name's form is what is refused.
        ...(tool === 'HandlerValidate' ? { description: 'Text' } : {}),
      });
      assert.equal(answered.isError, true);
      assert.ok(answered.text.includes('GROUP|FM_NAME'));
      assert.equal(answered.sent, 0);
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
    assert.deepStrictEqual(
      connection.requests.map((r) => r.method),
      ['POST'],
    );
    assert.equal(answered.isError, true);
    assert.ok(answered.text.includes('has not been created'));
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
    assert.deepStrictEqual(
      connection.requests.map((r) => r.method),
      ['POST'],
    );
    assert.equal(answered.isError, true);
  });

  it('HandlerActivate no longer names a low tool', async () => {
    const answered = await call('HandlerActivate', {
      object_type: 'FUNCTION_MODULE',
      object_name: 'FM_A',
    }).catch((error: Error) => ({ text: error.message }));
    assert.ok(answered.text.includes('function_group_name'));
    assert.doesNotMatch(answered.text, /\w+Low\b/);
  });
});
