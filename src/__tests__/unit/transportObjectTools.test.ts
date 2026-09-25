import { handleAddTransportObject } from '../../handlers/transport/high/handleAddTransportObject';
import { handleCreateTransportTask } from '../../handlers/transport/high/handleCreateTransportTask';
import { handleRemoveTransportObject } from '../../handlers/transport/high/handleRemoveTransportObject';
import { handleReadTransportActionLog } from '../../handlers/transport/readonly/handleReadTransportActionLog';
import { handleReadTransportObjects } from '../../handlers/transport/readonly/handleReadTransportObjects';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

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
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

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
      '@': { 'tm:number': 'E19K905942' },
      'tm:request': {
        'tm:task': {
          '@': { 'tm:number': 'E19K905943' },
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
      transport_number: 'E19K905943',
    });

    expect(asked).toBe('E19K905943');
    const answered = body(result);
    expect(answered.count).toBe(2);
    expect(answered.objects[0]).toMatchObject({
      pgmid: 'R3TR',
      type: 'FUGR',
      name: 'ZMCP_BLD_FGR_H1',
      position: '000025',
    });
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
      transport_number: 'E19K905943',
    });

    expect(body(result).objects[0].position).toBeNull();
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
      transport_number: 'E19K905943',
      object_name: 'ZCL_X',
      object_type: 'CLAS',
      position: '000026',
    });

    expect(sent.number).toBe('E19K905943');
    expect(sent.object).toMatchObject({
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
        transport_number: 'E19K905943',
        object_name: 'ZCL_X',
        object_type: 'CLAS',
        position: '000026',
      }),
    );

    expect(answered.accepted).toBe(true);
    expect(answered.removed).toBe('unknown');
    expect(answered.confirm_with).toMatch(/ReadTransportActionLog/);
    // **And no `success`.** Every other write here says `success: true`
    // because its answer means the write happened; this one's does not, and
    // a reader who stopped at that field would skip the re-read that is the
    // only thing establishing the outcome.
    expect('success' in answered).toBe(false);
  });

  it('refuses to call the server without a position', async () => {
    fakeClient = fakeClientOf({
      removeObject: () => okResponse(reading('<tm:root/>')),
    });

    const result = await handleRemoveTransportObject(
      context as any,
      {
        transport_number: 'E19K905943',
        object_name: 'ZCL_X',
        object_type: 'CLAS',
      } as never,
    );

    expect(result.isError).toBe(true);
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
      transport_number: 'E19K905943',
      object_name: 'ZCL_X',
      object_type: 'CLAS',
    });

    expect(sent).toEqual({ name: 'ZCL_X', type: 'CLAS' });
    expect('position' in sent).toBe(false);
  });

  it('claims acceptance, not attachment, and says what would settle it', async () => {
    fakeClient = fakeClientOf({
      addObject: () => okResponse(reading('<tm:root/>')),
    });

    const answered = body(
      await handleAddTransportObject(context as any, {
        transport_number: 'E19K905943',
        object_name: 'ZCL_X',
        object_type: 'CLAS',
      }),
    );

    expect(answered.accepted).toBe(true);
    expect(answered.added).toBe('unknown');
    expect('success' in answered).toBe(false);
    expect(answered.confirm_with).toMatch(/ReadTransportObjects/);
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
          reading({ '@': { 'tm:number': 'E19K907073' } } as never),
        );
      },
    });

    const answered = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'E19K905941',
        target_user: 'DEVELOPER',
      }),
    );

    expect(options.targetUser).toBe('DEVELOPER');
    expect(answered.task_number).toBe('E19K907073');
    expect(answered.owner).toBe('DEVELOPER');
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
        transport_number: 'E19K905941',
        target_user: 'DEVELOPER',
      }),
    );

    expect(answered.task_number).toBeNull();
    expect(answered.note).toMatch(/no task number/);
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
        okResponse(reading({ '@': { 'tm:number': 'E19K907073' } } as never)),
      changeTaskType: (...given: unknown[]) => {
        typed.push(given);
        return okResponse(reading('<tm:root/>'));
      },
    });

    const answered = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'E19K905941',
        target_user: 'DEVELOPER',
      }),
    );

    expect(typed).toHaveLength(1);
    expect(typed[0].slice(0, 2)).toEqual(['E19K907073', 'S']);
    expect(answered.task_type).toBe('S');
  });

  it('types the task as asked, and leaves it alone when asked for X', async () => {
    const typed: unknown[][] = [];
    fakeClient = fakeClientOf({
      createTask: () =>
        okResponse(reading({ '@': { 'tm:number': 'E19K907073' } } as never)),
      changeTaskType: (...given: unknown[]) => {
        typed.push(given);
        return okResponse(reading('<tm:root/>'));
      },
    });

    const repair = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'E19K905941',
        target_user: 'DEVELOPER',
        task_type: 'R',
      }),
    );
    const unclassified = body(
      await handleCreateTransportTask(context as any, {
        transport_number: 'E19K905941',
        target_user: 'DEVELOPER',
        task_type: 'X',
      }),
    );

    expect(typed.map((call) => call[1])).toEqual(['R']);
    expect(repair.task_type).toBe('R');
    expect(unclassified.task_type).toBe('X');
  });

  /**
   * The task exists by then, so a refused typing is not a failed creation —
   * but the caller must hear that the task is still Unclassified, because the
   * next AddTransportObject will be refused for exactly that reason.
   */
  it('still answers the task when typing it is refused, and says it is unclassified', async () => {
    fakeClient = fakeClientOf({
      createTask: () =>
        okResponse(reading({ '@': { 'tm:number': 'E19K907073' } } as never)),
      changeTaskType: () => refusedResponse('Specified task type is unknown'),
    });

    const result = await handleCreateTransportTask(context as any, {
      transport_number: 'E19K905941',
      target_user: 'DEVELOPER',
    });
    const answered = body(result);

    expect(result.isError).toBe(false);
    expect(answered.task_number).toBe('E19K907073');
    expect(answered.task_type).toBe('X');
    expect(answered.task_type_error).toMatch(/unknown/);
    expect(answered.note).toMatch(/AddTransportObject/);
  });

  it('refuses a task type that is not S, R or X before calling the server', async () => {
    let created = false;
    fakeClient = fakeClientOf({
      createTask: () => {
        created = true;
        return okResponse(
          reading({ '@': { 'tm:number': 'E19K907073' } } as never),
        );
      },
    });

    const result = await handleCreateTransportTask(
      context as any,
      {
        transport_number: 'E19K905941',
        target_user: 'DEVELOPER',
        task_type: 'K',
      } as never,
    );

    expect(result.isError).toBe(true);
    expect(created).toBe(false);
  });

  it('refuses to call the server without a target user', async () => {
    fakeClient = fakeClientOf({
      createTask: () => okResponse(reading('<tm:root/>')),
    });

    const result = await handleCreateTransportTask(
      context as any,
      {
        transport_number: 'E19K905941',
      } as never,
    );

    expect(result.isError).toBe(true);
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
        transport_number: 'E19K905942',
      }),
    );

    expect(answered.count).toBe(1);
    expect(answered.entries[0]).toMatch(/deleted following object/);
  });

  /**
   * The shape an on-premise system answers, measured 2026-09-25 on E19: the
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
        transport_number: 'E19K907299',
      }),
    );

    expect(answered.count).toBe(3);
    expect(answered.entries[1]).toBe(
      '25.09.2026 10:52:18 task type changed to S',
    );
    expect(answered.entries[2]).toMatch(/deleted following object R3TR PROG/);
  });
});
