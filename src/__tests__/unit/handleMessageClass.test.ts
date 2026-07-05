/**
 * Unit tests: Message Class (MSAG) CRUD tools.
 *  - the message-class handlers dispatch to client.getMessageClass()
 *    with the right config (name uppercased, package, transport, master lang);
 *  - the message handlers dispatch to client.getMessageClassMessage()
 *    with { className, msgno, msgtext, ... };
 *  - read handlers surface the parsed messageClass / message.
 * SAP-free via a mocked AdtClient.
 */

const mockMc = {
  create: jest.fn(),
  read: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockMsg = {
  create: jest.fn(),
  read: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getMessageClass: () => mockMc,
    getMessageClassMessage: () => mockMsg,
  }),
}));

import { handleCreateMessageClass } from '../../handlers/message_class/high/handleCreateMessageClass';
import { handleCreateMessageClassMessage } from '../../handlers/message_class/high/handleCreateMessageClassMessage';
import { handleDeleteMessageClass } from '../../handlers/message_class/high/handleDeleteMessageClass';
import { handleGetMessageClass } from '../../handlers/message_class/high/handleGetMessageClass';
import { handleUpdateMessageClassMessage } from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import { handleReadMessageClass } from '../../handlers/message_class/readonly/handleReadMessageClass';
import { handleReadMessageClassMessage } from '../../handlers/message_class/readonly/handleReadMessageClassMessage';

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

describe('Message Class (MSAG) CRUD tools', () => {
  beforeEach(() => {
    for (const m of [mockMc, mockMsg]) {
      for (const fn of Object.values(m)) (fn as jest.Mock).mockReset();
    }
  });

  it('ReadMessageClass returns the parsed message class', async () => {
    mockMc.read.mockResolvedValue({
      messageClass: {
        name: 'ZMY_MSGS',
        description: 'My messages',
        packageName: 'ZPKG',
        messages: [{ msgno: '001', msgtext: 'Hello &1' }],
      },
    });

    const result = await handleReadMessageClass(ctx, {
      message_class_name: 'zmy_msgs',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.read).toHaveBeenCalledWith({ name: 'ZMY_MSGS' });
    expect(payload(result).message_class.messages[0].msgno).toBe('001');
  });

  it('GetMessageClass surfaces "not found" when read returns undefined', async () => {
    mockMc.read.mockResolvedValue(undefined);
    const result = await handleGetMessageClass(ctx, {
      message_class_name: 'ZNOPE',
    });
    expect(result.isError).toBe(true);
  });

  it('CreateMessageClass dispatches create() with camelCase config', async () => {
    mockMc.create.mockResolvedValue({ createResult: { status: 201 } });

    const result = await handleCreateMessageClass(ctx, {
      message_class_name: 'zmy_msgs',
      description: 'My messages',
      package_name: '$TMP',
      master_language: 'EN',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.create).toHaveBeenCalledWith({
      name: 'ZMY_MSGS',
      description: 'My messages',
      packageName: '$TMP',
      transportRequest: undefined,
      masterLanguage: 'EN',
    });
  });

  it('DeleteMessageClass dispatches delete() with name + transport', async () => {
    mockMc.delete.mockResolvedValue({ deleteResult: { status: 200 } });

    const result = await handleDeleteMessageClass(ctx, {
      message_class_name: 'ZMY_MSGS',
      transport_request: 'E19K900001',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.delete).toHaveBeenCalledWith({
      name: 'ZMY_MSGS',
      transportRequest: 'E19K900001',
    });
  });

  it('CreateMessageClassMessage dispatches to getMessageClassMessage().create', async () => {
    mockMsg.create.mockResolvedValue({ createResult: { status: 200 } });

    const result = await handleCreateMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
      msgtext: 'Hello &1',
      self_explanatory: true,
      transport_request: 'E19K900001',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.create).toHaveBeenCalledWith({
      className: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Hello &1',
      selfExplanatory: true,
      description: undefined,
      transportRequest: 'E19K900001',
    });
  });

  it('UpdateMessageClassMessage dispatches update() with the new text', async () => {
    mockMsg.update.mockResolvedValue({ updateResult: { status: 200 } });

    const result = await handleUpdateMessageClassMessage(ctx, {
      message_class_name: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Updated &1',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.update).toHaveBeenCalledWith({
      className: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Updated &1',
      selfExplanatory: undefined,
      description: undefined,
      transportRequest: undefined,
    });
  });

  it('ReadMessageClassMessage returns the single parsed message', async () => {
    mockMsg.read.mockResolvedValue({
      message: { msgno: '001', msgtext: 'Hello &1', selfExplanatory: false },
    });

    const result = await handleReadMessageClassMessage(ctx, {
      message_class_name: 'ZMY_MSGS',
      msgno: '001',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.read).toHaveBeenCalledWith({
      className: 'ZMY_MSGS',
      msgno: '001',
    });
    expect(payload(result).message.msgtext).toBe('Hello &1');
  });
});
