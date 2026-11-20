import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
import type { DestinationGrant } from '@mcp-abap-adt/interfaces-auth-broker';
import { GRANTS, vetMeans } from '../../auth/vocabulary';

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
  assert.ok(err instanceof DestinationConfigError);
  assert.deepStrictEqual(err.missingFields, [field]);
  if (secret) {
    assert.ok(!err.message.includes(secret));
    for (const value of Object.values(err)) {
      assert.ok(!JSON.stringify(value).includes(secret));
    }
  }
}

describe('vetMeans', () => {
  for (const [_n, means] of [
    ['null means', null],
    ['absent', {}],
    ['empty', { authType: '' }],
  ]) {
    it(format('refuses an authType that is %s, naming authType', _n), () => {
      expectNamed(
        refusal(() => vetMeans('dest', means as never)),
        'authType',
      );
    });
  }

  it('refuses a made-up authType without quoting it', () => {
    expectNamed(
      refusal(() => vetMeans('dest', { authType: MADE_UP } as never)),
      'authType',
      MADE_UP,
    );
  });

  for (const [_n, extra] of [
    ['absent', {}],
    ['empty', { grantType: '' }],
    ['made up', { grantType: MADE_UP }],
  ] satisfies [string, Record<string, string>][]) {
    it(
      format('refuses jwt with a grantType that is %s, naming grantType', _n),
      () => {
        const err = refusal(() =>
          vetMeans('dest', { authType: 'jwt', ...extra } as never),
        );
        expectNamed(err, 'grantType', MADE_UP);
      },
    );
  }

  it('refuses saml without a grantType', () => {
    expectNamed(
      refusal(() => vetMeans('dest', { authType: 'saml' })),
      'grantType',
    );
  });

  it('accepts jwt and saml with a known grant', () => {
    assert.deepStrictEqual(
      vetMeans('dest', { authType: 'jwt', grantType: 'authorization_code' }),
      { authType: 'jwt', grantType: 'authorization_code' },
    );
    assert.deepStrictEqual(
      vetMeans('dest', { authType: 'saml', grantType: 'saml2_pure' }),
      { authType: 'saml', grantType: 'saml2_pure' },
    );
  });

  for (const authType of ['basic', 'snc'] as const) {
    it(format('%s is vetted without a stray grantType', authType), () => {
      assert.deepStrictEqual(
        vetMeans('dest', { authType, grantType: 'passcode' }),
        {
          authType,
        },
      );
    });
  }
});

describe('known but unsupported types', () => {
  for (const authType of ['certificate', 'kerberos'] as const) {
    it(
      format(
        '%s is vetted (so the server can name it), without a grant',
        authType,
      ),
      () => {
        assert.deepStrictEqual(
          vetMeans('dest', { authType, grantType: 'passcode' } as never),
          { authType },
        );
      },
    );
  }
});

describe('GRANTS', () => {
  it('lists every DestinationGrant (compile-time: test:check fails on a missing member)', () => {
    type Missing = Exclude<DestinationGrant, (typeof GRANTS)[number]>;
    const none: [Missing] extends [never] ? true : never = true;
    assert.equal(none, true);
    assert.equal(new Set(GRANTS).size, GRANTS.length);
  });
});
