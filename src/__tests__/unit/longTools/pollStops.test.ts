/**
 * An async long call whose `timeout` ended its wait polls no more (spec
 * §5.8): the run goes on in SAP, and the answer already named it. Proved
 * where the poll loop is, apart from the logoff that follows the timeout —
 * which would stop a poll on its own by spending the connection.
 */

import { pollUntilFinished } from '../../../handlers/unit_test/shared/pollRun';
import {
  type LongCallProgress,
  withLongCallProgress,
} from '../../../lib/longTools';

const unfinished = {
  ok: true,
  getResult: () => ({ value: { value: {}, raw: '' } }),
} as never;

it('stops polling once the wait was ended, and names the run it polls', async () => {
  const progress: LongCallProgress = { ids: new Map(), waitEnded: false };
  let polls = 0;
  await withLongCallProgress(progress, () =>
    pollUntilFinished(
      async () => {
        polls += 1;
        // The timeout fires while this poll is held.
        progress.waitEnded = true;
        return unfinished;
      },
      'run-placeholder-1',
      async () => unfinished,
    ),
  );
  expect(polls).toBe(1);
  expect(progress.ids.get('run_id')).toBe('run-placeholder-1');
});

it('outside a long call, polls to its bound as before', async () => {
  let polls = 0;
  await pollUntilFinished(
    async () => {
      polls += 1;
      return unfinished;
    },
    'run-placeholder-1',
    async () => unfinished,
  );
  expect(polls).toBe(5);
});
