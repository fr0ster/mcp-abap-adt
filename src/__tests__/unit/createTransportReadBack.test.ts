/**
 * Once SAP has created a request, its number is never lost (Codex P1 on
 * terse answers): a read-back that fails — refused, or an answer that is not
 * the request created — is answered as a success carrying the number, with
 * fixed words naming how to read it again, at terse, medium and full;
 * `full` is the parse of the create's answer. `raw` is what ADT sent: the
 * create's document and the request read back, so a failed read-back shows
 * as the missing document (the coordinator's ruling, Codex round 4).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

const head = '<?xml version="1.0" encoding="utf-8"?>';
const NUMBER = 'SIDK900011';
const CREATED = `${head}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest"><tm:request tm:number="${NUMBER}" tm:desc="x" tm:type="K" tm:target="LOCAL"><tm:task tm:owner="SAPUSER01"/></tm:request></tm:root>`;
const READ_BACK_WORDS = (kind: string) =>
  `the request ${NUMBER} was created, but reading it back failed (${kind}): read it with GetTransport, transport_number ${NUMBER}`;

const run = async (
  readBack: { data: string; status?: number },
  detail: string,
) => {
  const connection = recordingConnection([{ data: CREATED }, readBack]);
  declareSystemKind(connection, 'onprem');
  return (await handleCreateTransport(
    { connection, logger: undefined } as never,
    { description: 'x', detail } as never,
  )) as { isError?: boolean; content: Array<{ text?: string }> };
};

describe('CreateTransport keeps the created number when the read-back fails', () => {
  beforeEach(() =>
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    }),
  );
  afterEach(() => resetSystemContextCache());

  for (const [label, readBack, kind] of [
    [
      'a read-back that is not the request',
      { data: `${head}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"/>` },
      'malformed',
    ],
    [
      'a read-back that is no transport document',
      { data: `${head}<html/>` },
      'malformed',
    ],
    ['a refused read-back', { data: 'boom', status: 500 }, 'server'],
    [
      'a read-back refused for its credentials',
      { data: 'no', status: 401 },
      'authentication',
    ],
  ] as const) {
    it(`${label}: terse answers the number and how to read it again`, async () => {
      const answered = await run(readBack, 'terse');
      assert.equal(answered.isError === true, false, answered.content[0]?.text);
      const body = JSON.parse(answered.content[0]?.text ?? '{}');
      assert.equal(body.transport_number, NUMBER);
      assert.equal(body.task_number, null);
      assert.equal(body.note, READ_BACK_WORDS(kind));
    });

    it(`${label}: raw is the create's document alone — the read-back missing`, async () => {
      const answered = await run(readBack, 'raw');
      assert.equal(answered.isError === true, false, answered.content[0]?.text);
      assert.equal(answered.content[0]?.text, JSON.stringify([CREATED]));
    });

    for (const detail of ['medium', 'full'] as const) {
      it(`${label}: detail ${detail} still succeeds and names the number`, async () => {
        const answered = await run(readBack, detail);
        assert.equal(
          answered.isError === true,
          false,
          answered.content[0]?.text,
        );
        assert.ok((answered.content[0]?.text ?? '').includes(NUMBER));
      });
    }
  }

  it('a read-back that came: raw is the create and the request read back, in order', async () => {
    const READ = `${head}<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core" tm:object_type="R" adtcore:name="${NUMBER}"><tm:request tm:number="${NUMBER}" tm:owner="SAPUSER01" tm:desc="x" tm:type="K" tm:status="D"><tm:task tm:number="SIDK900012" tm:owner="SAPUSER01" tm:desc="x" tm:type="X" tm:status="D"/></tm:request></tm:root>`;
    const connection = recordingConnection([{ data: CREATED }, { data: READ }]);
    declareSystemKind(connection, 'onprem');
    const answered = (await handleCreateTransport(
      { connection, logger: undefined } as never,
      { description: 'x', task_type: 'X', detail: 'raw' } as never,
    )) as { isError?: boolean; content: Array<{ text?: string }> };
    assert.equal(answered.isError === true, false, answered.content[0]?.text);
    assert.equal(answered.content[0]?.text, JSON.stringify([CREATED, READ]));
  });

  it('full is the parse of the create, raw its document: not the same', async () => {
    const full = (await run({ data: `${head}<html/>` }, 'full')).content[0]
      ?.text;
    const raw = (await run({ data: `${head}<html/>` }, 'raw')).content[0]?.text;
    assert.notEqual(full, raw);
    assert.equal(raw, JSON.stringify([CREATED]));
    assert.ok(!(full ?? '').includes('<tm:root'));
  });

  it('a read-back the connection refuses (AuthRefusedError) keeps the number at every level, raw as the missing document', async () => {
    for (const detail of ['terse', 'medium', 'full', 'raw'] as const) {
      let sent = 0;
      const connection = recordingConnection([{ data: CREATED }]);
      declareSystemKind(connection, 'onprem');
      const created = connection.makeAdtRequest.bind(connection);
      connection.makeAdtRequest = async (request: never) => {
        sent += 1;
        if (sent === 1) return created(request);
        throw new AuthRefusedError(
          authError.connection({
            problem: 'refused-after-renewal',
            at: 'request',
          }),
          'request',
        );
      };
      const answered = (await handleCreateTransport(
        { connection, logger: undefined } as never,
        { description: 'x', detail } as never,
      )) as { isError?: boolean; content: Array<{ text?: string }> };
      const text = answered.content[0]?.text ?? '';
      assert.equal(answered.isError === true, false, text);
      if (detail === 'raw') {
        assert.equal(text, JSON.stringify([CREATED]));
        continue;
      }
      assert.ok(text.includes(NUMBER), text);
      assert.ok(text.includes(READ_BACK_WORDS('authentication')), text);
    }
  });
});
