/**
 * lib's parameter machinery: a table read in its three forms, removed
 * parameters refused in the form used, the template nested by dotted keys,
 * and the TLS pair.
 */

import { load } from 'js-yaml';
import {
  ParameterRefusal,
  type ParameterTable,
  parametersTemplate,
  readParameters,
  tlsConfigOf,
  validateYamlParameters,
} from '../../../lib/config/authParameters';

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
    expect(readParameters(TABLE, ['--x-hosts=a, b;;c'], {}).hosts).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(readParameters(TABLE, [], { X_HOSTS: 'a;b' }).hosts).toEqual([
      'a',
      'b',
    ]);
    expect(
      readParameters(TABLE, [], {}, { x: { hosts: ['a', 'b,c'] } }).hosts,
    ).toEqual(['a', 'b', 'c']);
  });

  it('a dotted YAML key is read nested; a scalar on the way is no value', () => {
    expect(
      readParameters(TABLE, [], {}, { x: { deep: { port: 4100 } } }).port,
    ).toBe(4100);
    expect(readParameters(TABLE, [], {}, { x: 'scalar' }).port).toBe(4000);
  });

  it('the first CLI name wins over its alias, and a value is required', () => {
    expect(
      readParameters(TABLE, ['--port-x=4200', '--x-port=4300'], {}).port,
    ).toBe(4300);
    expect(() => readParameters(TABLE, ['--x-port'], {})).toThrow(
      new ParameterRefusal('--x-port needs a value: --x-port=<port>'),
    );
  });
});

describe('removed parameters', () => {
  it.each([
    [['--gone'], {}, undefined, '--gone: gone'],
    [['--gone=1'], {}, undefined, '--gone: gone'],
    [['--old-anything=1'], {}, undefined, '--old-anything: gone'],
    [[], { GONE: '' }, undefined, 'GONE: gone'],
    [[], {}, { gone: true }, 'gone (config file): gone'],
  ] as const)(
    'refused in the form used (%j %j %j)',
    (argv, env, yaml, words) => {
      expect(() =>
        readParameters(TABLE, argv, { ...env }, yaml as never),
      ).toThrow(new ParameterRefusal(words));
    },
  );

  it('an environment variable the table does not list is not read', () => {
    expect(readParameters(TABLE, [], { OLD_THING: 'x', X_PORTS: '1' })).toEqual(
      { port: 4000 },
    );
  });

  it('a value that only looks like a removed name is not one', () => {
    expect(() =>
      readParameters(TABLE, ['--x-hosts', '--gone-not'], {}),
    ).toThrow('--x-hosts needs a value');
    expect(readParameters(TABLE, ['--x-hosts=--gone'], {}).hosts).toEqual([
      '--gone',
    ]);
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
    expect(() =>
      readParameters(
        throwing(new ParameterRefusal('its words')),
        ['--x=1'],
        {},
      ),
    ).toThrow(new ParameterRefusal('its words'));
  });

  it.each([
    new Error('foreign text that must not reach the refusal'),
    'a thrown string',
  ])('any other throw gets fixed words, never its message (%p)', (thrown) => {
    expect(() => readParameters(throwing(thrown), ['--x=1'], {})).toThrow(
      new ParameterRefusal('Invalid --x'),
    );
  });
});

describe('the template', () => {
  it('nests dotted keys and validates clean', () => {
    const parsed = load(parametersTemplate(TABLE)) as Record<string, unknown>;
    expect(parsed).toEqual({ x: { hosts: null, deep: { port: 4000 } } });
    expect(validateYamlParameters(TABLE, parsed)).toEqual([]);
  });
});

describe('the TLS pair', () => {
  it('cert and key together, the CA beside them; one alone is refused', () => {
    expect(tlsConfigOf({})).toBeUndefined();
    expect(tlsConfigOf({ tlsCert: '/c', tlsKey: '/k' })).toEqual({
      cert: '/c',
      key: '/k',
    });
    const halves: Record<string, string>[] = [
      { tlsCert: '/c' },
      { tlsKey: '/k' },
      { tlsCa: '/a' },
    ];
    for (const half of halves) {
      expect(() => tlsConfigOf(half)).toThrow(ParameterRefusal);
    }
  });
});
