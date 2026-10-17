/**
 * `CurrentCredential`: the credential a held connection presents — every
 * moment goes to the credential in force, a throw becomes a refusal
 * (nothing crosses the contract), and a credential put in force after the
 * connect is prepared once before its first use.
 */

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
  expect(current.kind).toBe('a');
  expect(await current.prepare()).toEqual(OK);
  expect(await current.authorize(request)).toEqual(OK);
  current.take(b.credential);
  expect(current.kind).toBe('b');
  expect(current.inForce).toBe(b.credential);
  expect(await current.authorize(request)).toEqual(OK);
  expect(await current.establish(logon)).toEqual(OK);
  expect(await current.rejected(rejection)).toEqual(OK);
  expect(a.seen).toEqual(['a.prepare', 'a.authorize']);
  expect(b.seen).toEqual([
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
  expect(outcome.ok).toBe(false);
  expect(outcome.ok === false && outcome.refusal).toBe(refusal);
});

it('a credential that throws: a refusal, never a rejection', async () => {
  const a = recording('a', {
    authorize: () => {
      throw new Error('secret-bearing text');
    },
  });
  const current = new CurrentCredential(a.credential);
  const outcome = await current.authorize(request);
  expect(outcome.ok).toBe(false);
  expect(JSON.stringify(outcome)).not.toContain('secret-bearing text');
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
  expect((await current.authorize(request)).ok).toBe(false);
  refuse = false;
  expect(await current.authorize(request)).toEqual(OK);
  expect(b.seen).toEqual(['b.prepare', 'b.prepare', 'b.authorize']);
});
