/**
 * Every request asks the broker for the
 * destination's provider with its own signal — the server keeps no provider
 * cache — and the counted wrapper is memoised per inner provider; the
 * settings are read once per process, and a failed read is not kept.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import {
  assertMatchObject,
  rejectionOf,
} from '../../../../../src/__tests__/helpers/assertions';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import {
  type BrokerBase,
  basicLines,
  brokerBase,
  factoryConfig,
  recordingLogins,
} from '../helpers/factoryFixture';

let base: BrokerBase;

beforeEach(() => {
  base = brokerBase('per-request-provider');
});

afterEach(() => {
  mock.restoreAll();
  base.remove();
});

const factory = () =>
  new AuthBrokerFactory(factoryConfig(base, recordingLogins()));

function innerProvider(kind: string): IAuthProvider {
  const ok = async () => ({ ok: true as const });
  return { kind, prepare: ok, establish: ok, authorize: ok, rejected: ok };
}

describe('getProvider(destination, { signal })', () => {
  it("asks the broker on every call, with the call's own signal", async (t) => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const asked = t.mock.method(broker, 'getProvider');
    const first = new AbortController();
    const second = new AbortController();
    await f.getProvider('dest', { signal: first.signal });
    await f.getProvider('dest', { signal: second.signal });
    await f.getProvider('dest');
    assert.equal(asked.mock.callCount(), 3);
    assert.deepStrictEqual(asked.mock.calls[0]?.arguments, [
      'dest',
      { signal: first.signal },
    ]);
    assert.deepStrictEqual(asked.mock.calls[1]?.arguments, [
      'dest',
      { signal: second.signal },
    ]);
    assert.equal(asked.mock.calls[2]?.arguments[1]?.signal, undefined);
  });

  it('one counted wrapper per inner provider: the same inner, the same wrapper', async (t) => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const a = innerProvider('a');
    const b = innerProvider('b');
    // The first three calls answer a, a, b; any later one the original.
    const asked = t.mock.method(broker, 'getProvider');
    asked.mock.mockImplementationOnce(async () => a, 0);
    asked.mock.mockImplementationOnce(async () => a, 1);
    asked.mock.mockImplementationOnce(async () => b, 2);
    const first = await f.getProvider('dest');
    const again = await f.getProvider('dest');
    const other = await f.getProvider('dest');
    assert.equal(again, first);
    assert.notEqual(first, a);
    assert.equal(first.kind, 'a');
    assert.notEqual(other, first);
    assert.equal(other.kind, 'b');
  });

  it("a refusing broker's error reaches the caller, and the next call asks again", async (t) => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const refusal = new Error('refused');
    // The first call refuses, the second answers one provider made now
    // (the provider is made here, when the answer is queued); any later
    // call the original.
    const asked = t.mock.method(broker, 'getProvider');
    const answered = innerProvider('a');
    asked.mock.mockImplementationOnce(async () => {
      throw refusal;
    }, 0);
    asked.mock.mockImplementationOnce(async () => answered, 1);
    assert.equal(await rejectionOf(f.getProvider('dest')), refusal);
    assertMatchObject(await f.getProvider('dest'), { kind: 'a' });
    assert.equal(asked.mock.callCount(), 2);
  });
});

describe('settingsFor: read once per process', () => {
  it('a changed file after the first read changes nothing', async () => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const first = await f.settingsFor('dest');
    base.writeSession('dest', [
      'SAP_URL=https://changed.example.test',
      'SAP_CLIENT=200',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=placeholder-user',
      'SAP_PASSWORD=placeholder-password',
    ]);
    assert.deepStrictEqual(await f.settingsFor('dest'), first);
  });

  it('a failed read is not kept: fixing the file lets the next call answer', async () => {
    base.writeSession('dest', [
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=placeholder-user',
      'SAP_PASSWORD=placeholder-password',
    ]);
    const f = factory();
    assert.notEqual(await rejectionOf(f.settingsFor('dest')), undefined);
    fs.writeFileSync(
      path.join(base.sessionsDir, 'dest.env'),
      `${basicLines().join('\n')}\n`,
    );
    assertMatchObject(await f.settingsFor('dest'), {
      url: 'https://system.example.test',
    });
  });
});
