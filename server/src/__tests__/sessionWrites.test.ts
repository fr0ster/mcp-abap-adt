/**
 * What a failed session write means, by store:
 *
 * - the `--env` / `--env-path` file, `'fail'`: a store whose write throws
 *   (`EACCES`) fails the request `unknown` `persisting-tokens` with the
 *   server's sentence, and the destination is refused until a write lands;
 * - a named destination with `--unsafe`, `'continue'`: the request succeeds,
 *   and a stderr line reports the write whatever `DEBUG_AUTH_LOG` says (the
 *   factory's diagnostics logger is silent here, as without it).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthBrokerFactory } from '../auth/brokerFactory';
import { PERSISTING_TOKENS_SENTENCE } from '../auth/serverSentences';
import {
  authorizationCodeLines,
  brokerBase,
  factoryConfig,
  recordingLogins,
  silentLogger,
} from './helpers/factoryFixture';
import { type Stand, stand, tokenEndpoint } from './helpers/loginStand';

jest.setTimeout(30_000);

const REJECTION_401 = { status: 401 } as never;

describe("the --env file: 'fail'", () => {
  let s: Stand;
  let dir: string;

  afterEach(async () => {
    fs.chmodSync(dir, 0o755);
    await s.close();
  });

  it('a write that does not land fails the request with persisting-tokens and its sentence, and refuses the destination until a write lands', async () => {
    s = await stand({ auth: 'jwt' });
    dir = path.dirname(s.envFile);
    // A first call logs in; its tokens land in the file.
    expect(await s.callTool('ProbeAdt', { id: 'login' })).toMatchObject({
      isError: false,
    });
    // The file can no longer be written: the store throws EACCES.
    fs.chmodSync(s.envFile, 0o444);
    fs.chmodSync(dir, 0o555);
    s.adt.answerOnce((r) => r.url.includes('/probe/renew'), 401);
    const failed = await s.callTool('ProbeAdt', { id: 'renew' });
    expect(failed).toMatchObject({ isError: true });
    const answer = JSON.parse((failed as { text: string }).text);
    expect(answer).toMatchObject({
      error: 'authentication_failed',
      kind: 'unknown',
      server: PERSISTING_TOKENS_SENTENCE,
    });

    // Still not writable: refused.
    const refused = await s.callTool('ProbeAdt', { id: 'still' });
    expect(refused).toMatchObject({ isError: true });
    expect(JSON.parse((refused as { text: string }).text)).toMatchObject({
      kind: 'unknown',
      server: PERSISTING_TOKENS_SENTENCE,
    });
    expect(s.reached('still')).toBe(false);

    // Writable again: the write lands and the destination serves.
    fs.chmodSync(dir, 0o755);
    fs.chmodSync(s.envFile, 0o644);
    expect(await s.callTool('ProbeAdt', { id: 'again' })).toMatchObject({
      text: 'again',
      isError: false,
    });
  });
});

describe("a named destination with --unsafe: 'continue'", () => {
  it('the request succeeds, and a stderr line reports the write whatever DEBUG_AUTH_LOG says', async () => {
    const base = brokerBase('session-writes');
    const tokens = await tokenEndpoint();
    const promptLines: string[] = [];
    const saved = process.env.DEBUG_AUTH_LOG;
    delete process.env.DEBUG_AUTH_LOG;
    try {
      base.writeSession('dest', authorizationCodeLines(tokens.url));
      const logins = recordingLogins();
      const factory = new AuthBrokerFactory(
        factoryConfig(base, logins, {
          unsafe: true,
          logger: silentLogger,
          promptLogger: {
            ...silentLogger,
            info: (line: string) => {
              promptLines.push(line);
            },
          },
        }),
      );
      const provider = await factory.getProvider('dest');
      await expect(provider.prepare()).resolves.toEqual({ ok: true });
      fs.chmodSync(path.join(base.sessionsDir, 'dest.env'), 0o444);
      fs.chmodSync(base.sessionsDir, 0o555);
      await expect(provider.rejected(REJECTION_401)).resolves.toEqual({
        ok: true,
      });
      expect(tokens.grants).toEqual(['authorization_code', 'refresh_token']);
      expect(promptLines).toEqual([
        expect.stringMatching(/^\[MCP\] A session write did not land/),
      ]);
      expect(promptLines.join('\n')).not.toContain('placeholder-refresh');
      await factory.settle({ signal: AbortSignal.abort() });
    } finally {
      fs.chmodSync(base.sessionsDir, 0o755);
      if (saved !== undefined) process.env.DEBUG_AUTH_LOG = saved;
      await tokens.close();
      base.remove();
    }
  });
});
