/**
 * `liveDescribe` (the describe every `liveSuite` runs in) runs its body's
 * hooks before its own teardown: a cleanup `afterAll` written in the body
 * finds the runner still open, so `deleteRecorded` can delete what the
 * cases created. With the body's hooks beside the teardown, the teardown ran
 * first and the cleanup found no runner (measured in a live run, 2026-11-04:
 * five classes left behind).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { type LiveRunner, liveDescribe } from '../../integration/helpers/live';
import { assertEquals } from '../../integration/helpers/liveAssert';

/** What the body's cleanup saw, in order: read by the case after the suite. */
const seen: string[] = [];
let closed = false;

const stubRunner: LiveRunner = {
  system: 'onprem',
  user: 'STUB_USER',
  call: async () => ({ isError: false, content: [], text: '' }),
  connection: () => {
    throw new Error('no connection in this test');
  },
  close: async () => {},
};

liveDescribe(
  'a live suite with a cleanup in its body',
  async () => stubRunner,
  async (ending) => {
    await ending.close();
    closed = true;
    seen.push('teardown');
  },
  () => {
    after(() => {
      seen.push(closed ? 'cleanup after teardown' : 'cleanup');
    });
    it('runs a case', () => {
      assert.equal(closed, false);
    });
  },
);

// node:test runs this after the suite above, its hooks included.
describe('after the suite', () => {
  it("the body's cleanup ran before the teardown closed the runner", () => {
    assertEquals(seen, ['cleanup', 'teardown']);
  });
});
