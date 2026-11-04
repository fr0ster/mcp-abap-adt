/**
 * The live scripts (plan C2, controller ruling): every npm script that runs
 * Jest over the integration or admin suites is declared live, runs in band,
 * and is the only kind of run whose `globalSetup` does live work; a unit run
 * (`npm test`) does none.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { adtStandIn } from '../../helpers/adtStandIn';
import globalSetup from '../../integration/globalSetup';
import {
  LIVE_SCRIPTS,
  selectsLiveSuites,
} from '../../integration/helpers/liveScripts';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** The repository's npm scripts, by name. */
function scripts(): Map<string, string> {
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
  );
  const declared: unknown =
    typeof manifest === 'object' && manifest !== null
      ? Reflect.get(manifest, 'scripts')
      : undefined;
  const out = new Map<string, string>();
  if (typeof declared === 'object' && declared !== null) {
    for (const [name, command] of Object.entries(declared)) {
      if (typeof command === 'string') out.set(name, command);
    }
  }
  return out;
}

describe('the live scripts', () => {
  it('every script that runs the integration or admin suites is declared live', () => {
    const live = [...scripts()]
      .filter(([, command]) => selectsLiveSuites(command))
      .map(([name]) => name)
      .sort();
    expect(live).toEqual([...LIVE_SCRIPTS].sort());
  });

  it('every live script runs in band', () => {
    for (const name of LIVE_SCRIPTS) {
      const words = (scripts().get(name) ?? '').split(' ');
      expect({ name, inBand: words.includes('--runInBand') }).toEqual({
        name,
        inBand: true,
      });
    }
  });

  it('the unit run is not live, and a new live script would be seen', () => {
    expect(selectsLiveSuites(scripts().get('test') ?? '')).toBe(false);
    expect(
      selectsLiveSuites("jest --testPathPatterns='integration/batch'"),
    ).toBe(true);
    expect(
      selectsLiveSuites("jest --testPathIgnorePatterns='__tests__/admin/'"),
    ).toBe(true);
    expect(selectsLiveSuites("jest --testPathIgnorePatterns='[]'")).toBe(true);
  });

  it('a unit run does no realm check and no logon, even with a config', async () => {
    const stand = await adtStandIn();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-run-'));
    const event = process.env.npm_lifecycle_event;
    const configFile = process.env.MCP_TEST_CONFIG;
    try {
      fs.mkdirSync(path.join(dir, 'sessions'));
      fs.writeFileSync(
        path.join(dir, 'sessions', 'STAND.env'),
        `SAP_URL=${stand.url}\nSAP_AUTH_TYPE=basic\n`,
      );
      const config = path.join(dir, 'test-config.yaml');
      fs.writeFileSync(
        config,
        [
          'auth_broker:',
          `  paths: { service_keys_dir: ${JSON.stringify(dir)} }`,
          '  abap: { destination: STAND }',
          'environment:',
          '  system_type: onprem',
          '  expected_realm: STAND',
          '',
        ].join('\n'),
      );
      process.env.MCP_TEST_CONFIG = config;
      process.env.npm_lifecycle_event = 'test';
      await expect(
        globalSetup({ rootDir: REPO, testPathPatterns: { patterns: [] } }),
      ).resolves.toBeUndefined();
      expect(stand.requests).toEqual([]);
    } finally {
      if (event === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = event;
      if (configFile === undefined) delete process.env.MCP_TEST_CONFIG;
      else process.env.MCP_TEST_CONFIG = configFile;
      await stand.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
