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
} from '../../../lib/auth/countedProvider';

const OK: AuthOutcome = { ok: true };
const OOPS: AuthOutcome = {
  ok: false,
  refusal: { reason: 'refused by the inner provider', hint: 'a hint' },
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
        refusal: { reason: 'the server is shutting down' },
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
  it('resolves 0 at once when nothing runs', async () => {
    await expect(new ProviderGate().drained(1_000)).resolves.toBe(0);
  });

  it('resolves 0 when the count reaches zero before the deadline', async () => {
    const held = deferred<AuthOutcome>();
    const { inner } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const running = p.rejected(rejection);
    let settled = false;
    const drained = gate.drained(30_000).then((n) => {
      settled = true;
      return n;
    });
    await new Promise((r) => setImmediate(r));
    expect(settled).toBe(false);
    held.resolve(OK);
    await running;
    await expect(drained).resolves.toBe(0);
  });

  it('resolves at the deadline with the number still running', async () => {
    const held = deferred<AuthOutcome>();
    const { inner } = fakeInner(() => held.promise);
    const gate = new ProviderGate();
    const p = countedProvider(inner, gate);
    const running = [p.prepare(), p.authorize(request)];
    const started = Date.now();
    await expect(gate.drained(50)).resolves.toBe(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    held.resolve(OK);
    await Promise.all(running);
  });
});
