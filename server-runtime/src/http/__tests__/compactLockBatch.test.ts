/**
 * Compact's lock chain in batch mode over Streamable HTTP: N objects locked
 * in one batch, written in the next, unlocked in the third — each batch
 * reached by the instance's `state_handle`. The locks recorded in the lock
 * batch are held for the instance once their parts are answered at
 * `HandlerBatch` end, so the write batch and the unlock batch are recorded under them;
 * every envelope goes on the instance's one SAP session. Real HTTP to the ADT
 * stand-in; each envelope part answered as SAP would — a LOCK with a handle of
 * its own object.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { assertMatchObject } from '../../../../src/__tests__/helpers/assertions';
import {
  envelopeResponse,
  innerRequests,
} from '../../../../src/__tests__/helpers/batchEnvelope';
import { CompactBatchHandlersGroup } from '../../../../src/lib/compact/batch/group';
import {
  basicHeaders,
  type HttpStand,
  httpStand,
  turns,
} from './shutdown/harness';

const placeholder = { connection: undefined } as unknown as HandlerContext;
const OBJECTS = ['ZCL_B1', 'ZCL_B2', 'ZCL_B3'];

let s: HttpStand;

const isEnvelope = (url: string) => url.includes('/communication/batch');
const envelopes = () =>
  s.standIn.requests.filter((r) => isEnvelope(r.url) && r.method === 'POST');
/** Every inner request the envelopes carried, in order. */
const parts: Array<{ method: string; url: string }> = [];

/** The handle SAP answers a LOCK of `url`'s class: one per object. */
const handleOf = (url: string) =>
  `HANDLE_${url.split('/oo/classes/')[1]?.split(/[?/]/)[0]?.toUpperCase()}`;

const lockAnswer = (handle: string) =>
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
  `<asx:values><DATA><LOCK_HANDLE>${handle}</LOCK_HANDLE>` +
  '<CORRNR/><CORRUSER/><CORRTEXT/><IS_LOCAL>X</IS_LOCAL><IS_LINK_UP/>' +
  '<MODIFICATION_SUPPORT>NoModification</MODIFICATION_SUPPORT><LINK_UP_MODE/>' +
  '<CORR_LOCKS/><CORR_CONTENTS/><SCOPE_MESSAGES/></DATA></asx:values></asx:abap>';

beforeEach(async () => {
  parts.length = 0;
  mock.method(console, 'error', () => {});
  s = await httpStand({
    server: { batch: { keepRawParts: false } },
    groups: [
      new CompactModifyHandlersGroup(placeholder),
      new CompactBatchHandlersGroup(placeholder),
    ],
  });
  s.standIn.respond(
    (r) => isEnvelope(r.url) && r.method === 'POST',
    (r) => {
      const inner = innerRequests({
        url: r.url,
        method: r.method,
        headers: { 'content-type': r.contentType ?? '' },
        data: r.body,
        timeout: 0,
      });
      parts.push(...inner.map((p) => ({ method: p.method, url: p.url })));
      const answer = envelopeResponse(
        inner.map((part) =>
          part.url.includes('_action=LOCK')
            ? {
                status: 200,
                statusText: 'OK',
                headers: {
                  'content-type':
                    'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result',
                },
                body: lockAnswer(handleOf(part.url)),
              }
            : { status: 200, statusText: 'OK' },
        ),
      );
      return {
        status: answer.status,
        headers: answer.headers as Record<string, string>,
        text: String(answer.data),
      };
    },
  );
});

afterEach(async () => {
  // The server logs a request's end after its answer went out.
  await turns(20);
  await s.close();
  mock.restoreAll();
});

const withHeader = (handle: string) => ({
  ...basicHeaders(s.standIn.url),
  'x-mcp-state-handle': handle,
});

async function batch(
  stateHandle: string | undefined,
  calls: Array<[string, Record<string, unknown>]>,
): Promise<{ stateHandle: string; answers: Array<Record<string, unknown>> }> {
  const begun = await s.call(
    'HandlerBatch',
    { action: 'begin' },
    stateHandle === undefined ? undefined : withHeader(stateHandle),
  );
  assert.equal(begun.isError, false);
  const handle = (JSON.parse(begun.text) as { state_handle: string })
    .state_handle;
  if (stateHandle !== undefined) assert.equal(handle, stateHandle);
  for (const [tool, args] of calls) {
    const recorded = await s.call(tool, args, withHeader(handle));
    assert.deepStrictEqual(
      { tool, recorded: recorded.isError },
      {
        tool,
        recorded: false,
      },
    );
  }
  const ended = await s.call(
    'HandlerBatch',
    { action: 'end' },
    withHeader(handle),
  );
  assertMatchObject(JSON.parse(ended.text), {
    recorded: calls.length,
    sent: calls.length,
    received: calls.length,
  });
  const answers: Array<Record<string, unknown>> = [];
  for (let n = 1; n <= calls.length; n += 1) {
    const read = await s.call(
      'HandlerBatch',
      { action: 'answers', number: n },
      withHeader(handle),
    );
    assert.equal(read.isError, false);
    answers.push(JSON.parse(read.text) as Record<string, unknown>);
  }
  return { stateHandle: handle, answers };
}

/** A batch answer's tool answer, parsed: `HandlerBatch` answers names it beside its number. */
const answerOf = (entry: Record<string, unknown>): Record<string, unknown> => {
  const text = JSON.stringify(entry);
  const at = text.indexOf('lock_handle');
  assert.ok(at > -1);
  return entry;
};

it('lock batch, write batch, unlock batch: the handles held for the instance, every envelope on one SAP session', async () => {
  const locked = await batch(
    undefined,
    OBJECTS.map((name) => [
      'HandlerLock',
      { object_type: 'CLASS', object_name: name },
    ]),
  );
  const handles = OBJECTS.map((name) => `HANDLE_${name}`);
  for (const [i, entry] of locked.answers.entries()) {
    answerOf(entry);
    assert.ok(JSON.stringify(entry).includes(handles[i]));
  }

  await batch(
    locked.stateHandle,
    OBJECTS.map((name, i) => [
      'HandlerUpdate',
      {
        object_type: 'CLASS',
        class_name: name,
        source_code: `CLASS ${name} DEFINITION. ENDCLASS.`,
        lock_handle: handles[i],
      },
    ]),
  );
  await batch(
    locked.stateHandle,
    OBJECTS.map((name, i) => [
      'HandlerLock',
      {
        action: 'unlock',
        object_type: 'CLASS',
        object_name: name,
        lock_handle: handles[i],
      },
    ]),
  );

  assert.equal(envelopes().length, 3);
  assert.equal(new Set(envelopes().map((r) => r.session)).size, 1);
  assert.equal(parts.filter((p) => p.url.includes('_action=LOCK')).length, 3);
  const puts = parts.filter((p) => p.method === 'PUT');
  assert.equal(puts.length, 3);
  for (const [i, handle] of handles.entries()) {
    assert.ok(puts[i]?.url.includes(`lockHandle=${handle}`));
  }
  assert.equal(parts.filter((p) => p.url.includes('_action=UNLOCK')).length, 3);
});

it('without the state_handle a write batch on another instance is refused before anything is recorded', async () => {
  const locked = await batch(undefined, [
    ['HandlerLock', { object_type: 'CLASS', object_name: 'ZCL_B1' }],
  ]);
  assert.ok(JSON.stringify(locked.answers[0]).includes('HANDLE_ZCL_B1'));
  const updated = await s.call('HandlerUpdate', {
    object_type: 'CLASS',
    class_name: 'ZCL_B1',
    source_code: 'CLASS ZCL_B1 DEFINITION. ENDCLASS.',
    lock_handle: 'HANDLE_ZCL_B1',
  });
  assert.equal(updated.isError, true);
  assert.ok(updated.text.includes('lock_handle is not held by this instance'));
  assert.deepStrictEqual(
    parts.filter((p) => p.method === 'PUT'),
    [],
  );
});
