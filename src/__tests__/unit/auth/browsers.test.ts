import { browserFor } from '../../../lib/auth/browsers';

/**
 * `--browser` names, as auth-providers 6's README maps a 5.x name to one of
 * its shipped browsers. A browser is opaque (an `IBrowser`), so what is
 * checked is which names give one and which give none.
 */
describe('browserFor', () => {
  it.each(['none', 'headless', ' Headless '])(
    '%j is no browser: the URL is prompted on stderr',
    (name) => {
      expect(browserFor(name, 'linux')).toBeUndefined();
    },
  );

  it.each([
    'system',
    'auto',
    'chrome',
    'edge',
    'firefox',
    'msedge',
    'anything-else',
  ])('%j is a browser on every platform', (name) => {
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      expect(typeof browserFor(name, platform)?.open).toBe('function');
    }
  });
});
