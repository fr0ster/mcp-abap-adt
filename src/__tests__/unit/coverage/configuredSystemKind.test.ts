/**
 * The system kind of a test run comes from explicit statements only (plan
 * C2 Step 4c): the config's `environment.system_type`, then
 * `SAP_SYSTEM_TYPE` in the environment or the session file. A credential
 * type is not a statement of the kind, and nothing defaults to `onprem`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { adtStandIn } from '../../helpers/adtStandIn';
import { getSystemType } from '../../integration/helpers/configHelpers';
import { configuredSystemKindOf } from '../../integration/helpers/configuredSystemKind';
import { createHardModeClient } from '../../integration/helpers/testers/hardMode';
import { testerSystemKind } from '../../integration/helpers/testers/LambdaTester';

let base: string;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'configured-kind-'));
  fs.mkdirSync(path.join(base, 'sessions'));
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** A config naming the destination `DEST`, whose session file holds `lines`. */
function configWithSession(
  lines: string[],
  environment: Record<string, string> = {},
): Record<string, unknown> {
  fs.writeFileSync(
    path.join(base, 'sessions', 'DEST.env'),
    `${lines.join('\n')}\n`,
  );
  return {
    auth_broker: {
      paths: { service_keys_dir: base },
      abap: { destination: 'DEST' },
    },
    environment,
  };
}

const JWT_SESSION = [
  'SAP_URL=https://system.example.invalid',
  'SAP_AUTH_TYPE=jwt',
  'SAP_JWT_TOKEN=placeholder-token',
];

const BASIC_SESSION = [
  'SAP_URL=https://system.example.invalid',
  'SAP_AUTH_TYPE=basic',
  'SAP_USERNAME=PLACEHOLDER',
  'SAP_PASSWORD=placeholder',
];

describe('configuredSystemKind', () => {
  it('configuredSystemKind answers nothing when nothing states the kind', () => {
    expect(configuredSystemKindOf({}, {})).toBeUndefined();
    expect(
      configuredSystemKindOf(configWithSession(BASIC_SESSION), {}),
    ).toBeUndefined();
  });

  it('a JWT session without SAP_SYSTEM_TYPE gives undefined', () => {
    expect(
      configuredSystemKindOf(configWithSession(JWT_SESSION), {}),
    ).toBeUndefined();
  });

  it('takes the config, then the environment, then the session file', () => {
    const config = configWithSession(
      [...JWT_SESSION, 'SAP_SYSTEM_TYPE=cloud'],
      {
        system_type: 'legacy',
      },
    );
    expect(configuredSystemKindOf(config, { SAP_SYSTEM_TYPE: 'onprem' })).toBe(
      'legacy',
    );
    const unstated = configWithSession([
      ...JWT_SESSION,
      'SAP_SYSTEM_TYPE=cloud',
    ]);
    expect(
      configuredSystemKindOf(unstated, { SAP_SYSTEM_TYPE: 'onprem' }),
    ).toBe('onprem');
    expect(configuredSystemKindOf(unstated, {})).toBe('cloud');
  });

  it('a word that names no kind states nothing', () => {
    expect(
      configuredSystemKindOf(
        { environment: { system_type: 'jwt' } },
        {
          SAP_SYSTEM_TYPE: '',
        },
      ),
    ).toBeUndefined();
  });
});

describe('getSystemType', () => {
  const saved = {
    config: process.env.MCP_TEST_CONFIG,
    kind: process.env.SAP_SYSTEM_TYPE,
  };

  afterEach(() => {
    for (const [name, value] of [
      ['MCP_TEST_CONFIG', saved.config],
      ['SAP_SYSTEM_TYPE', saved.kind],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('getSystemType refuses instead of defaulting to onprem', () => {
    // A config of its own, read once by this test file's module.
    const file = path.join(base, 'test-config.yaml');
    fs.writeFileSync(file, 'environment: {}\n');
    process.env.MCP_TEST_CONFIG = file;
    delete process.env.SAP_SYSTEM_TYPE;
    expect(() => getSystemType()).toThrow('no system kind stated');
  });
});

describe('hard mode', () => {
  it('hard mode refuses to spawn without a stated kind', async () => {
    const stand = await adtStandIn();
    try {
      const sessions = configWithSession([
        `SAP_URL=${stand.url}`,
        'SAP_AUTH_TYPE=basic',
        'SAP_USERNAME=PLACEHOLDER',
        'SAP_PASSWORD=placeholder',
      ]);
      const stdio = {
        ...sessions,
        integration_hard_mode: { enabled: true, transport: 'stdio' },
      };
      const http = {
        ...sessions,
        integration_hard_mode: {
          enabled: true,
          transport: 'http',
          launch_http: true,
        },
      };
      const saved = process.env.SAP_SYSTEM_TYPE;
      delete process.env.SAP_SYSTEM_TYPE;
      try {
        await expect(createHardModeClient('full', stdio)).rejects.toThrow(
          'hard mode launches nothing: no system kind stated',
        );
        await expect(createHardModeClient('compact', http)).rejects.toThrow(
          'hard mode launches nothing: no system kind stated',
        );
      } finally {
        if (saved !== undefined) process.env.SAP_SYSTEM_TYPE = saved;
      }
      expect(stand.requests).toEqual([]);
    } finally {
      await stand.close();
    }
  });
});

describe('LambdaTester', () => {
  it('LambdaTester skips with its reason when no kind is stated', () => {
    expect(testerSystemKind(configWithSession(JWT_SESSION), {})).toEqual({
      skip: expect.stringContaining('no system kind stated'),
    });
  });

  it("JWT credential with onprem stated: the tester's kind is onprem", () => {
    expect(
      testerSystemKind(
        configWithSession(JWT_SESSION, { system_type: 'onprem' }),
        {},
      ),
    ).toEqual({ kind: 'onprem', isCloudSystem: false });
  });

  it("basic credential with cloud stated: the tester's kind is cloud", () => {
    expect(
      testerSystemKind(
        configWithSession(BASIC_SESSION, { system_type: 'cloud' }),
        {},
      ),
    ).toEqual({ kind: 'cloud', isCloudSystem: true });
  });
});
