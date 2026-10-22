/**
 * The long session's close over Streamable HTTP (spec §2, "Close"):
 * `SessionClose` (and the compact `HandlerSession` with `action: 'close'`)
 * runs on the instance the pool found by the handle and answers that the
 * session is closed, naming what it held. Once that answer is written the
 * pool removes the instance from its index and starts the instance close
 * (`closeInstance`) on it in the same tick: every connection it owns logged
 * off once, an open batch and its answers dropped with nothing sent. From
 * then on the handle answers `state is not available` at once, whether or
 * not SAP answered the logoff; the shutdown still awaits that logoff's
 * answer. Every call goes over real HTTP to the ADT stand-in.
 */

import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import {
  BatchHandlersGroup,
  type HandlerContext,
} from '@mcp-abap-adt/lib/handlers';
import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import { CompactLongSessionHandlersGroup } from '../../../../src/lib/compact/longSession/group';
import { LongSessionHandlersGroup } from '../../../../src/lib/handlers/groups/LongSessionHandlersGroup';
import { isClosing } from '../../../../src/lib/instanceClose';
import { type HttpStand, httpStand, turns, until } from './shutdown/harness';

jest.setTimeout(30_000);

const placeholder = { connection: undefined } as unknown as HandlerContext;
const NOT_AVAILABLE = 'state is not available';
const LOCK = { object_type: 'CLASS', object_name: 'ZCL_LOCKED' };

let s: HttpStand;
let errorLines: string[];

interface PoolInternals {
  size(): number;
  index: Map<string, { instance: object }>;
}
const pool = () => (s.mcp as unknown as { pool: PoolInternals }).pool;
const poolSize = () => pool().size();
const probes = () =>
  s.standIn.requests.filter((r) => r.url.startsWith('/sap/bc/adt/probe/'));
const envelopes = () =>
  s.standIn.requests.filter(
    (r) => r.url.includes('/communication/batch') && r.method === 'POST',
  );

beforeEach(async () => {
  errorLines = [];
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errorLines.push(args.map(String).join(' '));
  });
  s = await httpStand({
    server: { batch: { keepRawParts: false } },
    groups: [
      new CompactModifyHandlersGroup(placeholder),
      new BatchHandlersGroup(placeholder),
      new LongSessionHandlersGroup(placeholder),
      new CompactLongSessionHandlersGroup(placeholder),
    ],
  });
});

afterEach(async () => {
  await turns(20);
  await s.close();
  jest.restoreAllMocks();
});

const handleOf = (text: string): string =>
  (JSON.parse(text) as { state_handle: string }).state_handle;

async function openSession(): Promise<string> {
  const opened = await s.call('SessionOpen', {});
  expect(opened.isError).toBe(false);
  return handleOf(opened.text);
}

/**
 * Records, for each handle the pool's index lets go, whether the instance
 * close had begun on its instance by the end of that tick's microtasks.
 */
function watchUnindexing(): Array<{ closing: boolean }> {
  const seen: Array<{ closing: boolean }> = [];
  const index = pool().index;
  const remove = index.delete.bind(index);
  index.delete = (handle: string) => {
    const instance = index.get(handle)?.instance;
    const record = { closing: false };
    seen.push(record);
    queueMicrotask(() => {
      record.closing = instance !== undefined && isClosing(instance);
    });
    return remove(handle);
  };
  return seen;
}

it('SessionClose answers that the session is closed and names what it held; the instance is unindexed and closed in that tick; every SAP session logged off once', async () => {
  const handle = await openSession();
  const locked = await s.call('HandlerLock', { ...LOCK, state_handle: handle });
  expect(locked.isError).toBe(false);
  const probed = await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  expect(probed.isError).toBe(false);
  expect(s.standIn.logoffs()).toBe(0);
  const unindexed = watchUnindexing();

  const closed = await s.call('SessionClose', { state_handle: handle });
  expect(closed.isError).toBe(false);
  expect(JSON.parse(closed.text)).toEqual({
    closed: true,
    held: { locks: 1, batch: false, debug_session: false },
  });

  await until(() => poolSize() === 0);
  expect(unindexed).toEqual([{ closing: true }]);
  await until(() => s.standIn.logoffs() > 0);
  await turns(20);
  const sessions = [
    ...new Set(
      s.standIn.requests.filter((r) => !isLogoff(r.url)).map((r) => r.session),
    ),
  ];
  expect(s.standIn.loggedOff().sort()).toEqual(sessions.sort());
});

it('a later call carrying the closed handle answers state is not available; nothing is created or sent', async () => {
  const handle = await openSession();
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  await s.call('SessionClose', { state_handle: handle });
  await until(() => s.standIn.logoffs() === 1);
  const sent = s.standIn.requests.length;

  const after = await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  expect(after).toEqual({ status: 200, text: NOT_AVAILABLE, isError: true });
  const again = await s.call('SessionClose', { state_handle: handle });
  expect(again).toEqual({ status: 200, text: NOT_AVAILABLE, isError: true });
  await turns(20);
  expect(s.standIn.requests).toHaveLength(sent);
  expect(poolSize()).toBe(0);
});

it('the compact HandlerSession close closes the session as SessionClose does', async () => {
  const opened = await s.call('HandlerSession', { action: 'open' });
  const handle = handleOf(opened.text);
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  const closed = await s.call('HandlerSession', {
    action: 'close',
    state_handle: handle,
  });
  expect(closed.isError).toBe(false);
  expect(JSON.parse(closed.text)).toEqual({
    closed: true,
    held: { locks: 0, batch: false, debug_session: false },
  });
  await until(() => s.standIn.logoffs() === 1);
  expect(poolSize()).toBe(0);
  const after = await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  expect(after.text).toBe(NOT_AVAILABLE);
});

it('close without a handle, or with an unknown one, answers state is not available and sends nothing', async () => {
  const bare = await s.call('SessionClose', {});
  expect(bare).toEqual({ status: 200, text: NOT_AVAILABLE, isError: true });
  const compactBare = await s.call('HandlerSession', { action: 'close' });
  expect(compactBare).toEqual({
    status: 200,
    text: NOT_AVAILABLE,
    isError: true,
  });
  const unknown = await s.call('SessionClose', {
    state_handle: '0123456789ABCDEF0123456789ABCDEF',
  });
  expect(unknown).toEqual({ status: 200, text: NOT_AVAILABLE, isError: true });
  await turns(20);
  expect(s.standIn.requests).toEqual([]);
  expect(poolSize()).toBe(0);
});

it('close runs at once while a batch is open: the batch and its recorded call are dropped with nothing sent', async () => {
  const handle = await openSession();
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  const begun = await s.call('BatchBegin', { state_handle: handle });
  expect(begun.isError).toBe(false);
  expect(handleOf(begun.text)).toBe(handle);
  const recorded = await s.call('HandlerLock', {
    ...LOCK,
    state_handle: handle,
  });
  expect(recorded.isError).toBe(false);

  const closed = await s.call('SessionClose', { state_handle: handle });
  expect(closed.isError).toBe(false);
  expect(JSON.parse(closed.text)).toEqual({
    closed: true,
    held: { locks: 0, batch: true, debug_session: false },
  });
  await until(() => s.standIn.logoffs() === 1);
  await turns(20);
  expect(envelopes()).toEqual([]);
  expect(s.standIn.requests.some((r) => r.url.includes('_action=LOCK'))).toBe(
    false,
  );
  const answers = await s.call('BatchAnswers', {
    number: 1,
    state_handle: handle,
  });
  expect(answers.text).toBe(NOT_AVAILABLE);
});

it('a call queued on the instance behind close is refused: state is not available, nothing sent', async () => {
  const handle = await openSession();
  const held = s.standIn.hold((r) => r.url.includes('/probe/first'));
  const first = s.call('ProbeAdt', { id: 'first', state_handle: handle });
  await held.arrived;
  const logged = (tool: string) =>
    errorLines.some((l) => l.includes(`tools/call -> ${tool} (id=`));
  const closing = s.call('SessionClose', { state_handle: handle });
  await until(() => logged('SessionClose'));
  await turns(5);
  const queued = s.call('ProbeAdt', { id: 'queued', state_handle: handle });
  await until(
    () =>
      errorLines.filter((l) => l.includes('tools/call -> ProbeAdt (id='))
        .length === 2,
  );
  await turns(5);
  held.release();

  expect((await first).isError).toBe(false);
  expect(JSON.parse((await closing).text)).toMatchObject({ closed: true });
  expect(await queued).toEqual({
    status: 200,
    text: NOT_AVAILABLE,
    isError: true,
  });
  await until(() => s.standIn.logoffs() === 1);
  expect(probes().map((r) => r.url)).toEqual(['/sap/bc/adt/probe/first']);
});

it('with the logoff written but never answered, the handle is refused at once and the shutdown awaits that close', async () => {
  const handle = await openSession();
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  const logoff = s.standIn.hold((r) => isLogoff(r.url));

  const closed = await s.call('SessionClose', { state_handle: handle });
  expect(closed.isError).toBe(false);
  await logoff.arrived;

  const after = await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  expect(after).toEqual({ status: 200, text: NOT_AVAILABLE, isError: true });
  expect(poolSize()).toBe(0);

  let exited = false;
  void s.exited.then(() => {
    exited = true;
  });
  s.processLike.emit('SIGTERM');
  await turns(50);
  expect(exited).toBe(false);

  logoff.release();
  expect(await s.exited).toBe(0);
  expect(s.standIn.logoffs()).toBe(1);
});

it('an embedder stop awaits a running instance close whose logoff is not answered yet', async () => {
  const handle = await openSession();
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  const logoff = s.standIn.hold((r) => isLogoff(r.url));
  await s.call('SessionClose', { state_handle: handle });
  await logoff.arrived;

  let stopped = false;
  const stopping = s.mcp.stop().then(() => {
    stopped = true;
  });
  await turns(50);
  expect(stopped).toBe(false);

  logoff.release();
  await stopping;
  expect(stopped).toBe(true);
});
