import {
  expectAbsent,
  liveCall,
  liveSuite,
} from '../../../../../integration/helpers/live';

const name = 'ZTHING';

liveSuite(['onprem', 'cloud'], 'thing', () => {
  it('reads a thing', async () => {
    const answer = await liveCall('GetThing', { thing_name: name });
    expect(answer.isError).toBe(false);
  });
  test.concurrent('reads, at once with others', async () => {
    await liveCall('GetThing', { thing_name: name });
  });
});

liveSuite(['onprem'], 'thing delete', () => {
  it('deletes a thing', async () => {
    await liveCall('DeleteThing', { thing_name: name });
    await expectAbsent({ tool: 'GetThing', args: { thing_name: name } });
  });
});
