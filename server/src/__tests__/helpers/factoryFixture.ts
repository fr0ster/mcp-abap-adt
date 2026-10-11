/**
 * A temporary auth-broker base (`service-keys/`, `sessions/`) and the
 * factory configuration the auth suites start from. Nothing here launches a
 * browser: the login strategy is the test's own, or a recording stand-in.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { IAuthBrokerFactoryConfig } from '../../auth/IAuthBrokerFactoryConfig';

export const SYSTEM_URL = 'https://system.example.test';
export const UAA_URL = 'https://uaa.example.test';
export const REDIRECT = 'http://localhost:61001/callback';

export const silentLogger: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/** A login strategy that records what it was built with and answers a code. */
export function recordingLogins() {
  const built: Array<{ browser?: IBrowser; port?: number }> = [];
  const requests: AuthorizationRequest[] = [];
  const disposed: number[] = [];
  const browserStrategy = (options: {
    browser?: IBrowser;
    port?: number;
  }): IAuthorizationStrategy<string> => {
    const index = built.push(options) - 1;
    return {
      authorize: async (request) => {
        requests.push(request);
        await request.buildAuthorizationUrl(REDIRECT);
        return { payload: 'code-1', redirectUri: REDIRECT };
      },
      dispose: async () => {
        disposed.push(index);
      },
    };
  };
  return { browserStrategy, built, requests, disposed };
}

export interface BrokerBase {
  root: string;
  keysDir: string;
  sessionsDir: string;
  /** Writes `sessions/<name>.env`. */
  writeSession(name: string, lines: string[]): void;
  /** Writes a file in the base and answers its path (an `--env` file). */
  writeFile(name: string, lines: string[]): string;
  remove(): void;
}

export function brokerBase(prefix: string): BrokerBase {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)),
  );
  const keysDir = path.join(root, 'service-keys');
  const sessionsDir = path.join(root, 'sessions');
  fs.mkdirSync(keysDir);
  fs.mkdirSync(sessionsDir);
  return {
    root,
    keysDir,
    sessionsDir,
    writeSession: (name, lines) =>
      fs.writeFileSync(
        path.join(sessionsDir, `${name}.env`),
        `${lines.join('\n')}\n`,
      ),
    writeFile: (name, lines) => {
      const file = path.join(root, name);
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      return file;
    },
    remove: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export const basicLines = (extra: string[] = []) => [
  `SAP_URL=${SYSTEM_URL}`,
  'SAP_CLIENT=100',
  'SAP_AUTH_TYPE=basic',
  'SAP_USERNAME=placeholder-user',
  'SAP_PASSWORD=placeholder-password',
  ...extra,
];

/** A jwt / authorization_code destination with a client and no session. */
export const authorizationCodeLines = (uaaUrl = UAA_URL) => [
  `SAP_URL=${SYSTEM_URL}`,
  'SAP_AUTH_TYPE=jwt',
  'SAP_GRANT_TYPE=authorization_code',
  `SAP_UAA_URL=${uaaUrl}`,
  'SAP_UAA_CLIENT_ID=client-id',
  'SAP_UAA_CLIENT_SECRET=client-secret',
];

export function factoryConfig(
  base: BrokerBase,
  logins: ReturnType<typeof recordingLogins>,
  over: Partial<IAuthBrokerFactoryConfig> = {},
): IAuthBrokerFactoryConfig {
  return {
    authBrokerPath: base.root,
    unsafe: false,
    connectionType: 'http',
    browserStrategy: logins.browserStrategy,
    promptLogger: silentLogger,
    ...over,
  };
}
