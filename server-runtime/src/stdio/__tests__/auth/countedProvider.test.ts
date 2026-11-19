import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { authError } from '@mcp-abap-adt/auth-errors';
import type {
  AuthOutcome,
  IAuthProvider,
  IAuthRejection,
  ILogonTarget,
  IRequestTarget,
} from '@mcp-abap-adt/interfaces-auth';
import { rejectionOf } from '../../../../../src/__tests__/helpers/assertions';
import {
  getTimerCount,
  useFakeTimers,
  useRealTimers,
} from '../../../../../src/__tests__/helpers/fakeTime';
import {
  countedProvider,
  ProviderGate,
  SHUTDOWN_REFUSAL,
} from '../../auth/countedProvider';

const OK: AuthOutcome = { ok: true };
const OOPS: AuthOutcome = {
  ok: false,
  refusal: authError['credential-refused']({ credential: 'token' }),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Method = 'prepare' | 'establish' | 'authorize' | 'rejected';
const METHODS: Method[] = ['prepare', 'establish', 'authorize', 'rejected'];

const logon = { marker: 'logon' } as unknown as ILogonTarget;
const request = { marker: 'request' } as unknown as IRequestTarget;
const rejection: IAuthRejection = { at: 'request', status: 401, error: null };
const ARG: Record<Method, unknown> = {
  prepare: undefined,
  establish: logon,
  authorize: request,
  rejected: rejection,
};

function call(p: IAuthProvider, m: Method): Promise<AuthOutcome> {
  switch (m) {
    case 'prepare':
      return p.prepare();
    case 'establish':
      return p.establish(logon);
    case 'authorize':
      return p.authorize(request);
    case 'rejected':
      return p.rejected(rejection);
  }
}

function fakeInner(answer: (m: Method) => Promise<AuthOutcome>) {
  const calls: Array<{ method: Method; args: unknown[] }> = [];
  const inner: IAuthProvider = {
    kind: 'fake',
    prepare: (...args: unknown[]) => {
      calls.push({ method: 'prepare', args });
      return answer('prepare');
    },
    establish: (...args: unknown[]) => {
      calls.push({ method: 'establish', args });
      return answer('establish');
    },
    authorize: (...args: unknown[]) => {
      calls.push({ method: 'authorize', args });
      return answer('authorize');
    },
    rejected: (...args: unknown[]) => {
      calls.push({ method: 'rejected', args });
      return answer('rejected');
    },
  } as IAuthProvider;
  return { inner, calls };
}

describe('countedProvider', () => {
  for (const m of METHODS) {
    it(
      format(
        '%s is forwarded with its argument; Ok and Oops come back unchanged',
        m,
      ),
      async () => {
        for (const answer of [OK, OOPS]) {
          const { inner, calls } = fakeInner(async () => answer);
          const p = countedProvider(inner, new ProviderGate());
          assert.equal(await call(p, m), answer);
          assert.equal(calls.length, 1);
          assert.equal(calls[0].method, m);
          if (m === 'prepare') assert.deepStrictEqual(calls[0].args, []);
          else assert.equal(calls[0].args[0], ARG[m]);
        }
      },
    );
  }

  it('keeps the inner provider kind', () => {
    const { inner } = fakeInner(async () => OK);
    assert.equal(countedProvider(inner, new ProviderGate()).kind, 'fake');
  });

  for (const m of METHODS) {
    it(
      format('%s: a throw from the inner provider passes through unaltered', m),
      async () => {
        const boom = new Error('inner bug');
        const { inner } = fakeInner(async () => {
          throw boom;
        });
        const gate = new ProviderGate();
        const p = countedProvider(inner, gate);
        assert.equal(await rejectionOf(call(p, m)), boom);
        assert.equal(gate.inFlight, 0);
      },
    );
  }

  it('counts a held call while it runs and counts it down when it answers', async () => {
    const held = deferred<AuthOutcome>();
    const { inner } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const a = p.rejected(rejection);
    const b = p.authorize(request);
    assert.equal(gate.inFlight, 2);
    held.resolve(OK);
    await Promise.all([a, b]);
    assert.equal(gate.inFlight, 0);
  });

  for (const m of METHODS) {
    it(
      format(
        '%s behind a closed gate answers the shutdown refusal, never calls inner, never throws',
        m,
      ),
      async () => {
        const { inner, calls } = fakeInner(async () => OK);
        const gate = new ProviderGate();
        const p = countedProvider(inner, gate);
        gate.close();
        assert.equal(gate.closed, true);
        const outcome = await call(p, m);
        assert.deepStrictEqual(outcome, {
          ok: false,
          refusal: authError['interactive-login']({ outcome: 'aborted' }),
        });
        assert.deepStrictEqual(outcome, SHUTDOWN_REFUSAL);
        assert.equal(calls.length, 0);
        assert.equal(gate.inFlight, 0);
      },
    );
  }

  it('a call admitted before close() completes and is counted down', async () => {
    const held = deferred<AuthOutcome>();
    const { inner, calls } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const admitted = p.prepare();
    gate.close();
    assert.equal(gate.inFlight, 1);
    held.resolve(OK);
    assert.equal(await admitted, OK);
    assert.equal(calls.length, 1);
    assert.equal(gate.inFlight, 0);
  });
});

describe('ProviderGate.drained', () => {
  it('resolves at once when nothing runs', async () => {
    assert.equal(await new ProviderGate().drained(), undefined);
  });

  it('resolves when the count reaches zero — no deadline, no timer', async () => {
    const held = deferred<AuthOutcome>();
    const { inner } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const running = p.rejected(rejection);
    let settled = false;
    const drained = gate.drained().then(() => {
      settled = true;
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false);
    held.resolve(OK);
    await running;
    await drained;
    assert.equal(settled, true);
  });

  it('holds no timer while it waits', async () => {
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    });
    try {
      const held = deferred<AuthOutcome>();
      const { inner } = fakeInner(() => held.promise);
      const gate = new ProviderGate();
      const p = countedProvider(inner, gate);
      const running = p.prepare();
      void gate.drained();
      assert.equal(getTimerCount(), 0);
      held.resolve(OK);
      await running;
    } finally {
      useRealTimers();
    }
  });

  it("the shutdown's signal releases the wait (the forced close)", async () => {
    const held = deferred<AuthOutcome>();
    const { inner } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const running = p.prepare();
    const forced = new AbortController();
    const drained = gate.drained(forced.signal);
    forced.abort();
    await drained;
    assert.equal(gate.inFlight, 1);
    held.resolve(OK);
    await running;
  });
});
