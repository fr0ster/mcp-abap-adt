/**
 * Every request asks the broker for the
 * destination's provider with its own signal — the server keeps no provider
 * cache — and the counted wrapper is memoised per inner provider; the
 * settings are read once per process, and a failed read is not kept.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
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
  jest.restoreAllMocks();
  base.remove();
});

const factory = () =>
  new AuthBrokerFactory(factoryConfig(base, recordingLogins()));

function innerProvider(kind: string): IAuthProvider {
  const ok = async () => ({ ok: true as const });
  return { kind, prepare: ok, establish: ok, authorize: ok, rejected: ok };
}

describe('getProvider(destination, { signal })', () => {
  it("asks the broker on every call, with the call's own signal", async () => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const asked = jest.spyOn(broker, 'getProvider');
    const first = new AbortController();
    const second = new AbortController();
    await f.getProvider('dest', { signal: first.signal });
    await f.getProvider('dest', { signal: second.signal });
    await f.getProvider('dest');
    expect(asked).toHaveBeenCalledTimes(3);
    expect(asked.mock.calls[0]).toEqual(['dest', { signal: first.signal }]);
    expect(asked.mock.calls[1]).toEqual(['dest', { signal: second.signal }]);
    expect(asked.mock.calls[2][1]?.signal).toBeUndefined();
  });

  it('one counted wrapper per inner provider: the same inner, the same wrapper', async () => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const a = innerProvider('a');
    const b = innerProvider('b');
    jest
      .spyOn(broker, 'getProvider')
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b);
    const first = await f.getProvider('dest');
    const again = await f.getProvider('dest');
    const other = await f.getProvider('dest');
    expect(again).toBe(first);
    expect(first).not.toBe(a);
    expect(first.kind).toBe('a');
    expect(other).not.toBe(first);
    expect(other.kind).toBe('b');
  });

  it("a refusing broker's error reaches the caller, and the next call asks again", async () => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const refusal = new Error('refused');
    const asked = jest
      .spyOn(broker, 'getProvider')
      .mockRejectedValueOnce(refusal)
      .mockResolvedValueOnce(innerProvider('a'));
    await expect(f.getProvider('dest')).rejects.toBe(refusal);
    await expect(f.getProvider('dest')).resolves.toMatchObject({ kind: 'a' });
    expect(asked).toHaveBeenCalledTimes(2);
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
    expect(await f.settingsFor('dest')).toEqual(first);
  });

  it('a failed read is not kept: fixing the file lets the next call answer', async () => {
    base.writeSession('dest', [
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=placeholder-user',
      'SAP_PASSWORD=placeholder-password',
    ]);
    const f = factory();
    await expect(f.settingsFor('dest')).rejects.toBeDefined();
    fs.writeFileSync(
      path.join(base.sessionsDir, 'dest.env'),
      `${basicLines().join('\n')}\n`,
    );
    await expect(f.settingsFor('dest')).resolves.toMatchObject({
      url: 'https://system.example.test',
    });
  });
});
