/**
 * `--env-path` gives the env file to the auth broker, which never fills
 * `process.env`. Only what decides the start before any destination is read
 * is bridged: the connection type and the system type. The client, the
 * language and the RFC address are the destination's own means (24.0.0):
 * none of them reaches `process.env`.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ENV_FILE_CONTEXT_KEYS,
  hydrateSystemContextFromEnvFile,
} from '../../config/envFileContext';

function envFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'env-ctx-')), 'session.env');
  writeFileSync(path, content);
  return path;
}

describe('hydrateSystemContextFromEnvFile', () => {
  it('bridges the connection type and the system type', () => {
    const env: NodeJS.ProcessEnv = {};
    hydrateSystemContextFromEnvFile(
      envFile(
        'SAP_URL=https://host\nSAP_CONNECTION_TYPE=rfc\nSAP_SYSTEM_TYPE=onprem\nSAP_USERNAME=SAPUSER01\n',
      ),
      env,
    );
    expect(env).toEqual({
      SAP_CONNECTION_TYPE: 'rfc',
      SAP_SYSTEM_TYPE: 'onprem',
    });
    expect([...ENV_FILE_CONTEXT_KEYS]).toEqual([
      'SAP_CONNECTION_TYPE',
      'SAP_SYSTEM_TYPE',
    ]);
  });

  it.each([
    'SAP_CLIENT',
    'SAP_LANGUAGE',
    'SAP_ASHOST',
    'SAP_SYSNR',
    'SAP_MSHOST',
    'SAP_MSSERV',
    'SAP_SYSID',
    'SAP_GROUP',
    'SAP_SAPROUTER',
  ])("%s stays the destination's: it does not reach the environment", (key) => {
    const env: NodeJS.ProcessEnv = {};
    hydrateSystemContextFromEnvFile(envFile(`${key}=value-one\n`), env);
    expect(env).toEqual({});
  });

  it("the responsible and master system stay the file's destination's: they are not bridged", () => {
    // The file is the `default` destination's own .env, read per destination
    // (IDestinations.systemContextFor). Copied into the process environment
    // they would become every other destination's fallback over HTTP/SSE.
    const env: NodeJS.ProcessEnv = {};
    hydrateSystemContextFromEnvFile(
      envFile(
        'SAP_RESPONSIBLE=USER_OF_FILE\nSAP_MASTER_SYSTEM=SYSTEM_OF_FILE\nSAP_USERNAME=SAPUSER01\n',
      ),
      env,
    );
    expect(env).toEqual({});
  });

  it('leaves a value the process already has', () => {
    const env: NodeJS.ProcessEnv = { SAP_SYSTEM_TYPE: 'cloud' };
    hydrateSystemContextFromEnvFile(envFile('SAP_SYSTEM_TYPE=onprem\n'), env);
    expect(env.SAP_SYSTEM_TYPE).toBe('cloud');
  });

  it('changes nothing without a file', () => {
    const env: NodeJS.ProcessEnv = {};
    hydrateSystemContextFromEnvFile(undefined, env);
    hydrateSystemContextFromEnvFile('/nonexistent/session.env', env);
    expect(env).toEqual({});
  });
});
