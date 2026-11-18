/**
 * The nine refusals of a destination's address and logon (24.0.0, spec §7),
 * as `checkDestinationStatement` decides them: each case on its own, with its
 * own words and keys only — a sentinel value never in them —, the first
 * failing step answering when faults of two steps come together, and every
 * faulty key of a step named. A complete destination answers its address,
 * typed, and `rfcConfigOf` builds the config of its shape.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { DestinationKeyValues } from '../../../lib/config/messageServer';
import {
  checkDestinationStatement,
  type DestinationAddressCase,
  type DestinationStatement,
  destinationAddressHint,
  destinationAddressWords,
  MSSERV_OR_SYSID,
  rfcConfigOf,
} from '../../../lib/config/rfcDestination';

/** A value that must never reach a refusal's words. */
const SENTINEL = 'sentinel-value-7f3a';

const APP = { ashost: SENTINEL, sysnr: SENTINEL } as const;
const MS = { mshost: SENTINEL, msserv: SENTINEL, group: SENTINEL } as const;
const LOGON = { client: SENTINEL, language: SENTINEL } as const;

function rfc(
  keys: DestinationKeyValues,
  extra: Partial<DestinationStatement> = {},
): DestinationStatement {
  return {
    connectionType: 'rfc',
    authType: 'basic',
    urlKey: 'SAP_URL',
    keys,
    ...extra,
  };
}

function http(
  keys: DestinationKeyValues,
  extra: Partial<DestinationStatement> = {},
): DestinationStatement {
  return {
    connectionType: 'http',
    authType: 'basic',
    urlKey: 'SAP_URL',
    url: `https://${SENTINEL}.example.test`,
    keys,
    ...extra,
  };
}

function faultOf(stated: DestinationStatement) {
  const checked = checkDestinationStatement(stated);
  if (!('fault' in checked)) throw new Error('not refused');
  return checked.fault;
}

function expectRefused(
  stated: DestinationStatement,
  which: DestinationAddressCase,
  keys: readonly string[],
): string {
  const fault = faultOf(stated);
  assert.equal(fault.case, which);
  assert.deepStrictEqual([...fault.keys], keys);
  const words = destinationAddressWords('D1', fault);
  const hint = destinationAddressHint(fault) ?? '';
  assert.ok(!words.includes(SENTINEL));
  assert.ok(!hint.includes(SENTINEL));
  for (const key of keys) assert.ok(words.includes(key));
  return words;
}

describe('1. HTTP stating an RFC address key', () => {
  for (const [key, env] of [
    ['ashost', 'SAP_ASHOST'],
    ['sysnr', 'SAP_SYSNR'],
    ['mshost', 'SAP_MSHOST'],
    ['msserv', 'SAP_MSSERV'],
    ['sysid', 'SAP_SYSID'],
    ['group', 'SAP_GROUP'],
    ['saprouter', 'SAP_SAPROUTER'],
  ] as const) {
    it(format('%s → %s', key, env), () => {
      assert.equal(
        expectRefused(http({ [key]: SENTINEL }), 'http-with-rfc-keys', [env]),
        `Destination "D1" is HTTP and states RFC address keys, which HTTP does not take: ${env}`,
      );
    });
  }

  it('names every one it states', () => {
    expectRefused(
      http({ ashost: SENTINEL, group: SENTINEL, saprouter: SENTINEL }),
      'http-with-rfc-keys',
      ['SAP_ASHOST', 'SAP_GROUP', 'SAP_SAPROUTER'],
    );
  });

  it('the client and the language are not RFC address keys', () => {
    assert.deepStrictEqual(checkDestinationStatement(http({ ...LOGON })), {
      http: { url: `https://${SENTINEL}.example.test` },
    });
  });
});

describe('2. HTTP without a URL', () => {
  for (const urlKey of ['SAP_URL', 'XSUAA_MCP_URL'] as const) {
    it(format('names %s', urlKey), () => {
      assert.equal(
        expectRefused(
          http({}, { url: undefined, urlKey }),
          'http-without-url',
          [urlKey],
        ),
        `Destination "D1" cannot be used: ${urlKey}`,
      );
    });
  }
});

describe('3. RFC stating a URL', () => {
  for (const urlKey of ['SAP_URL', 'XSUAA_MCP_URL'] as const) {
    it(format('names %s', urlKey), () => {
      assert.equal(
        expectRefused(
          rfc({ ...APP, ...LOGON }, { url: SENTINEL, urlKey }),
          'rfc-with-url',
          [urlKey],
        ),
        `Destination "D1" is RFC and states ${urlKey}, which an RFC destination does not take`,
      );
    });
  }
});

describe('3. every URL key the file states', () => {
  it('names each, in a fixed order', () => {
    expectRefused(
      rfc(
        { ...APP, ...LOGON },
        {
          urlKey: 'XSUAA_MCP_URL',
          statedUrlKeys: ['XSUAA_MCP_URL', 'SAP_URL'],
        },
      ),
      'rfc-with-url',
      ['SAP_URL', 'XSUAA_MCP_URL'],
    );
  });

  it('a URL key other than the destination URL key refuses it too', () => {
    expectRefused(
      rfc(
        { ...APP, ...LOGON },
        { urlKey: 'XSUAA_MCP_URL', statedUrlKeys: ['SAP_URL'] },
      ),
      'rfc-with-url',
      ['SAP_URL'],
    );
  });
});

describe('4. RFC with keys of both addresses', () => {
  for (const [key, env] of [
    ['mshost', 'SAP_MSHOST'],
    ['msserv', 'SAP_MSSERV'],
    ['sysid', 'SAP_SYSID'],
    ['group', 'SAP_GROUP'],
  ] as const) {
    it(format('SAP_ASHOST beside %s', key), () => {
      expectRefused(
        rfc({ ashost: SENTINEL, [key]: SENTINEL, ...LOGON }),
        'two-addresses',
        ['SAP_ASHOST', env],
      );
    });
  }

  it('SAP_SYSNR beside SAP_MSHOST', () => {
    assert.equal(
      expectRefused(
        rfc({ sysnr: SENTINEL, mshost: SENTINEL, ...LOGON }),
        'two-addresses',
        ['SAP_SYSNR', 'SAP_MSHOST'],
      ),
      'Destination "D1" states two RFC addresses — an application server and a message server: SAP_SYSNR, SAP_MSHOST',
    );
  });

  it('names every stated key of both', () => {
    expectRefused(
      rfc({ ...APP, ...MS, sysid: SENTINEL, ...LOGON }),
      'two-addresses',
      [
        'SAP_ASHOST',
        'SAP_SYSNR',
        'SAP_MSHOST',
        'SAP_MSSERV',
        'SAP_SYSID',
        'SAP_GROUP',
      ],
    );
  });
});

describe('5. RFC with no address key', () => {
  it('names both alternatives', () => {
    assert.equal(
      expectRefused(rfc({ ...LOGON }), 'no-address', [
        'SAP_ASHOST',
        'SAP_SYSNR',
        'SAP_MSHOST',
        'SAP_MSSERV',
        'SAP_SYSID',
        'SAP_GROUP',
      ]),
      'Destination "D1" is RFC and states no address: set SAP_ASHOST and SAP_SYSNR, or SAP_MSHOST with SAP_MSSERV or SAP_SYSID and SAP_GROUP',
    );
  });

  it('SAP_SAPROUTER alone is no address', () => {
    assert.equal(
      faultOf(rfc({ saprouter: SENTINEL, ...LOGON })).case,
      'no-address',
    );
  });
});

describe('6. an incomplete address', () => {
  it('without SAP_SYSNR', () => {
    assert.equal(
      expectRefused(rfc({ ashost: SENTINEL, ...LOGON }), 'incomplete-address', [
        'SAP_SYSNR',
      ]),
      'Destination "D1" is RFC and its address lacks: SAP_SYSNR',
    );
  });

  it('without SAP_ASHOST', () => {
    expectRefused(rfc({ sysnr: SENTINEL, ...LOGON }), 'incomplete-address', [
      'SAP_ASHOST',
    ]);
  });

  it('SAP_MSHOST without SAP_GROUP', () => {
    expectRefused(
      rfc({ mshost: SENTINEL, msserv: SENTINEL, ...LOGON }),
      'incomplete-address',
      ['SAP_GROUP'],
    );
  });

  it('SAP_MSHOST without either service', () => {
    expectRefused(
      rfc({ mshost: SENTINEL, group: SENTINEL, ...LOGON }),
      'incomplete-address',
      [MSSERV_OR_SYSID],
    );
  });

  for (const [_key, keys] of [
    ['msserv', { msserv: SENTINEL, group: SENTINEL }],
    ['sysid', { sysid: SENTINEL, group: SENTINEL }],
    ['group', { group: SENTINEL, msserv: SENTINEL }],
  ] as const) {
    it(format('SAP_%s without SAP_MSHOST', _key), () => {
      expectRefused(rfc({ ...keys, ...LOGON }), 'incomplete-address', [
        'SAP_MSHOST',
      ]);
    });
  }

  it('names every key a message server lacks', () => {
    expectRefused(rfc({ sysid: SENTINEL, ...LOGON }), 'incomplete-address', [
      'SAP_MSHOST',
      'SAP_GROUP',
    ]);
    expectRefused(rfc({ group: SENTINEL, ...LOGON }), 'incomplete-address', [
      'SAP_MSHOST',
      MSSERV_OR_SYSID,
    ]);
  });
});

describe('7. RFC without its client or language', () => {
  it('without SAP_CLIENT', () => {
    assert.equal(
      expectRefused(rfc({ ...APP, language: SENTINEL }), 'logon-incomplete', [
        'SAP_CLIENT',
      ]),
      'Destination "D1" is RFC and lacks: SAP_CLIENT',
    );
  });

  it('without SAP_LANGUAGE', () => {
    expectRefused(rfc({ ...APP, client: SENTINEL }), 'logon-incomplete', [
      'SAP_LANGUAGE',
    ]);
  });

  it('without both: both named', () => {
    expectRefused(rfc({ ...APP }), 'logon-incomplete', [
      'SAP_CLIENT',
      'SAP_LANGUAGE',
    ]);
  });
});

describe('8. ABAP Cloud over RFC', () => {
  it('names SAP_SYSTEM_TYPE and SAP_CONNECTION_TYPE', () => {
    assert.equal(
      expectRefused(
        rfc({ ...APP, ...LOGON }, { systemType: 'cloud' }),
        'cloud-over-rfc',
        ['SAP_SYSTEM_TYPE', 'SAP_CONNECTION_TYPE'],
      ),
      'Destination "D1" is ABAP Cloud over RFC, which ABAP Cloud does not offer: SAP_SYSTEM_TYPE, SAP_CONNECTION_TYPE',
    );
  });

  for (const type of ['onprem', 'legacy'] as const) {
    it(format('%s over RFC is served', type), () => {
      assert.equal(
        'rfc' in
          checkDestinationStatement(
            rfc({ ...APP, ...LOGON }, { systemType: type }),
          ),
        true,
      );
    });
  }
});

describe('9. a client certificate over RFC', () => {
  it('names SAP_AUTH_TYPE and SAP_CONNECTION_TYPE', () => {
    assert.equal(
      expectRefused(
        rfc({ ...APP, ...LOGON }, { authType: 'certificate' }),
        'certificate-over-rfc',
        ['SAP_AUTH_TYPE', 'SAP_CONNECTION_TYPE'],
      ),
      'Destination "D1" logs on with a client certificate over RFC, which the RFC wire does not take: SAP_AUTH_TYPE, SAP_CONNECTION_TYPE',
    );
  });
});

describe('each case its own words', () => {
  it('no two cases render one sentence', () => {
    const cases: DestinationAddressCase[] = [
      'http-with-rfc-keys',
      'http-without-url',
      'rfc-with-url',
      'two-addresses',
      'no-address',
      'incomplete-address',
      'logon-incomplete',
      'cloud-over-rfc',
      'certificate-over-rfc',
    ];
    const words = cases.map((which) =>
      destinationAddressWords('D1', { case: which, keys: ['SAP_X'] }),
    );
    assert.equal(new Set(words).size, cases.length);
  });

  it('each fixed hint names the CLI and YAML forms of a destination key', () => {
    const hint = destinationAddressHint({
      case: 'logon-incomplete',
      keys: ['SAP_CLIENT', 'SAP_LANGUAGE'],
    });
    assert.ok(typeof hint === 'string');
    assert.ok(hint.includes('--client'));
    assert.ok(hint.includes('client in YAML'));
    assert.ok(hint.includes('--language'));
  });
});

describe('the first failing step answers', () => {
  const cases: Array<[string, DestinationStatement, DestinationAddressCase]> = [
    [
      '1+2',
      http({ ashost: SENTINEL }, { url: undefined }),
      'http-with-rfc-keys',
    ],
    [
      '3+4',
      rfc({ ...APP, mshost: SENTINEL, ...LOGON }, { url: SENTINEL }),
      'rfc-with-url',
    ],
    ['3+5', rfc({ ...LOGON }, { url: SENTINEL }), 'rfc-with-url'],
    [
      '3+6',
      rfc({ ashost: SENTINEL, ...LOGON }, { url: SENTINEL }),
      'rfc-with-url',
    ],
    ['3+7', rfc({ ...APP }, { url: SENTINEL }), 'rfc-with-url'],
    [
      '4+6',
      rfc({ ashost: SENTINEL, mshost: SENTINEL, ...LOGON }),
      'two-addresses',
    ],
    ['4+7', rfc({ ...APP, mshost: SENTINEL }), 'two-addresses'],
    ['5+7', rfc({}), 'no-address'],
    ['6+7', rfc({ ashost: SENTINEL }), 'incomplete-address'],
    [
      '8+3',
      rfc({ ...APP, ...LOGON }, { url: SENTINEL, systemType: 'cloud' }),
      'rfc-with-url',
    ],
    [
      '8+4',
      rfc({ ...APP, mshost: SENTINEL, ...LOGON }, { systemType: 'cloud' }),
      'two-addresses',
    ],
    ['8+5', rfc({ ...LOGON }, { systemType: 'cloud' }), 'no-address'],
    [
      '8+6',
      rfc({ ashost: SENTINEL, ...LOGON }, { systemType: 'cloud' }),
      'incomplete-address',
    ],
    ['8+7', rfc({ ...APP }, { systemType: 'cloud' }), 'logon-incomplete'],
    [
      '9+3',
      rfc({ ...APP, ...LOGON }, { url: SENTINEL, authType: 'certificate' }),
      'rfc-with-url',
    ],
    [
      '9+4',
      rfc({ ...APP, mshost: SENTINEL, ...LOGON }, { authType: 'certificate' }),
      'two-addresses',
    ],
    ['9+5', rfc({ ...LOGON }, { authType: 'certificate' }), 'no-address'],
    [
      '9+6',
      rfc({ ashost: SENTINEL, ...LOGON }, { authType: 'certificate' }),
      'incomplete-address',
    ],
    ['9+7', rfc({ ...APP }, { authType: 'certificate' }), 'logon-incomplete'],
    [
      '9+8',
      rfc(
        { ...APP, ...LOGON },
        { authType: 'certificate', systemType: 'cloud' },
      ),
      'cloud-over-rfc',
    ],
  ];
  for (const [_pair, stated, which] of cases) {
    it(format('steps %s: the earlier answers', _pair), () => {
      assert.equal(faultOf(stated).case, which);
    });
  }
});

describe('a complete RFC destination', () => {
  it('an application server: its address, logon and SAProuter as stated', () => {
    const checked = checkDestinationStatement(
      rfc({
        ashost: ' h ',
        sysnr: '00',
        client: '100',
        language: 'DE',
        saprouter: '/H/r/',
      }),
    );
    if (!('rfc' in checked)) throw new Error('refused');
    assert.deepStrictEqual(rfcConfigOf({ authType: 'basic' }, checked.rfc), {
      authType: 'basic',
      connectionType: 'rfc',
      client: '100',
      language: 'DE',
      saprouter: '/H/r/',
      ashost: ' h ',
      sysnr: '00',
    });
  });

  for (const [_name, service, expected] of [
    ['msserv', { msserv: 'sapmsX' }, { msserv: 'sapmsX' }],
    ['sysid', { sysid: 'SYX' }, { sysid: 'SYX' }],
    [
      'both',
      { msserv: 'sapmsX', sysid: 'SYX' },
      { msserv: 'sapmsX', sysid: 'SYX' },
    ],
  ] as const) {
    it(format('a message server by %s', _name), () => {
      const checked = checkDestinationStatement(
        rfc({
          mshost: 'ms',
          group: 'G',
          client: '100',
          language: 'EN',
          ...service,
        }),
      );
      if (!('rfc' in checked)) throw new Error('refused');
      assert.deepStrictEqual(rfcConfigOf({ authType: 'basic' }, checked.rfc), {
        authType: 'basic',
        connectionType: 'rfc',
        client: '100',
        language: 'EN',
        mshost: 'ms',
        group: 'G',
        ...expected,
      });
    });
  }
});
