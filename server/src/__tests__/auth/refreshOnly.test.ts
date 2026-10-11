/**
 * D11: under `--renewal=refresh-only` a destination that needs a login does
 * not log in: its provider answers `renewal-declined`, and the server's
 * sentence for it is "Logins are off (`--renewal=refresh-only`): log in with
 * `mcp-auth`, or start without it." Real broker, real provider; the login
 * strategy is a recording stand-in that must never be asked.
 */

import { authError } from '@mcp-abap-adt/auth-errors';
import type { IRequestTarget } from '@mcp-abap-adt/interfaces-auth';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import { REFRESH_ONLY_SENTENCE } from '../../auth/serverSentences';
import {
  authorizationCodeLines,
  type BrokerBase,
  brokerBase,
  factoryConfig,
  recordingLogins,
} from '../helpers/factoryFixture';

let base: BrokerBase;
let logins: ReturnType<typeof recordingLogins>;

beforeEach(() => {
  base = brokerBase('refresh-only');
  logins = recordingLogins();
});

afterEach(() => base.remove());

function target(): IRequestTarget & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    header: (name) => {
      written.push(name);
    },
    cookies: () => {
      written.push('cookies');
    },
  };
}

it('the sentence, verbatim', () => {
  expect(REFRESH_ONLY_SENTENCE).toBe(
    'Logins are off (`--renewal=refresh-only`): log in with `mcp-auth`, or start without it.',
  );
});

describe('--renewal=refresh-only, a destination with no session', () => {
  it('answers renewal-declined, never logs in, and the server says why', async () => {
    const file = base.writeFile('conn.env', authorizationCodeLines());
    const f = new AuthBrokerFactory(
      factoryConfig(base, logins, {
        envFile: { path: file, source: '--env' },
        renewal: 'refresh-only',
      }),
    );
    const provider = await f.getProvider('default');
    const sent = target();
    const outcome = await provider.authorize(sent);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal.kind).toBe('renewal-declined');
    expect(f.sentenceFor(outcome.refusal)).toBe(REFRESH_ONLY_SENTENCE);
    expect(logins.requests).toHaveLength(0);
    expect(sent.written).toEqual([]);
  });
});

describe('the sentence is keyed on the server’s renewal, not on words', () => {
  const declined = authError['renewal-declined']({ trigger: 'no-token' });

  it('under refresh-then-login a renewal-declined gets no server sentence', () => {
    const f = new AuthBrokerFactory(factoryConfig(base, logins));
    expect(f.sentenceFor(declined)).toBeUndefined();
  });

  it('under refresh-only another kind gets no server sentence', () => {
    const f = new AuthBrokerFactory(
      factoryConfig(base, logins, { renewal: 'refresh-only' }),
    );
    expect(
      f.sentenceFor(authError['credential-refused']({ credential: 'token' })),
    ).toBeUndefined();
    expect(f.sentenceFor(declined)).toBe(REFRESH_ONLY_SENTENCE);
  });
});
