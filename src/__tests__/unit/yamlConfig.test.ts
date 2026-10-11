/**
 * Unit tests (#143): YAML startup-config loading.
 * Guards the fix that consolidated runtime YAML parsing onto `js-yaml`
 * (a real runtime dependency) after `yaml` was dropped — the `yaml`
 * package used to be a devDependency, so `npx` installs crashed with
 * "Cannot find module 'yaml'". These tests prove the config loads and
 * validates without the `yaml` package present, against a binary's table.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EXPOSITION_ROW,
  type ParameterTable,
  tlsRows,
  transportRemoved,
} from '../../lib/config/authParameters';
import {
  loadYamlConfig,
  validateYamlConfig,
} from '../../lib/config/yamlConfig';

/** A table with a nested row, a list row and the removed --transport. */
const TABLE: ParameterTable = {
  program: 'test-binary',
  rows: [
    EXPOSITION_ROW,
    {
      key: 'port',
      cli: '--http-port',
      yaml: 'http.port',
      kind: 'port',
      section: 'TEST',
      help: 'A port',
    },
    {
      key: 'host',
      cli: '--http-host',
      yaml: 'http.host',
      kind: 'string',
      section: 'TEST',
      help: 'A host',
    },
    ...tlsRows('http'),
  ],
  removed: [transportRemoved('http')],
};

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
      ['http:', '  port: 8080', '  host: 127.0.0.1'].join('\n'),
    );

    const config = loadYamlConfig(TABLE, file) as {
      http?: { port?: number; host?: string };
    };

    expect(config).not.toBeNull();
    expect(config?.http?.port).toBe(8080);
    expect(config?.http?.host).toBe('127.0.0.1');
  });

  it('parses a YAML array (exposition) into a string[]', () => {
    const file = writeTempYaml(
      'array.yaml',
      ['exposition:', '  - readonly', '  - high', '  - low'].join('\n'),
    );

    const config = loadYamlConfig(TABLE, file);

    expect(config?.exposition).toEqual(['readonly', 'high', 'low']);
  });

  it('returns null when the config file does not exist', () => {
    const missing = path.join(os.tmpdir(), 'definitely-not-here-143.yaml');
    expect(loadYamlConfig(TABLE, missing)).toBeNull();
  });

  it('throws when the parsed config fails validation: --transport is gone', () => {
    const file = writeTempYaml('bad.yaml', 'transport: telepathy\n');
    expect(() => loadYamlConfig(TABLE, file)).toThrow(
      '`--transport` is gone: `mcp-abap-adt-http` serves Streamable HTTP',
    );
  });

  it('a file that is not YAML is refused by its position, never its text', () => {
    const file = writeTempYaml('broken.yaml', 'a: [unclosed\nsecret-ish\n');
    let words = '';
    try {
      loadYamlConfig(TABLE, file);
    } catch (error) {
      words = (error as Error).message;
    }
    expect(words).toMatch(
      /^The config file .* is not valid YAML \(line \d+, column \d+\)$/,
    );
    expect(words).not.toContain('secret-ish');
  });

  it('validateYamlConfig rejects an out-of-range port, naming its key', () => {
    const result = validateYamlConfig(TABLE, { http: { port: 70000 } });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Invalid http.port (config file): "70000". Must be a port between 1 and 65535',
    ]);
  });
});
