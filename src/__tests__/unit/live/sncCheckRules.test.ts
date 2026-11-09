/**
 * The SNC live check's rules (`tests/live/sncCheckRules.ts`, RFC plan step
 * 21; deleted with the script at step 22): its arguments, and the keys an SNC
 * destination's `.env` must state — a fixture `.env` per refusal, and a clean
 * one, each parsed as the script parses it (dotenv). Keys only: no value of a
 * fixture appears in any fault.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as dotenv from 'dotenv';
import {
  checkSncEnv,
  parseSncCheckArguments,
  SncCheckUsageError,
  statedKeyNames,
} from '../../../../tests/live/sncCheckRules';

/** A value that must never reach a fault. */
const SENTINEL = 'sentinel-value-7f3a';

const CLEAN = [
  'SAP_CONNECTION_TYPE=rfc',
  'SAP_AUTH_TYPE=snc',
  'SAP_SYSTEM_TYPE=onprem',
  `SAP_ASHOST=${SENTINEL}`,
  'SAP_SYSNR=00',
  'SAP_CLIENT=100',
  'SAP_LANGUAGE=EN',
  `SAP_SNC_PARTNERNAME=p:CN=${SENTINEL}`,
];

/** The clean `.env` with `drop` left out and `add` appended, parsed. */
function envOf(drop: readonly string[], add: readonly string[] = []) {
  const lines = CLEAN.filter(
    (line) => !drop.some((key) => line.startsWith(`${key}=`)),
  );
  return dotenv.parse([...lines, ...add].join('\n'));
}

function faultKeys(env: Record<string, string>): string[] {
  const faults = checkSncEnv(env);
  assert.ok(!JSON.stringify(faults).includes(SENTINEL), 'a value was named');
  return faults.map((fault) => fault.key);
}

describe('the SNC .env check', () => {
  it('a clean .env: no fault', () => {
    assert.deepEqual(faultKeys(envOf([])), []);
  });

  it('a message-server address is clean too', () => {
    assert.deepEqual(
      faultKeys(
        envOf(
          ['SAP_ASHOST', 'SAP_SYSNR'],
          ['SAP_MSHOST=ms', 'SAP_SYSID=SYX', 'SAP_GROUP=G'],
        ),
      ),
      [],
    );
  });

  const REFUSALS: ReadonlyArray<[string, string[], string[], string[]]> = [
    [
      'not RFC',
      ['SAP_CONNECTION_TYPE'],
      ['SAP_CONNECTION_TYPE=http'],
      ['SAP_CONNECTION_TYPE'],
    ],
    ['not SNC', ['SAP_AUTH_TYPE'], ['SAP_AUTH_TYPE=basic'], ['SAP_AUTH_TYPE']],
    ['no partner name', ['SAP_SNC_PARTNERNAME'], [], ['SAP_SNC_PARTNERNAME']],
    ['no system type', ['SAP_SYSTEM_TYPE'], [], ['SAP_SYSTEM_TYPE']],
    ['a user', [], [`SAP_USERNAME=${SENTINEL}`], ['SAP_USERNAME']],
    ['a password', [], [`SAP_PASSWORD=${SENTINEL}`], ['SAP_PASSWORD']],
    ['a URL', [], [`SAP_URL=https://${SENTINEL}.example.test`], ['SAP_URL']],
    [
      'no address',
      ['SAP_ASHOST', 'SAP_SYSNR'],
      [],
      [
        'SAP_ASHOST',
        'SAP_SYSNR',
        'SAP_MSHOST',
        'SAP_MSSERV',
        'SAP_SYSID',
        'SAP_GROUP',
      ],
    ],
    ['an incomplete address', ['SAP_SYSNR'], [], ['SAP_SYSNR']],
    [
      'two addresses',
      [],
      ['SAP_MSHOST=ms'],
      ['SAP_ASHOST', 'SAP_SYSNR', 'SAP_MSHOST'],
    ],
    ['no client', ['SAP_CLIENT'], [], ['SAP_CLIENT']],
    ['no language', ['SAP_LANGUAGE'], [], ['SAP_LANGUAGE']],
  ];
  for (const [name, drop, add, keys] of REFUSALS) {
    it(`${name}: refused naming ${keys.join(', ')}`, () => {
      assert.deepEqual(faultKeys(envOf(drop, add)), keys);
    });
  }

  it('each fault says what to do', () => {
    for (const fault of checkSncEnv(envOf(['SAP_CLIENT']))) {
      assert.ok(fault.fix.length > 0);
    }
  });

  it('a blank value is no value', () => {
    assert.deepEqual(faultKeys(envOf(['SAP_CLIENT'], ['SAP_CLIENT=   '])), [
      'SAP_CLIENT',
    ]);
  });

  it('the stated key names, sorted, blank ones left out', () => {
    assert.deepEqual(statedKeyNames(dotenv.parse('B=1\nA=2\nC=  \n')), [
      'A',
      'B',
    ]);
  });
});

describe('the arguments', () => {
  const OK = [
    '--env',
    'dest.env',
    '--realm',
    'Realm Name',
    '--realm-url',
    'https://system.example.test:44300',
  ];

  it('the three options, as separate words or with =', () => {
    const expected = {
      env: 'dest.env',
      realm: 'Realm Name',
      realmUrl: 'https://system.example.test:44300',
    };
    assert.deepEqual(parseSncCheckArguments(OK), expected);
    assert.deepEqual(
      parseSncCheckArguments([
        '--env=dest.env',
        '--realm=Realm Name',
        '--realm-url=https://system.example.test:44300',
      ]),
      expected,
    );
  });

  const refused = (argv: readonly string[], words: string) =>
    assert.throws(
      () => parseSncCheckArguments(argv),
      (error: unknown) =>
        error instanceof SncCheckUsageError && error.message.includes(words),
    );

  it('each option is required', () => {
    refused(OK.slice(2), '--env is required');
    refused([...OK.slice(0, 2), ...OK.slice(4)], '--realm is required');
    refused(OK.slice(0, 4), '--realm-url is required');
  });

  it('a value is required, and an option once', () => {
    refused(['--env'], '--env needs a value');
    refused(['--env', '  ', ...OK.slice(2)], '--env needs a value');
    refused([...OK, '--env', 'other.env'], '--env is given twice');
  });

  it('an unknown argument is refused by its position', () => {
    refused([...OK, '--verbose'], 'unknown argument at position 7');
  });

  it('--realm-url must be an absolute http(s) URL', () => {
    refused(
      [...OK.slice(0, 4), '--realm-url', 'system.example.test'],
      '--realm-url must be',
    );
    refused(
      [...OK.slice(0, 4), '--realm-url', 'ftp://system.example.test'],
      '--realm-url must be',
    );
  });
});
