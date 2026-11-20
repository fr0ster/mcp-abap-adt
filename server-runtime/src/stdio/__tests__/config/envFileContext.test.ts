/**
 * `--env-path` gives the env file to the auth broker, which never fills
 * `process.env`. The start reads only what decides it before any
 * destination is read — the connection type and the system type — from the
 * file itself (`readEnvFileContext`), below the process environment
 * (`withEnvFileContext`), and writes nothing into `process.env` (24.0.0).
 * The client, the language and the RFC address are the destination's own
 * means: the start does not read them from the file.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  ENV_FILE_CONTEXT_KEYS,
  readEnvFileContext,
  withEnvFileContext,
} from '../../config/envFileContext';

function envFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'env-ctx-')), 'session.env');
  writeFileSync(path, content);
  return path;
}

describe('readEnvFileContext', () => {
  it('reads the connection type and the system type, and writes nothing', () => {
    const before = { ...process.env };
    assert.deepStrictEqual(
      readEnvFileContext(
        envFile(
          'SAP_URL=https://host\nSAP_CONNECTION_TYPE=rfc\nSAP_SYSTEM_TYPE=onprem\nSAP_USERNAME=SAPUSER01\n',
        ),
      ),
      { SAP_CONNECTION_TYPE: 'rfc', SAP_SYSTEM_TYPE: 'onprem' },
    );
    // A plain copy: process.env's own prototype is not Object's.
    assert.deepStrictEqual({ ...process.env }, before);
    assert.deepStrictEqual(
      [...ENV_FILE_CONTEXT_KEYS],
      ['SAP_CONNECTION_TYPE', 'SAP_SYSTEM_TYPE'],
    );
  });

  for (const key of [
    'SAP_CLIENT',
    'SAP_LANGUAGE',
    'SAP_ASHOST',
    'SAP_SYSNR',
    'SAP_MSHOST',
    'SAP_MSSERV',
    'SAP_SYSID',
    'SAP_GROUP',
    'SAP_SAPROUTER',
    'SAP_RESPONSIBLE',
    'SAP_MASTER_SYSTEM',
  ]) {
    it(
      format("%s stays the destination's: the start does not read it", key),
      () => {
        assert.deepStrictEqual(
          readEnvFileContext(envFile(`${key}=value-one\n`)),
          {},
        );
      },
    );
  }

  it('states nothing without a file', () => {
    assert.deepStrictEqual(readEnvFileContext(undefined), {});
    assert.deepStrictEqual(readEnvFileContext('/nonexistent/session.env'), {});
  });
});

describe('withEnvFileContext', () => {
  it('the process environment wins over the file; an empty value does not', () => {
    const env = { SAP_SYSTEM_TYPE: 'cloud', SAP_CONNECTION_TYPE: '' };
    assert.deepStrictEqual(
      withEnvFileContext(env, {
        SAP_SYSTEM_TYPE: 'onprem',
        SAP_CONNECTION_TYPE: 'http',
      }),
      { SAP_SYSTEM_TYPE: 'cloud', SAP_CONNECTION_TYPE: 'http' },
    );
    assert.deepStrictEqual(env, {
      SAP_SYSTEM_TYPE: 'cloud',
      SAP_CONNECTION_TYPE: '',
    });
  });
});
