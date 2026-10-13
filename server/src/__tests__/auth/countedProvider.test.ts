import { authError } from '@mcp-abap-adt/auth-errors';
import type {
  AuthOutcome,
  IAuthProvider,
  IAuthRejection,
  ILogonTarget,
  IRequestTarget,
} from '@mcp-abap-adt/interfaces-auth';
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
  it.each(METHODS)(
    '%s is forwarded with its argument; Ok and Oops come back unchanged',
    async (m) => {
      for (const answer of [OK, OOPS]) {
        const { inner, calls } = fakeInner(async () => answer);
        const p = countedProvider(inner, new ProviderGate());
        await expect(call(p, m)).resolves.toBe(answer);
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe(m);
        if (m === 'prepare') expect(calls[0].args).toEqual([]);
        else expect(calls[0].args[0]).toBe(ARG[m]);
      }
    },
  );

  it('keeps the inner provider kind', () => {
    const { inner } = fakeInner(async () => OK);
    expect(countedProvider(inner, new ProviderGate()).kind).toBe('fake');
  });

  it.each(METHODS)(
    '%s: a throw from the inner provider passes through unaltered',
    async (m) => {
      const boom = new Error('inner bug');
      const { inner } = fakeInner(async () => {
        throw boom;
      });
      const gate = new ProviderGate();
      const p = countedProvider(inner, gate);
      await expect(call(p, m)).rejects.toBe(boom);
      expect(gate.inFlight).toBe(0);
    },
  );

  it('counts a held call while it runs and counts it down when it answers', async () => {
    const held = deferred<AuthOutcome>();
    const { inner } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const a = p.rejected(rejection);
    const b = p.authorize(request);
    expect(gate.inFlight).toBe(2);
    held.resolve(OK);
    await Promise.all([a, b]);
    expect(gate.inFlight).toBe(0);
  });

  it.each(METHODS)(
    '%s behind a closed gate answers the shutdown refusal, never calls inner, never throws',
    async (m) => {
      const { inner, calls } = fakeInner(async () => OK);
      const gate = new ProviderGate();
      const p = countedProvider(inner, gate);
      gate.close();
      expect(gate.closed).toBe(true);
      const outcome = await call(p, m);
      expect(outcome).toEqual({
        ok: false,
        refusal: authError['interactive-login']({ outcome: 'aborted' }),
      });
      expect(outcome).toEqual(SHUTDOWN_REFUSAL);
      expect(calls).toHaveLength(0);
      expect(gate.inFlight).toBe(0);
    },
  );

  it('a call admitted before close() completes and is counted down', async () => {
    const held = deferred<AuthOutcome>();
    const { inner, calls } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const admitted = p.prepare();
    gate.close();
    expect(gate.inFlight).toBe(1);
    held.resolve(OK);
    await expect(admitted).resolves.toBe(OK);
    expect(calls).toHaveLength(1);
    expect(gate.inFlight).toBe(0);
  });
});

describe('ProviderGate.drained', () => {
  it('resolves at once when nothing runs', async () => {
    await expect(new ProviderGate().drained()).resolves.toBeUndefined();
  });

  it('resolves when the count reaches zero — no deadline, no timer (D33)', async () => {
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
    expect(settled).toBe(false);
    held.resolve(OK);
    await running;
    await drained;
    expect(settled).toBe(true);
  });

  it('holds no timer while it waits', async () => {
    jest.useFakeTimers();
    try {
      const held = deferred<AuthOutcome>();
      const { inner } = fakeInner(() => held.promise);
      const gate = new ProviderGate();
      const p = countedProvider(inner, gate);
      const running = p.prepare();
      void gate.drained();
      expect(jest.getTimerCount()).toBe(0);
      held.resolve(OK);
      await running;
    } finally {
      jest.useRealTimers();
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
    expect(gate.inFlight).toBe(1);
    held.resolve(OK);
    await running;
  });
});
