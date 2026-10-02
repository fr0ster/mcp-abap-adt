/**
 * Issue #182 — `--env-path` gives the env file to the auth broker, which never
 * fills `process.env`; the system context reads its keys from there, so they
 * are bridged. `SAP_LANGUAGE` was not among them.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ENV_FILE_CONTEXT_KEYS,
  hydrateSystemContextFromEnvFile,
} from '../../lib/config/envFileContext';

function envFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'env-ctx-')), 'session.env');
  writeFileSync(path, content);
  return path;
}

describe('hydrateSystemContextFromEnvFile', () => {
  it('bridges the language with the rest of the system context', () => {
    const env: NodeJS.ProcessEnv = {};
    hydrateSystemContextFromEnvFile(
      envFile(
        'SAP_URL=https://host\nSAP_LANGUAGE=DE\nSAP_CLIENT=100\nSAP_USERNAME=SAPUSER01\n',
      ),
      env,
    );

    expect(env).toEqual({
      SAP_LANGUAGE: 'DE',
      SAP_CLIENT: '100',
      SAP_USERNAME: 'SAPUSER01',
    });
    expect(ENV_FILE_CONTEXT_KEYS).toContain('SAP_LANGUAGE');
  });

  it('leaves a value the process already has', () => {
    const env: NodeJS.ProcessEnv = { SAP_LANGUAGE: 'EN' };
    hydrateSystemContextFromEnvFile(envFile('SAP_LANGUAGE=DE\n'), env);
    expect(env.SAP_LANGUAGE).toBe('EN');
  });

  it('changes nothing without a file', () => {
    const env: NodeJS.ProcessEnv = {};
    hydrateSystemContextFromEnvFile(undefined, env);
    hydrateSystemContextFromEnvFile('/nonexistent/session.env', env);
    expect(env).toEqual({});
  });
});
