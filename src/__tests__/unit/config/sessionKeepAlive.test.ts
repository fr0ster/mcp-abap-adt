/**
 * `--session-keep-alive-minutes` / `MCP_SESSION_KEEP_ALIVE_MINUTES` / YAML
 * `session-keep-alive-minutes`: one shared row in every binary's table, read
 * CLI over environment over YAML, an empty value not given, 10 when no form
 * gives it, `0` off, anything else refused naming its form. Each case runs
 * through the three readers — stdio's, Streamable HTTP's and SSE's.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readHttpConfig } from '../../../../server-runtime/src/http/config/httpParameters';
import { httpHelp } from '../../../../server-runtime/src/http/launcher';
import { StreamableHttpServer } from '../../../../server-runtime/src/http/StreamableHttpServer';
import { readSseConfig } from '../../../../server-runtime/src/sse/config/sseParameters';
import { sseHelp } from '../../../../server-runtime/src/sse/launcher';
import { SseServer } from '../../../../server-runtime/src/sse/SseServer';
import { readCoreConfig } from '../../../../server-runtime/src/stdio/config/coreParameters';
import { coreHelp } from '../../../../server-runtime/src/stdio/launcher';
import {
  ParameterRefusal,
  SESSION_KEEP_ALIVE_CLI,
  SESSION_KEEP_ALIVE_ENV,
  SESSION_KEEP_ALIVE_YAML,
} from '../../../lib/config';
import type { YamlConfig } from '../../../lib/config/yamlConfig';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';

const CLI = '--session-keep-alive-minutes';
const ENV = 'MCP_SESSION_KEEP_ALIVE_MINUTES';
const YAML = 'session-keep-alive-minutes';

type Reader = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml: YamlConfig | null,
) => number | undefined;

const BINARIES: ReadonlyArray<{
  name: string;
  read: Reader;
  help: () => string;
}> = [
  {
    name: 'stdio',
    read: (argv, env, yaml) =>
      readCoreConfig(argv, env, yaml).sessionKeepAliveMinutes,
    help: () => coreHelp(),
  },
  {
    name: 'Streamable HTTP',
    read: (argv, env, yaml) =>
      readHttpConfig(argv, env, yaml).sessionKeepAliveMinutes,
    help: () => httpHelp(),
  },
  {
    name: 'SSE',
    read: (argv, env, yaml) =>
      readSseConfig(argv, env, yaml).sessionKeepAliveMinutes,
    help: () => sseHelp(),
  },
];

describe('the session keep-alive option: its names', () => {
  it('are the three forms', () => {
    assert.equal(SESSION_KEEP_ALIVE_CLI, CLI);
    assert.equal(SESSION_KEEP_ALIVE_ENV, ENV);
    assert.equal(SESSION_KEEP_ALIVE_YAML, YAML);
  });
});

for (const binary of BINARIES) {
  describe(`the session keep-alive option on ${binary.name}`, () => {
    const read = binary.read;

    it('is 10 when no form gives it', () => {
      assert.equal(read([], {}, null), 10);
      assert.equal(read([], {}, {}), 10);
    });

    it('is read from each form alone', () => {
      assert.equal(read([`${CLI}=5`], {}, null), 5);
      assert.equal(read([], { [ENV]: '7' }, null), 7);
      assert.equal(read([], {}, { [YAML]: 9 }), 9);
    });

    it('takes CLI over environment over YAML', () => {
      assert.equal(read([`${CLI}=5`], { [ENV]: '7' }, { [YAML]: 9 }), 5);
      assert.equal(read([], { [ENV]: '7' }, { [YAML]: 9 }), 7);
    });

    it('an empty value is not given: the next form decides', () => {
      assert.equal(read([], { [ENV]: '' }, { [YAML]: 9 }), 9);
      assert.equal(read([], { [ENV]: '' }, null), 10);
    });

    it('0 is off, and accepted from every form', () => {
      assert.equal(read([`${CLI}=0`], {}, null), 0);
      assert.equal(read([], { [ENV]: '0' }, null), 0);
      assert.equal(read([], {}, { [YAML]: 0 }), 0);
    });

    it('refuses a value that is no whole number of minutes in range, naming its form', () => {
      const refused = (run: () => unknown, form: string) =>
        assert.throws(run, (error: unknown) => {
          assert.ok(error instanceof ParameterRefusal);
          assert.ok(error.words.includes(form), error.words);
          assert.ok(error.words.includes('whole number of minutes'));
          return true;
        });
      refused(() => read([`${CLI}=abc`], {}, null), CLI);
      refused(() => read([`${CLI}=1.5`], {}, null), CLI);
      refused(() => read([], { [ENV]: '-1' }, null), ENV);
      refused(() => read([], { [ENV]: '35792' }, null), ENV);
      refused(() => read([], {}, { [YAML]: 'ten' }), `${YAML} (config file)`);
      refused(() => read([], {}, { [YAML]: true }), `${YAML} (config file)`);
    });

    it('is listed in --help with its three forms', () => {
      const help = binary.help();
      assert.ok(help.includes(`  ${CLI}`));
      assert.ok(help.includes(`env: ${ENV}, yaml: ${YAML}`));
    });
  });
}

describe('an embedder’s sessionKeepAliveMs on the HTTP and SSE servers', () => {
  it('is refused at construction, before any client traffic', () => {
    const registry = () => new CompositeHandlersRegistry([]);
    for (const value of [-1, 1.5, 2 ** 31]) {
      assert.throws(
        () =>
          new StreamableHttpServer(registry(), {
            systemType: 'onprem',
            sessionKeepAliveMs: value,
          }),
        /Invalid sessionKeepAliveMs/,
      );
      assert.throws(
        () =>
          new SseServer(registry(), {
            systemType: 'onprem',
            sessionKeepAliveMs: value,
          }),
        /Invalid sessionKeepAliveMs/,
      );
    }
  });
});
