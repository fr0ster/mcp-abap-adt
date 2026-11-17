/** Run by `runReport.test.ts`: a todo case that calls (node:test runs a todo case's body). */
import { it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('todoAfterCall', () => {
  it('calls, some day for real', { todo: true }, async () => {
    await liveCall('GetTable', { table_name: 'ZTODO' });
  });
});
