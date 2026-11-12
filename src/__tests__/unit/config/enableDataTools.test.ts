/**
 * `--enable-data-tools` / `MCP_ENABLE_DATA_TOOLS` / YAML `enable-data-tools`:
 * one shared row in every binary's table, read CLI over environment over
 * YAML, off when no form gives it (spec §2). Each case runs through the
 * three readers — stdio's, Streamable HTTP's and SSE's — so a table that
 * lacks the row, or reads it otherwise, fails on its own.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { readOnlyToolSet as coreRoSet } from '../../../../core-ro/src/launcher';
import {
  HTTP_PARAMETERS,
  readHttpConfig,
} from '../../../../server-runtime/src/http/config/httpParameters';
import { httpHelp } from '../../../../server-runtime/src/http/launcher';
import {
  readSseConfig,
  SSE_PARAMETERS,
} from '../../../../server-runtime/src/sse/config/sseParameters';
import { sseHelp } from '../../../../server-runtime/src/sse/launcher';
import {
  CORE_PARAMETERS,
  readCoreConfig,
} from '../../../../server-runtime/src/stdio/config/coreParameters';
import { hydrateSystemContextFromEnvFile } from '../../../../server-runtime/src/stdio/config/envFileContext';
import { coreHelp } from '../../../../server-runtime/src/stdio/launcher';
import {
  ENABLE_DATA_TOOLS_CLI,
  ENABLE_DATA_TOOLS_ENV,
  ENABLE_DATA_TOOLS_YAML,
  ParameterRefusal,
  type ParameterTable,
} from '../../../lib/config';
import {
  BINARIES as BINARY_NAMES,
  type ToolSetKind,
} from '../../../lib/config/binaries';
import { generateYamlConfigTemplate } from '../../../lib/config/yamlConfig';
import { fullToolSet, type ToolSet } from '../../../lib/toolSet';

const CLI = '--enable-data-tools';
const ENV = 'MCP_ENABLE_DATA_TOOLS';
const YAML = 'enable-data-tools';

type Reader = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml: Record<string, unknown> | null,
) => boolean | undefined;

interface Binary {
  readonly name: string;
  readonly read: Reader;
  readonly table: ParameterTable;
  readonly help: () => string;
}

/** The three readers; HTTP and SSE need a system type to start, not to read. */
const BINARIES: readonly Binary[] = [
  {
    name: 'stdio',
    read: (argv, env, yaml) => readCoreConfig(argv, env, yaml).enableDataTools,
    table: CORE_PARAMETERS,
    help: () => coreHelp(),
  },
  {
    name: 'Streamable HTTP',
    read: (argv, env, yaml) => readHttpConfig(argv, env, yaml).enableDataTools,
    table: HTTP_PARAMETERS,
    help: () => httpHelp(),
  },
  {
    name: 'SSE',
    read: (argv, env, yaml) => readSseConfig(argv, env, yaml).enableDataTools,
    table: SSE_PARAMETERS,
    help: () => sseHelp(),
  },
];

describe('the data-tools flag: its names', () => {
  it('are the three forms the spec names', () => {
    assert.equal(ENABLE_DATA_TOOLS_CLI, CLI);
    assert.equal(ENABLE_DATA_TOOLS_ENV, ENV);
    assert.equal(ENABLE_DATA_TOOLS_YAML, YAML);
  });
});

for (const binary of BINARIES) {
  describe(`the data-tools flag on ${binary.name}`, () => {
    const read = binary.read;

    it('is false when no form gives it', () => {
      assert.equal(read([], {}, null), false);
      assert.equal(read([], {}, {}), false);
    });

    it('is true from a bare CLI flag', () => {
      assert.equal(read([CLI], {}, null), true);
    });

    it('is true from the environment alone', () => {
      assert.equal(read([], { [ENV]: 'true' }, null), true);
    });

    it('is true from YAML alone', () => {
      assert.equal(read([], {}, { [YAML]: true }), true);
    });

    it('an explicit CLI false beats an environment true', () => {
      assert.equal(read([`${CLI}=false`], { [ENV]: 'true' }, null), false);
    });

    it('a CLI true beats an environment false', () => {
      assert.equal(read([CLI], { [ENV]: 'false' }, null), true);
    });

    it('an environment false beats a YAML true', () => {
      assert.equal(read([], { [ENV]: 'false' }, { [YAML]: true }), false);
    });

    it('an environment true beats a YAML false', () => {
      assert.equal(read([], { [ENV]: 'true' }, { [YAML]: false }), true);
    });

    it('an empty environment value falls through to YAML', () => {
      assert.equal(read([], { [ENV]: '' }, { [YAML]: true }), true);
    });

    it('a value that is not a flag is refused, naming its form', () => {
      const refused = (run: () => unknown, form: string) =>
        assert.throws(run, (error: unknown) => {
          assert.ok(error instanceof ParameterRefusal);
          assert.ok(error.words.includes(form), error.words);
          assert.ok(error.words.includes('Must be true or false'));
          return true;
        });
      refused(() => read([`${CLI}=yes`], {}, null), CLI);
      refused(() => read([], { [ENV]: 'yes' }, null), ENV);
      refused(() => read([], {}, { [YAML]: 'yes' }), `${YAML} (config file)`);
      refused(() => read([], {}, { [YAML]: [true] }), `${YAML} (config file)`);
    });

    it('is listed in --help with its three forms, under DATA TOOLS', () => {
      const help = binary.help();
      const section = help.indexOf('\nDATA TOOLS:\n');
      assert.ok(section >= 0, 'no DATA TOOLS section');
      const rest = help.slice(section);
      assert.ok(rest.includes(`  ${CLI}`));
      assert.ok(rest.includes(`env: ${ENV}, yaml: ${YAML}`));
    });

    it('is stated false in the generated --conf template', () => {
      const template = generateYamlConfigTemplate(binary.table);
      assert.ok(
        template.split('\n').some((line) => line.startsWith(`${YAML}: false`)),
        'the template does not state the flag false',
      );
    });
  });
}

describe("the data-tools flag and a destination's .env", () => {
  it('is not read from the destination file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-tools-env-'));
    try {
      const file = path.join(dir, 'destination.env');
      fs.writeFileSync(file, `${ENV}=true\nSAP_SYSTEM_TYPE=onprem\n`);
      const env: NodeJS.ProcessEnv = {};
      hydrateSystemContextFromEnvFile(file, env);
      // The file's system type joins, so the hydrate ran; the flag does not.
      assert.equal(env.SAP_SYSTEM_TYPE, 'onprem');
      assert.equal(env[ENV], undefined);
      assert.equal(readCoreConfig([], env, null).enableDataTools, false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** How many times `part` occurs in `text`. Plain code. */
function occurrences(text: string, part: string): number {
  let count = 0;
  let at = text.indexOf(part);
  while (at >= 0) {
    count += 1;
    at = text.indexOf(part, at + part.length);
  }
  return count;
}

const CITATION = 'SAP API Policy FAQ v1.3 (June 2026), Q33';
const DECISION = "Whether to turn this on is the customer's decision.";

const SETS: ReadonlyArray<readonly [ToolSetKind, ToolSet, readonly string[]]> =
  [
    ['core', fullToolSet, ['GetSqlQuery', 'GetTableContents']],
    ['core-ro', coreRoSet, ['GetSqlQuery', 'GetTableContents']],
    ['compact', compactToolSet, ['HandlerGetData']],
    ['compact-ro', compactRoSet, ['HandlerGetData']],
  ];

const HELPS = {
  stdio: coreHelp,
  http: httpHelp,
  sse: sseHelp,
} as const;

describe('every binary help states the data tools once, and why', () => {
  for (const [kind, toolSet, data] of SETS) {
    for (const transport of ['stdio', 'http', 'sse'] as const) {
      const program = BINARY_NAMES[transport][kind].bin;
      it(`${program}`, () => {
        const help = HELPS[transport]({ toolSet, program });
        // The help wraps its sentences: read them with the line breaks and
        // the indentation as single spaces.
        const flat = help.split(/\s+/).join(' ');
        assert.equal(occurrences(flat, CITATION), 1, 'the FAQ citation');
        assert.equal(occurrences(flat, DECISION), 1, "the customer's decision");
        const tools = help.slice(help.indexOf('\nTOOLS:\n'));
        assert.ok(tools.startsWith('\nTOOLS:\n'), 'no TOOLS section');
        const section = tools.slice(0, tools.indexOf('For details:'));
        assert.ok(section.includes(CLI), 'the TOOLS section names the flag');
        for (const name of data) {
          assert.ok(section.includes(name), `the TOOLS section names ${name}`);
        }
        assert.ok(
          !help.includes('the binary chooses it, not a flag'),
          'the help still says no flag changes the set',
        );
      });
    }
  }
});
