/**
 * A flag followed by `false` no longer turns it on (D26, group A): on every
 * launcher's table a flag takes `--flag` or `--flag=<true|false>`, and
 * `--flag false` (two words) is refused suggesting `--flag=false`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type ParameterTable,
  readStartupConfig,
} from '@mcp-abap-adt/lib/config';
import { HTTP_PARAMETERS, readHttpConfig } from '../http/config/httpParameters';
import { readSseConfig, SSE_PARAMETERS } from '../sse/config/sseParameters';
import {
  CORE_PARAMETERS,
  readCoreConfig,
} from '../stdio/config/coreParameters';

interface Launcher {
  readonly name: string;
  readonly table: ParameterTable;
  readonly read: (
    argv: readonly string[],
    env: NodeJS.ProcessEnv,
    yaml: Parameters<typeof readHttpConfig>[2],
  ) => object;
  /** A flag row of this table, in its CLI form. */
  readonly flags: readonly string[];
  /** A YAML key of this table nested under a section, as a misspelling of it. */
  readonly nested: { readonly yaml: object; readonly key: string };
}

const LAUNCHERS: readonly Launcher[] = [
  {
    name: 'mcp-abap-adt',
    table: CORE_PARAMETERS,
    read: readCoreConfig,
    flags: ['--auth-debug', '--unsafe', '--enable-data-tools'],
    nested: { yaml: { env_path: '/x' }, key: 'env_path' },
  },
  {
    name: 'mcp-abap-adt-http',
    table: HTTP_PARAMETERS,
    read: readHttpConfig,
    flags: ['--http-enable-dns-protection', '--http-json-response'],
    nested: {
      yaml: { http: { json_response: true } },
      key: 'http.json_response',
    },
  },
  {
    name: 'mcp-abap-adt-sse',
    table: SSE_PARAMETERS,
    read: readSseConfig,
    flags: ['--sse-enable-dns-protection', '--batch-keep-raw-parts'],
    nested: {
      yaml: { sse: { allowed_hosts: ['a'] } },
      key: 'sse.allowed_hosts',
    },
  },
];

/** The start's lines and exits, for `argv` and an optional config file. */
function startWith(
  launcher: Launcher,
  argv: readonly string[],
  yaml?: string,
): { lines: string[]; exits: number[]; config: object | undefined } {
  const lines: string[] = [];
  const exits: number[] = [];
  let args = argv;
  let dir: string | undefined;
  if (yaml !== undefined) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stated-input-'));
    const file = path.join(dir, 'conf.yaml');
    fs.writeFileSync(file, yaml, 'utf8');
    args = [...argv, `--conf=${file}`];
  }
  try {
    const config = readStartupConfig(
      launcher.table,
      args,
      {},
      { stderr: (line) => lines.push(line), exit: (code) => exits.push(code) },
      launcher.read,
    );
    return { lines, exits, config };
  } finally {
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.each(LAUNCHERS)('$name: a flag and its value', (launcher) => {
  it.each(launcher.flags)(
    '%s false is refused, suggesting its = form',
    (flag) => {
      const { lines, exits, config } = startWith(launcher, [flag, 'false']);
      expect(config).toBeUndefined();
      expect(exits).toEqual([1]);
      expect(lines).toEqual([
        `[MCP] ${flag} false: a flag's value follows "=" — write ${flag}=false`,
      ]);
    },
  );

  it.each(launcher.flags)('%s true is refused the same way', (flag) => {
    const { lines, exits } = startWith(launcher, [flag, 'TRUE']);
    expect(exits).toEqual([1]);
    expect(lines).toEqual([
      `[MCP] ${flag} TRUE: a flag's value follows "=" — write ${flag}=true`,
    ]);
  });

  it.each(launcher.flags)(
    '%s: =false is false; =true and a bare flag are true',
    (flag) => {
      const row = launcher.table.rows.find((each) => each.cli === flag);
      const key = row?.key ?? '';
      const off = startWith(launcher, [`${flag}=false`]).config;
      expect(off).toBeDefined();
      expect(off).toHaveProperty(key, false);
      expect(startWith(launcher, [`${flag}=true`]).config).toHaveProperty(
        key,
        true,
      );
      expect(startWith(launcher, [flag]).config).toHaveProperty(key, true);
    },
  );
});
