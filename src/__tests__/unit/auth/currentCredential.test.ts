/**
 * `CurrentCredential`: the credential a held connection presents — every
 * moment goes to the credential in force, a throw becomes a refusal
 * (nothing crosses the contract), and a credential put in force after the
 * connect is prepared once before its first use.
 */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { authError } from '@mcp-abap-adt/auth-errors';
import type {
  AuthOutcome,
  IAuthProvider,
  IAuthRejection,
  ILogonTarget,
  IRequestTarget,
} from '@mcp-abap-adt/interfaces-auth';
import { CurrentCredential } from '../../../lib/auth/currentCredential';

const OK = { ok: true as const };

function recording(
  name: string,
  answers: Partial<Record<keyof IAuthProvider, () => unknown>> = {},
) {
  const seen: string[] = [];
  const moment =
    (m: 'prepare' | 'establish' | 'authorize' | 'rejected') => async () => {
      seen.push(`${name}.${m}`);
      const answer = answers[m];
      return (answer ? answer() : OK) as AuthOutcome;
    };
  const credential: IAuthProvider = {
    kind: name,
    prepare: moment('prepare'),
    establish: moment('establish'),
    authorize: moment('authorize'),
    rejected: moment('rejected'),
  };
  return { credential, seen };
}

const request = {
  header: () => OK,
  cookies: () => OK,
} as unknown as IRequestTarget;
const logon = {} as unknown as ILogonTarget;
const rejection = { status: 401 } as unknown as IAuthRejection;

it('forwards every moment to the credential in force; the one put in force later is prepared once before its first request', async () => {
  const a = recording('a');
  const b = recording('b');
  const current = new CurrentCredential(a.credential);
  assert.equal(current.kind, 'a');
  assert.deepStrictEqual(await current.prepare(), OK);
  assert.deepStrictEqual(await current.authorize(request), OK);
  current.take(b.credential);
  assert.equal(current.kind, 'b');
  assert.equal(current.inForce, b.credential);
  assert.deepStrictEqual(await current.authorize(request), OK);
  assert.deepStrictEqual(await current.establish(logon), OK);
  assert.deepStrictEqual(await current.rejected(rejection), OK);
  assert.deepStrictEqual(a.seen, ['a.prepare', 'a.authorize']);
  assert.deepStrictEqual(b.seen, [
    'b.prepare',
    'b.authorize',
    'b.establish',
    'b.rejected',
  ]);
});

it("hands on the credential's refusal as it came", async () => {
  const refusal = authError['credential-refused']({
    credential: 'token',
    at: 'request',
  } as never);
  const a = recording('a', { authorize: () => ({ ok: false, refusal }) });
  const current = new CurrentCredential(a.credential);
  const outcome = await current.authorize(request);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.refusal, refusal);
});

it('a credential that throws: a refusal, never a rejection', async () => {
  const a = recording('a', {
    authorize: () => {
      throw new Error('secret-bearing text');
    },
  });
  const current = new CurrentCredential(a.credential);
  const outcome = await current.authorize(request);
  assert.equal(outcome.ok, false);
  assert.ok(!JSON.stringify(outcome).includes('secret-bearing text'));
});

it('a credential whose prepare refuses: the request is not authorized, and prepare is asked again next time', async () => {
  let refuse = true;
  const refusal = authError['credential-refused']({
    credential: 'token',
    at: 'request',
  } as never);
  const b = recording('b', {
    prepare: () => (refuse ? { ok: false, refusal } : OK),
  });
  const current = new CurrentCredential(recording('a').credential);
  current.take(b.credential);
  assert.equal((await current.authorize(request)).ok, false);
  refuse = false;
  assert.deepStrictEqual(await current.authorize(request), OK);
  assert.deepStrictEqual(b.seen, ['b.prepare', 'b.prepare', 'b.authorize']);
});
