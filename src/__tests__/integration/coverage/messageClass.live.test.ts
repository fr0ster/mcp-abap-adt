/**
 * A message class and its messages, live, on both systems: the case creates
 * a message class of its own in the package the coverage suites create in
 * (`ownPackage`), its name read free first and recorded for cleanup before
 * its create; it reads it, changes its description, creates a message,
 * reads it, changes its text, deletes it and reads it absent, then deletes
 * the class and reads it absent. The cleanup deletes whatever is still
 * there (a record whose object is gone goes) and reads the class absent.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { onRequest, ownPackage, request, succeeded } from './ownObjects';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const CLASS = `ZMCP_MC_${SUFFIX}`;
const NUMBER = '001';

liveSuite(['onprem', 'cloud'], 'A message class and its messages', () => {
  after(async () => {
    await deleteRecorded();
    await expectAbsent({
      tool: 'GetMessageClass',
      args: { message_class_name: CLASS },
    });
  });

  it('CreateMessageClass, GetMessageClass, UpdateMessageClass', async () => {
    await expectNameFree({
      tool: 'GetMessageClass',
      args: { message_class_name: CLASS },
    });
    recordCreated('DeleteMessageClass', {
      message_class_name: CLASS,
      ...onRequest(),
    });
    const created = await liveCall('CreateMessageClass', {
      message_class_name: CLASS,
      description: 'MCP message class live case',
      package_name: ownPackage(),
      transport_request: request(),
    });
    succeeded('CreateMessageClass', created);
    const read = await liveCall('GetMessageClass', {
      message_class_name: CLASS,
    });
    succeeded('GetMessageClass', read);
    assert.ok(read.text.includes('MCP message class live case'));
    const updated = await liveCall('UpdateMessageClass', {
      message_class_name: CLASS,
      description: 'MCP message class changed',
      transport_request: request(),
    });
    succeeded('UpdateMessageClass', updated);
    const changed = succeeded(
      'GetMessageClass after the update',
      await livePrepare('GetMessageClass', { message_class_name: CLASS }),
    );
    assert.ok(changed.text.includes('MCP message class changed'));
  });

  it('CreateMessageClassMessage, GetMessageClassMessage, UpdateMessageClassMessage, DeleteMessageClassMessage', async () => {
    const created = await liveCall('CreateMessageClassMessage', {
      message_class_name: CLASS,
      msgno: NUMBER,
      msgtext: 'MCP message &1',
      transport_request: request(),
    });
    succeeded('CreateMessageClassMessage', created);
    const read = await liveCall('GetMessageClassMessage', {
      message_class_name: CLASS,
      msgno: NUMBER,
    });
    succeeded('GetMessageClassMessage', read);
    assert.ok(read.text.includes('MCP message &1'));
    const updated = await liveCall('UpdateMessageClassMessage', {
      message_class_name: CLASS,
      msgno: NUMBER,
      msgtext: 'MCP message changed &1',
      transport_request: request(),
    });
    succeeded('UpdateMessageClassMessage', updated);
    const changed = succeeded(
      'GetMessageClassMessage after the update',
      await livePrepare('GetMessageClassMessage', {
        message_class_name: CLASS,
        msgno: NUMBER,
      }),
    );
    assert.ok(changed.text.includes('MCP message changed &1'));
    const deleted = await liveCall('DeleteMessageClassMessage', {
      message_class_name: CLASS,
      msgno: NUMBER,
      transport_request: request(),
    });
    succeeded('DeleteMessageClassMessage', deleted);
    await expectAbsent({
      tool: 'GetMessageClassMessage',
      args: { message_class_name: CLASS, msgno: NUMBER },
    });
  });

  it('DeleteMessageClass deletes the class', async () => {
    const deleted = await liveCall('DeleteMessageClass', {
      message_class_name: CLASS,
      transport_request: request(),
    });
    succeeded('DeleteMessageClass', deleted);
    await expectAbsent({
      tool: 'GetMessageClass',
      args: { message_class_name: CLASS },
    });
  });
});
