/**
 * Hard or soft mode has one source (#394, third review): the session helper
 * reads `getHardModeConfig()`, whose `environment.integration_hard_mode`
 * wins over the top-level one — here it says soft, so the connection gets
 * its lock registry although the top level says hard.
 *
 * `createTestConnectionAndSession` on the ADT stand-in: an HTTP connection
 * that logged on holds its session, and the helper reads it through what the
 * guarded connection declares (`sessionCookies()`). Reading the concrete
 * class's old `getCookies()` / `getCsrfToken()` through `any` found nothing
 * on the guard's plain object and failed every HTTP case with "Failed to get
 * session state" (on premise, 2026-11-08).
 *
 * Nothing here prints a cookie: only its presence is asserted.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { resetSystemContextCache } from '../../lib/systemContext';
import { type AdtStandIn, adtStandIn } from '../helpers/adtStandIn';
import { stateSystemKind } from '../helpers/systemKind';
import { heldLocksIfAny } from '../integration/helpers/heldLiveLocks';
import { closeTrackedConnections } from '../integration/helpers/openConnections';
import { createTestConnectionAndSession } from '../integration/helpers/sessionHelpers';

const USER = 'SESSION_USER';

let stand: AdtStandIn;
let dir: string;
const saved: Record<string, string | undefined> = {};
const KEYS = [
  'MCP_TEST_CONFIG',
  'MCP_ABAP_ADT_COVERAGE_RUN',
  'SAP_SYSTEM_TYPE',
] as const;

before(async () => {
  for (const key of KEYS) saved[key] = process.env[key];
  stateSystemKind();
  stand = await adtStandIn();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-hard-mode-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = path.join(dir, 'run');
  fs.mkdirSync(process.env.MCP_ABAP_ADT_COVERAGE_RUN);
  fs.mkdirSync(path.join(dir, 'sessions'));
  fs.writeFileSync(
    path.join(dir, 'sessions', 'STAND.env'),
    [
      `SAP_URL=${stand.url}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_CONNECTION_TYPE=http',
      `SAP_USERNAME=${USER}`,
      'SAP_PASSWORD=session-password',
      '',
    ].join('\n'),
  );
  const config = path.join(dir, 'test-config.yaml');
  fs.writeFileSync(
    config,
    [
      'auth_broker:',
      `  paths: { service_keys_dir: ${JSON.stringify(dir)} }`,
      '  browser: none',
      'environment:',
      '  env: STAND.env',
      '  system_type: onprem',
      '  integration_hard_mode:',
      '    enabled: false',
      'integration_hard_mode:',
      '  enabled: true',
      '',
    ].join('\n'),
  );
  process.env.MCP_TEST_CONFIG = config;
});

after(async () => {
  await closeTrackedConnections();
  await stand.close();
  resetSystemContextCache();
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the session helper reads hard or soft mode from getHardModeConfig', () => {
  it('environment.integration_hard_mode wins: soft here, so the connection has its registry', async () => {
    const { connection } = await createTestConnectionAndSession();
    assert.notEqual(heldLocksIfAny(connection), undefined);
  });
});
