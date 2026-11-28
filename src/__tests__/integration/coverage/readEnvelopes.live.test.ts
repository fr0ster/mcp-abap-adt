/**
 * The read envelopes, live (#392), on both systems, read only, through the
 * server's dispatch (`throughServer`: the in-process server, its envelope
 * owner): an envelope created, listed and discarded; another created, a read
 * of the first shared class the configuration names recorded into it, and
 * executed — the read answered under its number as it answers outside the
 * envelope.
 *
 * Nothing is created, changed or deleted in the system.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSharedDependenciesConfig } from '../helpers/configHelpers';
import {
  liveCall,
  livePrepare,
  liveSuite,
  throughServer,
} from '../helpers/live';
import { member, succeeded } from './ownObjects';

/** The first shared class the configuration names. */
function sharedClass(): string {
  const classes = member(getSharedDependenciesConfig(), 'classes');
  const first = Array.isArray(classes) ? member(classes[0], 'name') : undefined;
  if (typeof first !== 'string' || first === '') {
    throw new Error('the test config names no shared class');
  }
  return first.toUpperCase();
}

/** The JSON of an answer. */
const payloadOf = (text: string): unknown => JSON.parse(text);

/** A new envelope's handle (a prerequisite of a case). */
async function created(): Promise<string> {
  const answer = succeeded(
    'CreateReadEnvelope',
    await livePrepare('CreateReadEnvelope', {}),
  );
  const handle = member(payloadOf(answer.text), 'envelope_handle');
  if (typeof handle !== 'string') throw new Error(answer.text);
  return handle;
}

liveSuite(['onprem', 'cloud'], 'read envelopes', () => {
  describe('through the server', () => {
    throughServer();

    it('CreateReadEnvelope answers a handle and sends nothing', async () => {
      const answer = await liveCall('CreateReadEnvelope', {});
      succeeded('CreateReadEnvelope', answer);
      assert.match(
        String(member(payloadOf(answer.text), 'envelope_handle')),
        /^[0-9A-F]{32}$/,
      );
    });

    it('ListReadEnvelopes lists the open envelopes; DiscardReadEnvelope ends one', async () => {
      const handle = await created();
      const listed = await liveCall('ListReadEnvelopes', {});
      succeeded('ListReadEnvelopes', listed);
      const open = payloadOf(listed.text);
      assert.ok(
        Array.isArray(open) &&
          open.some((each) => member(each, 'envelope_handle') === handle),
        listed.text,
      );
      const discarded = await liveCall('DiscardReadEnvelope', {
        envelope_handle: handle,
      });
      succeeded('DiscardReadEnvelope', discarded);
      assert.deepStrictEqual(payloadOf(discarded.text), {
        envelope_handle: handle,
        discarded: 0,
      });
    });

    it('ExecuteReadEnvelope answers the recorded read under its number, as outside the envelope', async () => {
      const read = { class_name: sharedClass() };
      const outside = await livePrepare('GetClass', read);
      const handle = await created();
      const recorded = await livePrepare('GetClass', {
        ...read,
        envelope_handle: handle,
      });
      assert.deepStrictEqual(payloadOf(recorded.text), {
        envelope_handle: handle,
        number: 1,
      });
      const executed = await liveCall('ExecuteReadEnvelope', {
        envelope_handle: handle,
      });
      succeeded('ExecuteReadEnvelope', executed);
      const answers = payloadOf(executed.text);
      assert.ok(Array.isArray(answers), executed.text);
      assert.equal(member(answers[0], 'number'), 1);
      const content = member(answers[0], 'content');
      const text = Array.isArray(content) ? member(content[0], 'text') : '';
      assert.equal(text, outside.text);
    });
  });
});
