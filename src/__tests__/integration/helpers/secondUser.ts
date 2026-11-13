/**
 * A second SAP user's own connection, for a live case whose behaviour
 * depends on another user (a draft another user wrote): built from the
 * session `.env` the test configuration names, after the realm check of its
 * URL, with basic authentication, guarded like every test connection (a
 * refusal of its credential stops the run). Its values never reach a
 * message or a log; its close logs it off.
 */

import * as fs from 'node:fs';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import * as dotenv from 'dotenv';
import { resolveEnvFilePath } from '../../../../server-runtime/src/stdio/config/envResolver';
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import { loadTestConfig, testAuthBrokerPath } from './configHelpers';
import { endTestConnection } from './openConnections';
import { realmCheck } from './realmCheck';
import { guardedTestConnection } from './refusalGuard';

/** A text at `keys` of a parsed YAML value; `''` where there is none. */
export function configText(value: unknown, ...keys: string[]): string {
  let at: unknown = value;
  for (const key of keys) {
    at =
      typeof at === 'object' && at !== null ? Reflect.get(at, key) : undefined;
  }
  return typeof at === 'string' ? at.trim() : '';
}

/** An on-premise connection as the user the session `.env` named `envName` holds. */
export async function connectionAs(envName: string): Promise<{
  connection: IAbapConnection;
  close: () => Promise<void>;
}> {
  const config = loadTestConfig();
  const file = resolveEnvFilePath({
    envDestination: envName,
    authBrokerPath: testAuthBrokerPath(config),
  });
  if (file === undefined || !fs.existsSync(file)) {
    throw new Error(`no session .env named ${envName}`);
  }
  const env = dotenv.parse(fs.readFileSync(file, 'utf8'));
  // Names only: the values never reach a message.
  const missing = ['SAP_URL', 'SAP_USERNAME', 'SAP_PASSWORD'].filter(
    (key) => (env[key] ?? '').trim() === '',
  );
  if (missing.length > 0) {
    throw new Error(
      `${envName} lacks ${missing.join(', ')} (basic authentication is required)`,
    );
  }
  const given = (env.SAP_URL ?? '').trim();
  const url = given.endsWith('/') ? given.slice(0, -1) : given;
  await realmCheck(
    'onprem',
    url,
    configText(config, 'environment', 'expected_realm'),
    { jwt: undefined },
  );
  const client = (env.SAP_CLIENT ?? '').trim();
  const settings: SapConfig = {
    url,
    authType: 'basic',
    username: env.SAP_USERNAME,
    password: env.SAP_PASSWORD,
    ...(client === '' ? {} : { client }),
  };
  const connection = guardedTestConnection(
    settings,
    credentialFromSapConfig(settings),
    { logger: null, kind: 'onprem' },
  );
  await connection.connect();
  return { connection, close: () => endTestConnection(connection) };
}
