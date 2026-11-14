import assert from 'node:assert/strict';
import { it } from 'node:test';
import { expectAbsent, liveCall, liveSuite } from '../../../../../integration/helpers/live';

const name = 'ZTHING';

liveSuite(['onprem', 'cloud'], 'thing', () => {
  it('reads a thing', async () => {
    const answer = await liveCall('GetThing', { thing_name: name });
    assert.equal(answer.isError, false);
  });
  it('reads, then skips', async (t) => {
    await liveCall('GetThing', { thing_name: name });
    t.skip();
  });
});

liveSuite(['onprem'], 'thing delete', () => {
  it('deletes a thing', async () => {
    await liveCall('DeleteThing', { thing_name: name });
    await expectAbsent({ tool: 'GetThing', args: { thing_name: name } });
  });
});
