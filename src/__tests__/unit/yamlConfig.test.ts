/**
 * Unit tests (#143): YAML startup-config loading.
 * Guards the fix that consolidated runtime YAML parsing onto `js-yaml`
 * (a real runtime dependency) after `yaml` was dropped — the `yaml`
 * package used to be a devDependency, so `npx` installs crashed with
 * "Cannot find module 'yaml'". These tests prove the config loads and
 * validates without the `yaml` package present.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadYamlConfig,
  validateYamlConfig,
} from '../../lib/config/yamlConfig';

function writeTempYaml(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-yaml-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

describe('yamlConfig (js-yaml runtime parsing, #143)', () => {
  it('parses a YAML config file into typed values', () => {
    const file = writeTempYaml(
      'config.yaml',
      ['transport: http', 'http:', '  port: 8080', '  host: 127.0.0.1'].join(
        '\n',
      ),
    );

    const config = loadYamlConfig(file);

    expect(config).not.toBeNull();
    expect(config?.transport).toBe('http');
    expect(config?.http?.port).toBe(8080);
    expect(config?.http?.host).toBe('127.0.0.1');
  });

  it('parses a YAML array (exposition) into a string[]', () => {
    const file = writeTempYaml(
      'array.yaml',
      ['exposition:', '  - readonly', '  - high', '  - low'].join('\n'),
    );

    const config = loadYamlConfig(file);

    expect(config?.exposition).toEqual(['readonly', 'high', 'low']);
  });

  it('returns null when the config file does not exist', () => {
    const missing = path.join(os.tmpdir(), 'definitely-not-here-143.yaml');
    expect(loadYamlConfig(missing)).toBeNull();
  });

  it('throws when the parsed config fails validation', () => {
    const file = writeTempYaml('bad.yaml', 'transport: telepathy\n');
    expect(() => loadYamlConfig(file)).toThrow(/Invalid transport/);
  });

  it('validateYamlConfig rejects an out-of-range HTTP port', () => {
    const result = validateYamlConfig({ http: { port: 70000 } });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Invalid HTTP port/);
  });
});
