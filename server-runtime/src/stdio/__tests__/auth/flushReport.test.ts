/**
 * The shutdown's flush is
 * `flush({ signal })`, and what was not stored is read with auth-errors'
 * `classify(entry, 'persisting-tokens')` — one line per destination,
 * `"<destination>": <reason>`, never the store's own words.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { SessionWriteFailure } from '@mcp-abap-adt/auth-broker';
import { classify } from '@mcp-abap-adt/auth-errors';
import { repositoryRoot } from '../../../../../src/__tests__/helpers/repoRoot';
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
  mock.restoreAll();
  base.remove();
});

const factory = () =>
  new AuthBrokerFactory(factoryConfig(base, recordingLogins()));

describe('settle: flush({ signal })', () => {
  it("hands the shutdown's signal to every broker's flush", async (t) => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const broker = await f.getBroker('dest');
    const flush = t.mock.method(broker, 'flush', async () => undefined);
    const controller = new AbortController();
    assert.deepStrictEqual(await f.settle({ signal: controller.signal }), {
      notStored: [],
    });
    assert.ok(
      flush.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [{ signal: controller.signal }]),
      ),
    );
  });

  it('a stored-nothing entry is read with classify(entry, persisting-tokens)', async (t) => {
    base.writeSession('dest', basicLines());
    base.writeSession('other', basicLines());
    const f = factory();
    const a = await f.getBroker('dest');
    const b = await f.getBroker('other');
    const storeError = Object.assign(new Error(SECRET), { code: 'EACCES' });
    const entry = new SessionWriteFailure('dest', storeError);
    const failing = new AggregateError([entry], `failing ${SECRET}`);
    t.mock.method(a, 'flush', async () => {
      throw failing;
    });
    const plain = new Error(SECRET);
    t.mock.method(b, 'flush', async () => {
      throw plain;
    });

    const report = await f.settle();

    assert.deepStrictEqual(
      report.notStored.sort(),
      [
        `"dest": ${classify(entry, 'persisting-tokens').reason}`,
        `"other": ${classify(plain, 'persisting-tokens').reason}`,
      ].sort(),
    );
    // The broker's entry carries its store error classified: that is the reason.
    assert.equal(classify(entry, 'persisting-tokens'), entry.error);
    assert.ok(!JSON.stringify(report).includes(SECRET));
  });

  it('an empty AggregateError still names the destination', async (t) => {
    base.writeSession('dest', basicLines());
    const f = factory();
    const a = await f.getBroker('dest');
    const empty = new AggregateError([], SECRET);
    t.mock.method(a, 'flush', async () => {
      throw empty;
    });
    const report = await f.settle();
    assert.deepStrictEqual(report.notStored, [
      `"dest": ${classify(empty, 'persisting-tokens').reason}`,
    ]);
  });

  it('the old reader is gone: no notStoredOf, no ENTRY pattern', () => {
    const source = fs.readFileSync(
      path.join(
        repositoryRoot(__dirname),
        'server-runtime',
        'src',
        'stdio',
        'auth',
        'brokerFactory.ts',
      ),
      'utf8',
    );
    assert.ok(!source.includes('notStoredOf'));
    assert.ok(!source.includes('ENTRY'));
    assert.ok(!source.includes('errorClassOf'));
  });
});
