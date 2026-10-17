/**
 * Compact's lock chain in batch mode over Streamable HTTP: N objects locked
 * in one batch, written in the next, unlocked in the third — each batch
 * reached by the instance's `state_handle`. The locks recorded in the lock
 * batch are held for the instance once their parts are answered at
 * `BatchEnd`, so the write batch and the unlock batch are recorded under them;
 * every envelope goes on the instance's one SAP session. Real HTTP to the ADT
 * stand-in; each envelope part answered as SAP would — a LOCK with a handle of
 * its own object.
 */

import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import {
  BatchHandlersGroup,
  type HandlerContext,
} from '@mcp-abap-adt/lib/handlers';
import {
  envelopeResponse,
  innerRequests,
} from '../../../src/__tests__/helpers/batchEnvelope';
import {
  basicHeaders,
  type HttpStand,
  httpStand,
  turns,
} from './shutdown/harness';

jest.setTimeout(30_000);

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
  jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand({
    server: { batch: { keepRawParts: false } },
    groups: [
      new CompactModifyHandlersGroup(placeholder),
      new BatchHandlersGroup(placeholder),
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
  jest.restoreAllMocks();
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
    'BatchBegin',
    {},
    stateHandle === undefined ? undefined : withHeader(stateHandle),
  );
  expect(begun.isError).toBe(false);
  const handle = (JSON.parse(begun.text) as { state_handle: string })
    .state_handle;
  if (stateHandle !== undefined) expect(handle).toBe(stateHandle);
  for (const [tool, args] of calls) {
    const recorded = await s.call(tool, args, withHeader(handle));
    expect({ tool, recorded: recorded.isError }).toEqual({
      tool,
      recorded: false,
    });
  }
  const ended = await s.call('BatchEnd', {}, withHeader(handle));
  expect(JSON.parse(ended.text)).toMatchObject({
    recorded: calls.length,
    failed: [],
  });
  const answers: Array<Record<string, unknown>> = [];
  for (let n = 1; n <= calls.length; n += 1) {
    const read = await s.call(
      'BatchAnswers',
      { number: n },
      withHeader(handle),
    );
    expect(read.isError).toBe(false);
    answers.push(JSON.parse(read.text) as Record<string, unknown>);
  }
  return { stateHandle: handle, answers };
}

/** A batch answer's tool answer, parsed: `BatchAnswers` names it beside its number. */
const answerOf = (entry: Record<string, unknown>): Record<string, unknown> => {
  const text = JSON.stringify(entry);
  const at = text.indexOf('lock_handle');
  expect(at).toBeGreaterThan(-1);
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
    expect(JSON.stringify(entry)).toContain(handles[i]);
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
      'HandlerUnlock',
      { object_type: 'CLASS', object_name: name, lock_handle: handles[i] },
    ]),
  );

  expect(envelopes()).toHaveLength(3);
  expect(new Set(envelopes().map((r) => r.session)).size).toBe(1);
  expect(parts.filter((p) => p.url.includes('_action=LOCK'))).toHaveLength(3);
  const puts = parts.filter((p) => p.method === 'PUT');
  expect(puts).toHaveLength(3);
  for (const [i, handle] of handles.entries()) {
    expect(puts[i]?.url).toContain(`lockHandle=${handle}`);
  }
  expect(parts.filter((p) => p.url.includes('_action=UNLOCK'))).toHaveLength(
    3,
  );
});

it('without the state_handle a write batch on another instance is refused before anything is recorded', async () => {
  const locked = await batch(undefined, [
    ['HandlerLock', { object_type: 'CLASS', object_name: 'ZCL_B1' }],
  ]);
  expect(JSON.stringify(locked.answers[0])).toContain('HANDLE_ZCL_B1');
  const updated = await s.call('HandlerUpdate', {
    object_type: 'CLASS',
    class_name: 'ZCL_B1',
    source_code: 'CLASS ZCL_B1 DEFINITION. ENDCLASS.',
    lock_handle: 'HANDLE_ZCL_B1',
  });
  expect(updated.isError).toBe(true);
  expect(updated.text).toContain('lock_handle is not held by this instance');
  expect(parts.filter((p) => p.method === 'PUT')).toEqual([]);
});
