/**
 * A transport task and its parent request read live, read only, on both
 * systems: the task `read_transport.task_number` of the test config names
 * (on premise one holding objects, on the cloud one holding none), and its
 * parent request, read from the task's answer. Nothing is created, changed
 * or released.
 *
 * - `GetTransport` given the task's number answers `kind: 'task'`: the
 *   task's own fields (its number, its parent), its objects with their
 *   positions and their count, and the parent's header as `parent_request`
 *   — never the parent's data as the item read.
 * - `GetTransport` given the parent's number answers `kind: 'request'`: the
 *   request, the task among its tasks.
 * - `HandlerGet` with `TRANSPORT` and part `metadata` answers the same two.
 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loadTestConfig } from '../helpers/configHelpers';
import { type LiveAnswer, liveCall, liveSuite } from '../helpers/live';
import { member, payloadOf, succeeded } from './ownObjects';

/** The configured task's number; the case fails naming the key when absent. */
function configuredTask(): string {
  const task = loadTestConfig().read_transport?.task_number?.trim() ?? '';
  if (task === '' || task === 'TASK') {
    throw new Error(
      'read_transport.task_number is not set in the test config: give a transport task of the system',
    );
  }
  return task;
}

/** A task read: the task itself, its objects counted; answers its parent. */
function readTask(answer: LiveAnswer, task: string): string {
  const payload = payloadOf(answer);
  assert.equal(member(payload, 'kind'), 'task');
  assert.equal(member(payload, 'transport'), undefined);
  const own = member(payload, 'task');
  assert.equal(member(own, 'number'), task);
  const parent = member(own, 'parent');
  assert.equal(typeof parent, 'string');
  assert.notEqual(parent, '');
  assert.notEqual(parent, task);
  assert.equal(member(member(payload, 'parent_request'), 'number'), parent);
  const objects = member(payload, 'objects');
  assert.ok(Array.isArray(objects));
  assert.equal(member(payload, 'object_count'), objects.length);
  for (const object of objects) {
    assert.equal(typeof member(object, 'name'), 'string');
    assert.equal(typeof member(object, 'type'), 'string');
    assert.equal(typeof member(object, 'position'), 'string');
  }
  return String(parent);
}

/** A request read: the request itself, `task` among its tasks. */
function readRequest(answer: LiveAnswer, request: string, task: string): void {
  const payload = payloadOf(answer);
  assert.equal(member(payload, 'kind'), 'request');
  assert.equal(member(member(payload, 'transport'), 'number'), request);
  const tasks = member(payload, 'tasks');
  assert.ok(Array.isArray(tasks));
  assert.ok(
    tasks.some((each) => member(each, 'number') === task),
    `${request} does not list ${task} among its tasks`,
  );
}

liveSuite(
  ['onprem', 'cloud'],
  'Transport request and task read (read only)',
  () => {
    it('GetTransport reads a task and its parent request, each as itself', async () => {
      const task = configuredTask();
      const taskRead = await liveCall('GetTransport', {
        transport_number: task,
      });
      const parent = readTask(
        succeeded(`GetTransport ${task}`, taskRead),
        task,
      );
      const requestRead = await liveCall('GetTransport', {
        transport_number: parent,
      });
      readRequest(
        succeeded(`GetTransport ${parent}`, requestRead),
        parent,
        task,
      );
    });

    it('HandlerGet TRANSPORT part metadata reads a task and its parent request, each as itself', async () => {
      const task = configuredTask();
      const taskRead = await liveCall('HandlerGet', {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: task,
      });
      const parent = readTask(
        succeeded(`HandlerGet TRANSPORT metadata ${task}`, taskRead),
        task,
      );
      const requestRead = await liveCall('HandlerGet', {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: parent,
      });
      readRequest(
        succeeded(`HandlerGet TRANSPORT metadata ${parent}`, requestRead),
        parent,
        task,
      );
    });
  },
);
