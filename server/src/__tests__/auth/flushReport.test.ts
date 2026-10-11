/**
 * §10.2 row `brokerFactory.ts:217`: the shutdown's flush is
 * `flush({ signal })`, and what was not stored is read with auth-errors'
 * `classify(entry, 'persisting-tokens')` — one line per destination,
 * `"<destination>": <reason>`, never the store's own words.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SessionWriteFailure } from '@mcp-abap-adt/auth-broker';
import { classify } from '@mcp-abap-adt/auth-errors';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import {
  type BrokerBase,
  basicLines,
  brokerBase,
  factoryConfig,
  recordingLogins,
} from '../helpers/factoryFixture';

const SECRET = 'placeholder-secret-in-a-store-message';

let base: BrokerBase;

beforeEach(() => {
  base = brokerBase('flush-report');
});

afterEach(() => {
  jest.restoreAllMocks();
  base.remove();
});

const factory = () =>
  new AuthBrokerFactory(factoryConfig(base, recordingLogins()));

describe('settle: flush({ signal })', () => {
  it("hands the shutdown's signal to every broker's flush", async () => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const flush = jest.spyOn(broker, 'flush').mockResolvedValue(undefined);
    const controller = new AbortController();
    await expect(
      f.settle(1_000, { signal: controller.signal }),
    ).resolves.toEqual({ abandoned: 0, notStored: [] });
    expect(flush).toHaveBeenCalledWith({ signal: controller.signal });
  });

  it('a stored-nothing entry is read with classify(entry, persisting-tokens)', async () => {
    base.writeSession('dest', basicLines());
    base.writeSession('other', basicLines());
    const f = factory();
    const a = await f.getBroker('dest');
    const b = await f.getBroker('other');
    const storeError = Object.assign(new Error(SECRET), { code: 'EACCES' });
    const entry = new SessionWriteFailure('dest', storeError);
    jest
      .spyOn(a, 'flush')
      .mockRejectedValue(new AggregateError([entry], `failing ${SECRET}`));
    const plain = new Error(SECRET);
    jest.spyOn(b, 'flush').mockRejectedValue(plain);

    const report = await f.settle(1_000);

    expect(report.abandoned).toBe(0);
    expect(report.notStored.sort()).toEqual(
      [
        `"dest": ${classify(entry, 'persisting-tokens').reason}`,
        `"other": ${classify(plain, 'persisting-tokens').reason}`,
      ].sort(),
    );
    // The broker's entry carries its store error classified: that is the reason.
    expect(classify(entry, 'persisting-tokens')).toBe(entry.error);
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it('an empty AggregateError still names the destination', async () => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const a = await f.getBroker('dest');
    const empty = new AggregateError([], SECRET);
    jest.spyOn(a, 'flush').mockRejectedValue(empty);
    const report = await f.settle(1_000);
    expect(report.notStored).toEqual([
      `"dest": ${classify(empty, 'persisting-tokens').reason}`,
    ]);
  });

  it('the old reader is gone: no notStoredOf, no ENTRY pattern', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../auth/brokerFactory.ts'),
      'utf8',
    );
    expect(source).not.toContain('notStoredOf');
    expect(source).not.toContain('ENTRY');
    expect(source).not.toContain('errorClassOf');
  });
});
