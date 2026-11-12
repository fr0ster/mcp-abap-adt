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
});

liveSuite(['onprem'], 'thing delete', () => {
  it('deletes a thing', async () => {
    await liveCall('DeleteThing', { thing_name: name });
    await expectAbsent({ tool: 'GetThing', args: { thing_name: name } });
  });
  it('checks with a tool that reads another type', async () => {
    await liveCall('DeleteThing', { thing_name: name });
    await expectAbsent({ tool: 'GetOther', args: { thing_name: name } });
  });
});
