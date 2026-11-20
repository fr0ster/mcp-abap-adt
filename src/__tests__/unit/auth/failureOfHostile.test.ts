/**
 * `failureOf` is total. A thrown value whose `refusal`, `error` or
 * `code` is a throwing getter, a Proxy (revoked or with throwing traps), a
 * primitive or `null` never makes the reader throw: it answers `undefined`
 * or a classified failure, and no getter of the value is run.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
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

describe('failureOf on hostile values', () => {
  for (const key of ['refusal', 'error', 'code', 'name', 'message', 'kind']) {
    it(format('a throwing getter on %s: never run, never throws', key), () => {
      const { value, ran } = throwingGetters(key);
      failureOf(value);
      assert.equal(failureOf(value), undefined);
      assert.deepStrictEqual(ran, []);
    });
  }

  it('throwing getters on refusal, error and code at once', () => {
    const { value, ran } = throwingGetters('refusal', 'error', 'code');
    assert.equal(failureOf(value), undefined);
    assert.deepStrictEqual(ran, []);
  });

  it('an own refusal whose kind is a throwing getter', () => {
    const { value: refusal, ran } = throwingGetters('kind', 'facts');
    assert.equal(failureOf({ refusal }), undefined);
    assert.deepStrictEqual(ran, []);
  });

  it('a Proxy whose traps throw, as the value and as its refusal', () => {
    failureOf(trapsThatThrow());
    assert.equal(failureOf(trapsThatThrow()), undefined);
    assert.equal(failureOf({ refusal: trapsThatThrow() }), undefined);
  });

  it('a revoked Proxy, as the value and as its refusal', () => {
    assert.equal(failureOf(revoked()), undefined);
    assert.equal(failureOf({ refusal: revoked() }), undefined);
    assert.equal(failureOf({ refusal: { refusal: revoked() } }), undefined);
  });

  it('a refusal with a known kind but forged facts: a classified failure, not a throw', () => {
    const read = failureOf({
      refusal: { kind: 'credential-refused', facts: { credential: 42 } },
    });
    assert.equal(read?.error, 'authentication_failed');
    assert.equal(read?.kind, 'unknown');
  });

  it('a refusal held behind a getter on a value with a real one beside it: only own data is read', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const proto = { refusal: error };
    assert.equal(failureOf(Object.create(proto)), undefined);
  });

  for (const [_label, value] of [
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'ADT_REQUEST_ABORTED'],
    ['a boolean', true],
    ['a symbol', Symbol('x')],
    ['a bigint', BigInt(1)],
  ]) {
    it(format('%s: undefined', _label), () => {
      assert.equal(failureOf(value), undefined);
    });
  }

  it('a function with an own refusal is read like an object', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const fn = Object.assign(() => {}, { refusal: error });
    assert.equal(failureOf(fn)?.kind, 'credential-refused');
  });
});
