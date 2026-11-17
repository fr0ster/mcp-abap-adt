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
  it('reads a class source', async () => {
    await liveCall('HandlerGet', { object_type: 'CLASS', part: 'source', class_name: 'ZCL' });
  });
  it('reads an object structure', async () => {
    await liveCall('HandlerGet', { part: 'object_structure', object_adt_type: 'CLAS/OC', object_name: 'ZCL' });
  });
});
