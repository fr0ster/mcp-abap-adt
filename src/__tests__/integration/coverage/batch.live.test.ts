/**
 * The communication batch, live: `BatchBegin` opens it, a read is recorded
 * under number 1 and answers empty, `BatchEnd` sends it in one envelope and
 * answers its counts, and `BatchAnswers` answers number 1 with what the same
 * read answers outside a batch — on both systems.
 *
 * The read is `GetPackage` of the package the coverage suites create in
 * (`ownPackage`): nothing is created, changed or deleted. Every call goes
 * through one in-process server (`throughServer`): the server owns the
 * batch, and records only the calls it dispatches.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  liveCall,
  livePrepare,
  liveSuite,
  throughServer,
} from '../helpers/live';
import { assertEquals } from '../helpers/liveAssert';
import { member, ownPackage, payloadOf, succeeded } from './ownObjects';

liveSuite(['onprem', 'cloud'], 'The communication batch', () => {
  describe('through the server', () => {
    throughServer();
    it('BatchBegin opens it, BatchEnd sends the recorded read, its answer the plain one', async () => {
      const read = { package_name: ownPackage() };
      const plain = succeeded(
        'GetPackage outside a batch',
        await livePrepare('GetPackage', read),
      );

      const begun = await liveCall('BatchBegin', {});
      succeeded('BatchBegin', begun);
      assert.equal(member(payloadOf(begun), 'batch'), 'on');

      const recorded = succeeded(
        'GetPackage in the batch',
        await livePrepare('GetPackage', read),
      );
      assertEquals(recorded.text, '');

      const ended = await liveCall('BatchEnd', {});
      succeeded('BatchEnd', ended);
      assertEquals(payloadOf(ended), { recorded: 1, sent: 1, received: 1 });

      const answers = succeeded(
        'BatchAnswers',
        await livePrepare('BatchAnswers', { number: 1 }),
      );
      const entries = payloadOf(answers);
      assert.ok(Array.isArray(entries));
      const [entry] = entries;
      assert.equal(member(entry, 'number'), 1);
      assert.equal(member(entry, 'isError'), undefined);
      const content = member(entry, 'content');
      assertEquals(
        Array.isArray(content)
          ? content.map((item) => member(item, 'text'))
          : content,
        plain.content.map((item) => item.text),
      );
    });
  });
});
