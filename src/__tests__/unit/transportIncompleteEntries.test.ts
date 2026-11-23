/**
 * A task entry SAP lists without a name or a type (adt-strategies 0.28.2,
 * `incompleteEntries`; Codex P1-4) reaches the answer at every level of
 * GetTransport and ReadTransportObjects, with every identity field it
 * carries, and is counted. Codex's case: an entry with a type and a position
 * but no name.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetTransport } from '../../handlers/transport/readonly/handleGetTransport';
import { handleReadTransportObjects } from '../../handlers/transport/readonly/handleReadTransportObjects';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';
import { TASK, TASK_WITH_OBJECTS } from '../helpers/transportTaskDocuments';

process.env.SAP_SYSTEM_TYPE = 'onprem';

/** The task's two entries and, after them, one with a type and a position but no name. */
const NAMELESS = TASK_WITH_OBJECTS.replace(
  '</tm:task>',
  '<tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:position="000003"/></tm:task>',
);

type Level = 'terse' | 'medium' | 'full' | 'raw';

async function textOf(
  handler: typeof handleGetTransport | typeof handleReadTransportObjects,
  detail: Level,
): Promise<string> {
  const connection = recordingConnection([{ data: NAMELESS }]);
  declareSystemKind(connection, 'onprem');
  const answered = await handler(
    { connection, logger: undefined } as never,
    {
      transport_number: TASK,
      detail,
    } as never,
  );
  assert.equal(answered.isError === true, false, answered.content[0]?.text);
  return answered.content[0]?.text ?? '';
}

describe('an entry SAP lists without a name reaches the answer', () => {
  it('the document holds it', () => {
    assert.notEqual(NAMELESS, TASK_WITH_OBJECTS);
  });

  it('GetTransport terse: a row of its identity fields, counted', async () => {
    const body = JSON.parse(await textOf(handleGetTransport, 'terse'));
    assert.deepStrictEqual(body.incomplete_objects, [
      { pgmid: 'R3TR', type: 'PROG', position: '000003' },
    ]);
    assert.equal(body.objects.length, 2);
    assert.equal(body.object_count, 3);
  });

  it('ReadTransportObjects terse: an incomplete line, counted', async () => {
    const lines = (await textOf(handleReadTransportObjects, 'terse')).split(
      '\n',
    );
    assert.ok(lines.includes('# count 3'), lines.join('\n'));
    assert.ok(
      lines.includes(
        `# incomplete\ttask=${TASK}\tpgmid=R3TR\ttype=PROG\tposition=000003`,
      ),
      lines.join('\n'),
    );
  });

  it('ReadTransportObjects medium: incomplete_objects, counted', async () => {
    const body = JSON.parse(await textOf(handleReadTransportObjects, 'medium'));
    assert.equal(body.count, 3);
    assert.deepStrictEqual(body.incomplete_objects, [
      { task: TASK, pgmid: 'R3TR', type: 'PROG', position: '000003' },
    ]);
  });

  for (const handler of [handleGetTransport, handleReadTransportObjects]) {
    for (const detail of ['medium', 'full', 'raw'] as const) {
      if (handler === handleReadTransportObjects && detail === 'medium') {
        continue;
      }
      it(`${handler.name} ${detail}: the entry is in the answer`, async () => {
        assert.ok((await textOf(handler, detail)).includes('000003'));
      });
    }
  }
});
