import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { handleAddTransportObject } from '../../handlers/transport/high/handleAddTransportObject';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import { handleCreateTransportTask } from '../../handlers/transport/high/handleCreateTransportTask';
import { handleRemoveTransportObject } from '../../handlers/transport/high/handleRemoveTransportObject';
import { handleReadTransportActionLog } from '../../handlers/transport/readonly/handleReadTransportActionLog';
import { handleReadTransportObjects } from '../../handlers/transport/readonly/handleReadTransportObjects';
import * as clients from '../../lib/clients';
import { assertMatchObject } from '../helpers/assertions';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

mock.method(clients, 'createAdtClient', () => fakeClient);

/**
 * The five tools that answer fr0ster/mcp-abap-adt#221.
 *
 * What they are for: deleting an ABAP object does not free its name. The CTS
 * object-directory entry stays on the request that carried it — deliberately,
 * so that transporting the request deletes the object in the target system
 * too — and until it is detached, creating the same name again is refused with
 * `CTS_WBO_API 019`, even passing that same request. Before these, the ways
 * out were releasing the whole request, shipping everything else in it, or
 * SE09.
 *
 * What these tests hold in place is the part measured against an on-premise
 * system on 2026-09-21 and easy to lose later: **a `200` from a user action
 * is not evidence**, and the arguments the server will not fill in itself.
 */

let fakeClient: any;

const context = { connection: {} as any, logger: undefined };
const body = (result: any) => JSON.parse(result.content[0].text);

describe('ReadTransportObjects', () => {
  /**
   * A task document as `structured` parses one: entries under a task, with
   * their attributes under `@`. Shaped after the `removeobject` echo, the one
   * document of this media type captured whole.
   */
  const document = {
    'tm:root': {
      '@': { 'tm:number': 'SIDK905942' },
      'tm:request': {
        'tm:task': {
          '@': { 'tm:number': 'SIDK905943' },
          'tm:abap_object': [
            {
              '@': {
                'tm:pgmid': 'R3TR',
                'tm:type': 'FUGR',
                'tm:name': 'ZMCP_BLD_FGR_H1',
                'tm:obj_desc': 'Function Group',
                'tm:position': '000025',
                'tm:lock_status': '',
              },
            },
            {
              '@': {
                'tm:pgmid': 'R3TR',
                'tm:type': 'CLAS',
                'tm:name': 'ZCL_X',
                'tm:position': '000026',
              },
            },
          ],
        },
      },
    },
  };

  it('answers the entries with the positions a removal needs', async () => {
    let asked: unknown;
    fakeClient = fakeClientOf({
      readObjects: (number: unknown) => {
        asked = number;
        return okResponse(reading(document as never));
      },
    });

    const result = await handleReadTransportObjects(context as any, {
      transport_number: 'SIDK905943',
    });

    assert.equal(asked, 'SIDK905943');
    const answered = body(result);
    assert.equal(answered.count, 2);
    assertMatchObject(answered.objects[0], {
      pgmid: 'R3TR',
      type: 'FUGR',
      name: 'ZMCP_BLD_FGR_H1',
      position: '000025',
    });
  });

  const object = (type: string, name: string, position: string) => ({
    '@': {
      'tm:pgmid': 'R3TR',
      'tm:type': type,
      'tm:name': name,
      'tm:position': position,
    },
  });

  /**
   * A request document as measured: each task's entries under
   * `tm:request/tm:task`, and beside them `tm:all_objects`, the request's
   * aggregate list — every object once more. Read whole, every object came
   * twice (684 rows for 342 entries).
   */
  it("answers a request's task entries once each, with their task numbers", async () => {
    fakeClient = fakeClientOf({
      readObjects: () =>
        okResponse(
          reading({
            'tm:root': {
              'tm:request': {
                '@': { 'tm:number': 'SIDK900100' },
                'tm:all_objects': {
                  'tm:abap_object': [
                    object('PROG', 'ZP_ONE', '000001'),
                    object('CLAS', 'ZCL_TWO', '000002'),
                    object('PROG', 'ZP_THREE', '000003'),
                  ],
                },
                'tm:task': [
                  {
                    '@': { 'tm:number': 'SIDK900101' },
                    'tm:abap_object': [
                      object('PROG', 'ZP_ONE', '000001'),
                      object('CLAS', 'ZCL_TWO', '000002'),
                    ],
                  },
                  {
                    '@': { 'tm:number': 'SIDK900102' },
                    'tm:abap_object': object('PROG', 'ZP_THREE', '000001'),
                  },
                ],
              },
            },
          } as never),
        ),
    });

    const answered = body(
      await handleReadTransportObjects(context as any, {
        transport_number: 'SIDK900100',
      }),
    );

    assert.equal(answered.count, 3);
    assert.deepStrictEqual(
      answered.objects.map((o: any) => [o.task, o.type, o.name, o.position]),
      [
        ['SIDK900101', 'PROG', 'ZP_ONE', '000001'],
        ['SIDK900101', 'CLAS', 'ZCL_TWO', '000002'],
        ['SIDK900102', 'PROG', 'ZP_THREE', '000001'],
      ],
    );
  });

  /** A task document as measured: its entries under `tm:root/tm:task`. */
  it('answers a task document as before: its own entries, once each', async () => {
    fakeClient = fakeClientOf({
      readObjects: () =>
        okResponse(
          reading({
            'tm:root': {
              'tm:request': { '@': { 'tm:number': 'SIDK900100' } },
              'tm:task': {
                '@': { 'tm:number': 'SIDK900101' },
                'tm:abap_object': [
                  object('PROG', 'ZP_ONE', '000001'),
                  object('CLAS', 'ZCL_TWO', '000002'),
                ],
              },
            },
          } as never),
        ),
    });

    const answered = body(
      await handleReadTransportObjects(context as any, {
        transport_number: 'SIDK900101',
      }),
    );

    assert.equal(answered.count, 2);
    assert.deepStrictEqual(answered.objects, [
      { pgmid: 'R3TR', type: 'PROG', name: 'ZP_ONE', position: '000001' },
      { pgmid: 'R3TR', type: 'CLAS', name: 'ZCL_TWO', position: '000002' },
    ]);
  });

  /**
   * An entry the server described without a position cannot be removed, and
   * the tool must not invent one: `''` satisfies the member's required
   * `position` and produces a call that answers 200 and removes nothing —
   * the defect these tools exist to end.
   */
  it('answers null for a position the server did not send', async () => {
    fakeClient = fakeClientOf({
      readObjects: () =>
        okResponse(
          reading({
            'tm:root': {
              'tm:abap_object': {
                '@': {
                  'tm:pgmid': 'R3TR',
                  'tm:type': 'CLAS',
                  'tm:name': 'ZCL_NO_POS',
                },
              },
            },
          } as never),
        ),
    });

    const result = await handleReadTransportObjects(context as any, {
      transport_number: 'SIDK905943',
    });

    assert.equal(body(result).objects[0].position, null);
  });
});

describe('RemoveTransportObject', () => {
  it('sends what it was given, position included', async () => {
    let sent: any;
    fakeClient = fakeClientOf({
      removeObject: (number: unknown, object: unknown) => {
        sent = { number, object };
        return okResponse(reading('<tm:root/>'));
      },
    });

    await handleRemoveTransportObject(context as any, {
      transport_number: 'SIDK905943',
      object_name: 'ZCL_X',
      object_type: 'CLAS',
      position: '000026',
    });

    assert.equal(sent.number, 'SIDK905943');
    assertMatchObject(sent.object, {
      name: 'ZCL_X',
      type: 'CLAS',
      position: '000026',
    });
  });

  /**
   * **The answer says accepted, never removed.** The endpoint echoes whatever
   * it was asked about, for an entry that exists and for one that never did.
   * Measured: twenty-two objects asked for without a position each answered
   * `200` with that echo and stayed on the task.
   */
  it('claims acceptance, not removal, and says what would settle it', async () => {
    fakeClient = fakeClientOf({
      removeObject: () => okResponse(reading('<tm:root/>')),
    });

    const answered = body(
      await handleRemoveTransportObject(context as any, {
        transport_number: 'SIDK905943',
        object_name: 'ZCL_X',
        object_type: 'CLAS',
        position: '000026',
      }),
    );

    assert.equal(answered.accepted, true);
    assert.equal(answered.removed, 'unknown');
    assert.match(answered.confirm_with, /ReadTransportActionLog/);
    // **And no `success`.** Every other write here says `success: true`
    // because its answer means the write happened; this one's does not, and
    // a reader who stopped at that field would skip the re-read that is the
    // only thing establishing the outcome.
    assert.equal('success' in answered, false);
  });

  it('refuses to call the server without a position', async () => {
    fakeClient = fakeClientOf({
      removeObject: () => okResponse(reading('<tm:root/>')),
    });

    const result = await handleRemoveTransportObject(
      context as any,
      {
        transport_number: 'SIDK905943',
        object_name: 'ZCL_X',
        object_type: 'CLAS',
      } as never,
    );

    assert.equal(result.isError, true);
  });
});

describe('AddTransportObject', () => {
  it('sends no position, because an entry that does not exist has none', async () => {
    let sent: any;
    fakeClient = fakeClientOf({
      addObject: (_number: unknown, object: unknown) => {
        sent = object;
        return okResponse(reading('<tm:root/>'));
      },
    });

    await handleAddTransportObject(context as any, {
      transport_number: 'SIDK905943',
      object_name: 'ZCL_X',
      object_type: 'CLAS',
    });

    assert.deepStrictEqual(sent, { name: 'ZCL_X', type: 'CLAS' });
    assert.equal('position' in sent, false);
  });

  it('claims acceptance, not attachment, and says what would settle it', async () => {
    fakeClient = fakeClientOf({
      addObject: () => okResponse(reading('<tm:root/>')),
    });

    const answered = body(
      await handleAddTransportObject(context as any, {
        transport_number: 'SIDK905943',
        object_name: 'ZCL_X',
        object_type: 'CLAS',
      }),
    );

    assert.equal(answered.accepted, true);
    assert.equal(answered.added, 'unknown');
    assert.equal('success' in answered, false);
    assert.match(answered.confirm_with, /ReadTransportObjects/);
  });
});

describe('CreateTransportTask', () => {
  /**
   * `targetUser` is required and measured: without `tm:targetuser` the server
   * resolves an empty owner and refuses with `400 SCTS_ADT_MSG 009`.
   */
  it('names the owner the caller gave, because the server will not choose', async () => {
    let options: any;
    fakeClient = fakeClientOf({
      createTask: (_number: unknown, given: unknown) => {
        options = given;
        return okResponse(
          reading({ '@': { 'tm:number': 'SIDK907073' } } as never),
        );
      },
    });

    const answered = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
      }),
    );

    assert.equal(options.targetUser, 'DEVELOPER');
    assert.equal(answered.task_number, 'SIDK907073');
    assert.equal(answered.owner, 'DEVELOPER');
  });

  /**
   * SAP stores user ids in upper case and refuses a lower-case one as an
   * unknown user (400, measured): the handler sends the id upper-cased.
   */
  it('sends target_user upper-cased and trimmed', async () => {
    let options: any;
    fakeClient = fakeClientOf({
      createTask: (_number: unknown, given: unknown) => {
        options = given;
        return okResponse(
          reading({ '@': { 'tm:number': 'SIDK907073' } } as never),
        );
      },
    });

    const answered = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: ' developer ',
        task_type: 'X',
      }),
    );

    assert.equal(options.targetUser, 'DEVELOPER');
    assert.equal(answered.owner, 'DEVELOPER');
  });

  /**
   * A task number of `''` passed `ok` and was useless to everything after it
   * — the defect adt-clients fixed in `parseCreatedTransport`. If it ever
   * comes back, the answer says so rather than handing back a blank.
   */
  it('says so when the answer carried no task number', async () => {
    fakeClient = fakeClientOf({
      createTask: () => okResponse(reading({ '@': {} } as never)),
    });

    const answered = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
      }),
    );

    assert.equal(answered.task_number, null);
    assert.match(answered.note, /no task number/);
  });

  /**
   * Measured on premise, 2026-09-25: a task `newtask` creates is
   * `Unclassified`, and `addobject` onto it is refused with `SCTS_ADT_MSG 009`
   * / TK127 — "Changes to objects are only allowed in correction/repair". The
   * same call after `changetasktype S` answers 200. So a task this tool hands
   * back is typed already, or it is a task nothing can be attached to.
   */
  it('types the new task Development/Correction, so objects can be attached to it', async () => {
    const typed: unknown[][] = [];
    fakeClient = fakeClientOf({
      createTask: () =>
        okResponse(reading({ '@': { 'tm:number': 'SIDK907073' } } as never)),
      changeTaskType: (...given: unknown[]) => {
        typed.push(given);
        return okResponse(reading('<tm:root/>'));
      },
    });

    const answered = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
      }),
    );

    assert.equal(typed.length, 1);
    assert.deepStrictEqual(typed[0].slice(0, 2), ['SIDK907073', 'S']);
    assert.equal(answered.task_type, 'S');
  });

  /**
   * A refused typing has to survive `detail`, and in the terse fields alone it
   * did not: `project()` calls the terse projection for `terse` only, so at
   * `full` the answer was the parsed creation document and at `raw` the
   * document itself — a task left Unclassified read as a clean creation in
   * both, and the next `AddTransportObject` onto it is refused with TK127.
   */
  it('says the task is still Unclassified at every detail, not only terse', async () => {
    const refused = () =>
      fakeClientOf({
        createTask: () =>
          okResponse(reading({ '@': { 'tm:number': 'SIDK907073' } } as never)),
        changeTaskType: () =>
          refusedResponse(
            'You can only change the type of tasks in workbench requests',
          ),
      });

    fakeClient = refused();
    const terse = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
      }),
    );
    assert.equal(terse.task_type, 'X');
    assert.deepStrictEqual(terse.task_type_error, {
      message: 'You can only change the type of tasks in workbench requests',
      origin: 'refusal',
      step: 'change task type',
    });
    assert.ok(terse.cleanup.message.includes('TK127'));
    assert.deepStrictEqual(terse.cleanup.failures, [terse.task_type_error]);

    fakeClient = refused();
    const full = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
        detail: 'full',
      }),
    );
    assert.ok(full.cleanup.message.includes('still Unclassified'));
    // SAP's refusal rides as the method's error, with its step — not folded
    // into the note's words.
    assert.ok(!full.cleanup.message.includes('workbench requests'));
    assert.deepStrictEqual(full.cleanup.failures, [
      {
        message: 'You can only change the type of tasks in workbench requests',
        origin: 'refusal',
        step: 'change task type',
      },
    ]);

    fakeClient = refused();
    const raw = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
        detail: 'raw',
      }),
    );
    // A raw answer is a string, so `answer()` gives it somewhere to put the
    // note: `{ result, cleanup }`.
    assert.ok(raw.cleanup.message.includes('still Unclassified'));
    assert.notEqual(raw.result, undefined);
  });

  it('types the task as asked, and leaves it alone when asked for X', async () => {
    const typed: unknown[][] = [];
    fakeClient = fakeClientOf({
      createTask: () =>
        okResponse(reading({ '@': { 'tm:number': 'SIDK907073' } } as never)),
      changeTaskType: (...given: unknown[]) => {
        typed.push(given);
        return okResponse(reading('<tm:root/>'));
      },
    });

    const repair = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
        task_type: 'R',
      }),
    );
    const unclassified = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
        task_type: 'X',
      }),
    );

    assert.deepStrictEqual(
      typed.map((call) => call[1]),
      ['R'],
    );
    assert.equal(repair.task_type, 'R');
    assert.equal(unclassified.task_type, 'X');
  });

  /**
   * The task exists by then, so a refused typing is not a failed creation —
   * but the caller must hear that the task is still Unclassified, because the
   * next AddTransportObject will be refused for exactly that reason.
   */
  it('still answers the task when typing it is refused, and says it is unclassified', async () => {
    fakeClient = fakeClientOf({
      createTask: () =>
        okResponse(reading({ '@': { 'tm:number': 'SIDK907073' } } as never)),
      changeTaskType: () => refusedResponse('Specified task type is unknown'),
    });

    const result = await handleCreateTransportTask(context as any, {
      transport_number: 'SIDK905941',
      target_user: 'DEVELOPER',
    });
    const answered = body(result);

    assert.equal(result.isError, false);
    assert.equal(answered.task_number, 'SIDK907073');
    assert.equal(answered.task_type, 'X');
    assert.match(answered.task_type_error.message, /unknown/);
    assert.equal(answered.task_type_error.step, 'change task type');
    assert.match(answered.note, /AddTransportObject/);
  });

  it('refuses a task type that is not S, R or X before calling the server', async () => {
    let created = false;
    fakeClient = fakeClientOf({
      createTask: () => {
        created = true;
        return okResponse(
          reading({ '@': { 'tm:number': 'SIDK907073' } } as never),
        );
      },
    });

    const result = await handleCreateTransportTask(
      context as any,
      {
        transport_number: 'SIDK905941',
        target_user: 'DEVELOPER',
        task_type: 'K',
      } as never,
    );

    assert.equal(result.isError, true);
    assert.equal(created, false);
  });

  it('refuses to call the server without a target user', async () => {
    fakeClient = fakeClientOf({
      createTask: () => okResponse(reading('<tm:root/>')),
    });

    const result = await handleCreateTransportTask(
      context as any,
      {
        transport_number: 'SIDK905941',
      } as never,
    );

    assert.equal(result.isError, true);
  });
});

describe('ReadTransportActionLog', () => {
  it('reads the entries out of the log document', async () => {
    fakeClient = fakeClientOf({
      readActionLog: () =>
        okResponse(
          reading({
            'log:log': {
              'log:entry': [
                {
                  '@': {
                    'log:text':
                      'SAPUSER01 deleted following object R3TR FUGR ZMCP_BLD_FGR_H1',
                  },
                },
              ],
            },
          } as never),
        ),
    });

    const answered = body(
      await handleReadTransportActionLog(context as any, {
        transport_number: 'SIDK905942',
      }),
    );

    assert.equal(answered.count, 1);
    assert.match(answered.entries[0], /deleted following object/);
  });

  /**
   * The shape an on-premise system answers, measured 2026-09-25 on premise: the
   * text is the content of `log:message/log:messageText`, with the T100 key
   * beside it as an attribute — no `log:text` anywhere. Reading only
   * `log:text` answered `count: 0` for a log that held six entries.
   */
  it('reads the on-premise shape, where the text is log:message/log:messageText', async () => {
    const entry = (id: string, key: string, text: string) => ({
      'log:message': {
        'log:messageText': { '#text': text, '@': { language: '', key } },
      },
      '@': { id, severity: 'information' },
    });
    fakeClient = fakeClientOf({
      readActionLog: () =>
        okResponse(
          reading({
            'log:log': {
              'log:type': 'LOG_TYPE_ACT_DDIC',
              'log:entry': [
                entry(
                  '000001',
                  'TK(185)',
                  '25.09.2026 10:52:18 OKYSLYTSIA has created the new request/task',
                ),
                entry(
                  '000002',
                  'TK(098)',
                  '25.09.2026 10:52:18 task type changed to S',
                ),
                entry(
                  '000003',
                  'TK(188)',
                  '25.09.2026 10:52:20 OKYSLYTSIA deleted following object R3TR PROG ZMCP_BLD_TPXLME',
                ),
              ],
            },
          } as never),
        ),
    });

    const answered = body(
      await handleReadTransportActionLog(context as any, {
        transport_number: 'SIDK907299',
      }),
    );

    assert.equal(answered.count, 3);
    assert.equal(
      answered.entries[1],
      '25.09.2026 10:52:18 task type changed to S',
    );
    assert.match(answered.entries[2], /deleted following object R3TR PROG/);
  });
});

describe('CreateTransport', () => {
  /**
   * SAP stores user ids in upper case: a create with a lower-case owner is
   * refused as an unknown user (400, measured), so the owner is sent
   * upper-cased.
   */
  it('sends owner upper-cased and trimmed', async () => {
    let given: any;
    fakeClient = fakeClientOf({
      create: (options: unknown) => {
        given = options;
        return okResponse(reading('', '', 200));
      },
    });

    await handleCreateTransport(context as any, {
      description: 'x',
      owner: ' developer ',
    });

    assert.equal(given.owner, 'DEVELOPER');
  });

  it('sends no owner when none is given', async () => {
    let given: any;
    fakeClient = fakeClientOf({
      create: (options: unknown) => {
        given = options;
        return okResponse(reading('', '', 200));
      },
    });

    await handleCreateTransport(context as any, { description: 'x' });

    assert.equal(given.owner, undefined);
  });
});
