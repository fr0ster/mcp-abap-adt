/**
 * Every argument and every YAML key is read (D26, group C): on every
 * launcher's table an unknown argument, a positional and a parameter given
 * twice are refused naming them; an unknown YAML key is refused naming it
 * and, where one is close, the key it may mean.
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

describe.each(LAUNCHERS)(
  '$name: unknown, positional and repeated arguments',
  (launcher) => {
    it('an unknown argument is refused, naming it and the program', () => {
      const { lines, exits } = startWith(launcher, ['--zzzz-qqq']);
      expect(exits).toEqual([1]);
      expect(lines).toEqual([
        `[MCP] --zzzz-qqq is not an argument of ${launcher.name}`,
      ]);
    });

    it('a close misspelling names the argument it may mean', () => {
      const { lines, exits } = startWith(launcher, ['--sytem-type=onprem']);
      expect(exits).toEqual([1]);
      expect(lines).toEqual([
        `[MCP] --sytem-type is not an argument of ${launcher.name}; did you mean --system-type?`,
      ]);
    });

    it('a positional argument is refused, naming it', () => {
      const { lines, exits } = startWith(launcher, [
        '--system-type=onprem',
        'stray',
      ]);
      expect(exits).toEqual([1]);
      expect(lines).toEqual([
        `[MCP] "stray" is not an argument of ${launcher.name}: every argument is --name or --name=<value>`,
      ]);
    });

    it('a single-dash argument other than -h and -v is refused', () => {
      const { lines, exits } = startWith(launcher, ['-x']);
      expect(exits).toEqual([1]);
      expect(lines).toEqual([
        `[MCP] -x is not an argument of ${launcher.name}`,
      ]);
    });

    it('a parameter given twice is refused, naming both forms', () => {
      const { lines, exits } = startWith(launcher, [
        '--system-type=onprem',
        '--system-type',
        'cloud',
      ]);
      expect(exits).toEqual([1]);
      expect(lines).toEqual([
        '[MCP] --system-type is given twice (--system-type=onprem, --system-type cloud): state it once',
      ]);
    });

    it("a value given in a parameter's two-word form is not a positional", () => {
      const { exits, config } = startWith(launcher, ['--system-type', 'cloud']);
      expect(exits).toEqual([]);
      expect(config).toHaveProperty('systemType', 'cloud');
    });
  },
);

describe.each(LAUNCHERS)('$name: unknown YAML keys', (launcher) => {
  it('a top-level misspelling is refused, naming the key and the known one', () => {
    const { lines, exits } = startWith(launcher, [], 'system_type: cloud\n');
    expect(exits).toEqual([1]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(
      'Config file key "system_type" is not a parameter of this binary; did you mean "system-type"?',
    );
  });

  it('a nested misspelling is refused, naming its dotted path', () => {
    const yaml = JSON.stringify(launcher.nested.yaml);
    const { lines, exits } = startWith(launcher, [], `${yaml}\n`);
    expect(exits).toEqual([1]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(
      `Config file key "${launcher.nested.key}" is not a parameter of this binary`,
    );
  });

  it('an unknown key nothing resembles is refused without a suggestion', () => {
    const { lines } = startWith(launcher, [], 'zzzz: 1\n');
    expect(
      lines[0]?.endsWith(
        'Config file key "zzzz" is not a parameter of this binary',
      ),
    ).toBe(true);
  });
});

describe.each(LAUNCHERS)('$name: an empty value is not given', (launcher) => {
  it('--system-type= is read as not given, and the next form decides', () => {
    const { exits, config } = startWith(
      launcher,
      ['--system-type='],
      'system-type: cloud\n',
    );
    expect(exits).toEqual([]);
    expect(config).toHaveProperty('systemType', 'cloud');
  });

  it('a YAML key with no value is a known key, read as not given', () => {
    const { exits, config } = startWith(
      launcher,
      ['--system-type=onprem'],
      'enable-data-tools:\n',
    );
    expect(exits).toEqual([]);
    expect(config).toHaveProperty('enableDataTools', false);
  });
});
