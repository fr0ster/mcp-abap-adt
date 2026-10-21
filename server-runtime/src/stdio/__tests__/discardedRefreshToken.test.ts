/**
 * A discarded refresh token does not come back: the
 * token endpoint refuses a refresh `invalid_grant`, and the broker's
 * `refreshToken: ''` write could not land then (the file was not writable);
 * the process shuts down — its flush lands the pending write before the exit
 * —, and a new factory over the same file seeds none: a rejection there logs
 * in, it does not refresh with the refused token.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { AuthBrokerFactory } from '../auth/brokerFactory';
import { installShutdown } from '../shutdown';
import {
  authorizationCodeLines,
  type BrokerBase,
  brokerBase,
  factoryConfig,
  recordingLogins,
  silentLogger,
} from './helpers/factoryFixture';
import { type TokenEndpoint, tokenEndpoint } from './helpers/loginStand';

jest.setTimeout(30_000);

const REJECTION_401 = { status: 401 } as never;

let base: BrokerBase;
let tokens: TokenEndpoint;
let envFile: string;

beforeEach(async () => {
  resetProcessLatchForTests();
  base = brokerBase('discarded-refresh');
  tokens = await tokenEndpoint();
  envFile = base.writeFile('conn.env', authorizationCodeLines(tokens.url));
});

afterEach(async () => {
  await tokens.close();
  base.remove();
});

const factoryOver = (renewal: 'refresh-then-login' | 'refresh-only') =>
  new AuthBrokerFactory(
    factoryConfig(base, recordingLogins(), {
      envFile: { path: envFile, source: '--env-path' },
      renewal,
      logger: silentLogger,
    }),
  );

it('refused invalid_grant, shutdown, a new factory over the same file seeds none and logs in', async () => {
  // A first process logs in: its tokens are in the file.
  const first = factoryOver('refresh-then-login');
  await expect((await first.getProvider('default')).prepare()).resolves.toEqual(
    { ok: true },
  );
  await first.settle();
  expect(fs.readFileSync(envFile, 'utf8')).toContain(
    'SAP_REFRESH_TOKEN=placeholder-refresh-1',
  );

  // A second process: its refresh is refused, the token discarded — and
  // the discard cannot be written yet: it stays pending.
  const second = factoryOver('refresh-only');
  tokens.refuseRefresh(true);
  fs.chmodSync(envFile, 0o444);
  fs.chmodSync(base.root, 0o555);
  let refused: { ok: boolean };
  try {
    refused = await (await second.getProvider('default')).rejected(
      REJECTION_401,
    );
  } finally {
    fs.chmodSync(base.root, 0o755);
    fs.chmodSync(envFile, 0o644);
  }
  expect(refused.ok).toBe(false);
  expect(fs.readFileSync(envFile, 'utf8')).toContain(
    'SAP_REFRESH_TOKEN=placeholder-refresh-1',
  );
  // Its shutdown: the flush lands the discard before the exit.
  const exits: number[] = [];
  const processLike = new EventEmitter();
  installShutdown({
    factory: second,
    instance: { close: async () => {} },
    exit: (code) => exits.push(code),
    stderr: () => {},
    processLike,
  });
  processLike.emit('SIGTERM');
  for (let i = 0; i < 50 && exits.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(exits).toEqual([0]);
  expect(fs.readFileSync(envFile, 'utf8')).not.toContain(
    'placeholder-refresh-1',
  );

  // A third process over the same file seeds none: it logs in.
  tokens.refuseRefresh(false);
  const grantsBefore = tokens.grants.length;
  const third = factoryOver('refresh-then-login');
  await expect(
    (await third.getProvider('default')).rejected(REJECTION_401),
  ).resolves.toEqual({ ok: true });
  expect(tokens.grants.slice(grantsBefore)).toEqual(['authorization_code']);
  await third.settle();
});
