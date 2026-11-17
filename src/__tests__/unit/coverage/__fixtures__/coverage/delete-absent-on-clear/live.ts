import {
  expectAbsent,
  expectCleared,
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
  it('empties local types', async () => {
    await liveCall('DeleteLocalTypes', { class_name: 'ZCL' });
    await expectCleared({ tool: 'GetLocalTypes', args: { class_name: 'ZCL' } });
  });
  it('checks an emptied part as absent', async () => {
    await liveCall('DeleteLocalTypes', { class_name: 'ZCL' });
    await expectAbsent({ tool: 'GetLocalTypes', args: { class_name: 'ZCL' } });
  });
});
