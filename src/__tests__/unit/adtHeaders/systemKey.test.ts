/**
 * The system key by the settings' wire (24.0.0): HTTP keys its URL (no
 * trailing slashes) and client; RFC keys every address field, the SAProuter
 * and the client — so two RFC destinations that differ in any one of them
 * are two systems, and an RFC key is never an HTTP one.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { SapRfcConfig } from '@mcp-abap-adt/connection';
import { adtSystemKey } from '../../../lib/adtHeaders/systemKey';

const APP: SapRfcConfig = {
  authType: 'basic',
  connectionType: 'rfc',
  client: '100',
  language: 'EN',
  ashost: 'host.example.test',
  sysnr: '00',
};
const MS: SapRfcConfig = {
  authType: 'basic',
  connectionType: 'rfc',
  client: '100',
  language: 'EN',
  mshost: 'ms.example.test',
  group: 'G',
  msserv: 'sapmsX',
  sysid: 'SYX',
};

describe('adtSystemKey', () => {
  it('HTTP: ["http", <URL>, <client>], trailing slashes and spaces dropped', () => {
    assert.equal(
      adtSystemKey({
        url: ' https://system.example.test/ ',
        client: '100',
        authType: 'basic',
      }),
      JSON.stringify(['http', 'https://system.example.test', '100']),
    );
  });

  it('RFC: every address field, the SAProuter and the client', () => {
    assert.equal(
      adtSystemKey({ ...MS, saprouter: '/H/r/' }),
      JSON.stringify([
        'rfc',
        '',
        '',
        'ms.example.test',
        'sapmsX',
        'SYX',
        'G',
        '/H/r/',
        '100',
      ]),
    );
  });

  for (const [_f, other] of [
    ['ashost', { ...APP, ashost: 'other.example.test' }],
    ['sysnr', { ...APP, sysnr: '01' }],
    ['client', { ...APP, client: '200' }],
    ['saprouter', { ...APP, saprouter: '/H/r/' }],
  ] as const) {
    it(
      format('an application server differing in %s is another system', _f),
      () => {
        assert.notEqual(adtSystemKey(other), adtSystemKey(APP));
      },
    );
  }

  for (const [_f, other] of [
    ['mshost', { ...MS, mshost: 'other.example.test' }],
    ['msserv', { ...MS, msserv: 'sapmsY' }],
    ['sysid', { ...MS, sysid: 'SYY' }],
    ['group', { ...MS, group: 'H' }],
  ] as const) {
    it(format('a message server differing in %s is another system', _f), () => {
      assert.notEqual(adtSystemKey(other), adtSystemKey(MS));
    });
  }

  it('the language is no part of the system', () => {
    assert.equal(adtSystemKey({ ...APP, language: 'DE' }), adtSystemKey(APP));
  });
});
