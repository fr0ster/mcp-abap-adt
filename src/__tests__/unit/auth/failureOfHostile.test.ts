/**
 * RF3: `failureOf` is total. A thrown value whose `refusal`, `error` or
 * `code` is a throwing getter, a Proxy (revoked or with throwing traps), a
 * primitive or `null` never makes the reader throw: it answers `undefined`
 * or a classified failure, and no getter of the value is run.
 */

import { authError } from '@mcp-abap-adt/auth-errors';
import { failureOf } from '../../../lib/auth/failures';

function throwingGetters(...keys: string[]): {
  value: object;
  ran: string[];
} {
  const ran: string[] = [];
  const value = {};
  for (const key of keys) {
    Object.defineProperty(value, key, {
      enumerable: true,
      get() {
        ran.push(key);
        throw new Error(`getter ${key} ran`);
      },
    });
  }
  return { value, ran };
}

function trapsThatThrow(): object {
  const thrower = () => {
    throw new Error('trap ran');
  };
  return new Proxy(
    {},
    {
      get: thrower,
      has: thrower,
      getOwnPropertyDescriptor: thrower,
      ownKeys: thrower,
      getPrototypeOf: thrower,
    },
  );
}

function revoked(): object {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
}

describe('failureOf on hostile values (RF3)', () => {
  it.each(['refusal', 'error', 'code', 'name', 'message', 'kind'])(
    'a throwing getter on %s: never run, never throws',
    (key) => {
      const { value, ran } = throwingGetters(key);
      expect(() => failureOf(value)).not.toThrow();
      expect(failureOf(value)).toBeUndefined();
      expect(ran).toEqual([]);
    },
  );

  it('throwing getters on refusal, error and code at once', () => {
    const { value, ran } = throwingGetters('refusal', 'error', 'code');
    expect(failureOf(value)).toBeUndefined();
    expect(ran).toEqual([]);
  });

  it('an own refusal whose kind is a throwing getter', () => {
    const { value: refusal, ran } = throwingGetters('kind', 'facts');
    expect(failureOf({ refusal })).toBeUndefined();
    expect(ran).toEqual([]);
  });

  it('a Proxy whose traps throw, as the value and as its refusal', () => {
    expect(() => failureOf(trapsThatThrow())).not.toThrow();
    expect(failureOf(trapsThatThrow())).toBeUndefined();
    expect(failureOf({ refusal: trapsThatThrow() })).toBeUndefined();
  });

  it('a revoked Proxy, as the value and as its refusal', () => {
    expect(failureOf(revoked())).toBeUndefined();
    expect(failureOf({ refusal: revoked() })).toBeUndefined();
    expect(failureOf({ refusal: { refusal: revoked() } })).toBeUndefined();
  });

  it('a refusal with a known kind but forged facts: a classified failure, not a throw', () => {
    const read = failureOf({
      refusal: { kind: 'credential-refused', facts: { credential: 42 } },
    });
    expect(read?.error).toBe('authentication_failed');
    expect(read?.kind).toBe('unknown');
  });

  it('a refusal held behind a getter on a value with a real one beside it: only own data is read', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const proto = { refusal: error };
    expect(failureOf(Object.create(proto))).toBeUndefined();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'ADT_REQUEST_ABORTED'],
    ['a boolean', true],
    ['a symbol', Symbol('x')],
    ['a bigint', BigInt(1)],
  ])('%s: undefined', (_label, value) => {
    expect(failureOf(value)).toBeUndefined();
  });

  it('a function with an own refusal is read like an object', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const fn = Object.assign(() => {}, { refusal: error });
    expect(failureOf(fn)?.kind).toBe('credential-refused');
  });
});
