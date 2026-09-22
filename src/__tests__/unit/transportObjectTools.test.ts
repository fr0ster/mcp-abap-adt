import { handleAddTransportObject } from '../../handlers/transport/high/handleAddTransportObject';
import { handleCreateTransportTask } from '../../handlers/transport/high/handleCreateTransportTask';
import { handleRemoveTransportObject } from '../../handlers/transport/high/handleRemoveTransportObject';
import { handleReadTransportActionLog } from '../../handlers/transport/readonly/handleReadTransportActionLog';
import { handleReadTransportObjects } from '../../handlers/transport/readonly/handleReadTransportObjects';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

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
    expect(answered.removed).toBeUndefined();
    expect(answered.confirm_with).toMatch(/ReadTransportActionLog/);
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
});
