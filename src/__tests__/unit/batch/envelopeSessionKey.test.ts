/**
 * The session key an envelope is valid in (spec §4.1), built from the
 * instance and the request alone, nothing read from SAP:
 *
 * - stdio and SSE: the instance's connection context, by identity;
 * - Streamable HTTP: the instance, its state handle and the digest
 *   `headerContext` computes of the request's five destination and
 *   credential headers — a fresh context per request, with the same
 *   headers, still matches.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  sameSession,
  sessionKeyOf,
} from '../../../lib/batch/InstanceEnvelopes';
import { headerContext } from '../../../lib/httpTransport/headerSource';

const HEADERS = {
  'x-sap-url': 'https://system.invalid',
  'x-sap-client': '100',
  'x-sap-login': 'USER_A',
  'x-sap-password': 'secret-a',
};

describe('the session key', () => {
  it('over HTTP a fresh headerContext per request with the same headers matches', () => {
    const instance = {};
    const first = sessionKeyOf({
      transport: 'http',
      instance,
      stateHandle: 'S',
      context: headerContext({ ...HEADERS }),
    });
    const second = sessionKeyOf({
      transport: 'http',
      instance,
      stateHandle: 'S',
      context: headerContext({ ...HEADERS }),
    });
    assert.equal(sameSession(first, second), true);
  });

  it('over HTTP each destination or credential header changed alone is another session', () => {
    const instance = {};
    const owner = sessionKeyOf({
      transport: 'http',
      instance,
      stateHandle: 'S',
      context: headerContext({ ...HEADERS }),
    });
    const variants: Record<string, string>[] = [
      { ...HEADERS, 'x-sap-url': 'https://other.invalid' },
      { ...HEADERS, 'x-sap-client': '200' },
      { ...HEADERS, 'x-sap-login': 'USER_B' },
      { ...HEADERS, 'x-sap-password': 'secret-b' },
      {
        'x-sap-url': HEADERS['x-sap-url'],
        'x-sap-client': HEADERS['x-sap-client'],
        'x-sap-jwt-token': 'token-a',
      },
    ];
    for (const headers of variants) {
      const other = sessionKeyOf({
        transport: 'http',
        instance,
        stateHandle: 'S',
        context: headerContext(headers),
      });
      assert.equal(
        sameSession(owner, other),
        false,
        JSON.stringify(Object.keys(headers)),
      );
    }
  });

  it('over HTTP another state handle, or another instance, is another session', () => {
    const instance = {};
    const owner = sessionKeyOf({
      transport: 'http',
      instance,
      stateHandle: 'S',
      context: headerContext({ ...HEADERS }),
    });
    assert.equal(
      sameSession(
        owner,
        sessionKeyOf({
          transport: 'http',
          instance,
          stateHandle: 'T',
          context: headerContext({ ...HEADERS }),
        }),
      ),
      false,
    );
    assert.equal(
      sameSession(
        owner,
        sessionKeyOf({
          transport: 'http',
          instance: {},
          stateHandle: 'S',
          context: headerContext({ ...HEADERS }),
        }),
      ),
      false,
    );
  });

  it("on stdio and SSE the connection context's identity is the key: the connection's one context matches, another does not", () => {
    const context = headerContext({ ...HEADERS });
    const owner = sessionKeyOf({ transport: 'other', instance: {}, context });
    assert.equal(
      sameSession(
        owner,
        sessionKeyOf({ transport: 'other', instance: {}, context }),
      ),
      true,
    );
    assert.equal(
      sameSession(
        owner,
        sessionKeyOf({
          transport: 'other',
          instance: {},
          context: headerContext({ ...HEADERS }),
        }),
      ),
      false,
    );
  });

  it('the digest carries no header value in any rendering', () => {
    const context = headerContext({ ...HEADERS });
    const key = sessionKeyOf({
      transport: 'http',
      instance: {},
      stateHandle: 'S',
      context,
    });
    const rendered = [
      JSON.stringify(key.digest),
      String(key.digest),
      key.digest?.toString('utf8') ?? '',
      key.digest?.toString('latin1') ?? '',
    ].join(' ');
    for (const value of Object.values(HEADERS)) {
      assert.equal(rendered.includes(value), false, value);
    }
    assert.equal(key.digest?.length, 32);
  });
});
