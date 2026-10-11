/**
 * The browser table of spec §8 (D9), cell by cell, as a pure function: no
 * browser is constructed and nothing is launched.
 */

import {
  linuxBrowser,
  linuxDefaultBrowser,
  macBrowser,
  macDefaultBrowser,
  windowsBrowser,
  windowsDefaultBrowser,
} from '@mcp-abap-adt/auth-providers';
import { BrowserChoiceError, browserFor } from '../../auth/browser';

const NONE = {};

describe('browserFor: the §8 table', () => {
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

  it.each(rows)('--browser=%s on %s', (browser, platform, expected) => {
    expect(browserFor({ browser }, platform)).toStrictEqual(expected);
  });

  it('no --browser is system', () => {
    expect(browserFor({}, 'linux')).toStrictEqual({
      factory: linuxDefaultBrowser,
    });
  });

  it('the word is read case-insensitively', () => {
    expect(browserFor({ browser: 'Edge' }, 'win32')).toStrictEqual({
      factory: windowsBrowser,
      argument: 'msedge',
    });
  });

  it.each(['system', 'auto', 'chrome', 'edge', 'firefox'])(
    '--browser=%s on another platform: refused, use --browser=none',
    (browser) => {
      expect(() => browserFor({ browser }, 'freebsd')).toThrow(
        BrowserChoiceError,
      );
      expect(() => browserFor({ browser }, 'freebsd')).toThrow(
        '--browser=none',
      );
    },
  );

  it('an unknown name: refused, use --browser=none', () => {
    expect(() => browserFor({ browser: 'opera' }, 'linux')).toThrow(
      BrowserChoiceError,
    );
    expect(() => browserFor({ browser: 'opera' }, 'linux')).toThrow(
      '--browser=none',
    );
  });
});

describe('browserFor: --browser-program', () => {
  it.each([
    ['linux', linuxBrowser],
    ['darwin', macBrowser],
    ['win32', windowsBrowser],
  ] as const)('on %s: the named factory with the program', (platform, f) => {
    expect(browserFor({ program: 'my-browser' }, platform)).toStrictEqual({
      factory: f,
      argument: 'my-browser',
    });
  });

  it('on another platform: refused, use --browser=none', () => {
    expect(() => browserFor({ program: 'my-browser' }, 'aix')).toThrow(
      '--browser=none',
    );
  });

  it('beside --browser: refused', () => {
    expect(() =>
      browserFor({ browser: 'firefox', program: 'my-browser' }, 'linux'),
    ).toThrow('--browser-program excludes --browser');
  });
});
