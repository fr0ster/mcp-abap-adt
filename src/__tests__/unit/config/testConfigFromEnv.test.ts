/**
 * The integration tests' `getSapConfigFromEnv` guesses nothing (#320): the
 * authentication is stated and is one the helper builds, and each needs what
 * it needs. A missing or unknown value is refused, naming it, instead of
 * becoming `basic` with an empty user.
 */
import { getSapConfigFromEnv } from '../../integration/helpers/configHelpers';

const KEYS = [
  'SAP_URL',
  'SAP_AUTH_TYPE',
  'SAP_USERNAME',
  'SAP_PASSWORD',
  'SAP_JWT_TOKEN',
  'SAP_CLIENT',
  'SAP_CONNECTION_TYPE',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.SAP_URL = 'https://system.example.test:44300';
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('getSapConfigFromEnv', () => {
  it('refuses a config that states no SAP_AUTH_TYPE', () => {
    process.env.SAP_USERNAME = 'user';
    process.env.SAP_PASSWORD = 'secret';
    expect(() => getSapConfigFromEnv()).toThrow(
      'SAP_AUTH_TYPE is not set. State one of: basic, jwt.',
    );
  });

  it.each(['basci', 'snc', 'certificate', 'xsuaa'])(
    'refuses SAP_AUTH_TYPE=%s rather than reading it as basic',
    (value) => {
      process.env.SAP_AUTH_TYPE = value;
      process.env.SAP_USERNAME = 'user';
      process.env.SAP_PASSWORD = 'secret';
      expect(() => getSapConfigFromEnv()).toThrow(
        `SAP_AUTH_TYPE "${value}" is not one this test helper builds: basic, jwt.`,
      );
    },
  );

  it.each([
    ['SAP_USERNAME', { SAP_PASSWORD: 'secret' }],
    ['SAP_PASSWORD', { SAP_USERNAME: 'user' }],
  ])('refuses basic without %s', (_missing, present) => {
    process.env.SAP_AUTH_TYPE = 'basic';
    Object.assign(process.env, present);
    expect(() => getSapConfigFromEnv()).toThrow(
      'SAP_AUTH_TYPE is basic, but SAP_USERNAME or SAP_PASSWORD is not set.',
    );
  });

  it('refuses jwt without SAP_JWT_TOKEN', () => {
    process.env.SAP_AUTH_TYPE = 'jwt';
    expect(() => getSapConfigFromEnv()).toThrow(
      'SAP_AUTH_TYPE is jwt, but SAP_JWT_TOKEN is not set.',
    );
  });

  it.each(['rfcc', 'tcp', 'https'])(
    'refuses SAP_CONNECTION_TYPE=%s rather than running over HTTP',
    (value) => {
      process.env.SAP_AUTH_TYPE = 'basic';
      process.env.SAP_USERNAME = 'user';
      process.env.SAP_PASSWORD = 'secret';
      process.env.SAP_CONNECTION_TYPE = value;
      expect(() => getSapConfigFromEnv()).toThrow(
        `SAP_CONNECTION_TYPE "${value}" is not one of: http, rfc.`,
      );
    },
  );

  it("reads rfc as rfc, and an absent connection type as HTTP (the launcher's documented default)", () => {
    process.env.SAP_AUTH_TYPE = 'basic';
    process.env.SAP_USERNAME = 'user';
    process.env.SAP_PASSWORD = 'secret';
    process.env.SAP_CONNECTION_TYPE = 'rfc';
    expect(getSapConfigFromEnv().connectionType).toBe('rfc');
    // In any case, as the launcher reads an enum.
    process.env.SAP_CONNECTION_TYPE = 'RFC';
    expect(getSapConfigFromEnv().connectionType).toBe('rfc');
    delete process.env.SAP_CONNECTION_TYPE;
    expect(getSapConfigFromEnv().connectionType).toBeUndefined();
  });

  it('builds basic from what was stated', () => {
    process.env.SAP_AUTH_TYPE = 'basic';
    process.env.SAP_USERNAME = ' user ';
    process.env.SAP_PASSWORD = 'secret';
    process.env.SAP_CLIENT = '100';
    expect(getSapConfigFromEnv()).toMatchObject({
      url: 'https://system.example.test:44300',
      authType: 'basic',
      username: 'user',
      password: 'secret',
      client: '100',
    });
  });

  it('builds jwt from what was stated', () => {
    process.env.SAP_AUTH_TYPE = 'jwt';
    process.env.SAP_JWT_TOKEN = 'token-value';
    expect(getSapConfigFromEnv()).toMatchObject({
      authType: 'jwt',
      jwtToken: 'token-value',
    });
  });
});
