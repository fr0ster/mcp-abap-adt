import { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
import type { DestinationGrant } from '@mcp-abap-adt/interfaces-auth-broker';
import { GRANTS, vetMeans } from '../../../lib/auth/vocabulary';

const MADE_UP = 'zz-made-up-value';

function refusal(fn: () => unknown): DestinationConfigError {
  try {
    fn();
  } catch (e) {
    return e as DestinationConfigError;
  }
  throw new Error('expected a refusal');
}

function expectNamed(
  err: DestinationConfigError,
  field: string,
  secret?: string,
) {
  expect(err).toBeInstanceOf(DestinationConfigError);
  expect(err.missingFields).toEqual([field]);
  if (secret) {
    expect(err.message).not.toContain(secret);
    for (const value of Object.values(err)) {
      expect(JSON.stringify(value)).not.toContain(secret);
    }
  }
}

describe('vetMeans', () => {
  it.each([
    ['null means', null],
    ['absent', {}],
    ['empty', { authType: '' }],
  ])('refuses an authType that is %s, naming authType', (_n, means) => {
    expectNamed(
      refusal(() => vetMeans('dest', means as never)),
      'authType',
    );
  });

  it('refuses a made-up authType without quoting it', () => {
    expectNamed(
      refusal(() => vetMeans('dest', { authType: MADE_UP } as never)),
      'authType',
      MADE_UP,
    );
  });

  it.each([
    ['absent', {}],
    ['empty', { grantType: '' }],
    ['made up', { grantType: MADE_UP }],
  ])(
    'refuses jwt with a grantType that is %s, naming grantType',
    (_n, extra) => {
      const err = refusal(() =>
        vetMeans('dest', { authType: 'jwt', ...extra } as never),
      );
      expectNamed(err, 'grantType', MADE_UP);
    },
  );

  it('refuses saml without a grantType', () => {
    expectNamed(
      refusal(() => vetMeans('dest', { authType: 'saml' })),
      'grantType',
    );
  });

  it('accepts jwt and saml with a known grant', () => {
    expect(
      vetMeans('dest', { authType: 'jwt', grantType: 'authorization_code' }),
    ).toEqual({ authType: 'jwt', grantType: 'authorization_code' });
    expect(
      vetMeans('dest', { authType: 'saml', grantType: 'saml2_pure' }),
    ).toEqual({ authType: 'saml', grantType: 'saml2_pure' });
  });

  it.each(['basic', 'snc'] as const)(
    '%s is vetted without a stray grantType',
    (authType) => {
      expect(vetMeans('dest', { authType, grantType: 'passcode' })).toEqual({
        authType,
      });
    },
  );
});

describe('GRANTS', () => {
  it('lists every DestinationGrant (compile-time: test:check fails on a missing member)', () => {
    type Missing = Exclude<DestinationGrant, (typeof GRANTS)[number]>;
    const none: [Missing] extends [never] ? true : never = true;
    expect(none).toBe(true);
    expect(new Set(GRANTS).size).toBe(GRANTS.length);
  });
});
