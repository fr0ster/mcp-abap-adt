/**
 * Run by `live.test.ts` through `node --test`, never by `npm test`: in a
 * live suite on a stub runner, one case calls and passes, one calls and
 * then fails an assertion.
 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  type LiveRunner,
  liveCall,
  liveDescribe,
} from '../../../../integration/helpers/live';

const runner: LiveRunner = {
  system: 'onprem',
  user: 'STUB_USER',
  call: async () => ({ isError: false, content: [], text: '' }),
  connection: () => {
    throw new Error('no connection in this fixture');
  },
  close: async () => {},
};

liveDescribe(
  'keyOutcome',
  async () => runner,
  async () => {},
  () => {
    it('calls and passes', async () => {
      await liveCall('GetProgram', { program_name: 'ZPASSES' });
    });

    it('calls and then fails', async () => {
      await liveCall('GetClass', { class_name: 'ZFAILS' });
      assert.equal(1, 2);
    });
  },
);
