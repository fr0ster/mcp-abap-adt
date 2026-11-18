/**
 * lib's parameter machinery: a table read in its three forms, removed
 * parameters refused in the form used, the template nested by dotted keys,
 * and the TLS pair.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { load } from 'js-yaml';
import {
  ParameterRefusal,
  type ParameterTable,
  parametersTemplate,
  readParameters,
  tlsConfigOf,
  tlsRows,
  validateYamlParameters,
} from '../../../lib/config/authParameters';
import type { YamlConfig } from '../../../lib/config/yamlConfig';
import { assertThrows } from '../../helpers/assertions';

const TABLE: ParameterTable = {
  program: 'test-binary',
  rows: [
    {
      key: 'hosts',
      cli: '--x-hosts',
      env: 'X_HOSTS',
      yaml: 'x.hosts',
      kind: 'list',
      section: 'X',
      help: 'Hosts',
    },
    {
      key: 'port',
      cli: '--x-port',
      cliAliases: ['--port-x'],
      env: 'X_PORT',
      yaml: 'x.deep.port',
      kind: 'port',
      default: 4000,
      section: 'X',
      help: 'A port',
    },
  ],
  removed: [
    {
      cli: ['--gone'],
      cliPrefixes: ['--old-'],
      env: ['GONE'],
      yaml: ['gone'],
      words: (form) => `${form}: gone`,
    },
  ],
};

describe('reading a table', () => {
  it('a list splits on , and ; in every form, blanks dropped', () => {
    assert.deepStrictEqual(
      readParameters(TABLE, ['--x-hosts=a, b;;c'], {}).hosts,
      ['a', 'b', 'c'],
    );
    assert.deepStrictEqual(
      readParameters(TABLE, [], { X_HOSTS: 'a;b' }).hosts,
      ['a', 'b'],
    );
    assert.deepStrictEqual(
      readParameters(TABLE, [], {}, { x: { hosts: ['a', 'b,c'] } }).hosts,
      ['a', 'b', 'c'],
    );
  });

  it('a dotted YAML key is read nested; a scalar on the way is no value', () => {
    assert.equal(
      readParameters(TABLE, [], {}, { x: { deep: { port: 4100 } } }).port,
      4100,
    );
    assert.equal(readParameters(TABLE, [], {}, { x: 'scalar' }).port, 4000);
  });

  it('the first CLI name wins over its alias, and a value is required', () => {
    assert.equal(
      readParameters(TABLE, ['--port-x=4200', '--x-port=4300'], {}).port,
      4300,
    );
    assertThrows(
      () => readParameters(TABLE, ['--x-port'], {}),
      new ParameterRefusal('--x-port needs a value: --x-port=<port>'),
    );
  });
});

describe('removed parameters', () => {
  for (const [argv, env, yaml, words] of [
    [['--gone'], {}, undefined, '--gone: gone'],
    [['--gone=1'], {}, undefined, '--gone: gone'],
    [['--old-anything=1'], {}, undefined, '--old-anything: gone'],
    [[], { GONE: '' }, undefined, 'GONE: gone'],
    [[], {}, { gone: true }, 'gone (config file): gone'],
  ] as const) {
    it(format('refused in the form used (%j %j %j)', argv, env, yaml), () => {
      assertThrows(
        () => readParameters(TABLE, argv, { ...env }, yaml as never),
        new ParameterRefusal(words),
      );
    });
  }

  it('an environment variable the table does not list is not read', () => {
    assert.deepStrictEqual(
      readParameters(TABLE, [], { OLD_THING: 'x', X_PORTS: '1' }),
      { port: 4000 },
    );
  });

  it('a value that only looks like a removed name is not one', () => {
    assertThrows(
      () => readParameters(TABLE, ['--x-hosts', '--gone-not'], {}),
      '--x-hosts needs a value',
    );
    assert.deepStrictEqual(
      readParameters(TABLE, ['--x-hosts=--gone'], {}).hosts,
      ['--gone'],
    );
  });
});

describe("a row's own reader", () => {
  const throwing = (thrown: unknown): ParameterTable => ({
    program: 'test-binary',
    rows: [
      {
        key: 'x',
        cli: '--x',
        kind: 'custom',
        parse: () => {
          throw thrown;
        },
        section: 'X',
        help: 'X',
      },
    ],
    removed: [],
  });

  it('a ParameterRefusal keeps its words', () => {
    assertThrows(
      () =>
        readParameters(
          throwing(new ParameterRefusal('its words')),
          ['--x=1'],
          {},
        ),
      new ParameterRefusal('its words'),
    );
  });

  // The title shows each value as Jest's %p rendered it (pretty-format).
  for (const [thrown, shown] of [
    [
      new Error('foreign text that must not reach the refusal'),
      '[Error: foreign text that must not reach the refusal]',
    ],
    ['a thrown string', '"a thrown string"'],
  ] satisfies [unknown, string][]) {
    it(`any other throw gets fixed words, never its message (${shown})`, () => {
      assertThrows(
        () => readParameters(throwing(thrown), ['--x=1'], {}),
        new ParameterRefusal('Invalid --x'),
      );
    });
  }
});

describe('the template', () => {
  it('nests dotted keys and validates clean', () => {
    const parsed = load(parametersTemplate(TABLE)) as YamlConfig;
    assert.deepStrictEqual(parsed, {
      x: { hosts: null, deep: { port: 4000 } },
    });
    assert.deepStrictEqual(validateYamlParameters(TABLE, parsed), []);
  });
});

describe('--tls-ca', () => {
  it('says it is the chain the server sends, not a trust store for clients', () => {
    const help = tlsRows('http').find((row) => row.cli === '--tls-ca')?.help;
    assert.ok(typeof help === 'string');
    assert.ok(help.includes('the server sends with its own certificate'));
    assert.ok(help.includes('Not a trust store for clients'));
    assert.ok(help.includes('no client certificate is requested'));
  });
});

describe('the TLS pair', () => {
  it('cert and key together, the CA beside them; one alone is refused', () => {
    assert.equal(tlsConfigOf({}), undefined);
    assert.deepStrictEqual(tlsConfigOf({ tlsCert: '/c', tlsKey: '/k' }), {
      cert: '/c',
      key: '/k',
    });
    const halves: Record<string, string>[] = [
      { tlsCert: '/c' },
      { tlsKey: '/k' },
      { tlsCa: '/a' },
    ];
    for (const half of halves) {
      assertThrows(() => tlsConfigOf(half), ParameterRefusal);
    }
  });
});
