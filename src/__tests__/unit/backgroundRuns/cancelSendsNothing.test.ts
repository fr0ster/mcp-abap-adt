/**
 * A cancelled read run sends nothing more to SAP: once `DiscardBackgroundRun`
 * has logged off the run's one connection, a read whose handler sends several
 * requests in sequence — `GetPackageTree` over three packages, read one after
 * another where the system has no communication batch — sends no further
 * request when the answer it was waiting for arrives, and no logon either:
 * the connection's own admission refuses every request after its
 * `disconnect()` (connection 25, `SessionLifecycle.admitRequest`), and a
 * logged-off instance is spent, so nothing logs on again.
 *
 * Measured over HTTP against the ADT stand-in, through the server's own
 * dispatch: the run's connection is the real one the server builds.
 */

import { pending, resetProcessLatchForTests } from '../../../lib/activeTools';
import type { StandInRequest } from '../../helpers/adtStandIn';
import { isLogoff } from '../../helpers/adtStandIn';
import {
  type Answer,
  type BackgroundStand,
  backgroundStand,
  logoffIndex,
  until,
} from './harness';

const PACKAGES = ['ZPLACEHOLDER_A', 'ZPLACEHOLDER_B', 'ZPLACEHOLDER_C'];
const TREE = { package_names: PACKAGES, include_subpackages: false };

/** The communication batch endpoint: answered `404` — no batch, read one by one. */
const isBatch = (r: StandInRequest): boolean =>
  r.url.includes('/communication/batch');

/** A package's metadata read (`GET …/packages/<name>`). */
const isPackageRead = (r: StandInRequest): boolean =>
  r.method === 'GET' && r.url.includes('/sap/bc/adt/packages/');

let stand: BackgroundStand;

beforeEach(async () => {
  stand = await backgroundStand();
  stand.standIn.answer(isBatch, 404);
});

afterEach(async () => {
  await stand.close();
  resetProcessLatchForTests();
});

const handleOf = (answer: Answer): string => {
  const handle = answer.payload.run_handle;
  return typeof handle === 'string' ? handle : '';
};

/** Every package tree read's work has settled. */
const treeSettled = () =>
  pending().every((name) => !name.startsWith('GetPackageTree'));

/** The requests `session` sent, logoffs and batch envelopes left out. */
const readsOf = (session: string): StandInRequest[] =>
  stand.standIn.requests.filter(
    (r) => r.session === session && !isLogoff(r.url) && !isBatch(r),
  );

describe('a cancelled read run sends nothing more', () => {
  it('uncancelled, the run reads every package in its own session, one after another', async () => {
    const started = await stand.a.call('GetPackageTree', TREE);
    expect(started.isError).toBe(false);
    await until(treeSettled);
    const first = stand.standIn.requests.find(isPackageRead);
    const session = first?.session ?? '';
    const reads = readsOf(session).filter(isPackageRead);
    // The multi-request run this suite cancels: a metadata read per package.
    expect(reads.length).toBe(PACKAGES.length);
  });

  it('discarded while its first read is held, it sends no request and no logon after the cancel', async () => {
    const held = stand.standIn.hold(isPackageRead);
    const started = await stand.a.call('GetPackageTree', TREE);
    const handle = handleOf(started);
    await held.arrived;
    const session = stand.standIn.requests.find(isPackageRead)?.session ?? '';
    const sentBefore = readsOf(session).length;
    const before = stand.standIn.requests.length;

    const discarded = await stand.a.call('DiscardBackgroundRun', {
      run_handle: handle,
    });
    expect(discarded.payload).toEqual({
      run_handle: handle,
      state: 'cancelled',
    });
    await until(() => logoffIndex(stand.standIn, session) >= before);
    const after = stand.standIn.requests.length;

    // The answer the run was waiting for arrives: its handler goes on.
    held.release();
    await held.answered;
    await until(treeSettled);

    // Nothing more in the run's session, and nothing in a new one either.
    expect(readsOf(session).length).toBe(sentBefore);
    expect(stand.standIn.requests.slice(after)).toEqual([]);
  });
});
