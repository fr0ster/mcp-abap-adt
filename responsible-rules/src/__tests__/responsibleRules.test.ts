/**
 * The rules alone: what parameters a lookup makes for a connection, by its
 * kind and what it states. `systeminformation` with the information wins;
 * without it ABAP Cloud is one step to the error, on-premise two (the
 * stated responsible, else the login, else the error); no kind is
 * `system_type_required`.
 */
import { serverRefusalOf } from '@mcp-abap-adt/lib/auth';
import type { SystemCall } from '@mcp-abap-adt/lib/request-context';
import { responsibleRules } from '../index';

const INFO = {
  system: { responsible: 'SYSTEM_USER', masterSystem: 'SID' },
} as const;
const ABSENT = { system: null, absent: true } as const;
const NO_INFO = { system: null, absent: false } as const;

function call(stated: Partial<SystemCall>): SystemCall {
  return {
    kind: 'onprem',
    responsible: undefined,
    login: undefined,
    masterSystem: undefined,
    warn: () => undefined,
    ...stated,
  };
}

function refusalOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return serverRefusalOf(error)?.code;
  }
  return undefined;
}

describe.each(['cloud', 'onprem'] as const)('%s', (kind) => {
  it('the information wins over everything stated', () => {
    expect(
      responsibleRules.parametersFor(
        INFO,
        call({
          kind,
          responsible: 'STATED',
          login: 'LOGIN',
          masterSystem: 'X',
        }),
      ),
    ).toEqual(INFO.system);
  });
});

describe('ABAP Cloud without the information: one step to the error', () => {
  it('a 404 is cloud_without_systeminformation, whatever is stated', () => {
    expect(
      refusalOf(() =>
        responsibleRules.parametersFor(
          ABSENT,
          call({ kind: 'cloud', responsible: 'STATED', login: 'LOGIN' }),
        ),
      ),
    ).toBe('cloud_without_systeminformation');
  });

  it('anything else is system_lookup_failed, whatever is stated', () => {
    expect(
      refusalOf(() =>
        responsibleRules.parametersFor(
          NO_INFO,
          call({ kind: 'cloud', responsible: 'STATED', login: 'LOGIN' }),
        ),
      ),
    ).toBe('system_lookup_failed');
  });
});

describe.each([
  ['a 404', ABSENT],
  ['no information', NO_INFO],
])('on-premise, %s: two steps', (_what, lookup) => {
  it('the stated responsible, with the stated master system', () => {
    expect(
      responsibleRules.parametersFor(
        lookup,
        call({ responsible: 'RESP', login: 'LOGIN', masterSystem: 'SID' }),
      ),
    ).toEqual({ responsible: 'RESP', masterSystem: 'SID' });
  });

  it('no responsible: the login', () => {
    expect(
      responsibleRules.parametersFor(lookup, call({ login: 'LOGIN' })),
    ).toEqual({ responsible: 'LOGIN', masterSystem: undefined });
  });

  it('a blank responsible counts as none', () => {
    expect(
      responsibleRules.parametersFor(
        lookup,
        call({ responsible: ' ', login: 'LOGIN' }),
      ),
    ).toEqual({ responsible: 'LOGIN', masterSystem: undefined });
  });

  it('neither: system_user_unknown', () => {
    expect(
      refusalOf(() =>
        responsibleRules.parametersFor(
          lookup,
          call({ responsible: ' ', login: '' }),
        ),
      ),
    ).toBe('system_user_unknown');
  });
});

it('no kind stated: system_type_required, never guessed', () => {
  expect(
    refusalOf(() =>
      responsibleRules.parametersFor(
        ABSENT,
        call({ kind: undefined, responsible: 'RESP' }),
      ),
    ),
  ).toBe('system_type_required');
});

it('the refusals log fixed words only, never a stated value', () => {
  const lines: string[] = [];
  const warn = (line: string) => lines.push(line);
  for (const [lookup, kind] of [
    [ABSENT, 'cloud'],
    [NO_INFO, 'cloud'],
    [ABSENT, 'onprem'],
  ] as const) {
    refusalOf(() =>
      responsibleRules.parametersFor(
        lookup,
        call({ kind, masterSystem: 'SECRET_SID', warn }),
      ),
    );
  }
  expect(lines).toHaveLength(3);
  for (const line of lines) expect(line).not.toContain('SECRET_SID');
});
