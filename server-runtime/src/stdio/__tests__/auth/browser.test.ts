/**
 * The browser table, cell by cell, as a pure function: no
 * browser is constructed and nothing is launched.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  linuxBrowser,
  linuxDefaultBrowser,
  macBrowser,
  macDefaultBrowser,
  windowsBrowser,
  windowsDefaultBrowser,
} from '@mcp-abap-adt/auth-providers';
import { assertThrows } from '../../../../../src/__tests__/helpers/assertions';
import { BrowserChoiceError, browserFor } from '../../auth/browser';

const NONE = {};

describe('browserFor: the browser table', () => {
  const rows: Array<[string, string, unknown]> = [
    ['system', 'linux', { factory: linuxDefaultBrowser }],
    ['system', 'darwin', { factory: macDefaultBrowser }],
    ['system', 'win32', { factory: windowsDefaultBrowser }],
    ['auto', 'linux', { factory: linuxDefaultBrowser }],
    ['auto', 'darwin', { factory: macDefaultBrowser }],
    ['auto', 'win32', { factory: windowsDefaultBrowser }],
    ['chrome', 'linux', { factory: linuxBrowser, argument: 'google-chrome' }],
    ['chrome', 'darwin', { factory: macBrowser, argument: 'Google Chrome' }],
    ['chrome', 'win32', { factory: windowsBrowser, argument: 'chrome' }],
    ['edge', 'linux', { factory: linuxBrowser, argument: 'microsoft-edge' }],
    ['edge', 'darwin', { factory: macBrowser, argument: 'Microsoft Edge' }],
    ['edge', 'win32', { factory: windowsBrowser, argument: 'msedge' }],
    ['firefox', 'linux', { factory: linuxBrowser, argument: 'firefox' }],
    ['firefox', 'darwin', { factory: macBrowser, argument: 'Firefox' }],
    ['firefox', 'win32', { factory: windowsBrowser, argument: 'firefox' }],
    ['none', 'linux', NONE],
    ['none', 'darwin', NONE],
    ['none', 'win32', NONE],
    ['none', 'freebsd', NONE],
    ['headless', 'linux', NONE],
    ['headless', 'darwin', NONE],
    ['headless', 'win32', NONE],
    ['headless', 'freebsd', NONE],
  ];

  for (const [browser, platform, expected] of rows) {
    it(format('--browser=%s on %s', browser, platform), () => {
      assert.deepStrictEqual(browserFor({ browser }, platform), expected);
    });
  }

  it('no --browser is system', () => {
    assert.deepStrictEqual(browserFor({}, 'linux'), {
      factory: linuxDefaultBrowser,
    });
  });

  it('the word is read case-insensitively', () => {
    assert.deepStrictEqual(browserFor({ browser: 'Edge' }, 'win32'), {
      factory: windowsBrowser,
      argument: 'msedge',
    });
  });

  for (const browser of ['system', 'auto', 'chrome', 'edge', 'firefox']) {
    it(
      format(
        '--browser=%s on another platform: unavailable, not thrown — the words say use --browser=none',
        browser,
      ),
      () => {
        const mapping = browserFor({ browser }, 'freebsd');
        assert.ok('unavailable' in mapping);
        const { unavailable, ...rest } = mapping;
        assert.ok(typeof unavailable === 'string');
        assert.deepStrictEqual(rest, {});
        assert.equal(Object.getPrototypeOf(mapping), Object.prototype);
        assert.ok(unavailable.includes('--browser=none'));
        assert.ok(unavailable.includes('freebsd'));
      },
    );
  }

  it('no --browser on another platform: unavailable', () => {
    const { unavailable } = browserFor({}, 'aix');
    assert.ok(typeof unavailable === 'string');
    assert.ok(unavailable.includes('--browser=none'));
  });

  for (const platform of ['linux', 'freebsd']) {
    it(
      format('an unknown name on %s: refused, use --browser=none', platform),
      () => {
        assertThrows(
          () => browserFor({ browser: 'opera' }, platform),
          BrowserChoiceError,
        );
        assertThrows(
          () => browserFor({ browser: 'opera' }, platform),
          '--browser=none',
        );
      },
    );
  }
});

describe('browserFor: --browser-program', () => {
  for (const [platform, f] of [
    ['linux', linuxBrowser],
    ['darwin', macBrowser],
    ['win32', windowsBrowser],
  ] as const) {
    it(format('on %s: the named factory with the program', platform), () => {
      assert.deepStrictEqual(browserFor({ program: 'my-browser' }, platform), {
        factory: f,
        argument: 'my-browser',
      });
    });
  }

  it('on another platform: the linux launch, a plain spawn of the program', () => {
    assert.deepStrictEqual(browserFor({ program: 'my-browser' }, 'aix'), {
      factory: linuxBrowser,
      argument: 'my-browser',
    });
  });

  for (const platform of ['linux', 'freebsd']) {
    it(format('beside --browser on %s: refused', platform), () => {
      assertThrows(
        () =>
          browserFor({ browser: 'firefox', program: 'my-browser' }, platform),
        '--browser-program excludes --browser',
      );
    });
  }
});
